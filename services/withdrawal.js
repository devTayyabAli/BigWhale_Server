const Withdrawal = require("../models/withdrawal.model.js");
const PartialWithdrawal = require("../models/partialWithdrawal.model.js");
const referral = require("../services/referral");
const createPaginator = require("../helpers/paginate");
const mongoose = require("mongoose");
const UserOtherReward = require("../models/userOtherReward.model");
const UserStakeReward = require("../models/userStakingReward.model");
const { ObjectId } = require("mongoose").Types;
const {
  DEFAULT_STATUS,
  CONTRACT_EVENTS,
  TRANSACTION_STATUS,
  TRANSACTION_TYPES,
  OTHER_REWARD,
  SETTING,
} = require("../config/constants.js");
const Transaction = require("../models/transaction.model.js");
const socket = require("../helpers/sockets");
const { transferFunds, getWithdrawalAmountFromContract, getAdminBlnc, stakeTokenOnChain, estimateTransferNetworkFee } = require("../helpers/web3.js");
const PartialWithdrawals = require("../models/partialWithdrawal.model.js");
const helper = require("../helpers/index");
const User = require("../models/user.model.js");
const Stake = require("../models/stake.model.js");
const salaryRankService = require("./salaryRank");

const create = async (req, response) => {
  const { userId, amount } = req.body;
  const { stakingAmount, otherRewardAmount } =
    await calculateTotalWithdrawalAmount(new ObjectId(userId));
  const partialWithdrawalAmountFixed = Number((Number(Number(amount)?.toFixed(6)) - Number(Number(stakingAmount)?.toFixed(6)))?.toFixed(6))
  const otherRewardAmountFixed = Number(Number(otherRewardAmount).toFixed(6))
  let withdrawalAmountFromContract = 0;
  const withdrawal = new Withdrawal({
    userId,
    payoutPercentage: 80,
  });
  const adminBlnc = await getAdminBlnc()
  //**** if there is no staking reward***//
  if (stakingAmount <= 0 && amount > 0) {
    if (adminBlnc < amount * 0.8 || amount > otherRewardAmountFixed) {
      response.message = "Something went wrong please try again later";
      response.status = 200;
      response.success = false;
      return
    }
    response = await makePartialPayment({ userId, amount, withdrawal }, response);
    return response;
  } else if (
    partialWithdrawalAmountFixed > 0 &&
    partialWithdrawalAmountFixed > otherRewardAmountFixed
  ) {
    withdrawalAmountFromContract = amount - partialWithdrawalAmountFixed;
    response.success = false;
    response.message = "Insuficient funds";
    response.status = 400;
    return response;
  }
  //**** if withdrawal amount is greater than staking reward***//
  else if (
    partialWithdrawalAmountFixed > 0 &&
    partialWithdrawalAmountFixed <= otherRewardAmountFixed
  ) {
    withdrawalAmountFromContract = amount - partialWithdrawalAmountFixed;

    if (adminBlnc < partialWithdrawalAmountFixed * 0.8) {
      response.message = "Something went wrong please try again later";
      response.status = 200;
      response.success = false;
      return
    }
    await createPartialWithdrawal({
      userId,
      amount: partialWithdrawalAmountFixed,
      withdrawalId: withdrawal?._id,
    });
  } else {
    withdrawalAmountFromContract = amount;
  }
  withdrawal.amount = withdrawalAmountFromContract * 0.8;
  await withdrawal.save();
  response.success = true;
  response.message = "Withdrawal added successfully";
  response.status = 201;
  response.data = {
    ...JSON.parse(JSON.stringify(withdrawal)),
    partialWithdrawalAmount:
      partialWithdrawalAmountFixed > 0 ? partialWithdrawalAmountFixed * 0.8 : 0,
    withdrawalAmountFromContract: withdrawalAmountFromContract * 0.8,
  };
  return response;
};
const makePartialPayment = async ({ userId, amount, withdrawal }, response) => {
  const partialWithdrawal = await createPartialWithdrawal({
    userId,
    amount,
    withdrawalId: withdrawal?._id,
  });
  const partialWithdrawalAmount = await PartialWithdrawal.findById(
    partialWithdrawal?._id
  ).populate("userId");
  const receipt = await withdrawAmount(
    partialWithdrawalAmount?.userId?.walletAddress,
    partialWithdrawalAmount?.amount * 0.8,
    partialWithdrawalAmount?.userId?._id,
    partialWithdrawalAmount?._id
  );

  if (!receipt || !receipt.transactionHash) {
    await PartialWithdrawal.deleteOne({ _id: partialWithdrawal?._id });
    response.success = false;
    response.message = "Blockchain transaction failed. Please check admin wallet balance or try again later.";
    response.status = 400;
    response.data = {};
    return response;
  }

  await updatePartialWithdrawal(receipt?.transactionHash)
  response.success = true;
  response.message = "Withdrawal added successfully";
  response.status = 201;
  response.data = {};
  return response;
};
const createPartialWithdrawal = async (payload) => {
  return await PartialWithdrawal.create(payload);
};

