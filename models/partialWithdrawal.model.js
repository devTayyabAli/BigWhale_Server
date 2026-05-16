const mongoose = require("mongoose");
const { DEFAULT_STATUS } = require("../config/constants");
const partialWithdrawalSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // Reference to the User model
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Transaction", // Reference to the Transaction model
  },
  status: {
    type: String,
    enum: [
      DEFAULT_STATUS.PENDING,
      DEFAULT_STATUS.ACTIVE,
      DEFAULT_STATUS.INACTIVE,
    ],
    default: DEFAULT_STATUS.PENDING,
  },
  withdrawalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Withdrawal", // Reference to the User model
    required: true,
  },
},
  { 
    timestamps: true,
    // collection: 'partial_withdrawals' 
});

const PartialWithdrawals = mongoose.model(
  "PartialWithdrawal",
  partialWithdrawalSchema
);

module.exports = PartialWithdrawals;
