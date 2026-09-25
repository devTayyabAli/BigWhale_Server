const mongoose = require("mongoose");

const systemWalletSchema = new mongoose.Schema(
  {
    walletType: {
      type: String,
      required: true,
      unique: true,
      default: "KGC_OWNER_WALLET",
      index: true,
    },
    publicAddress: {
      type: String,
      required: true,
    },
    encryptedPrivateKey: {
      type: String,
      required: true,
    },
    iv: {
      type: String,
      required: true,
    },
    authTag: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const SystemWallet = mongoose.model("SystemWallet", systemWalletSchema);

module.exports = SystemWallet;
