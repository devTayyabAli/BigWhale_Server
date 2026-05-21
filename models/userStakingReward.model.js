const mongoose = require('mongoose');

const userStakeRewardSchema = new mongoose.Schema({
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
{ timestamps: true,
  // collection: 'user_stake_rewards' 
},
);

// Prevent the staking cron from inserting duplicate rewards for the same
// stake on the same day. The index is on (stakeId + date-truncated createdAt).
// Since createdAt is set to the stake's original time-of-day, two rewards
// for the same stake on the same calendar day will have the same stakeId
// and the same createdAt — this index blocks the second insert.
userStakeRewardSchema.index({ stakeId: 1, createdAt: 1 }, { unique: true });

const UserStakeReward = mongoose.model('UserStakeReward', userStakeRewardSchema);

module.exports = UserStakeReward;
