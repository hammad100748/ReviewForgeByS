const express = require('express');
const { google } = require('googleapis');
const { db, admin } = require('../config/firebase');
const {
  getPendingReviews,
  getPendingReviewsByCustomer,
  getCustomerReviewHistory,
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
const {
  addApp,
  getAppsByCustomer,
  getAppById,
  setAppAutoPostMode,
} = require('../models/app');
const { postApprovedReply } = require('../services/postReply');
const { processSingleApp } = require('../services/detectReviews');

const router = express.Router();

// ============================================================================
// PUBLIC HEALTH CHECK ENDPOINT
// ============================================================================

/**
 * GET /health (and /api/health)
 * Public, lightweight health check endpoint confirming server process status.
 * Required for Render, Google Cloud Run, and uptime monitoring services.
 */
router.get('/health', (req, res) => {
  return res.status(200).json({ status: 'ok' });
});

// ============================================================================
// AUTHENTICATION & ACCESS CONTROL MIDDLEWARE
// ============================================================================

/**
 * Middleware enforcing HTTP Basic Auth for Admin routes.
 * Compares credentials strictly against process.env.ADMIN_USERNAME and process.env.ADMIN_PASSWORD (fail closed).
 */
function requireAdminBasicAuth(req, res, next) {
  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  // Fail closed if server environment variables are missing or unconfigured
  if (!expectedUsername || !expectedPassword || !expectedUsername.trim() || !expectedPassword.trim()) {
    res.setHeader('WWW-Authenticate', 'Basic realm="ReviewForge Admin Dashboard"');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Admin authentication credentials not configured on server.',
    });
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="ReviewForge Admin Dashboard"');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing Admin Basic Auth header.',
    });
  }

  const base64Credentials = authHeader.split('Basic ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
  const [username, password] = credentials.split(':');

  if (username !== expectedUsername || password !== expectedPassword) {
    res.setHeader('WWW-Authenticate', 'Basic realm="ReviewForge Admin Dashboard"');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid admin credentials.',
    });
  }

  next();
}

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
// ADMIN FOUNDER ANALYTICS ENDPOINT
// ============================================================================

/**
 * GET /api/admin/analytics
 * Returns aggregate metrics, performance ratios, and founder follow-up lists.
 * Protected by HTTP Basic Auth.
 */
