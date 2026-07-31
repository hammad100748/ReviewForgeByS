require('dotenv').config();
const {
  getAllActiveApps,
  getAppsByCustomer,
  getAppById,
} = require('../src/models/app');

async function testAppModel() {
  console.log('--- Testing src/models/app.js ---\n');

  // 1. Test getAllActiveApps()
  console.log('Calling getAllActiveApps()...');
  const activeApps = await getAllActiveApps();
  console.log(`getAllActiveApps() returned ${activeApps.length} active app(s).\n`);

  if (activeApps.length > 0) {
    console.log('Sample Active App:');
    console.log({
      id: activeApps[0].id,
      customerId: activeApps[0].customerId,
      appName: activeApps[0].appName,
      packageName: activeApps[0].packageName,
      autoPostEnabled: activeApps[0].autoPostEnabled,
      onboardingStatus: activeApps[0].onboardingStatus,
      customerName: activeApps[0].customerName,
      customerEmail: activeApps[0].customerEmail,
      hasServiceAccount: Boolean(activeApps[0].serviceAccountJson),
    });

    const sampleApp = activeApps[0];

    // 2. Test getAppsByCustomer()
    console.log(`\nCalling getAppsByCustomer('${sampleApp.customerId}')...`);
    const customerApps = await getAppsByCustomer(sampleApp.customerId);
    console.log(`getAppsByCustomer() returned ${customerApps.length} app(s).`);

    // 3. Test getAppById()
    console.log(`\nCalling getAppById('${sampleApp.id}')...`);
    const appById = await getAppById(sampleApp.id);
    console.log('getAppById() returned:', appById);
  } else {
    console.log('No active apps found (either no apps migrated or parent customers are not ACTIVE).');
  }

  console.log('\n--- App Model Test Complete ---');
}

testAppModel().catch((err) => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
