const { db, admin } = require('../config/firebase');

const REVIEWS_COLLECTION = 'reviews';

/**
 * Saves a newly detected review and its generated draft reply to Firestore.
 * @param {Object} params
 * @param {string} params.customerId Firestore ID of customer
 * @param {string} params.packageName App Package Name
 * @param {string} params.reviewId Google Play Review ID
 * @param {string} params.authorName Reviewer author name
 * @param {number} params.starRating Star rating (1-5)
 * @param {string} params.reviewText Content of the review
 * @param {string} params.draftReply Generated AI reply text
 * @param {string} [params.status='pending_approval'] Status of the review ('pending_approval' or 'posted')
 * @returns {Promise<Object>} Saved review document metadata
 */
async function saveDraftReview({ customerId, packageName, reviewId, authorName, starRating, reviewText, draftReply, status = 'pending_approval' }) {
  if (!customerId || !packageName || !reviewId) {
    throw new Error('[REVIEW MODEL ERROR] Missing required fields (customerId, packageName, reviewId).');
  }

  const reviewData = {
    customerId,
    packageName,
    reviewId,
    authorName: authorName || 'Anonymous',
    starRating: typeof starRating === 'number' ? starRating : 0,
    reviewText: reviewText || '',
    draftReply: draftReply || '',
    status: status || 'pending_approval',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (status === 'posted') {
    reviewData.postedAt = admin.firestore.FieldValue.serverTimestamp();
  }

  const docRef = await db.collection(REVIEWS_COLLECTION).add(reviewData);

  return {
    id: docRef.id,
    ...reviewData,
  };
}

/**
 * Checks if a review with the given reviewId already exists in Firestore.
 * @param {string} reviewId Google Play Review ID
 * @returns {Promise<boolean>} True if review is already recorded, false otherwise
 */
async function reviewExists(reviewId) {
  if (!reviewId) return false;

  const snapshot = await db
    .collection(REVIEWS_COLLECTION)
    .where('reviewId', '==', reviewId)
    .limit(1)
    .get();

  return !snapshot.empty;
}

/**
 * Retrieves all review documents with status 'pending_approval'.
 * @returns {Promise<Array<Object>>} List of pending review objects
 */
async function getPendingReviews() {
  const snapshot = await db
    .collection(REVIEWS_COLLECTION)
    .where('status', '==', 'pending_approval')
    .get();

  const reviews = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    reviews.push({
      id: doc.id,
      ...data,
      createdAt: data.createdAt ? data.createdAt.toDate() : null,
    });
  });

  return reviews;
}

/**
 * Fetches a single review document from Firestore by its document ID.
 * @param {string} docId Firestore Document ID
 * @returns {Promise<Object|null>} Review document object or null if not found
 */
async function getReviewById(docId) {
  if (!docId) {
    throw new Error('[REVIEW MODEL ERROR] docId is required.');
  }

  const doc = await db.collection(REVIEWS_COLLECTION).doc(docId).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data();

  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt ? data.createdAt.toDate() : null,
    postedAt: data.postedAt ? data.postedAt.toDate() : null,
    updatedAt: data.updatedAt ? data.updatedAt.toDate() : null,
  };
}

/**
 * Updates a review document's status field and optionally overwrites draftReply with finalReplyText.
 * @param {string} docId Firestore Document ID
 * @param {string} status New status string (e.g. 'posted', 'rejected', 'pending_approval')
 * @param {string} [finalReplyText] Optional final reply text if human edited it
 * @returns {Promise<Object>} Updated fields object
 */
async function updateReviewStatus(docId, status, finalReplyText) {
  if (!docId || !status) {
    throw new Error('[REVIEW MODEL ERROR] docId and status are required for updateReviewStatus.');
  }

  const updateData = {
    status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (typeof finalReplyText === 'string') {
    updateData.draftReply = finalReplyText;
  }

  if (status === 'posted') {
    updateData.postedAt = admin.firestore.FieldValue.serverTimestamp();
  }

  await db.collection(REVIEWS_COLLECTION).doc(docId).update(updateData);

  return updateData;
}

module.exports = {
  saveDraftReview,
  reviewExists,
  getPendingReviews,
  getReviewById,
  updateReviewStatus,
};
