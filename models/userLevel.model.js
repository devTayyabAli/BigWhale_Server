const mongoose = require('mongoose');

const userLevelSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  levelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IncomeLevel',
    required: true,
  },
  current: {
    type: String,
    required: true,
  },
},
  { timestamps: true,
    // collection: 'user_levels' 
  },
);

const UserLevel = mongoose.model('UserLevel', userLevelSchema);

module.exports = UserLevel;
