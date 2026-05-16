const mongoose = require("mongoose");
const { TRANSACTION_STATUS, EXCHANGE_TYPES } = require("../config/constants");
const tokensExchangeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: [
        EXCHANGE_TYPES.BUY,
        EXCHANGE_TYPES.SELL
      ],
      default: EXCHANGE_TYPES.BUY,
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
      ref: "Transaction",
    },
  },
  { timestamps: true  }
);

const TokenExchange = mongoose.model("TokenExchange", tokensExchangeSchema);

module.exports = TokenExchange;