const completeWithdrawal = async (req, response) => {
  const { userId, txHash, fiatAmount, cryptoAmount } = req.body;
  const { id: withdrawalId } = req.params;
  const stake = await Withdrawal.findOne({ _id: withdrawalId });
  if (stake) {
    const transaction = await Transaction.create({
      userId,
      txHash,
      type: TRANSACTION_TYPES.WITHDRAWAL,
      fiatAmount,
      cryptoAmount,
      status: DEFAULT_STATUS.PENDING,
    });
    const updatedWithdrawal = await Withdrawal.findOneAndUpdate(
      { _id: withdrawalId },
      { transactionId: transaction?._id }
    );
    if (updatedWithdrawal) {
      response.success = true;
      response.message = "Withdrawal completed successfully";
      response.status = 200;
      response.data = updatedWithdrawal;
      return response;
    }
    response.success = fase;
    response.message = "Something went wrong";
    response.status = 400;
    return response;
  }
};

const getWithdrawalByPayload = async (req, response) => {
  const { userId } = req.params;
  const { status = DEFAULT_STATUS.INACTIVE } = req.query;
  const withdrawal = await Withdrawal.findOne({
    userId: new ObjectId(userId),
    status,
  })
    .populate("userId")
    .populate("transactionId");

  response.success = true;
  response.message = "Withdrawal fetched successfully";
  response.status = 200;
  response.data = withdrawal || {};
  return response;
};

