const SystemWallet = require("../models/systemWallet.model");
const {
  normalizePrivateKey,
  deriveAddressFromPrivateKey,
  encryptPrivateKey,
  decryptPrivateKey,
} = require("../utils/keyEncryption");

// In-memory cache to avoid repeated DB queries and AES decryption on every transaction
let walletCache = null;

const WALLET_TYPE = "KGC_OWNER_WALLET";

/**
 * Retrieves the owner wallet credentials (private key and public address).
 * Priority:
 *   1. Memory cache
 *   2. Database (encrypted SystemWallet)
 *   3. Fallback to process.env.KGC_TOKENS_PRIVATE_KEY
 *
 * @returns {Promise<{ privateKey: string, address: string, source: 'database' | 'env' }>}
 */
async function getOwnerWallet() {
  // 1. Check in-memory cache
  if (walletCache && walletCache.privateKey && walletCache.address) {
    return {
      privateKey: walletCache.privateKey,
      address: walletCache.address,
      source: walletCache.source,
    };
  }

  // 2. Check Database
  try {
    const doc = await SystemWallet.findOne({
      walletType: WALLET_TYPE,
      isActive: true,
    });

    if (doc && doc.encryptedPrivateKey && doc.iv && doc.authTag) {
      const decryptedKey = decryptPrivateKey(
        doc.encryptedPrivateKey,
        doc.iv,
        doc.authTag
      );

      walletCache = {
        privateKey: decryptedKey,
        address: doc.publicAddress,
        source: "database",
        updatedAt: doc.updatedAt,
      };

      return {
        privateKey: decryptedKey,
        address: doc.publicAddress,
        source: "database",
      };
    }
  } catch (err) {
    console.error("SystemWallet DB lookup/decryption error:", err.message);
  }

  // 3. Fallback to .env configuration if DB has no record
  const envKey = process.env.KGC_TOKENS_PRIVATE_KEY;
  if (envKey && typeof envKey === "string" && envKey.trim().length > 0) {
    try {
      const normalized = normalizePrivateKey(envKey);
      const derivedAddress =
        process.env.KGC_TOKENS_ADMIN_ADDRESS ||
        deriveAddressFromPrivateKey(normalized);

      walletCache = {
        privateKey: normalized,
        address: derivedAddress,
        source: "env",
        updatedAt: null,
      };

      return {
        privateKey: normalized,
        address: derivedAddress,
        source: "env",
      };
    } catch (err) {
      console.error("Failed to parse fallback env private key:", err.message);
    }
  }

  throw new Error(
    "Owner private key is not configured in database or environment (.env)."
  );
}

/**
 * Returns safe public status of the owner wallet without exposing the private key.
 *
 * @returns {Promise<{ isConfigured: boolean, address: string | null, source: 'database' | 'env' | 'none', updatedAt: Date | null }>}
 */
async function getOwnerWalletStatus() {
  try {
    const doc = await SystemWallet.findOne({
      walletType: WALLET_TYPE,
      isActive: true,
    });

    if (doc) {
      return {
        isConfigured: true,
        address: doc.publicAddress,
        source: "database",
        updatedAt: doc.updatedAt,
      };
    }
  } catch (err) {
    console.error("Error reading SystemWallet status from DB:", err.message);
  }

  // Check env fallback
  const envKey = process.env.KGC_TOKENS_PRIVATE_KEY;
  if (envKey && typeof envKey === "string" && envKey.trim().length > 0) {
    try {
      const normalized = normalizePrivateKey(envKey);
      const address =
        process.env.KGC_TOKENS_ADMIN_ADDRESS ||
        deriveAddressFromPrivateKey(normalized);

      return {
        isConfigured: true,
        address,
        source: "env",
        updatedAt: null,
      };
    } catch (e) {
      // Ignored
    }
  }

  return {
    isConfigured: false,
    address: null,
    source: "none",
    updatedAt: null,
  };
}

/**
 * Encrypts and saves or updates the owner's private key in the database.
 *
 * @param {string} rawPrivateKey - The new raw private key provided by admin
 * @param {string} updatedBy - Identifier of admin performing the update
 * @returns {Promise<{ success: boolean, message: string, address: string }>}
 */
async function saveOwnerPrivateKey(rawPrivateKey, updatedBy = "admin") {
  const normalizedKey = normalizePrivateKey(rawPrivateKey);
  const derivedAddress = deriveAddressFromPrivateKey(normalizedKey);
  const { encryptedData, iv, authTag } = encryptPrivateKey(normalizedKey);

  const updatedDoc = await SystemWallet.findOneAndUpdate(
    { walletType: WALLET_TYPE },
    {
      walletType: WALLET_TYPE,
      publicAddress: derivedAddress,
      encryptedPrivateKey: encryptedData,
      iv,
      authTag,
      isActive: true,
      updatedBy,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Update in-memory cache immediately
  walletCache = {
    privateKey: normalizedKey,
    address: derivedAddress,
    source: "database",
    updatedAt: updatedDoc.updatedAt,
  };

  return {
    success: true,
    message: "Owner private key successfully encrypted and saved.",
    address: derivedAddress,
    updatedAt: updatedDoc.updatedAt,
  };
}

/**
 * Removes the owner's private key from the database.
 *
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function deleteOwnerPrivateKey() {
  await SystemWallet.deleteOne({ walletType: WALLET_TYPE });

  // Clear memory cache so it falls back to env (or reports unconfigured)
  walletCache = null;

  return {
    success: true,
    message: "Owner private key removed from database successfully.",
  };
}

function clearCache() {
  walletCache = null;
}

module.exports = {
  getOwnerWallet,
  getOwnerWalletStatus,
  saveOwnerPrivateKey,
  deleteOwnerPrivateKey,
  clearCache,
};
