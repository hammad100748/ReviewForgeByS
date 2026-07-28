// NOTE: Google Play Developer API caps review reply text at 350 characters.
// Replies exceeding 350 characters will be rejected by Google's API with a 400 Bad Request error.

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// ============================================================================
// CONFIGURATION
// Replace these placeholders with your actual package name, review ID, and reply text.
// ============================================================================
const PACKAGE_NAME = "com.ford9.ai.coding.generator.code.creator.maker.writer.builder.assistant";
const REVIEW_ID = "f2f5c2be-7c79-4781-bb24-dc674cfeecf3";
const REPLY_TEXT = "Thanks for your feedback! We understand that having a language option for communication matters, and we're looking into adding more language choices in a future update. Feel free to email us which language you need — it really helps us prioritize the right ones first.";

const SERVICE_ACCOUNT_FILE = path.join(__dirname, 'service-account.json');

async function testReply() {
  console.log(`\n--- Google Play Developer API Reply Test ---`);
  console.log(`Package Name: ${PACKAGE_NAME}`);
  console.log(`Review ID:    ${REVIEW_ID}`);
  console.log(`Reply Text:   "${REPLY_TEXT}" (${REPLY_TEXT.length} chars)\n`);

  // Client-side character length check (warning only)
  if (REPLY_TEXT.length > 350) {
    console.warn(`[WARNING] REPLY_TEXT exceeds the 350-character limit set by Google Play (${REPLY_TEXT.length}/350 chars).`);
    console.warn(`The API request will likely fail with a 400 Bad Request error.\n`);
  }

  // 1. Verify service account file exists
  if (!fs.existsSync(SERVICE_ACCOUNT_FILE)) {
    console.error(`[AUTH ERROR] 'service-account.json' not found in project root.`);
    console.error(`Please place your Google service account JSON key file at: ${SERVICE_ACCOUNT_FILE}`);
    process.exit(1);
  }

  try {
    // 2. Authenticate
    const auth = new google.auth.GoogleAuth({
      keyFile: SERVICE_ACCOUNT_FILE,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    const androidpublisher = google.androidpublisher({
      version: 'v3',
      auth,
    });

    console.log(`Sending reply via reviews.reply endpoint...`);

    // 3. Call reviews.reply endpoint
    const response = await androidpublisher.reviews.reply({
      packageName: PACKAGE_NAME,
      reviewId: REVIEW_ID,
      requestBody: {
        replyText: REPLY_TEXT,
      },
    });

    console.log(`\n[SUCCESS] Reply successfully posted! (HTTP ${response.status})`);
    console.log(`Confirmation Response Data:`);
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
    console.error(` 2. The service account lacks 'Reply to reviews' permission in Google Play Console.`);
  } else if (status === 404 || message.includes('Package not found') || message.includes('Review not found')) {
    console.error(`[NOT FOUND ERROR] Package name or Review ID not found (Status 404).`);
    console.error(`Check if PACKAGE_NAME '${PACKAGE_NAME}' or REVIEW_ID '${REVIEW_ID}' is valid.`);
  } else if (status === 400 || message.includes('length') || message.includes('too long')) {
    console.error(`[INVALID REQUEST ERROR] Bad Request (Status 400).`);
    if (REPLY_TEXT.length > 350 || message.toLowerCase().includes('length') || message.toLowerCase().includes('long')) {
      console.error(`Possible cause: Reply text length (${REPLY_TEXT.length} chars) exceeds Google's 350-character limit.`);
    }
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

testReply();
