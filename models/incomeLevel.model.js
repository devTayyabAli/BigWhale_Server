const mongoose = require('mongoose');

const incomeLevelSchema = new mongoose.Schema({

  title: { type: String, required: true },
  minimumRewardPercentage: { type: String, required: false },
  maximumRewardPercentage: { type: String, required: false },
  minimumRequiredReferrals: { type: String, required: false },
  directBussiness: { type: String, required: false },
  directReferral: { type: String, required: false },
  activationDays: { type: String, required: false },
  maxLevel: { type: Number, required:false},
  minLevel: { type: Number, required:false},
},
  { timestamps: true,
    // collection: 'income_levels' 
  },
);

const IncomeLevel = mongoose.model('IncomeLevel', incomeLevelSchema);

module.exports = IncomeLevel;
