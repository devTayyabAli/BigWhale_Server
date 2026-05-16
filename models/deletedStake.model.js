const mongoose = require('mongoose');

const DeletedStakeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  stakeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Stake',
    required: true,
  },
  amount: {  
    type: Number,
    default: 0,
    required: true 
  },
  missingRecordProcessedAt: { 
    type: Date, 
    default: null, 
    required: false 
  },
},
{ timestamps: true
  // collection: 'user_stake_rewards' 
},
);

const DeletedStake = mongoose.model('DeletedStake', DeletedStakeSchema);

module.exports = DeletedStake;