const getAllWithdrawalsByPayload = async (req, response) => {
  const { userId } = req.params;
  const { status = DEFAULT_STATUS.INACTIVE, page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;
  const withdrawals = await Withdrawal.find({
    userId: new ObjectId(userId),
    status,
  })
    .populate("userId")
    .populate("transactionId")
    .skip(skip)
    .limit(parseInt(limit));

  response.success = true;
  response.message = "Withdrawals fetched successfully";
  response.status = 200;
  response.data = withdrawals;
};

const updateWithdrawal = (query, payload) => {
  return Withdrawal.findOneAndUpdate(query, payload);
};

const handleWithdrawalEvent = async (txHash) => {
  const transaction = await Transaction.findOneAndUpdate(
    { txHash },
    { status: TRANSACTION_STATUS.COMPLETED }
  );
  if (transaction) {
    const withdrawal = await Withdrawal.findOneAndUpdate(
      {
        transactionId: transaction?._id,
        status: DEFAULT_STATUS.PENDING,
      },
      { status: DEFAULT_STATUS.ACTIVE }
    );


    if (withdrawal) {
      const payoutPct = withdrawal.payoutPercentage ?? 80;
      const payoutRatio = payoutPct / 100;

      // ── Salary Rank distribution (20% of total withdrawal) ─────────────
      // The full withdrawal amount before the split = amount / payoutRatio
      const totalWithdrawalForSalary = withdrawal.amount / payoutRatio;
      salaryRankService.distributeSalaryRankReward(totalWithdrawalForSalary).catch((err) =>
        console.error("Salary rank distribution failed (contract withdrawal):", err?.message)
      );

      // Reinvestment stake is ONLY done for legacy 50% withdrawals
      if (payoutPct === 50) {
        const originalContractAmount = withdrawal.amount * 2;
        const reinvestAmount = Number((originalContractAmount * 0.3).toFixed(8));
        if (reinvestAmount > 0) {
          const user = await User.findById(withdrawal.userId);
          if (user && user.walletAddress) {
            const stake = await createReinvestmentStakePending(withdrawal.userId, reinvestAmount);
            stakeTokenOnChain(user.walletAddress, reinvestAmount, withdrawal.userId, stake._id).catch(err => {
              console.error("Reinvestment on-chain transaction failed:", err);
            });
          }
        }
      }

      const partialWithdrawalAmount = await PartialWithdrawal.findOne({
        withdrawalId: withdrawal?._id,
      }).populate("userId");
      if (partialWithdrawalAmount) {
        const receipt = await withdrawAmount(
          partialWithdrawalAmount?.userId?.walletAddress,
          partialWithdrawalAmount?.amount * payoutRatio,
          partialWithdrawalAmount?.userId?._id,
          partialWithdrawalAmount?._id
        );
        await updatePartialWithdrawal(receipt?.transactionHash);
      } else {
        socket.io
          .to(`${withdrawal?.userId}`)
          .emit(CONTRACT_EVENTS.WITHDRAWAL, {});
      }
    }
  }
};

const updateStake = (query, payload) => {
  return Stake.findOneAndUpdate(query, payload);
};


const getWithdrawalAmount = async (req, response) => {
  const { userID } = req.params;
  const userId = new ObjectId(userID);
  const { combinedTotalAmount, stakingAmount, otherRewardAmount } =
    await calculateTotalWithdrawalAmount(userId);

  // Pre-calculate the network fee so the UI can show the real net amount.
  // The fee is only deducted when the partial-withdrawal (other-reward) leg is
  // sent via transferFunds, so we estimate it against the user's wallet address.
  let networkFeeKgc = 0;
  try {
    const user = await User.findById(userId).select("walletAddress").lean();
    if (user?.walletAddress && combinedTotalAmount > 0) {
      // Estimate against 80% of the combined amount (the portion actually transferred)
      networkFeeKgc = await estimateTransferNetworkFee(
        user.walletAddress,
        Number((combinedTotalAmount * 0.8).toFixed(8))
      );
    }
  } catch (err) {
    console.error("Network fee estimation failed:", err?.message);
  }

  response.success = true;
  response.message = "Withdrawal amount calculated";
  response.status = 200;
  response.data = {
    combinedTotalAmount,
    stakingAmount,
    otherRewardAmount,
    networkFeeKgc,
  };
  return response;
};

const calculateTotalWithdrawalAmount = async (_id) => {
  // ── Run all reward queries in parallel ──────────────────────────────────
  // salaryRankBonus: rewards earned as a salary rank holder from community withdrawals
  const [
    stakingRewardBonus,
    referralLevelBonus,
    leadershipBonus,
    instantRewardBonus,
    salaryRankBonus,
    partialWithdrawalAmountArr,
    withdrawalAmountArr,
    newWithdrawals,
  ] = await Promise.all([
    referral.stakingRewardAmount(_id),
    referral.referralLevelAmount(_id, OTHER_REWARD.INCOME_LEVEL),
    referral.referralLevelAmount(_id, OTHER_REWARD.LEADERSHIP),
    referral.referralLevelAmount(_id, OTHER_REWARD.INSTANT_BONUS),
    referral.referralLevelAmount(_id, OTHER_REWARD.SALARY_RANK),
    totalPartialWithdrawalAmount(_id),
    totalWithdrawalAmount(_id),
    Withdrawal.find({
      userId: _id,
      status: DEFAULT_STATUS.ACTIVE,
      payoutPercentage: 80,
    }).lean(),
  ]);

  const totalNewNet = newWithdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);
  const contractNet = withdrawalAmountArr[0]?.totalAmount || 0;
  const legacyNet = Math.max(0, contractNet - totalNewNet);
  const grossContractAmount = (legacyNet * 2) + (totalNewNet / 0.8);

  const withdrawalAmountToDeduct =
    grossContractAmount +
    (partialWithdrawalAmountArr[0]?.totalAmount || 0);

  const totalBonus = helper.convertNegativeToZero(
    stakingRewardBonus + referralLevelBonus + leadershipBonus + instantRewardBonus + salaryRankBonus
  );
  const availableBonusBalance = helper.convertNegativeToZero(
    totalBonus - withdrawalAmountToDeduct
  );
  const stakingAmount = helper.convertNegativeToZero(
    (stakingRewardBonus + instantRewardBonus) - grossContractAmount
  );
  const otherRewardAmount = helper.convertNegativeToZero(
    leadershipBonus + referralLevelBonus + salaryRankBonus - (partialWithdrawalAmountArr[0]?.totalAmount || 0)
  );
  const combinedTotalAmount = helper.convertNegativeToZero(availableBonusBalance);

  return {
    combinedTotalAmount: Number(combinedTotalAmount),
    stakingAmount,
    otherRewardAmount,
    stakingRewardBonus,
    referralLevelBonus,
    leadershipBonus,
    instantRewardBonus,
    salaryRankBonus,
    withdrawalAmount: withdrawalAmountToDeduct,
    totalBonus,
    availableBonusBalance: Number(combinedTotalAmount),
  };
};


