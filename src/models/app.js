const { db, admin } = require('../config/firebase');
const { getCustomer } = require('./customer');

const APPS_COLLECTION = 'apps';

/**
 * Adds a new app to the "apps" Firestore collection for a customer.
 * @param {Object} params
 * @param {string} params.customerId Customer document ID
 * @param {string} params.appName App Display Name
 * @param {string} params.packageName Android App Package Name
 * @returns {Promise<Object>} Created app metadata including Firestore document ID
 */
async function addApp({ customerId, appName, packageName }) {
  if (!customerId || !appName || !packageName) {
    throw new Error('[APP MODEL ERROR] Missing required parameters (customerId, appName, packageName).');
  }

  const appData = {
    customerId: customerId.trim(),
    appName: appName.trim(),
    packageName: packageName.trim(),
    autoPostEnabled: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const docRef = await db.collection(APPS_COLLECTION).add(appData);

  return {
    id: docRef.id,
    customerId: appData.customerId,
    appName: appData.appName,
    packageName: appData.packageName,
    autoPostEnabled: false,
  };
}

/**
 * Retrieves all app documents belonging to a specific customer, sorted by createdAt.
 * @param {string} customerId
 * @returns {Promise<Array<Object>>} Array of app objects
 */
async function getAppsByCustomer(customerId) {
  if (!customerId) {
    throw new Error('[APP MODEL ERROR] customerId is required for getAppsByCustomer.');
  }

  const snapshot = await db
    .collection(APPS_COLLECTION)
    .where('customerId', '==', customerId)
    .get();

  const apps = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    apps.push({
      id: doc.id,
      customerId: data.customerId,
      appName: data.appName,
      packageName: data.packageName,
      autoPostEnabled: Boolean(data.autoPostEnabled),
      createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : null,
    });
  });

  apps.sort((a, b) => {
    const timeA = a.createdAt ? a.createdAt.getTime() : 0;
    const timeB = b.createdAt ? b.createdAt.getTime() : 0;
    return timeA - timeB;
  });

  return apps;
}

/**
 * Retrieves a single app document by its Firestore document ID.
 * @param {string} appId
 * @returns {Promise<Object|null>} App object or null if not found
 */
async function getAppById(appId) {
  if (!appId) {
    throw new Error('[APP MODEL ERROR] appId is required for getAppById.');
  }

  const doc = await db.collection(APPS_COLLECTION).doc(appId).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data();
  return {
    id: doc.id,
    customerId: data.customerId,
    appName: data.appName,
    packageName: data.packageName,
    autoPostEnabled: Boolean(data.autoPostEnabled),
    createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : null,
  };
}

/**
 * Updates the autoPostEnabled mode for a specific app document in Firestore.
 * @param {string} appId Firestore App Document ID
 * @param {boolean} enabled True to enable auto-posting, false to disable
 * @returns {Promise<Object>} Updated fields
 */
async function setAppAutoPostMode(appId, enabled) {
  if (!appId) {
    throw new Error('[APP MODEL ERROR] appId is required for setAppAutoPostMode.');
  }

  const isEnabled = Boolean(enabled);
  const updateData = {
    autoPostEnabled: isEnabled,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection(APPS_COLLECTION).doc(appId).update(updateData);

  return updateData;
}

/**
 * Retrieves all app documents joined with their parent customer's onboardingStatus and decrypted serviceAccountJson.
 * Only includes apps whose parent customer has onboardingStatus === "ACTIVE".
 * Used by the detection cycle going forward instead of getAllActiveCustomers().
 * @returns {Promise<Array<Object>>} Array of active app objects with parent customer data
 */
async function getAllActiveApps() {
  const snapshot = await db.collection(APPS_COLLECTION).get();
  const activeApps = [];
  const customerCache = {};

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const customerId = data.customerId;

    if (!customerId) continue;

    if (!(customerId in customerCache)) {
      try {
        customerCache[customerId] = await getCustomer(customerId);
      } catch (err) {
        console.error(`[APP MODEL ERROR] Failed to fetch parent customer ${customerId}: ${err.message}`);
        customerCache[customerId] = null;
      }
    }

    const customer = customerCache[customerId];

    if (customer && customer.onboardingStatus === 'ACTIVE' && customer.serviceAccountJson) {
      activeApps.push({
        id: doc.id,
        appId: doc.id,
        customerId: data.customerId,
        appName: data.appName,
        packageName: data.packageName,
        autoPostEnabled: Boolean(data.autoPostEnabled),
        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : null,
        onboardingStatus: customer.onboardingStatus,
        serviceAccountJson: customer.serviceAccountJson,
        customerName: customer.name,
        customerEmail: customer.email,
      });
    }
  }

  return activeApps;
}

module.exports = {
  addApp,
  getAppsByCustomer,
  getAppById,
  setAppAutoPostMode,
  getAllActiveApps,
};