router.get('/admin/analytics', requireAdminBasicAuth, async (req, res) => {
  try {
    const nowMs = Date.now();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    // 1. Fetch all customer documents
    const custSnapshot = await db.collection('customers').get();
    const customers = [];
    custSnapshot.forEach((doc) => {
      const data = doc.data();
      customers.push({
        id: doc.id,
        ...data,
        createdAtDate: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : null,
      });
    });

    // 2. Fetch all review documents
    const revSnapshot = await db.collection('reviews').get();
    const reviews = [];
    revSnapshot.forEach((doc) => {
      const data = doc.data();
      reviews.push({
        id: doc.id,
        ...data,
        createdAtDate: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : null,
        postedAtDate: data.postedAt ? (data.postedAt.toDate ? data.postedAt.toDate() : new Date(data.postedAt)) : null,
      });
    });

    // 3. Aggregate Customer Metrics
    const totalCustomers = customers.length;
    const customersByStatus = {};
    customers.forEach((c) => {
      const status = c.onboardingStatus || 'AWAITING_VERIFICATION';
      customersByStatus[status] = (customersByStatus[status] || 0) + 1;
    });

    const activeCustomers = customers.filter((c) => c.onboardingStatus === 'ACTIVE');
    const autoPostEnabledCount = activeCustomers.filter((c) => c.autoPostEnabled === true).length;
    const autoPostDisabledCount = activeCustomers.length - autoPostEnabledCount;
    const autoPostAdoption = {
      enabled: autoPostEnabledCount,
      disabled: autoPostDisabledCount,
    };

    // 4. Aggregate Review Metrics
    const totalReviewsProcessed = reviews.length;
    const reviewsByStatus = {
      pending_approval: 0,
      posted: 0,
      rejected: 0,
    };
    reviews.forEach((r) => {
      const s = r.status || 'pending_approval';
      reviewsByStatus[s] = (reviewsByStatus[s] || 0) + 1;
    });

    const postedCount = reviewsByStatus.posted || 0;
    const rejectedCount = reviewsByStatus.rejected || 0;
    const totalDecided = postedCount + rejectedCount;
    const approvalRate = totalDecided > 0 ? Math.round((postedCount / totalDecided) * 100) : null;

    // Edit Rate calculation for posted reviews with originalAiDraft stored
    const postedWithOriginal = reviews.filter(
      (r) => r.status === 'posted' && typeof r.originalAiDraft === 'string' && r.originalAiDraft.length > 0
    );
    let editRate = null;
    if (postedWithOriginal.length > 0) {
      const editedCount = postedWithOriginal.filter(
        (r) => (r.draftReply || '').trim() !== (r.originalAiDraft || '').trim()
      ).length;
      editRate = Math.round((editedCount / postedWithOriginal.length) * 100);
    }

    // 5. Per-Customer Breakdown
    const reviewsPerCustomer = customers.map((c) => {
      const custRev = reviews.filter((r) => r.customerId === c.id);
      return {
        customerId: c.id,
        customerName: c.name || 'Unnamed',
        appName: c.appName || '',
        packageName: c.packageName || 'Unknown',
        totalReviews: custRev.length,
        posted: custRev.filter((r) => r.status === 'posted').length,
        pending: custRev.filter((r) => r.status === 'pending_approval').length,
        rejected: custRev.filter((r) => r.status === 'rejected').length,
      };
    });

    // 6. Stale Onboarding (AWAITING_VERIFICATION created > 3 days ago)
    const staleOnboarding = customers
      .filter((c) => {
        if (c.onboardingStatus !== 'AWAITING_VERIFICATION') return false;
        if (!c.createdAtDate) return false;
        return nowMs - c.createdAtDate.getTime() > threeDaysMs;
      })
      .map((c) => {
        const daysAwaiting = Math.floor((nowMs - c.createdAtDate.getTime()) / (24 * 60 * 60 * 1000));
        return {
          id: c.id,
          name: c.name,
          email: c.email,
          appName: c.appName || '',
          packageName: c.packageName,
          daysAwaiting,
          createdAt: c.createdAtDate,
        };
      });

    // 7. Inactive Customers (ACTIVE customers with 0 reviews posted in last 7 days)
    const sevenDaysAgoMs = nowMs - sevenDaysMs;
    const inactiveCustomers = activeCustomers
      .filter((c) => {
        const recentPostedCount = reviews.filter((r) => {
          if (r.customerId !== c.id) return false;
          if (r.status !== 'posted') return false;
          if (!r.postedAtDate) return false;
          return r.postedAtDate.getTime() >= sevenDaysAgoMs;
        }).length;
        return recentPostedCount === 0;
      })
      .map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        appName: c.appName || '',
        packageName: c.packageName,
      }));

    return res.status(200).json({
      success: true,
      data: {
        totalCustomers,
        customersByStatus,
        autoPostAdoption,
        totalReviewsProcessed,
        reviewsByStatus,
        approvalRate,
        editRate,
        reviewsPerCustomer,
        staleOnboarding,
        inactiveCustomers,
      },
    });
  } catch (error) {
    console.error(`[ANALYTICS ERROR] ${error.message}`);
    return res.status(500).json({
      success: false,
      error: `Failed to generate analytics: ${error.message}`,
    });
  }
});

// ============================================================================
// CUSTOMER PORTAL SCOPED APPS, REVIEWS, ME, & AUTO-POST ENDPOINTS
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
        appName: fullCustomer.appName || '',
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
 * GET /api/customer/apps
 * Protected endpoint returning all apps belonging to the logged-in customer.
 * Powers the app-switcher dropdown on customer-frontend.
 */
