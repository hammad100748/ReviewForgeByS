const express = require('express');
const { google } = require('googleapis');
const { admin } = require('../config/firebase');
const {
  getPendingReviews,
  getPendingReviewsByCustomer,
  getReviewById,
  updateReviewStatus,
} = require('../models/review');
const {
  getAllActiveCustomers,
  setAutoPostMode,
  addCustomer,
  findCustomerByEmail,
  getCustomer,
  updateOnboardingStatus,
} = require('../models/customer');
const { postApprovedReply } = require('../services/postReply');

const router = express.Router();

// ============================================================================
// AUTHENTICATION & ACCESS CONTROL MIDDLEWARE
// ============================================================================

/**
 * Middleware to verify Firebase ID Token and enforce email pre-provisioning in Firestore.
 * Rejects with HTTP 403 if the authenticated email is not found in Firestore.
 */
async function verifyCustomerAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing or invalid Authorization Bearer header.',
    });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const email = decodedToken.email;

    if (!email) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: ID Token does not contain an email address.',
      });
    }

    const customer = await findCustomerByEmail(email);

    if (!customer) {
      return res.status(403).json({
        success: false,
        error: 'No account found for this email. Please contact support.',
      });
    }

    req.user = decodedToken;
    req.customer = customer;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: `Unauthorized: Invalid token (${err.message}).`,
    });
  }
}

// ============================================================================
// CUSTOMER PORTAL SCOPED REVIEWS, ME, & AUTO-POST ENDPOINTS
// ============================================================================

/**
 * GET /api/customer/me
 * Protected endpoint returning current customer's profile and service account email.
 * SECURITY: Never returns decrypted private key or full service account JSON.
 */
