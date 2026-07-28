const { db, admin } = require('../config/firebase');
const { encrypt, decrypt } = require('../config/encryption');

const CUSTOMERS_COLLECTION = 'customers';

/**
 * Finds a customer document by email address.
 * @param {string} email Customer Email
 * @returns {Promise<Object|null>} Customer object or null if not found
 */
async function findCustomerByEmail(email) {
  if (!email) return null;

  const snapshot = await db
    .collection(CUSTOMERS_COLLECTION)
    .where('email', '==', email.trim().toLowerCase())
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...doc.data(),
  };
}

/**
 * Adds a new customer to the "customers" Firestore collection.
 * @param {Object} params
 * @param {string} params.name Customer Name
 * @param {string} params.email Customer Email
 * @param {string} params.packageName Android App Package Name
 * @param {string|Object} params.serviceAccountJson Service Account JSON object or string
 * @param {boolean} [params.autoPostEnabled=false] Optional autoPostEnabled flag (default false)
 * @param {string} [params.onboardingStatus='AWAITING_VERIFICATION'] Onboarding status
 * @returns {Promise<Object>} Created customer metadata including Firestore document ID
 */
async function addCustomer({ name, email, packageName, serviceAccountJson, autoPostEnabled = false, onboardingStatus = 'AWAITING_VERIFICATION' }) {
  if (!name || !email || !packageName || !serviceAccountJson) {
    throw new Error('[CUSTOMER MODEL ERROR] Missing required parameters (name, email, packageName, serviceAccountJson).');
  }

  const normalizedEmail = email.trim().toLowerCase();

  const jsonString = typeof serviceAccountJson === 'object'
    ? JSON.stringify(serviceAccountJson)
    : serviceAccountJson;

  const encryptedServiceAccount = encrypt(jsonString);

  const customerData = {
    name: name.trim(),
    email: normalizedEmail,
    packageName: packageName.trim(),
    encryptedServiceAccount,
    autoPostEnabled: Boolean(autoPostEnabled),
    onboardingStatus: onboardingStatus || 'AWAITING_VERIFICATION',
    active: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const docRef = await db.collection(CUSTOMERS_COLLECTION).add(customerData);

  return {
    id: docRef.id,
    name: customerData.name,
    email: customerData.email,
    packageName: customerData.packageName,
    autoPostEnabled: customerData.autoPostEnabled,
    onboardingStatus: customerData.onboardingStatus,
    active: true,
  };
}

/**
 * Updates the autoPostEnabled mode for a specific customer document in Firestore.
 * @param {string} customerId Firestore Customer ID
 * @param {boolean} enabled True to enable auto-posting, false to disable
 * @returns {Promise<Object>} Updated fields
 */
async function setAutoPostMode(customerId, enabled) {
  if (!customerId) {
    throw new Error('[CUSTOMER MODEL ERROR] customerId is required for setAutoPostMode.');
  }

  const isEnabled = Boolean(enabled);
  const updateData = {
    autoPostEnabled: isEnabled,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection(CUSTOMERS_COLLECTION).doc(customerId).update(updateData);

  return updateData;
}

/**
 * Updates the onboardingStatus field for a customer document in Firestore.
 * @param {string} customerId Firestore Customer ID
 * @param {string} status Status string (e.g. 'AWAITING_VERIFICATION', 'ACTIVE')
 * @returns {Promise<Object>} Updated fields
 */
async function updateOnboardingStatus(customerId, status) {
  if (!customerId || !status) {
    throw new Error('[CUSTOMER MODEL ERROR] customerId and status are required for updateOnboardingStatus.');
  }

  const updateData = {
    onboardingStatus: status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection(CUSTOMERS_COLLECTION).doc(customerId).update(updateData);

  return updateData;
}

/**
 * Retrieves and decrypts a customer document by Firestore ID.
 * @param {string} customerId
 * @returns {Promise<Object|null>} Customer object with decrypted serviceAccountJson and autoPostEnabled
 */
async function getCustomer(customerId) {
  if (!customerId) {
    throw new Error('[CUSTOMER MODEL ERROR] customerId is required.');
  }

  const doc = await db.collection(CUSTOMERS_COLLECTION).doc(customerId).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data();
  const decryptedJsonString = decrypt(data.encryptedServiceAccount);
  const serviceAccountJson = JSON.parse(decryptedJsonString);

  return {
    id: doc.id,
    name: data.name,
    email: data.email,
    packageName: data.packageName,
    autoPostEnabled: Boolean(data.autoPostEnabled),
    onboardingStatus: data.onboardingStatus || 'AWAITING_VERIFICATION',
    active: data.active,
    createdAt: data.createdAt ? data.createdAt.toDate() : null,
    serviceAccountJson,
  };
}

/**
 * Retrieves all active customers (where active == true) and decrypts their service account JSON credentials.
 * @returns {Promise<Array<Object>>} Array of active customer objects
 */
async function getAllActiveCustomers() {
  const snapshot = await db
    .collection(CUSTOMERS_COLLECTION)
    .where('active', '==', true)
    .get();

  const customers = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    let serviceAccountJson = null;

    if (data.encryptedServiceAccount) {
      try {
        const decryptedString = decrypt(data.encryptedServiceAccount);
        serviceAccountJson = JSON.parse(decryptedString);
      } catch (err) {
        console.error(`[CUSTOMER MODEL WARNING] Failed to decrypt credentials for customer ${doc.id}: ${err.message}`);
      }
    }

    customers.push({
      id: doc.id,
      name: data.name,
      email: data.email,
      packageName: data.packageName,
      autoPostEnabled: Boolean(data.autoPostEnabled),
      onboardingStatus: data.onboardingStatus || 'AWAITING_VERIFICATION',
      active: data.active,
      createdAt: data.createdAt ? data.createdAt.toDate() : null,
      serviceAccountJson,
    });
  }

  return customers;
}

module.exports = {
  addCustomer,
  findCustomerByEmail,
  setAutoPostMode,
  updateOnboardingStatus,
  getCustomer,
  getAllActiveCustomers,
};