router.get('/customer/apps', verifyCustomerAuth, async (req, res) => {
  try {
    const apps = await getAppsByCustomer(req.customer.id);
    return res.status(200).json({
      success: true,
      data: apps,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to fetch customer apps: ${error.message}`,
    });
  }
});

/**
 * POST /api/customer/apps/:appId/sync
 * Protected endpoint for an on-demand review detection trigger for a specific app.
 * Enforces a 90-second manual sync cooldown rate limit per app.
 */
router.post('/customer/apps/:appId/sync', verifyCustomerAuth, async (req, res) => {
  const { appId } = req.params;

  try {
    const app = await getAppById(appId);
    if (!app || app.customerId !== req.customer.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: App does not belong to your account.',
      });
    }

    // 90-Second Cooldown Rate Limiting
    const nowMs = Date.now();
    if (app.lastManualSyncAt) {
      const lastSyncMs = app.lastManualSyncAt.getTime ? app.lastManualSyncAt.getTime() : new Date(app.lastManualSyncAt).getTime();
      const elapsedMs = nowMs - lastSyncMs;
      if (elapsedMs < 90000) {
        const remainingSeconds = Math.ceil((90000 - elapsedMs) / 1000);
        return res.status(429).json({
          success: false,
          error: `Please wait ${remainingSeconds} more second(s) before syncing again.`,
          remainingSeconds,
        });
      }
    }

    // Fetch parent customer credentials
    const fullCustomer = await getCustomer(req.customer.id);
    if (!fullCustomer || !fullCustomer.serviceAccountJson) {
      return res.status(400).json({
        success: false,
        error: 'Customer service account credentials incomplete.',
      });
    }

    const fullAppObj = {
      ...app,
      serviceAccountJson: fullCustomer.serviceAccountJson,
      customerName: fullCustomer.name,
      customerEmail: fullCustomer.email,
    };

    // Run single-app detection cycle
    const stats = await processSingleApp(fullAppObj, { isManual: true });
    const newCount = stats.appNewReviews || 0;
    const message = newCount > 0 ? `Found ${newCount} new review(s)` : 'No new reviews found';

    return res.status(200).json({
      success: true,
      newReviewsFound: newCount,
      message,
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[MANUAL SYNC ERROR] Sync failed for app ${appId}: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: `Sync failed: ${error.message}`,
    });
  }
});

/**
 * POST /api/customer/apps/:appId/autopost
 * Protected endpoint for a logged-in customer to toggle autoPostEnabled for a specific app.
 * Payload: { "enabled": true } or { "enabled": false }
 */
router.post('/customer/apps/:appId/autopost', verifyCustomerAuth, async (req, res) => {
  const { appId } = req.params;
  const { enabled } = req.body || {};

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({
      success: false,
      error: 'Field "enabled" must be a boolean (true or false).',
    });
  }

  try {
    const app = await getAppById(appId);
    if (!app || app.customerId !== req.customer.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: App does not belong to your account.',
      });
    }

    await setAppAutoPostMode(appId, enabled);

    return res.status(200).json({
      success: true,
      appId,
      autoPostEnabled: enabled,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to update app auto-post mode: ${error.message}`,
    });
  }
});

/**
 * POST /api/customer/autopost
 * Protected legacy endpoint for a logged-in customer to toggle their customer autoPostEnabled setting.
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

    // Also update all apps belonging to this customer for backward compatibility
    const apps = await getAppsByCustomer(req.customer.id);
    for (const app of apps) {
      await setAppAutoPostMode(app.id, enabled);
    }

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
 * POST /api/customer/autopost/bulk-post-pending
 * Protected endpoint that posts all pending_approval reviews for the logged-in customer as-is.
 * Continues through all pending reviews even if an individual post fails.
 */
router.post('/customer/autopost/bulk-post-pending', verifyCustomerAuth, async (req, res) => {
  try {
    const pendingReviews = await getPendingReviewsByCustomer(req.customer.id);
    let postedCount = 0;
    let failedCount = 0;

    for (const review of pendingReviews) {
      try {
        await postApprovedReply(review.id);
        postedCount++;
      } catch (err) {
        console.error(`[BULK POST ERROR] Failed to post reply for review ${review.id}:`, err);
        failedCount++;
      }
    }

    return res.status(200).json({
      success: true,
      postedCount,
      failedCount,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to bulk post pending reviews: ${error.message}`,
    });
  }
});

/**
 * POST /api/customer/verify-connection
 * Protected customer-level endpoint to test Google Play Console Developer API connection using stored credentials.
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
 * GET /api/customer/reviews/pending?appId=xyz
 * Returns pending_approval reviews strictly scoped to the logged-in customer and optional appId.
 * If appId is provided: verifies ownership (must match customerId).
 * If appId is omitted: defaults to customer's first app if available, for backward compatibility.
 */
router.get('/customer/reviews/pending', verifyCustomerAuth, async (req, res) => {
  try {
    let targetAppId = req.query.appId ? String(req.query.appId).trim() : null;

    if (targetAppId) {
      const app = await getAppById(targetAppId);
      if (!app || app.customerId !== req.customer.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: App does not belong to your account.',
        });
      }
    } else {
      // Backward compatibility: If no appId passed, default to customer's first app if only one exists
      const customerApps = await getAppsByCustomer(req.customer.id);
      if (customerApps.length === 1) {
        targetAppId = customerApps[0].id;
      }
    }

    const reviews = await getPendingReviewsByCustomer(req.customer.id, targetAppId);
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
 * GET /api/customer/reviews/history?appId=xyz
 * Returns reviews with status 'posted' or 'rejected' strictly scoped to the logged-in customer and optional appId.
 * Sorted newest first.
 */
router.get('/customer/reviews/history', verifyCustomerAuth, async (req, res) => {
  try {
    let targetAppId = req.query.appId ? String(req.query.appId).trim() : null;

    if (targetAppId) {
      const app = await getAppById(targetAppId);
      if (!app || app.customerId !== req.customer.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: App does not belong to your account.',
        });
      }
    } else {
      // Backward compatibility: If no appId passed, default to customer's first app if only one exists
      const customerApps = await getAppsByCustomer(req.customer.id);
      if (customerApps.length === 1) {
        targetAppId = customerApps[0].id;
      }
    }

    const history = await getCustomerReviewHistory(req.customer.id, targetAppId);
    return res.status(200).json({
      success: true,
      data: history,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to fetch review history: ${error.message}`,
    });
  }
});

