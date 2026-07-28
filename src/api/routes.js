const express = require('express');
const { getPendingReviews, updateReviewStatus } = require('../models/review');
const { getAllActiveCustomers, setAutoPostMode } = require('../models/customer');
const { postApprovedReply } = require('../services/postReply');

const router = express.Router();

// ============================================================================
// REVIEWS ENDPOINTS
// ============================================================================

/**
 * GET /api/reviews/pending
 * Returns all review documents currently in 'pending_approval' status.
 */
router.get('/reviews/pending', async (req, res) => {
  try {
    const reviews = await getPendingReviews();
    return res.status(200).json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to fetch pending reviews: ${error.message}`,
    });
  }
});

/**
 * POST /api/reviews/:docId/approve
 * Approves and posts the draft reply as-is to Google Play Store.
 */
router.post('/reviews/:docId/approve', async (req, res) => {
  const { docId } = req.params;
  try {
    const result = await postApprovedReply(docId);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    const statusCode = error.message.includes('not found') ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/reviews/:docId/edit-approve
 * Updates the draft reply with newText, then posts it to Google Play Store.
 * Payload: { "newText": "Thank you for your feedback!" }
 */
router.post('/reviews/:docId/edit-approve', async (req, res) => {
  const { docId } = req.params;
  const { newText } = req.body || {};

  if (!newText || typeof newText !== 'string' || !newText.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Field "newText" is required and must be a non-empty string.',
    });
  }

  const trimmedText = newText.trim();
  if (trimmedText.length > 350) {
    return res.status(400).json({
      success: false,
      error: `Reply text length (${trimmedText.length} chars) exceeds Google's 350-character limit.`,
    });
  }

  try {
    // 1. Save edited reply text to Firestore
    await updateReviewStatus(docId, 'pending_approval', trimmedText);

    // 2. Post updated reply to Google Play Store
    const result = await postApprovedReply(docId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    const statusCode = error.message.includes('not found') ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/reviews/:docId/reject
 * Marks a review draft's status as "rejected".
 *
 * DESIGN RATIONALE:
 * Setting status explicitly to "rejected" in Firestore removes the review draft from the
 * 'pending_approval' queue (so it won't clutter the approval UI), while maintaining a complete
 * historical audit trail of AI drafts that were rejected by human operators.
 */
router.post('/reviews/:docId/reject', async (req, res) => {
  const { docId } = req.params;
  try {
    await updateReviewStatus(docId, 'rejected');
    return res.status(200).json({
      success: true,
      message: `Review draft '${docId}' rejected successfully.`,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to reject review draft: ${error.message}`,
    });
  }
});

// ============================================================================
// CUSTOMERS ENDPOINTS
// ============================================================================

/**
 * GET /api/customers
 * Returns all active customers.
 * SECURITY: Decrypted service account JSON credentials are NEVER returned in this response.
 */
router.get('/customers', async (req, res) => {
  try {
    const customers = await getAllActiveCustomers();

    // Strip sensitive service account credentials before returning JSON
    const safeCustomers = customers.map(({ serviceAccountJson, encryptedServiceAccount, ...safeCustomer }) => safeCustomer);

    return res.status(200).json({
      success: true,
      data: safeCustomers,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to fetch customers: ${error.message}`,
    });
  }
});

/**
 * POST /api/customers/:customerId/autopost
 * Toggles autoPostEnabled mode for a specific customer.
 * Payload: { "enabled": true } or { "enabled": false }
 */
router.post('/customers/:customerId/autopost', async (req, res) => {
  const { customerId } = req.params;
  const { enabled } = req.body || {};

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({
      success: false,
      error: 'Field "enabled" must be a boolean (true or false).',
    });
  }

  try {
    await setAutoPostMode(customerId, enabled);

    return res.status(200).json({
      success: true,
      data: {
        customerId,
        autoPostEnabled: enabled,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to update auto-post mode: ${error.message}`,
    });
  }
});

module.exports = router;
