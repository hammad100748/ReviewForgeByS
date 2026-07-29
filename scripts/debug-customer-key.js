require('dotenv').config();

const readline = require('readline');
const { getCustomer } = require('../src/models/customer');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function run() {
  console.log('\n======================================================');
  console.log('       ReviewForge - Debug Customer Key Inspector     ');
  console.log('======================================================\n');

  try {
    let docId = process.argv[2];
    if (!docId || !docId.trim()) {
      docId = await askQuestion('Enter Customer Firestore Document ID: ');
    }

    docId = docId.trim();
    if (!docId) {
      throw new Error('Firestore Document ID is required.');
    }

    console.log(`\nFetching and decrypting customer record '${docId}'...\n`);

    const customer = await getCustomer(docId);
    if (!customer) {
      throw new Error(`Customer document '${docId}' not found in Firestore.`);
    }

    const serviceAccount = customer.serviceAccountJson || {};
    const clientEmail = serviceAccount.client_email || 'N/A';
    const privateKey = typeof serviceAccount.private_key === 'string' ? serviceAccount.private_key : '';

    const keyLength = privateKey.length;
    const first40 = privateKey.substring(0, 40);
    const last40 = keyLength >= 40 ? privateKey.substring(keyLength - 40) : privateKey;

    const hasBeginHeader = privateKey.includes('-----BEGIN PRIVATE KEY-----');
    const hasEndHeader = privateKey.includes('-----END PRIVATE KEY-----');
    const newlineCount = (privateKey.match(/\n/g) || []).length;

    console.log('-------------------- DEBUG REPORT --------------------');
    console.log(`Customer ID:            ${customer.id}`);
    console.log(`Customer Name:          ${customer.name || 'N/A'}`);
    console.log(`Client Email:           ${clientEmail}`);
    console.log(`Private Key Length:     ${keyLength} characters`);
    console.log(`First 40 chars:         "${first40}"`);
    console.log(`Last 40 chars:          "${last40}"`);
    console.log(`Has BEGIN Header:       ${hasBeginHeader}`);
    console.log(`Has END Header:         ${hasEndHeader}`);
    console.log(`Actual \\n Newlines:     ${newlineCount}`);
    console.log('------------------------------------------------------\n');
  } catch (error) {
    console.error(`\n[DEBUG ERROR] ${error.message}\n`);
  } finally {
    rl.close();
    process.exit(0);
  }
}

run();
