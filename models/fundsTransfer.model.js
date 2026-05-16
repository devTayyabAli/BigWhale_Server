const mongoose = require("mongoose");
const { TRANSACTION_STATUS } = require("../config/constants");
const fundsTransferSchema = new mongoose.Schema(
  {
    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: [
        TRANSACTION_STATUS.PENDING,
        TRANSACTION_STATUS.COMPLETED,
        TRANSACTION_STATUS.FAILED,
      ],
      default: TRANSACTION_STATUS.PENDING,
    },
    transactionId: {

     type: mongoose.Schema.Types.ObjectId,
      required: false,
      // unique: true,
      ref: "Transaction", // Reference to the Transaction model
    },
  },
  { timestamps: true,
    // collection: 'fund_transfers' 
  }
);

const FundsTransfer = mongoose.model("FundsTransfer", fundsTransferSchema);

module.exports = FundsTransfer;