const calculateTodayBonus = async (userId) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  // Assuming your reward records have a "createdAt" field
  const todayStaking = await referral.stakingRewardAmount(userId, startOfToday, endOfToday);
  const todayReferral = await referral.referralLevelAmount(userId, OTHER_REWARD.INCOME_LEVEL, startOfToday, endOfToday);
  const todayLeadership = await referral.referralLevelAmount(userId, OTHER_REWARD.LEADERSHIP, startOfToday, endOfToday);
  const todayInstant = await referral.referralLevelAmount(userId, OTHER_REWARD.INSTANT_BONUS, startOfToday, endOfToday);
  
  const totalTodayBonus = helper.convertNegativeToZero(
    (todayStaking || 0) + (todayReferral || 0) + (todayLeadership || 0) + (todayInstant || 0)
  );

  return Number(totalTodayBonus);
};
const userStakeReward = (userId) => {
  return UserStakeReward.aggregate([
    {
      $match: { userId },
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $unwind: "$user",
    },
    {
      $match: {
        "user.status": DEFAULT_STATUS.ACTIVE,
      },
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$amount" },
      },
    },
    {
      $project: {
        _id: 0,
        totalAmount: 1,
      },
    },
  ]);
};

const userOtherReward = (userId, type, value) => {
  return UserOtherReward.aggregate([
    {
      $match: {
        userId,
        ...(type && { type }), // Conditionally include type
        type: value, // Exclude records with type 'instant_bonus'
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $unwind: "$user",
    },
    {
      $match: {
        "user.status": DEFAULT_STATUS.ACTIVE,
      },
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$amount" },
      },
    },
    {
      $project: {
        _id: 0,
        totalAmount: 1,
      },
    },
  ]);
};
const totalWithdrawalAmount = async (userId) => {
  const user = await User.findById(new ObjectId(userId))
  const amount = await getWithdrawalAmountFromContract(user?.walletAddress)
  return [
    {
      totalAmount: amount || 0
    }
  ]
  // return Withdrawal.aggregate([
  //   {
  //     $match: { userId, status: DEFAULT_STATUS.ACTIVE },
  //   },
  //   {
  //     $lookup: {
  //       from: "users",
  //       localField: "userId",
  //       foreignField: "_id",
  //       as: "user",
  //     },
  //   },
  //   {
  //     $unwind: "$user",
  //   },
  //   {
  //     $match: {
  //       "user.status": DEFAULT_STATUS.ACTIVE,
  //     },
  //   },
  //   {
  //     $group: {
  //       _id: null,
  //       totalAmount: { $sum: "$amount" },
  //     },
  //   },
  //   {
  //     $project: {
  //       _id: 0,
  //       totalAmount: 1,
  //     },
  //   },
  // ]);
};
const totalPartialWithdrawalAmount = (userId) => {
  return PartialWithdrawal.aggregate([
    {
      $match: { userId, status: DEFAULT_STATUS.ACTIVE },
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $unwind: "$user",
    },
    {
      $match: {
        "user.status": DEFAULT_STATUS.ACTIVE,
      },
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$amount" },
      },
    },
    {
      $project: {
        _id: 0,
        totalAmount: 1,
      },
    },
  ]);
};
const withdrawAmount = async (
  toAddress,
  amount,
  userId,
  partialWithdrawalAmountId
) => {
  const receipt = await transferFunds(
    toAddress,
    amount,
    userId,
    partialWithdrawalAmountId
  );
  return receipt;
};
const updatePartialWithdrawal = async (txHash) => {
  const tx = await Transaction.findOneAndUpdate(
    { txHash },
    { status: TRANSACTION_STATUS.COMPLETED }
  );
  if (tx) {
    const partialWithdrawal = await PartialWithdrawals.findOneAndUpdate(
      {
        transactionId: tx?._id,
      },
      { status: DEFAULT_STATUS.ACTIVE }
    ).populate("withdrawalId");
    if (partialWithdrawal) {
      // ── Salary Rank distribution (partial withdrawal) ───────────────────
      salaryRankService.distributeSalaryRankReward(partialWithdrawal.amount).catch((err) =>
        console.error("Salary rank distribution failed (partial withdrawal):", err?.message)
      );

      // Reinvestment stake for partial withdrawal is ONLY done for legacy 50% withdrawals
      const payoutPct = partialWithdrawal.withdrawalId?.payoutPercentage ?? 80;
      if (payoutPct === 50) {
        const originalPartialAmount = partialWithdrawal.amount;
        const reinvestAmount = Number((originalPartialAmount * 0.3).toFixed(8));
        if (reinvestAmount > 0) {
          const user = await User.findById(partialWithdrawal.userId);
          if (user && user.walletAddress) {
            const stake = await createReinvestmentStakePending(partialWithdrawal.userId, reinvestAmount);
            stakeTokenOnChain(user.walletAddress, reinvestAmount, partialWithdrawal.userId, stake._id).catch(err => {
              console.error("Reinvestment on-chain transaction failed for partial withdrawal:", err);
            });
          }
        }
      }

      socket.io
        .to(`${partialWithdrawal?.userId}`)
        .emit(CONTRACT_EVENTS.WITHDRAWAL, {});
    }
  }
};
const getPendingWithdrawals = async () => {
  const ninetySecondsAgo = new Date(Date.now() - 90 * 1000);
  return await Withdrawal.find(
    {
      status: "pending",
      createdAt: { $lt: ninetySecondsAgo },
      transactionId: { $ne: null },
    }
    //  }
  ).populate("transactionId");
};
const getPendingPartialWithdrawals = async () => {
  const ninetySecondsAgo = new Date(Date.now() - 90 * 1000);
  return await PartialWithdrawals.find(
    {
      status: "pending",
      createdAt: { $lt: ninetySecondsAgo },
      transactionId: { $ne: null },
    }
    //  }
  ).populate("transactionId");
};
const getWithdrawalHistoryByID = async (userId, page, limit) => {
  try {
    const skip = (page - 1) * limit;
    if (!userId) {
      return { message: "User ID is required" }
    }

    // 🔹 Fetch all withdrawals for user
    const withdrawals = await Withdrawal.find({ userId, status: "active" })
      .populate("transactionId", "hash fiatAmount status")
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();
    // 🔹 Count total documents for pagination info
    const totalCount = await Withdrawal.countDocuments({ userId, status: "active" });
    // 🔹 Fetch all related partial withdrawals
    const withdrawalIds = withdrawals.map((w) => w._id);
    const partialWithdrawals = await PartialWithdrawal.find({
      withdrawalId: { $in: withdrawalIds }, status: "active"
    })
      .populate("transactionId", "fiatAmount status")
      .sort({ createdAt: -1 })
      .lean();

    // 🔹 Group partials by withdrawalId
    const partialByMain = partialWithdrawals.reduce((acc, pw) => {
      acc[pw.withdrawalId] = acc[pw.withdrawalId] || [];
      acc[pw.withdrawalId].push(pw);
      return acc;
    }, {});

    // 🔹 Merge and sum partial amounts
    const data = withdrawals.map((withdrawal) => {
      const partials = partialByMain[withdrawal._id] || [];
      const partialSum = partials.reduce(
        (sum, pw) => sum + (pw.amount || 0),
        0
      );

      const pct = withdrawal.payoutPercentage || 50;
      const ratio = pct / 100;

      return {
        ...withdrawal,
        amount: ((withdrawal.amount || 0) / ratio) + partialSum, // total amount
        partialWithdrawals: partials,
      };
    });

    // 🔹 Optional: compute grand total
    const totalWithdrawn = data.reduce((sum, w) => sum + (w.amount || 0), 0);

    return {
      success: true,
      status: 200,
      totalWithdrawn,
      withdrawals: data,
      totalRecords: totalCount,
      paginate: createPaginator.paginate(totalCount, limit, page),
    }
  } catch (error) {
    console.error("Error fetching withdrawal history:", error);
    return { success: false, error: "Server error" }
  }
};


