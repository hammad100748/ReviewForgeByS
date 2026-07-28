const { google } = require('googleapis');
const { getAllActiveCustomers } = require('../models/customer');
const { reviewExists, saveDraftReview } = require('../models/review');
const { generateReply } = require('../config/deepseek');

/**
 * Runs the review detection, AI draft generation, and optional auto-post cycle across all active customers.
 */
async function runDetectionCycle() {
  console.log(`\n======================================================`);
  console.log(`     ReviewForge - Review Detection & AI Draft Cycle    `);
  console.log(`======================================================\n`);

  let totalCustomersProcessed = 0;
  let totalNewReviewsFound = 0;
  let totalSkippedAlreadyReplied = 0;
  let totalDraftsGenerated = 0;
  let totalAutoPosted = 0;
  let totalCustomerErrors = 0;

  try {
    const customers = await getAllActiveCustomers();
    console.log(`Found ${customers.length} active customer(s) to process.\n`);

    for (const customer of customers) {
      totalCustomersProcessed++;
      const autoPostLabel = customer.autoPostEnabled ? '[Auto-Post: ENABLED]' : '[Auto-Post: DISABLED]';
      console.log(`--- Processing Customer: ${customer.name} (${customer.packageName}) ${autoPostLabel} ---`);

      try {
        if (!customer.serviceAccountJson) {
          throw new Error('No decrypted service account credentials available.');
        }

        // Initialize GoogleAuth with decrypted inline credentials
        const auth = new google.auth.GoogleAuth({
          credentials: customer.serviceAccountJson,
          scopes: ['https://www.googleapis.com/auth/androidpublisher'],
        });

        const androidpublisher = google.androidpublisher({
          version: 'v3',
          auth,
        });

        console.log(`Fetching reviews from Google Play Developer API...`);

        const response = await androidpublisher.reviews.list({
          packageName: customer.packageName,
        });

        const reviews = response.data.reviews || [];
        console.log(`Fetched ${reviews.length} total review(s) from Google Play.`);

        let customerNewReviews = 0;
        let customerSkippedAlreadyReplied = 0;
        let customerDraftsGenerated = 0;
        let customerAutoPosted = 0;

        for (const review of reviews) {
          const reviewId = review.reviewId;

          // 1. Check across full comments array for ANY developerComment entry
          const hasDeveloperReply = Array.isArray(review.comments) &&
            review.comments.some(c => Boolean(c.developerComment));

          if (hasDeveloperReply) {
            console.log(`Skipping review ${reviewId} — already has a developer reply on Google.`);
            customerSkippedAlreadyReplied++;
            totalSkippedAlreadyReplied++;
            continue;
          }

          // 2. Skip if review was already detected and stored in Firestore
          const exists = await reviewExists(reviewId);
          if (exists) {
            continue;
          }

          customerNewReviews++;
          totalNewReviewsFound++;

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

          // Generate AI draft reply using DeepSeek
          console.log(`    Generating AI draft reply via DeepSeek...`);
          let draftReply = '';
          try {
            draftReply = await generateReply(reviewText, starRating);
            console.log(`    Generated Draft (${draftReply.length} chars): "${draftReply}"`);
          } catch (aiError) {
            console.error(`    [AI GENERATION ERROR] ${aiError.message}`);
            draftReply = 'Could not generate AI draft reply.';
          }

          let isAutoPosted = false;

          // 3. Handle Auto-Post Mode if enabled for this customer
          if (customer.autoPostEnabled && draftReply && draftReply !== 'Could not generate AI draft reply.') {
            console.log(`    [AUTO-POST] Mode is ENABLED. Attempting immediate post to Google Play...`);
            try {
              const replyRes = await androidpublisher.reviews.reply({
                packageName: customer.packageName,
                reviewId: reviewId,
                requestBody: {
                  replyText: draftReply,
                },
              });

              console.log(`    [AUTO-POST SUCCESS] Successfully posted reply to Google Play! (HTTP ${replyRes.status})`);
              isAutoPosted = true;
              customerAutoPosted++;
              totalAutoPosted++;

              // Save directly as posted
              await saveDraftReview({
                customerId: customer.id,
                packageName: customer.packageName,
                reviewId,
                authorName,
                starRating,
                reviewText,
                draftReply,
                status: 'posted',
              });

              console.log(`    Saved review to Firestore with status 'posted'.\n`);
            } catch (postError) {
              console.error(`    [AUTO-POST FAILURE] Failed to post reply to Google Play: ${postError.message}`);
              console.error(`    Falling back to saving review as 'pending_approval'.\n`);
            }
          }

          // 4. Fallback or Standard Manual Mode: Save as pending_approval
          if (!isAutoPosted) {
            customerDraftsGenerated++;
            totalDraftsGenerated++;

            await saveDraftReview({
              customerId: customer.id,
              packageName: customer.packageName,
              reviewId,
              authorName,
              starRating,
              reviewText,
              draftReply,
              status: 'pending_approval',
            });

            console.log(`    Saved review draft to Firestore (status: pending_approval).\n`);
          }
        }

        console.log(`Customer Summary (${customer.name}): ${customerNewReviews} new review(s), ${customerSkippedAlreadyReplied} skipped (already replied), ${customerAutoPosted} auto-posted, ${customerDraftsGenerated} draft(s) pending approval.\n`);

      } catch (customerError) {
        totalCustomerErrors++;
        console.error(`[CUSTOMER ERROR] Failed processing customer '${customer.name}' (${customer.id}): ${customerError.message}\n`);
      }
    }

  } catch (error) {
    console.error(`[CRITICAL ERROR] Review detection cycle failed: ${error.message}\n`);
  }

  console.log(`======================================================`);
  console.log(`                  CYCLE SUMMARY RESULTS               `);
  console.log(`======================================================`);
  console.log(` Customers Processed:                 ${totalCustomersProcessed}`);
  console.log(` New Reviews Found:                   ${totalNewReviewsFound}`);
  console.log(` Skipped (already replied):           ${totalSkippedAlreadyReplied}`);
  console.log(` Auto-Posted (Direct to Google Play): ${totalAutoPosted}`);
  console.log(` AI Drafts Generated (Pending):       ${totalDraftsGenerated}`);
  console.log(` Customer Errors:                     ${totalCustomerErrors}`);
  console.log(`======================================================\n`);
}

module.exports = {
  runDetectionCycle,
};
