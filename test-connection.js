const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// ============================================================================
// CONFIGURATION
// Replace this placeholder with your actual Android app package name.
// ============================================================================
const PACKAGE_NAME = "com.ford9.ai.coding.generator.code.creator.maker.writer.builder.assistant";
const SERVICE_ACCOUNT_FILE = path.join(__dirname, 'service-account.json');

async function testConnection() {
  console.log(`\n--- Google Play Developer API Connectivity Test ---`);
  console.log(`Package Name: ${PACKAGE_NAME}`);
  console.log(`Service Account File: ${SERVICE_ACCOUNT_FILE}\n`);

  // 1. Verify service account file exists before attempting authentication
  if (!fs.existsSync(SERVICE_ACCOUNT_FILE)) {
    console.error(`[AUTH ERROR] 'service-account.json' not found in project root.`);
    console.error(`Please place your Google service account JSON key file at: ${SERVICE_ACCOUNT_FILE}`);
    process.exit(1);
  }

  try {
    // 2. Initialize Google Auth with the androidpublisher scope
    const auth = new google.auth.GoogleAuth({
      keyFile: SERVICE_ACCOUNT_FILE,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    const androidpublisher = google.androidpublisher({
      version: 'v3',
      auth,
    });

    console.log(`Authenticating and querying reviews.list...`);

    // 3. Call the reviews.list endpoint
    const response = await androidpublisher.reviews.list({
      packageName: PACKAGE_NAME,
    });

    console.log(`\n[SUCCESS] API connection successful! (HTTP ${response.status})`);

    const reviews = response.data.reviews;

    if (!reviews || reviews.length === 0) {
      console.log(`[INFO] No reviews found for package '${PACKAGE_NAME}'.`);
      console.log(`Raw Response Data:`, JSON.stringify(response.data, null, 2));
      return;
    }

    console.log(`\nFound ${reviews.length} review(s):\n`);

    // 4. Log specific review details: ID, star rating, and review text
    reviews.forEach((review, index) => {
      const userComment = review.comments && review.comments[0] && review.comments[0].userComment;
      const starRating = userComment ? userComment.starRating : 'N/A';
      const text = userComment ? userComment.text : '(No text)';

      console.log(`--- Review #${index + 1} ---`);
      console.log(`ID:         ${review.reviewId}`);
      console.log(`Author:     ${review.authorName || 'Anonymous'}`);
      console.log(`Star Rating: ${starRating}/5`);
      console.log(`Text:       ${text}`);
      console.log(`--------------------\n`);
    });

    console.log(`Raw Response Data:`);
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error) {
    handleError(error);
  }
}

function handleError(error) {
  const status = error.status || error.code || (error.response && error.response.status);
  const message = error.message || '';

  console.error(`\n=================== ERROR DETAILS ===================`);

  if (status === 401 || message.includes('invalid_grant') || message.includes('unauthorized')) {
    console.error(`[AUTH ERROR] Authentication failed (Status ${status}).`);
    console.error(`Check that 'service-account.json' is a valid Google service account key file.`);
  } else if (status === 403 || message.includes('forbidden') || message.includes('permission')) {
    console.error(`[PERMISSION ERROR] Access Forbidden (Status 403).`);
    console.error(`Common causes:`);
    console.error(` 1. Android Publisher API is not enabled in your Google Cloud Project.`);
    console.error(` 2. The service account email has not been invited/added to your Google Play Console under 'Users and permissions'.`);
    console.error(` 3. The service account does not have sufficient permissions (e.g. 'View app information and download bulk reports').`);
  } else if (status === 404 || message.includes('Package not found')) {
    console.error(`[PACKAGE ERROR] Package not found (Status 404).`);
    console.error(`Check if PACKAGE_NAME '${PACKAGE_NAME}' is correct and exists in your Google Play Console.`);
  } else if (status === 400) {
    console.error(`[REQUEST ERROR] Invalid Request (Status 400).`);
    console.error(`Message: ${message}`);
  } else {
    console.error(`[UNEXPECTED ERROR] Code/Status: ${status || 'Unknown'}`);
    console.error(`Message: ${message}`);
  }

  if (error.response && error.response.data) {
    console.error(`\nRaw Error Response:`);
    console.error(JSON.stringify(error.response.data, null, 2));
  }
  console.error(`=====================================================\n`);
}

testConnection();
