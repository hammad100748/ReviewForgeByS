require('dotenv').config();
const { db, admin } = require('../src/config/firebase');

/**
 * Migration Script: Single-App to Multi-App Architecture
 * Restructures existing customer app data into a new "apps" collection
 * and updates "reviews" documents with "appId" reference.
 * IDEMPOTENT-SAFE: Safe to execute multiple times without duplicating data.
 */
async function migrateToMultiApp() {
  console.log(`\n======================================================`);
  console.log(`    ReviewForge - Multi-App Schema Data Migration     `);
  console.log(`======================================================\n`);

  let customersProcessed = 0;
  let appDocsCreated = 0;
  let appDocsSkipped = 0;
  let customersSkippedNoPackage = 0;
  let reviewsUpdated = 0;
  let reviewsAlreadyMigrated = 0;

  // Map to store customerId -> appId relationship for review document updating
  const customerAppMap = {};

  try {
    // ------------------------------------------------------------------------
    // STEP 1: Process Customers & Populate "apps" Collection
    // ------------------------------------------------------------------------
    console.log(`[STEP 1] Fetching customer documents...`);
    const customersSnapshot = await db.collection('customers').get();
    console.log(`Found ${customersSnapshot.size} total customer document(s).\n`);

    for (const customerDoc of customersSnapshot.docs) {
      customersProcessed++;
      const customerId = customerDoc.id;
      const customerData = customerDoc.data();
      const customerName = customerData.name || 'Unnamed Customer';
      const packageName = customerData.packageName;

      if (!packageName || typeof packageName !== 'string' || !packageName.trim()) {
        console.log(`[SKIP] Customer ID '${customerId}' (${customerName}) has no packageName field. Skipping app creation.`);
        customersSkippedNoPackage++;
        continue;
      }

      const trimmedPackage = packageName.trim();

      // Check if an app document already exists for this customerId + packageName
      const existingAppSnap = await db
        .collection('apps')
        .where('customerId', '==', customerId)
        .where('packageName', '==', trimmedPackage)
        .limit(1)
        .get();

      if (!existingAppSnap.empty) {
        const existingAppDoc = existingAppSnap.docs[0];
        const appId = existingAppDoc.id;
        customerAppMap[customerId] = appId;
        appDocsSkipped++;
        console.log(`[EXISTS] App doc already exists for customer '${customerName}' (ID: ${customerId}): App ID '${appId}'.`);
      } else {
        // Create new app document
        const appName = customerData.appName && customerData.appName.trim()
          ? customerData.appName.trim()
          : trimmedPackage;

        const autoPostEnabled = Boolean(customerData.autoPostEnabled);
        const createdAt = customerData.createdAt || admin.firestore.FieldValue.serverTimestamp();

        const newAppData = {
          customerId,
          appName,
          packageName: trimmedPackage,
          autoPostEnabled,
          createdAt,
        };

        const newAppRef = await db.collection('apps').add(newAppData);
        const newAppId = newAppRef.id;
        customerAppMap[customerId] = newAppId;
        appDocsCreated++;

        console.log(`[CREATED] Created App doc '${newAppId}' for customer '${customerName}' (ID: ${customerId}): App Name "${appName}", Package "${trimmedPackage}".`);
      }
    }

    console.log(`\n------------------------------------------------------`);
    console.log(`[STEP 1 COMPLETE] Apps collection migration complete.`);
    console.log(`Created: ${appDocsCreated} | Existing/Skipped: ${appDocsSkipped} | No Package: ${customersSkippedNoPackage}`);
    console.log(`------------------------------------------------------\n`);

    // ------------------------------------------------------------------------
    // STEP 2: Update "reviews" Documents with "appId"
    // ------------------------------------------------------------------------
    console.log(`[STEP 2] Fetching review documents...`);
    const reviewsSnapshot = await db.collection('reviews').get();
    console.log(`Found ${reviewsSnapshot.size} total review document(s).\n`);

    for (const reviewDoc of reviewsSnapshot.docs) {
      const reviewId = reviewDoc.id;
      const reviewData = reviewDoc.data();
      const customerId = reviewData.customerId;

      if (!customerId) {
        console.log(`[WARNING] Review '${reviewId}' has no customerId field. Skipping.`);
        continue;
      }

      const targetAppId = customerAppMap[customerId];

      if (!targetAppId) {
        console.log(`[WARNING] Review '${reviewId}' customerId '${customerId}' has no corresponding app document. Skipping.`);
        continue;
      }

      if (reviewData.appId === targetAppId) {
        reviewsAlreadyMigrated++;
      } else {
        await db.collection('reviews').doc(reviewId).update({
          appId: targetAppId,
        });
        reviewsUpdated++;
        console.log(`[UPDATED] Review '${reviewId}' set appId -> '${targetAppId}' (Customer: ${customerId}).`);
      }
    }

    // ------------------------------------------------------------------------
    // SUMMARY REPORT
    // ------------------------------------------------------------------------
    console.log(`\n======================================================`);
    console.log(`              Migration Summary Report                `);
    console.log(`======================================================`);
    console.log(`Customers Processed:        ${customersProcessed}`);
    console.log(`Customers Skipped (No Pkg): ${customersSkippedNoPackage}`);
    console.log(`App Documents Created:      ${appDocsCreated}`);
    console.log(`App Documents Existing:     ${appDocsSkipped}`);
    console.log(`Reviews Updated with appId: ${reviewsUpdated}`);
    console.log(`Reviews Already Up-To-Date: ${reviewsAlreadyMigrated}`);
    console.log(`======================================================\n`);

  } catch (error) {
    console.error(`\n[CRITICAL MIGRATION ERROR] ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

async function main() {
  await migrateToMultiApp();
  process.exit(0);
}

main().catch((err) => {
  console.error('[UNHANDLED FATAL ERROR]', err);
  process.exit(1);
});
