const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    txHash: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "staking",
        "register",
        "withdraw",
        "fundsTransfer",
        "partialWithdrawal",
        "withdrawal",
        "buyToken",
        "sellToken"
      ],
      default: "register",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    cryptoAmount: {
      type: Number,
      default: 0,
    },
    fiatAmount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    // collection: 'transactions'
  }
);

const Transaction = mongoose.model("Transaction", transactionSchema);

module.exports = Transaction;
