// ============================================================================
// Encryption Utility (AES-256-GCM)
//
// To generate a valid 32-byte hex-encoded ENCRYPTION_KEY, run:
// node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// ============================================================================

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes standard IV length for AES-GCM

/**
 * Validates and retrieves the 32-byte key buffer from process.env.ENCRYPTION_KEY
 */
function getKeyBuffer() {
  const hexKey = process.env.ENCRYPTION_KEY;
  if (!hexKey) {
    throw new Error('[ENCRYPTION ERROR] ENCRYPTION_KEY environment variable is not defined.');
  }
  const keyBuffer = Buffer.from(hexKey, 'hex');
  if (keyBuffer.length !== 32) {
    throw new Error('[ENCRYPTION ERROR] ENCRYPTION_KEY must be a 32-byte (64 hex characters) string.');
  }
  return keyBuffer;
}

/**
 * Encrypts plain text string into an AES-256-GCM payload JSON string
 * @param {string} text Plain text to encrypt
 * @returns {string} Encrypted payload string containing iv, authTag, and content
 */
function encrypt(text) {
  if (typeof text !== 'string') {
    throw new Error('[ENCRYPTION ERROR] Input to encrypt must be a string.');
  }
  const keyBuffer = getKeyBuffer();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return JSON.stringify({
    iv: iv.toString('hex'),
    authTag,
    content: encrypted,
  });
}

/**
 * Decrypts an AES-256-GCM payload JSON string back to original plain text
 * @param {string|object} encryptedPayload JSON string or object containing iv, authTag, and content
 * @returns {string} Decrypted plain text
 */
function decrypt(encryptedPayload) {
  const keyBuffer = getKeyBuffer();
  let parsed;

  if (typeof encryptedPayload === 'string') {
    try {
      parsed = JSON.parse(encryptedPayload);
    } catch (e) {
      throw new Error('[DECRYPTION ERROR] Invalid encrypted payload format.');
    }
  } else {
    parsed = encryptedPayload;
  }

  const { iv, authTag, content } = parsed || {};

  if (!iv || !authTag || !content) {
    throw new Error('[DECRYPTION ERROR] Encrypted payload must contain iv, authTag, and content.');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(content, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = {
  encrypt,
  decrypt,
};
