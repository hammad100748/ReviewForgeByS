# Google Play Developer API Test Scripts

Minimal Node.js proof-of-concept scripts to verify authentication, reading reviews, and posting review replies via the Google Play Developer API.

## Setup Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Credentials & Package Name**
   - Place your Google Service Account JSON key file named `service-account.json` in the root directory of this project.
   - Open `test-connection.js` and set the `PACKAGE_NAME` constant at the top of the file to your Android app's package name (e.g., `com.example.myapp`).

3. **Run the Connection Test Script**
   ```bash
   node test-connection.js
   ```

---

## Testing Review Replies (`test-reply.js`)

To test posting a response to a review:

1. **Configure Parameters**
   Open `test-reply.js` and edit the constants at the top of the file:
   - `PACKAGE_NAME`: Your app's package name (e.g., `com.example.myapp`).
   - `REVIEW_ID`: The unique ID of the review you want to reply to (obtained from running `test-connection.js`).
   - `REPLY_TEXT`: The response message you want to post (**max 350 characters**).

2. **Run the Reply Script**
   ```bash
   node test-reply.js
   ```

> **Note**: Google Play Developer API strictly caps reply text at 350 characters. `test-reply.js` includes a client-side length check that warns if `REPLY_TEXT` exceeds 350 characters.
