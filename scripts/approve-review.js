require('dotenv').config();

const readline = require('readline');
const { getPendingReviews, updateReviewStatus } = require('../src/models/review');
const { postApprovedReply } = require('../src/services/postReply');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`         ReviewForge - Approve & Post Reviews         `);
  console.log(`======================================================\n`);

  try {
    const reviews = await getPendingReviews();

    if (!reviews || reviews.length === 0) {
      console.log(`[INFO] No pending reviews found requiring approval.\n`);
      return;
    }

    console.log(`Found ${reviews.length} pending review(s):\n`);

    reviews.forEach((review, index) => {
      console.log(`[${index + 1}] Document ID: ${review.id}`);
      console.log(`    Package:     ${review.packageName}`);
      console.log(`    Author:      ${review.authorName}`);
      console.log(`    Rating:      ${review.starRating}/5 stars`);
      console.log(`    Review Text: "${review.reviewText}"`);
      console.log(`    AI Draft:    "${review.draftReply}"\n`);
    });

    const selectionInput = await askQuestion(`Select a review number to process (1-${reviews.length}) or enter 0 to exit: `);
    const selectedIndex = parseInt(selectionInput.trim(), 10) - 1;

    if (isNaN(selectedIndex) || selectedIndex < 0) {
      console.log('\nExiting without making changes.\n');
      return;
    }

    if (selectedIndex >= reviews.length) {
      console.log('\n[ERROR] Invalid selection number.\n');
      return;
    }

    const selectedReview = reviews[selectedIndex];

    console.log(`\nSelected Review #${selectedIndex + 1}:`);
    console.log(`Author:      ${selectedReview.authorName}`);
    console.log(`Rating:      ${selectedReview.starRating}/5 stars`);
    console.log(`Review Text: "${selectedReview.reviewText}"`);
    console.log(`AI Draft:    "${selectedReview.draftReply}"\n`);

    const actionInput = await askQuestion('Post this reply as-is? (y/n/edit): ');
    const action = actionInput.trim().toLowerCase();

    if (action === 'y' || action === 'yes') {
      console.log('\nPosting draft reply as-is...');
      try {
        await postApprovedReply(selectedReview.id);
        console.log(`\n[SUCCESS] Review #${selectedIndex + 1} successfully approved and posted to Google Play!\n`);
      } catch (postErr) {
        console.error(`\n[FAILURE] Failed to post reply: ${postErr.message}\n`);
      }

    } else if (action === 'edit') {
      const editedReply = await askQuestion('\nEnter new reply text (max 350 chars): ');
      const trimmedReply = editedReply.trim();

      if (!trimmedReply) {
        console.log('\n[ERROR] Reply text cannot be empty. Aborting.\n');
        return;
      }

      if (trimmedReply.length > 350) {
        console.warn(`\n[WARNING] Edited reply is ${trimmedReply.length} characters long. Google caps replies at 350 chars.`);
      }

      console.log('\nSaving edited reply text to Firestore...');
      await updateReviewStatus(selectedReview.id, 'pending_approval', trimmedReply);

      console.log('Posting updated reply to Google Play...');
      try {
        await postApprovedReply(selectedReview.id);
        console.log(`\n[SUCCESS] Edited reply successfully approved and posted to Google Play!\n`);
      } catch (postErr) {
        console.error(`\n[FAILURE] Failed to post edited reply: ${postErr.message}\n`);
      }

    } else if (action === 'n' || action === 'no') {
      console.log('\nSkipping review. Status remains "pending_approval".\n');
    } else {
      console.log('\nUnrecognized action. Exiting without making changes.\n');
    }

  } catch (error) {
    console.error(`\n[ERROR] ${error.message}\n`);
  } finally {
    rl.close();
    process.exit(0);
  }
}

run();
