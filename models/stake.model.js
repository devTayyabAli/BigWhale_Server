const mongoose = require("mongoose");
const moment = require("moment");
const { DEFAULT_STATUS, SETTING} = require("../config/constants");
const { getSettingWithKey } = require("../helpers/setting");

const stakeDurationExpiry = async () => await getSettingWithKey(SETTING.STAKE_DURATION_EXPIRY);
const stakeDurationUnit = async () => await getSettingWithKey(SETTING.STAKE_DURATION_UNIT);

const stakeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Reference to the User model
      required: false,
    },
    amount: {
      type: Number,
      required: true,
    },
    endDate: {
      type: Date,
      default: () =>
      moment().add(stakeDurationExpiry, stakeDurationUnit).toDate(),
      required: true,
    },
    status: {
      type: String,
      enum: [
        DEFAULT_STATUS.PENDING,
        DEFAULT_STATUS.ACTIVE,
        DEFAULT_STATUS.INACTIVE,
        DEFAULT_STATUS.FAILED,   
      ],
      default: DEFAULT_STATUS.PENDING,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      // required: true,
      // unique: true,
      ref: "Transaction", // Reference to the Transaction model
    },
    rewardPercentage: {
    type: Number,
    required: false
  },
  cappingReached: {
    type: Boolean,
    default:false,
  },
  lastReward:{
    type: Date,
    default:null,
  }
},
{ timestamps: true,
  // collection: 'stakes' 
},
);

const Stake = mongoose.model("Stake", stakeSchema);

module.exports = Stake;
