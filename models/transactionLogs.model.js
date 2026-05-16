const mongoose = require("mongoose");

const transactionLogs = new mongoose.Schema(
  {
    walletAddress: { type: String, required: true },
    txHash: { type: String },
    error: { type: String, required: true },
  },
  {
    timestamps: true,
    // collection: 'transaction_logs'
  }
);
const TransactionLogs = mongoose.model("transactionLogs", transactionLogs);

module.exports = TransactionLogs;
