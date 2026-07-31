require('dotenv').config();
const { findCustomerByEmail } = require('../src/models/customer');
const { getAppsByCustomer, getAppById } = require('../src/models/app');
const { getPendingReviewsByCustomer, getCustomerReviewHistory } = require('../src/models/review');

async function testRoutesLogic() {
  console.log('======================================================');
  console.log('       ReviewForge - Routes Logic Verification        ');
  console.log('======================================================\n');

  const testEmail = 'hammad.dev9@gmail.com';
  console.log(`[1] Finding customer record for '${testEmail}'...`);
  const customer = await findCustomerByEmail(testEmail);

  if (!customer) {
    console.error(`Customer '${testEmail}' not found in Firestore.`);
    process.exit(1);
  }

  console.log(`Found Customer: ID='${customer.id}', Name='${customer.name}'\n`);

  // 1. GET /api/customer/apps logic
  console.log(`[2] Testing GET /api/customer/apps logic for customer '${customer.id}'...`);
  const apps = await getAppsByCustomer(customer.id);
  console.log(`Returned ${apps.length} app(s):`);
  apps.forEach((a) => {
    console.log(`  - App ID: '${a.id}', Name: "${a.appName}", Package: "${a.packageName}", AutoPost: ${a.autoPostEnabled}`);
  });

  const testAppId = apps.length > 0 ? apps[0].id : 'p7h0eBekz8XUdmknsCKm';

  // 2. Ownership Verification Check
  console.log(`\n[3] Testing App Ownership Verification for App ID '${testAppId}'...`);
  const appObj = await getAppById(testAppId);
  const isOwner = appObj && appObj.customerId === customer.id;
  console.log(`App exists: ${Boolean(appObj)}, Belongs to customer: ${isOwner} (HTTP ${isOwner ? 200 : 403})`);

  console.log(`\nTesting App Ownership Verification for Invalid App ID 'invalidAppId'...`);
  const invalidAppObj = await getAppById('invalidAppId');
  const isInvalidOwner = invalidAppObj && invalidAppObj.customerId === customer.id;
  console.log(`Invalid App exists: ${Boolean(invalidAppObj)}, Belongs to customer: ${isInvalidOwner} (HTTP ${isInvalidOwner ? 200 : 403})`);

  // 3. GET /api/customer/reviews/pending WITH appId
  console.log(`\n[4] Testing GET /api/customer/reviews/pending WITH appId='${testAppId}'...`);
  const pendingWithApp = await getPendingReviewsByCustomer(customer.id, testAppId);
  console.log(`Pending reviews for app '${testAppId}': ${pendingWithApp.length} review(s).`);

  // 4. GET /api/customer/reviews/pending WITHOUT appId (backward compatibility mode)
  console.log(`\n[5] Testing GET /api/customer/reviews/pending WITHOUT appId (backward compatibility)...`);
  const defaultAppId = apps.length === 1 ? apps[0].id : null;
  const pendingDefault = await getPendingReviewsByCustomer(customer.id, defaultAppId);
  console.log(`Pending reviews (default app '${defaultAppId}'): ${pendingDefault.length} review(s).`);

  // 5. GET /api/customer/reviews/history WITH appId
  console.log(`\n[6] Testing GET /api/customer/reviews/history WITH appId='${testAppId}'...`);
  const historyWithApp = await getCustomerReviewHistory(customer.id, testAppId);
  console.log(`History reviews for app '${testAppId}': ${historyWithApp.length} review(s).`);

  // 6. GET /api/customer/reviews/history WITHOUT appId (backward compatibility mode)
  console.log(`\n[7] Testing GET /api/customer/reviews/history WITHOUT appId (backward compatibility)...`);
  const historyDefault = await getCustomerReviewHistory(customer.id, defaultAppId);
  console.log(`History reviews (default app '${defaultAppId}'): ${historyDefault.length} review(s).`);

  console.log('\n======================================================');
  console.log('             Routes Logic Verification Complete       ');
  console.log('======================================================\n');
}

testRoutesLogic().catch((err) => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
