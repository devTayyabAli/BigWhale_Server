const mongoose = require('mongoose');
const {DEFAULT_STATUS}=require('../config/constants');
const { timeStamp } = require('console');

const withdrawalSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model
    required: true,
  },
  amount: {
    type: Number,
    default: 0,
    required: true,
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction', // Reference to the Transaction model
  },
  status: {
    type: String,
    enum: [DEFAULT_STATUS.PENDING,DEFAULT_STATUS.ACTIVE, DEFAULT_STATUS.INACTIVE],                      
    default:  DEFAULT_STATUS.PENDING,
  },
},
{ 
  timestamps: true,
  // collection: 'withdrawals' 
}
);

const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);

module.exports = Withdrawal;