const createReinvestmentStakePending = async (userId, amount) => {
  const { getSettingsWithKeys } = require("../helpers/setting");
  const settings = await getSettingsWithKeys([
    SETTING.STAKE_DURATION,
    SETTING.STAKE_REWARD_PER_DAY,
    SETTING.STAKE_DURATION_UNIT,
  ]);
  const stakeDurationDays = settings[SETTING.STAKE_DURATION];
  const stakeRewardPerDay = settings[SETTING.STAKE_REWARD_PER_DAY];
  const stakeDurationUnit = settings[SETTING.STAKE_DURATION_UNIT];

  const { momentToAdd, momentFormated } = require("../helpers/moment");

  return await Stake.create({
    userId,
    amount,
    status: DEFAULT_STATUS.PENDING,
    endDate: momentToAdd(stakeDurationDays, stakeDurationUnit),
    rewardPercentage: stakeRewardPerDay,
    lastReward: momentFormated(),
  });
};

module.exports = {
  create,
  getWithdrawalByPayload,
  getAllWithdrawalsByPayload,
  updateWithdrawal,
  handleWithdrawalEvent,
  getWithdrawalAmount,
  completeWithdrawal,
  withdrawAmount,
  userStakeReward,
  userOtherReward,
  totalWithdrawalAmount,
  updatePartialWithdrawal,
  calculateTotalWithdrawalAmount,
  getPendingWithdrawals,
  getPendingPartialWithdrawals,
  totalPartialWithdrawalAmount,
  calculateTodayBonus,
  getWithdrawalHistoryByID
};