router.get('/customer/me', verifyCustomerAuth, async (req, res) => {
  try {
    const fullCustomer = await getCustomer(req.customer.id);
    if (!fullCustomer) {
      return res.status(403).json({
        success: false,
        error: 'No account found for this email. Please contact support.',
      });
    }

    const serviceAccountEmail = fullCustomer.serviceAccountJson ? fullCustomer.serviceAccountJson.client_email : null;

    return res.status(200).json({
      success: true,
      data: {
        id: fullCustomer.id,
        name: fullCustomer.name,
        email: fullCustomer.email,
        packageName: fullCustomer.packageName,
        autoPostEnabled: Boolean(fullCustomer.autoPostEnabled),
        onboardingStatus: fullCustomer.onboardingStatus || 'AWAITING_VERIFICATION',
        serviceAccountEmail,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to fetch customer profile: ${error.message}`,
    });
  }
});

/**
 * POST /api/customer/autopost
 * Protected endpoint for a logged-in customer to toggle their autoPostEnabled setting.
 * Payload: { "enabled": true } or { "enabled": false }
 */
router.post('/customer/autopost', verifyCustomerAuth, async (req, res) => {
  const { enabled } = req.body || {};

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({
      success: false,
      error: 'Field "enabled" must be a boolean (true or false).',
    });
  }

  try {
    await setAutoPostMode(req.customer.id, enabled);

    return res.status(200).json({
      success: true,
      autoPostEnabled: enabled,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to update auto-post mode: ${error.message}`,
    });
  }
});

/**
 * POST /api/customer/verify-connection
 * Protected endpoint to test Google Play Console Developer API connection using stored credentials.
 * On success: updates onboardingStatus to "ACTIVE".
 */
router.post('/customer/verify-connection', verifyCustomerAuth, async (req, res) => {
  try {
    const fullCustomer = await getCustomer(req.customer.id);
    if (!fullCustomer || !fullCustomer.serviceAccountJson || !fullCustomer.packageName) {
      return res.status(400).json({
        success: false,
        error: 'Customer record or service account credentials incomplete.',
      });
    }

    // Authenticate with Google Play Developer API
    const authClient = new google.auth.GoogleAuth({
      credentials: fullCustomer.serviceAccountJson,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    const androidpublisher = google.androidpublisher({
      version: 'v3',
      auth: authClient,
    });

    // Execute test reviews.list call to verify permission
    await androidpublisher.reviews.list({
      packageName: fullCustomer.packageName,
      maxResults: 1,
    });

    // On success: update onboardingStatus to ACTIVE
    await updateOnboardingStatus(fullCustomer.id, 'ACTIVE');

    return res.status(200).json({
      success: true,
      onboardingStatus: 'ACTIVE',
      message: 'Play Console connection verified successfully!',
    });
  } catch (error) {
    console.error(`[VERIFY CONNECTION ERROR] Verification failed for customer ${req.customer.id}: ${error.message}`);

    return res.status(400).json({
      success: false,
      error: "Unable to verify Play Console permission. Please confirm the service account email has been added to Google Play Console with 'Reply to reviews' permission.",
    });
  }
});

/**
 * GET /api/customer/reviews/pending
 * Returns pending_approval reviews strictly scoped to the logged-in customer.
 */
router.get('/customer/reviews/pending', verifyCustomerAuth, async (req, res) => {
  try {
    const reviews = await getPendingReviewsByCustomer(req.customer.id);
    return res.status(200).json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to fetch customer reviews: ${error.message}`,
    });
  }
});

/**
 * POST /api/customer/reviews/:docId/approve
 * Approves and posts the draft reply as-is to Google Play Store after ownership verification.
 */
router.post('/customer/reviews/:docId/approve', verifyCustomerAuth, async (req, res) => {
  const { docId } = req.params;

  try {
    const review = await getReviewById(docId);
    if (!review) {
      return res.status(404).json({ success: false, error: 'Review document not found.' });
    }

    if (review.customerId !== req.customer.id) {
      return res.status(403).json({ success: false, error: 'Access denied: You do not own this review document.' });
    }

    const result = await postApprovedReply(docId);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/customer/reviews/:docId/edit-approve
 * Updates the draft reply with newText, then posts it after ownership verification.
 */
router.post('/customer/reviews/:docId/edit-approve', verifyCustomerAuth, async (req, res) => {
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
    const review = await getReviewById(docId);
    if (!review) {
      return res.status(404).json({ success: false, error: 'Review document not found.' });
    }

    if (review.customerId !== req.customer.id) {
      return res.status(403).json({ success: false, error: 'Access denied: You do not own this review document.' });
    }

    await updateReviewStatus(docId, 'pending_approval', trimmedText);
    const result = await postApprovedReply(docId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/customer/reviews/:docId/reject
 * Marks a review draft's status as "rejected" after ownership verification.
 */
router.post('/customer/reviews/:docId/reject', verifyCustomerAuth, async (req, res) => {
  const { docId } = req.params;

  try {
    const review = await getReviewById(docId);
    if (!review) {
      return res.status(404).json({ success: false, error: 'Review document not found.' });
    }

    if (review.customerId !== req.customer.id) {
      return res.status(403).json({ success: false, error: 'Access denied: You do not own this review document.' });
    }

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
// ADMIN REVIEWS ENDPOINTS
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
// ADMIN CUSTOMERS ENDPOINTS
// ============================================================================

/**
 * GET /api/customers/by-email?email=x@example.com
 * Looks up a customer record by email in Firestore for access control.
 * SECURITY: If not found, returns { success: true, exists: false } without leaking customer data.
 */
router.get('/customers/by-email', async (req, res) => {
  const email = req.query.email;

  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Query parameter "email" is required.',
    });
  }

  try {
    const customer = await findCustomerByEmail(email.trim());

    if (!customer) {
      return res.status(200).json({
        success: true,
        exists: false,
      });
    }

    return res.status(200).json({
      success: true,
      exists: true,
      data: {
        onboardingStatus: customer.onboardingStatus || 'AWAITING_VERIFICATION',
        packageName: customer.packageName,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to check customer email: ${error.message}`,
    });
  }
});

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
 * POST /api/customers/create
 * Creates a new customer record with encrypted service account credentials and AWAITING_VERIFICATION status.
 * Payload: { "name": "...", "email": "...", "packageName": "...", "serviceAccountJson": { ... } }
 */
router.post('/customers/create', async (req, res) => {
  const { name, email, packageName, serviceAccountJson } = req.body || {};

  // 1. Validate required fields
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Customer Name is required.' });
  }

  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ success: false, error: 'Customer Email is required.' });
  }

  if (!packageName || typeof packageName !== 'string' || !packageName.trim()) {
    return res.status(400).json({ success: false, error: 'Package Name is required.' });
  }

  if (!serviceAccountJson || (typeof serviceAccountJson !== 'object' && typeof serviceAccountJson !== 'string')) {
    return res.status(400).json({ success: false, error: 'Service Account JSON is required.' });
  }

  // 2. Parse and validate JSON structure & required Google Service Account fields
  let parsedJson = serviceAccountJson;
  if (typeof serviceAccountJson === 'string') {
    try {
      parsedJson = JSON.parse(serviceAccountJson);
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Uploaded file is not valid JSON.' });
    }
  }

  if (!parsedJson || typeof parsedJson !== 'object') {
    return res.status(400).json({ success: false, error: 'Service Account JSON must be a valid object.' });
  }

  if (!parsedJson.client_email || !parsedJson.private_key) {
    return res.status(400).json({
      success: false,
      error: 'Uploaded Service Account JSON is missing required fields (client_email, private_key).',
    });
  }

  // 3. Check for existing customer email
  try {
    const existingCustomer = await findCustomerByEmail(email);
    if (existingCustomer) {
      return res.status(400).json({
        success: false,
        error: `A customer with email '${email.trim().toLowerCase()}' already exists.`,
      });
    }

    // 4. Create customer record in Firestore
    const newCustomer = await addCustomer({
      name: name.trim(),
      email: email.trim(),
      packageName: packageName.trim(),
      serviceAccountJson: parsedJson,
      onboardingStatus: 'AWAITING_VERIFICATION',
    });

    return res.status(200).json({
      success: true,
      data: {
        id: newCustomer.id,
        name: newCustomer.name,
        email: newCustomer.email,
        packageName: newCustomer.packageName,
        onboardingStatus: newCustomer.onboardingStatus,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to create customer: ${error.message}`,
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
module.exports.verifyCustomerAuth = verifyCustomerAuth;
