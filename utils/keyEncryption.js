const crypto = require("crypto");
const Web3 = require("web3");

// Algorithm: AES-256-GCM (Authenticated Encryption with Associated Data)
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM

/**
 * Derives a 32-byte (256-bit) encryption key from the environment secret.
 * Falls back to JWT_SECRET_STRING or a default seed if not explicitly configured.
 */
function getEncryptionKey() {
  const secret =
    process.env.WALLET_ENCRYPTION_SECRET ||
    process.env.JWT_SECRET_STRING ||
    "bigwhale_default_secure_vault_secret_2024";

  // SHA-256 digest creates an exact 32-byte Buffer regardless of secret length
  return crypto.createHash("sha256").update(String(secret)).digest();
}

/**
 * Validates and normalizes an EVM private key.
 * Accepts 64-char hex string with or without '0x' prefix.
 *
 * @param {string} key
 * @returns {string} normalized '0x'-prefixed 66-character private key
 */
function normalizePrivateKey(key) {
  if (!key || typeof key !== "string") {
    throw new Error("Private key must be a non-empty string");
  }
  let cleanKey = key.trim();
  if (!cleanKey.startsWith("0x")) {
    cleanKey = "0x" + cleanKey;
  }
  // EVM private key must be '0x' followed by 64 hexadecimal characters
  const hexPart = cleanKey.slice(2);
  if (!/^[0-9a-fA-F]{64}$/.test(hexPart)) {
    throw new Error(
      "Invalid private key format. Must be a 64-character hexadecimal string."
    );
  }
  return cleanKey;
}

/**
 * Derives the EVM checksum public address from a private key.
 *
 * @param {string} privateKey
 * @returns {string} public address (e.g., '0x1234...abcd')
 */
function deriveAddressFromPrivateKey(privateKey) {
  const normalized = normalizePrivateKey(privateKey);
  const web3 = new Web3();
  const account = web3.eth.accounts.privateKeyToAccount(normalized);
  return account.address;
}

/**
 * Encrypts a private key using AES-256-GCM.
 *
 * @param {string} privateKey - The raw private key (with or without '0x')
 * @returns {{ encryptedData: string, iv: string, authTag: string }}
 */
function encryptPrivateKey(privateKey) {
  const normalizedKey = normalizePrivateKey(privateKey);
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(normalizedKey, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return {
    encryptedData: encrypted,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

/**
 * Decrypts an encrypted private key using AES-256-GCM.
 *
 * @param {string} encryptedData - Hex string of encrypted ciphertext
 * @param {string} iv - Hex string of IV (12 bytes)
 * @param {string} authTag - Hex string of GCM auth tag (16 bytes)
 * @returns {string} Decrypted private key ('0x' prefixed)
 */
function decryptPrivateKey(encryptedData, iv, authTag) {
  if (!encryptedData || !iv || !authTag) {
    throw new Error("Encrypted data, IV, and auth tag are required for decryption");
  }

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, "hex")
  );

  decipher.setAuthTag(Buffer.from(authTag, "hex"));

  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

module.exports = {
  normalizePrivateKey,
  deriveAddressFromPrivateKey,
  encryptPrivateKey,
  decryptPrivateKey,
};
