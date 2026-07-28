const { google } = require('googleapis');
const { getReviewById, updateReviewStatus } = require('../models/review');
const { getCustomer } = require('../models/customer');

/**
 * Posts an approved review reply to Google Play Store via Android Publisher API.
 * @param {string} docId Firestore Document ID of the review to post
 * @returns {Promise<Object>} Response object containing success status and API response details
 */
async function postApprovedReply(docId) {
  if (!docId) {
    throw new Error('[POST REPLY ERROR] docId parameter is required.');
  }

  // 1. Fetch review document from Firestore
  const review = await getReviewById(docId);
  if (!review) {
    throw new Error(`[POST REPLY ERROR] Review document '${docId}' not found in Firestore.`);
  }

  if (!review.draftReply) {
    throw new Error(`[POST REPLY ERROR] Review document '${docId}' has no reply text to post.`);
  }

  // 2. Fetch associated customer to retrieve decrypted service account credentials
  const customer = await getCustomer(review.customerId);
  if (!customer) {
    throw new Error(`[POST REPLY ERROR] Customer '${review.customerId}' associated with review '${docId}' not found.`);
  }

  if (!customer.serviceAccountJson) {
    throw new Error(`[POST REPLY ERROR] Service account credentials missing or invalid for customer '${customer.name}'.`);
  }

  try {
    console.log(`\nPosting approved reply to Google Play Store...`);
    console.log(`Package:   ${review.packageName}`);
    console.log(`Review ID: ${review.reviewId}`);
    console.log(`Reply:     "${review.draftReply}" (${review.draftReply.length} chars)`);

    // 3. Authenticate with Android Publisher API using customer credentials
    const auth = new google.auth.GoogleAuth({
      credentials: customer.serviceAccountJson,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    const androidpublisher = google.androidpublisher({
      version: 'v3',
      auth,
    });

    // 4. Call reviews.reply
    const response = await androidpublisher.reviews.reply({
      packageName: review.packageName,
      reviewId: review.reviewId,
      requestBody: {
        replyText: review.draftReply,
      },
    });

    console.log(`\n[SUCCESS] Reply posted to Google Play! (HTTP ${response.status})`);

    // 5. On success: Update review status in Firestore to "posted"
    await updateReviewStatus(docId, 'posted');
    console.log(`Firestore document '${docId}' status updated to 'posted'.`);

    return {
      success: true,
      docId,
      status: response.status,
      responseData: response.data,
    };

  } catch (error) {
    // 6. On failure: Log clear error and preserve 'pending_approval' status for retry
    console.error(`\n=================== POST REPLY ERROR ===================`);
    console.error(`Failed to post reply for review doc '${docId}' (Review ID: ${review.reviewId}):`);
    console.error(`Message: ${error.message}`);
    if (error.response && error.response.data) {
      console.error(`Raw Error Response:`);
      console.error(JSON.stringify(error.response.data, null, 2));
    }
    console.error(`Status left as 'pending_approval' for retry.`);
    console.error(`========================================================\n`);

    throw new Error(`[POST REPLY FAILURE] ${error.message}`);
  }
}

module.exports = {
  postApprovedReply,
};
