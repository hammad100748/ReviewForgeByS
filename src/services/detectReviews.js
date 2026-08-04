const { google } = require('googleapis');
const { getAllActiveApps, updateAppSyncTimestamps } = require('../models/app');
const { reviewExists, saveDraftReview } = require('../models/review');
const { generateReply } = require('../config/deepseek');

/**
 * Processes review detection, AI draft generation, and auto-posting for a single app document.
 * @param {Object} app App document joined with parent customer service account credentials
 * @param {Object} [options] Options
 * @param {boolean} [options.isManual=false] True if triggered by manual user Sync Now click
 * @returns {Promise<Object>} Statistics of the single app run
 */
async function processSingleApp(app, { isManual = false } = {}) {
  if (!app.serviceAccountJson) {
    throw new Error('No decrypted service account credentials available.');
  }

  // Initialize GoogleAuth with decrypted inline credentials from parent customer
  const auth = new google.auth.GoogleAuth({
    credentials: app.serviceAccountJson,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  const androidpublisher = google.androidpublisher({
    version: 'v3',
    auth,
  });

  console.log(`Fetching reviews from Google Play Developer API for package ${app.packageName}...`);

  const response = await androidpublisher.reviews.list({
    packageName: app.packageName,
  });

  const reviews = response.data.reviews || [];
  console.log(`Fetched ${reviews.length} total review(s) from Google Play.`);

  let appNewReviews = 0;
  let appSkippedAlreadyReplied = 0;
  let appDraftsGenerated = 0;
  let appAutoPosted = 0;

  for (const review of reviews) {
    const reviewId = review.reviewId;

    // 1. Check across full comments array for ANY developerComment entry
    const hasDeveloperReply = Array.isArray(review.comments) &&
      review.comments.some(c => Boolean(c.developerComment));

    if (hasDeveloperReply) {
      console.log(`Skipping review ${reviewId} — already has a developer reply on Google.`);
      appSkippedAlreadyReplied++;
      continue;
    }

    // 2. Skip if review was already detected and stored in Firestore
    const exists = await reviewExists(reviewId);
    if (exists) {
      continue;
    }

    appNewReviews++;

    // Extract userComment from comments array
    const userCommentObj = Array.isArray(review.comments)
      ? review.comments.find(c => c.userComment)
      : null;
    const userComment = userCommentObj ? userCommentObj.userComment : null;

    const reviewText = userComment ? (userComment.text || '') : '';
    const starRating = userComment ? (userComment.starRating || 0) : 0;
    const authorName = review.authorName || 'Anonymous';

    console.log(`  > New review detected (ID: ${reviewId}, Rating: ${starRating}/5)`);
    console.log(`    Author: ${authorName}`);
    console.log(`    Text: "${reviewText}"`);

    // Generate AI draft reply & auto-tag using DeepSeek in a single call
    console.log(`    Generating AI draft reply and auto-tag via DeepSeek...`);
    let draftReply = '';
    let tag = 'other';
    try {
      const aiResult = await generateReply(reviewText, starRating);
      draftReply = aiResult.replyText;
      tag = aiResult.tag;
      console.log(`    Generated Tag: [${tag.toUpperCase()}], Draft (${draftReply.length} chars): "${draftReply}"`);
    } catch (aiError) {
      console.error(`    [AI GENERATION ERROR] ${aiError.message}`);
      draftReply = 'Could not generate AI draft reply.';
      tag = 'other';
    }

    let isAutoPosted = false;

    // 3. Handle Auto-Post Mode if enabled for this app
    if (app.autoPostEnabled && draftReply && draftReply !== 'Could not generate AI draft reply.') {
      console.log(`    [AUTO-POST] App mode is ENABLED. Attempting immediate post to Google Play...`);
      try {
        const replyRes = await androidpublisher.reviews.reply({
          packageName: app.packageName,
          reviewId: reviewId,
          requestBody: {
            replyText: draftReply,
          },
        });

        console.log(`    [AUTO-POST SUCCESS] Successfully posted reply to Google Play! (HTTP ${replyRes.status})`);
        isAutoPosted = true;
        appAutoPosted++;

        // Save directly as posted with customerId and appId
        await saveDraftReview({
          customerId: app.customerId,
          appId: app.id || app.appId,
          packageName: app.packageName,
          reviewId,
          authorName,
          starRating,
          reviewText,
          draftReply,
          tag,
          status: 'posted',
        });

        console.log(`    Saved review to Firestore with status 'posted', appId '${app.id || app.appId}', and tag '${tag}'.\n`);
      } catch (postError) {
        console.error(`    [AUTO-POST FAILURE] Failed to post reply to Google Play: ${postError.message}`);
        console.error(`    Falling back to saving review as 'pending_approval'.\n`);
      }
    }

    // 4. Fallback or Standard Manual Mode: Save as pending_approval
    if (!isAutoPosted) {
      appDraftsGenerated++;

      await saveDraftReview({
        customerId: app.customerId,
        appId: app.id || app.appId,
        packageName: app.packageName,
        reviewId,
        authorName,
        starRating,
        reviewText,
        draftReply,
        tag,
        status: 'pending_approval',
      });

      console.log(`    Saved review draft to Firestore (status: pending_approval, appId: ${app.id || app.appId}, tag: ${tag}).\n`);
    }
  }

  // Update timestamps on app document
  const targetAppId = app.id || app.appId;
  if (targetAppId) {
    try {
      await updateAppSyncTimestamps(targetAppId, { isManual });
    } catch (tsErr) {
      console.error(`[APP MODEL WARNING] Failed to update sync timestamps for app ${targetAppId}: ${tsErr.message}`);
    }
  }

  console.log(`App Summary (${app.appName}): ${appNewReviews} new review(s), ${appSkippedAlreadyReplied} skipped (already replied), ${appAutoPosted} auto-posted, ${appDraftsGenerated} draft(s) pending approval.\n`);

  return {
    appNewReviews,
    appSkippedAlreadyReplied,
    appDraftsGenerated,
    appAutoPosted,
  };
}

/**
 * Runs the review detection, AI draft generation, and optional auto-post cycle across all active apps.
 */
async function runDetectionCycle() {
  console.log(`\n======================================================`);
  console.log(`     ReviewForge - Review Detection & AI Draft Cycle    `);
  console.log(`======================================================\n`);

  let totalAppsProcessed = 0;
  let totalNewReviewsFound = 0;
  let totalSkippedAlreadyReplied = 0;
  let totalDraftsGenerated = 0;
  let totalAutoPosted = 0;
  let totalAppErrors = 0;

  try {
    const apps = await getAllActiveApps();
    console.log(`Found ${apps.length} active app(s) to process.\n`);

    for (const app of apps) {
      totalAppsProcessed++;
      const autoPostLabel = app.autoPostEnabled ? '[Auto-Post: ENABLED]' : '[Auto-Post: DISABLED]';
      const ownerLabel = app.customerName || app.customerEmail || app.customerId;
      console.log(`--- Processing App: ${app.appName} (${app.packageName}) ${autoPostLabel} [Customer: ${ownerLabel}] ---`);

      try {
        const stats = await processSingleApp(app, { isManual: false });
        totalNewReviewsFound += stats.appNewReviews;
        totalSkippedAlreadyReplied += stats.appSkippedAlreadyReplied;
        totalDraftsGenerated += stats.appDraftsGenerated;
        totalAutoPosted += stats.appAutoPosted;
      } catch (appError) {
        totalAppErrors++;
        console.error(`[APP ERROR] Failed processing app '${app.appName}' (${app.id || app.appId}): ${appError.message}\n`);
      }
    }

  } catch (error) {
    console.error(`[CRITICAL ERROR] Review detection cycle failed: ${error.message}\n`);
  }

  console.log(`======================================================`);
  console.log(`               Detection Cycle Complete               `);
  console.log(`======================================================`);
  console.log(`Apps Processed:   ${totalAppsProcessed}`);
  console.log(`New Reviews Found: ${totalNewReviewsFound}`);
  console.log(`Skipped (Replied): ${totalSkippedAlreadyReplied}`);
  console.log(`Auto-Posted:       ${totalAutoPosted}`);
  console.log(`Pending Drafts:    ${totalDraftsGenerated}`);
  console.log(`App Errors:        ${totalAppErrors}`);
  console.log(`======================================================\n`);
}

module.exports = {
  processSingleApp,
  runDetectionCycle,
};
