const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const FIREBASE_KEY_PATH = path.join(__dirname, '../../firebase-service-account.json');

if (!admin.apps.length) {
  if (!fs.existsSync(FIREBASE_KEY_PATH)) {
    throw new Error(
      `[FIREBASE ERROR] 'firebase-service-account.json' not found in project root.\nExpected file at: ${FIREBASE_KEY_PATH}`
    );
  }

  const serviceAccount = JSON.parse(fs.readFileSync(FIREBASE_KEY_PATH, 'utf8'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

module.exports = {
  admin,
  db,
};
