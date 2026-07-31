const { db, admin } = require('../config/firebase');

const REVIEWS_COLLECTION = 'reviews';

/**
 * Saves a newly detected review and its generated draft reply to Firestore.
 * @param {Object} params
 * @param {string} params.customerId Firestore ID of customer
 * @param {string} [params.appId] Firestore ID of app document
 * @param {string} params.packageName App Package Name
 * @param {string} params.reviewId Google Play Review ID
 * @param {string} params.authorName Reviewer author name
 * @param {number} params.starRating Star rating (1-5)
 * @param {string} params.reviewText Content of the review
 * @param {string} params.draftReply Generated AI reply text
 * @param {string} [params.tag='other'] AI category tag ('praise' | 'bug' | 'feature' | 'other')
 * @param {string} [params.status='pending_approval'] Status of the review ('pending_approval' or 'posted')
 * @returns {Promise<Object>} Saved review document metadata
 */
async function saveDraftReview({ customerId, appId, packageName, reviewId, authorName, starRating, reviewText, draftReply, tag = 'other', status = 'pending_approval' }) {
  if (!customerId || !packageName || !reviewId) {
    throw new Error('[REVIEW MODEL ERROR] Missing required fields (customerId, packageName, reviewId).');
  }

  const validTags = ['praise', 'bug', 'feature', 'other'];
  const safeTag = validTags.includes(tag) ? tag : 'other';

  const reviewData = {
    customerId,
    ...(appId ? { appId } : {}),
    packageName,
    reviewId,
    authorName: authorName || 'Anonymous',
    starRating: typeof starRating === 'number' ? starRating : 0,
    reviewText: reviewText || '',
    draftReply: draftReply || '',
    originalAiDraft: draftReply || '',
    tag: safeTag,
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
 * Retrieves all review documents with status "pending_approval" from Firestore.
 * @returns {Promise<Array<Object>>} Array of pending review objects
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
      createdAtDate: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : null,
    });
  });

  return reviews;
}

/**
 * Retrieves review documents with status "pending_approval" strictly scoped to a specific customerId and optional appId.
 * @param {string} customerId Firestore Customer ID
 * @param {string} [appId] Optional Firestore App Document ID
 * @returns {Promise<Array<Object>>} Array of customer-scoped pending review objects
 */
async function getPendingReviewsByCustomer(customerId, appId = null) {
  if (!customerId) {
    throw new Error('[REVIEW MODEL ERROR] customerId is required for getPendingReviewsByCustomer.');
  }

  let query = db
    .collection(REVIEWS_COLLECTION)
    .where('customerId', '==', customerId)
    .where('status', '==', 'pending_approval');

  if (appId) {
    query = query.where('appId', '==', appId);
  }

  const snapshot = await query.get();

  const reviews = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    reviews.push({
      id: doc.id,
      ...data,
      createdAtDate: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : null,
    });
  });

  return reviews;
}

/**
 * Retrieves review documents with status "posted" or "rejected" strictly scoped to a specific customerId and optional appId.
 * Sorted newest first.
 * @param {string} customerId Firestore Customer ID
 * @param {string} [appId] Optional Firestore App Document ID
 * @returns {Promise<Array<Object>>} Array of customer-scoped historical review objects
 */
async function getCustomerReviewHistory(customerId, appId = null) {
  if (!customerId) {
    throw new Error('[REVIEW MODEL ERROR] customerId is required for getCustomerReviewHistory.');
  }

  let query = db
    .collection(REVIEWS_COLLECTION)
    .where('customerId', '==', customerId)
    .where('status', 'in', ['posted', 'rejected']);

  if (appId) {
    query = query.where('appId', '==', appId);
  }

  const snapshot = await query.get();

  const reviews = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    reviews.push({
      id: doc.id,
      ...data,
      createdAtDate: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : null,
      postedAtDate: data.postedAt ? (data.postedAt.toDate ? data.postedAt.toDate() : new Date(data.postedAt)) : null,
      updatedAtDate: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt)) : null,
    });
  });

  // Sort newest first by postedAt / updatedAt / createdAt
  reviews.sort((a, b) => {
    const timeA = a.postedAtDate || a.updatedAtDate || a.createdAtDate || new Date(0);
    const timeB = b.postedAtDate || b.updatedAtDate || b.createdAtDate || new Date(0);
    return timeB.getTime() - timeA.getTime();
  });

  return reviews;
}

/**
 * Retrieves a single review document by its Firestore document ID.
 * @param {string} docId Firestore Review Document ID
 * @returns {Promise<Object|null>} Review document object or null if not found
 */
async function getReviewById(docId) {
  if (!docId) return null;

  const doc = await db.collection(REVIEWS_COLLECTION).doc(docId).get();
  if (!doc.exists) return null;

  return {
    id: doc.id,
    ...doc.data(),
  };
}

/**
 * Updates status and optionally draftReply of a specific review document in Firestore.
 * @param {string} docId Firestore Document ID
 * @param {string} status New status string
 * @param {string} [draftReply] Optional updated draft reply text
 * @returns {Promise<Object>} Updated fields
 */
async function updateReviewStatus(docId, status, draftReply) {
  if (!docId || !status) {
    throw new Error('[REVIEW MODEL ERROR] docId and status are required for updateReviewStatus.');
  }

  const updateData = {
    status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (typeof draftReply === 'string') {
    updateData.draftReply = draftReply.trim();
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
  getPendingReviewsByCustomer,
  getCustomerReviewHistory,
  getReviewById,
  updateReviewStatus,
};