/**
 * POST /api/customer/reviews/:docId/undo-reject
 * Reverts a rejected review's status back to 'pending_approval' after ownership verification.
 */
router.post('/customer/reviews/:docId/undo-reject', verifyCustomerAuth, async (req, res) => {
  const { docId } = req.params;

  try {
    const review = await getReviewById(docId);
    if (!review) {
      return res.status(404).json({ success: false, error: 'Review document not found.' });
    }

    if (review.customerId !== req.customer.id) {
      return res.status(403).json({ success: false, error: 'Access denied: You do not own this review document.' });
    }

    if (review.status !== 'rejected') {
      return res.status(400).json({
        success: false,
        error: 'Only rejected reviews can be moved back to pending approval.',
      });
    }

    await updateReviewStatus(docId, 'pending_approval');
    return res.status(200).json({
      success: true,
      message: `Review '${docId}' moved back to pending approval.`,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to undo review rejection: ${error.message}`,
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
// ADMIN REVIEWS ENDPOINTS (PROTECTED BY HTTP BASIC AUTH)
// ============================================================================

/**
 * GET /api/reviews/pending
 * Returns all review documents currently in 'pending_approval' status.
 * Protected by HTTP Basic Auth.
 */
router.get('/reviews/pending', requireAdminBasicAuth, async (req, res) => {
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
 * Protected by HTTP Basic Auth.
 */
router.post('/reviews/:docId/approve', requireAdminBasicAuth, async (req, res) => {
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
 * Protected by HTTP Basic Auth.
 */
router.post('/reviews/:docId/edit-approve', requireAdminBasicAuth, async (req, res) => {
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
 * Protected by HTTP Basic Auth.
 */
router.post('/reviews/:docId/reject', requireAdminBasicAuth, async (req, res) => {
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
// ADMIN CUSTOMERS ENDPOINTS & PUBLIC CUSTOMER CHECK
// ============================================================================

/**
 * Shared Handler for fetching active customers along with their connected apps.
 * Protected by HTTP Basic Auth.
 * SECURITY: Decrypted service account JSON credentials are NEVER returned in this response.
 */
const getActiveCustomersHandler = async (req, res) => {
  try {
    const customers = await getAllActiveCustomers();

    // Attach connected apps to each customer object
    const safeCustomersWithApps = await Promise.all(
      customers.map(async ({ serviceAccountJson, encryptedServiceAccount, ...safeCustomer }) => {
        let apps = [];
        try {
          apps = await getAppsByCustomer(safeCustomer.id);
        } catch (appErr) {
          console.error(`[ADMIN CUSTOMERS API] Failed fetching apps for customer ${safeCustomer.id}: ${appErr.message}`);
        }
        return {
          ...safeCustomer,
          apps: apps.map(({ id, appName, packageName, autoPostEnabled, createdAt, lastSyncedAt, lastManualSyncAt }) => ({
            id,
            appName,
            packageName,
            autoPostEnabled: Boolean(autoPostEnabled),
            createdAt,
            lastSyncedAt,
            lastManualSyncAt,
          })),
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: safeCustomersWithApps,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to fetch customers: ${error.message}`,
    });
  }
};

/**
 * GET /api/customers
 * GET /api/admin/customers
 * Returns all active customers with their nested connected apps.
 * Protected by HTTP Basic Auth.
 */
router.get('/customers', requireAdminBasicAuth, getActiveCustomersHandler);
router.get('/admin/customers', requireAdminBasicAuth, getActiveCustomersHandler);

/**
 * POST /api/admin/customers/:customerId/apps
 * Adds an additional app to an already-existing, already-verified customer.
 * Protected by HTTP Basic Auth.
 * Payload: { "appName": "...", "packageName": "..." }
 */
router.post('/admin/customers/:customerId/apps', requireAdminBasicAuth, async (req, res) => {
  const { customerId } = req.params;
  const { appName, packageName } = req.body || {};

  if (!appName || typeof appName !== 'string' || !appName.trim()) {
    return res.status(400).json({ success: false, error: 'App Name is required.' });
  }

  if (!packageName || typeof packageName !== 'string' || !packageName.trim()) {
    return res.status(400).json({ success: false, error: 'Package Name is required.' });
  }

  try {
    const customer = await getCustomer(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found.' });
    }

    const newApp = await addApp({
      customerId,
      appName: appName.trim(),
      packageName: packageName.trim(),
    });

    return res.status(200).json({
      success: true,
      data: newApp,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to add app to customer: ${error.message}`,
    });
  }
});

/**
 * GET /api/customers/by-email?email=x@example.com
 * Looks up a customer record by email in Firestore for access control,
 * and checks if a Firebase Auth account exists for this email.
 * Public endpoint used by customer-frontend before sign up / log in.
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
    const trimmedEmail = email.trim().toLowerCase();
    const customer = await findCustomerByEmail(trimmedEmail);

    if (!customer) {
      return res.status(200).json({
        success: true,
        exists: false,
      });
    }

    let hasAuthAccount = false;
    try {
      await admin.auth().getUserByEmail(trimmedEmail);
      hasAuthAccount = true;
    } catch (authErr) {
      if (authErr.code === 'auth/user-not-found') {
        hasAuthAccount = false;
      } else {
        console.error(`[AUTH CHECK ERROR] Unexpected error checking Firebase Auth for '${trimmedEmail}':`, authErr);
        return res.status(500).json({
          success: false,
          error: `Error checking Firebase Auth user status: ${authErr.message}`,
        });
      }
    }

    return res.status(200).json({
      success: true,
      exists: true,
      data: {
        onboardingStatus: customer.onboardingStatus || 'AWAITING_VERIFICATION',
        appName: customer.appName || '',
        packageName: customer.packageName,
        hasAuthAccount,
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
 * POST /api/customers/create
 * Creates a new customer record with encrypted service account credentials and AWAITING_VERIFICATION status,
 * AND automatically creates their first app document in the "apps" collection.
 * Protected by HTTP Basic Auth.
 * Payload: { "name": "...", "email": "...", "appName": "...", "packageName": "...", "serviceAccountJson": { ... } }
 */
router.post('/customers/create', requireAdminBasicAuth, async (req, res) => {
  const { name, email, appName, packageName, serviceAccountJson } = req.body || {};

  // 1. Validate required fields
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Customer Name is required.' });
  }

  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ success: false, error: 'Customer Email is required.' });
  }

  if (!appName || typeof appName !== 'string' || !appName.trim()) {
    return res.status(400).json({ success: false, error: 'App Name is required.' });
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
      appName: appName.trim(),
      packageName: packageName.trim(),
      serviceAccountJson: parsedJson,
      onboardingStatus: 'AWAITING_VERIFICATION',
    });

    // 5. Automatically create the first app document in "apps" collection
    const newApp = await addApp({
      customerId: newCustomer.id,
      appName: appName.trim(),
      packageName: packageName.trim(),
    });

    return res.status(200).json({
      success: true,
      data: {
        id: newCustomer.id,
        name: newCustomer.name,
        email: newCustomer.email,
        appId: newApp.id,
        appName: newApp.appName,
        packageName: newApp.packageName,
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
 * Protected by HTTP Basic Auth.
 * Payload: { "enabled": true } or { "enabled": false }
 */
router.post('/customers/:customerId/autopost', requireAdminBasicAuth, async (req, res) => {
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
