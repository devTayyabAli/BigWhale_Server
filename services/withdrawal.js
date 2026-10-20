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
  FAST_TRACK,
} = require("../config/constants.js");
const fastTrack = require("./fastTrack");
const Transaction = require("../models/transaction.model.js");
const socket = require("../helpers/sockets");
const { transferFunds, getWithdrawalAmountFromContract, getAdminBlnc, stakeTokenOnChain, estimateTransferNetworkFee } = require("../helpers/web3.js");
const PartialWithdrawals = require("../models/partialWithdrawal.model.js");
const helper = require("../helpers/index");
const User = require("../models/user.model.js");
const Stake = require("../models/stake.model.js");
const salaryRankService = require("./salaryRank");
const { getSettingWithKey } = require("../helpers/setting");

/**
 * 2X Fast-Track universal withdrawal rules (apply to every income type):
 *  • exactly FAST_TRACK.WITHDRAWAL_CHUNK (10 BW) per withdrawal
 *  • MAX_WITHDRAWALS_PER_WINDOW (1) per rolling WITHDRAWAL_WINDOW_HOURS (24h)
 *  • 1 unused direct-joining credit per withdrawal
 *  • quota/credit are consumed only when the withdrawal is CONFIRMED
 *    (handleWithdrawalEvent / makePartialPayment), never at request time,
 *    so a cancelled wallet transaction costs the user nothing.
 *
 * The chunk rule is validated on `fiatAmount` (USD value the user typed)
 * when the client sends it, otherwise on `amount` (token quantity).
 */
const validateFastTrackWithdrawal = async (user, ruleAmount) => {
  const chunk = FAST_TRACK.WITHDRAWAL_CHUNK;
  const maxPerRequest = chunk * FAST_TRACK.MAX_WITHDRAWALS_PER_WINDOW;

  if (!ruleAmount || ruleAmount <= 0) {
    return "Invalid withdrawal amount.";
  }
  const chunks = Math.round(ruleAmount / chunk);
  if (chunks < 1 || Math.abs(ruleAmount - chunks * chunk) > FAST_TRACK.AMOUNT_TOLERANCE) {
    return `Withdrawal is only allowed in chunks of ${chunk} BW.`;
  }
  if (ruleAmount > maxPerRequest + FAST_TRACK.AMOUNT_TOLERANCE) {
    return `Only ${FAST_TRACK.MAX_WITHDRAWALS_PER_WINDOW} withdrawal of ${chunk} BW is allowed per ${FAST_TRACK.WITHDRAWAL_WINDOW_HOURS} hours.`;
  }

  // Rolling window — based on the last CONFIRMED withdrawal.
  const remainingMs = fastTrack.getWithdrawalWindowRemainingMs(user.lastWithdrawalAt);
  if (remainingMs > 0) {
    const h = Math.floor(remainingMs / 3600000);
    const m = Math.ceil((remainingMs % 3600000) / 60000);
    return `Withdrawal limit reached. Next ${chunk} BW withdrawal available in ${h}h ${m}m.`;
  }

  // In-flight guard — one fast-track withdrawal at a time.
  const windowStart = new Date(Date.now() - FAST_TRACK.WITHDRAWAL_WINDOW_HOURS * 3600000);
  const staleBefore = new Date(Date.now() - FAST_TRACK.PENDING_WITHDRAWAL_STALE_MINUTES * 60000);

  // Drop abandoned requests (user never signed the wallet tx).
  await Withdrawal.deleteMany({
    userId: user._id,
    status: DEFAULT_STATUS.PENDING,
    payoutPercentage: 80,
    transactionId: null,
    createdAt: { $lt: staleBefore },
  });

  const inFlight = await Withdrawal.findOne({
    userId: user._id,
    status: DEFAULT_STATUS.PENDING,
    payoutPercentage: 80,
    createdAt: { $gte: windowStart },
  })
    .select("transactionId createdAt")
    .lean();

  if (inFlight) {
    if (inFlight.transactionId) {
      return "Your previous withdrawal is still being confirmed on-chain. Please wait for it to complete.";
    }
    const waitMin = Math.ceil(
      (new Date(inFlight.createdAt).getTime() + FAST_TRACK.PENDING_WITHDRAWAL_STALE_MINUTES * 60000 - Date.now()) / 60000
    );
    return `A withdrawal request is already in progress. Complete it in your wallet or try again in ${Math.max(1, waitMin)} minute(s).`;
  }

  // 1 new joining credit per chunk.
  const available = Number(user.unusedDirectCount || 0);
  if (available < chunks) {
    return `Withdrawal requires 1 new direct joining (5 BW stake) per ${chunk} BW (Required: ${chunks}, Available: ${available}).`;
  }

  return null;
};

const create = async (req, response) => {
  const { userId, amount, fiatAmount } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    response.success = false;
    response.message = "User not found";
    response.status = 404;
    return response;
  }

  // ── 2X Fast-Track Universal Withdrawal Validations ────────────────
  const ruleAmount = Number(fiatAmount ?? amount);
  const ruleError = await validateFastTrackWithdrawal(user, ruleAmount);
  if (ruleError) {
    response.success = false;
    response.message = ruleError;
    response.status = 400;
    return response;
  }
  const requiredJoinings = Math.round(ruleAmount / FAST_TRACK.WITHDRAWAL_CHUNK);

  const { stakingAmount, otherRewardAmount } =
    await calculateTotalWithdrawalAmount(new ObjectId(userId));
  const partialWithdrawalAmountFixed = Number((Number(Number(amount)?.toFixed(6)) - Number(Number(stakingAmount)?.toFixed(6)))?.toFixed(6))
  const otherRewardAmountFixed = Number(Number(otherRewardAmount).toFixed(6))
  let withdrawalAmountFromContract = 0;
  const withdrawal = new Withdrawal({
    userId,
    payoutPercentage: 80,
    requiredJoinings,
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

  // NOTE: the joining credit + 24h quota are consumed in handleWithdrawalEvent
  // once the on-chain transaction is confirmed — not here.

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

  const toAddress = partialWithdrawalAmount?.userId?.walletAddress;

  // Safety guard: never send tokens if the destination address is missing
  // or doesn't match a basic hex wallet format.
  if (!toAddress || !/^0x[0-9a-fA-F]{40}$/.test(toAddress)) {
    await PartialWithdrawal.deleteOne({ _id: partialWithdrawal?._id });
    console.error(`makePartialPayment: invalid or missing walletAddress for userId=${userId}, got="${toAddress}"`);
    response.success = false;
    response.message = "Withdrawal failed: user wallet address is not configured. Please contact support.";
    response.status = 400;
    response.data = {};
    return response;
  }

  console.log(`makePartialPayment: sending ${amount * 0.8} BW to userId=${userId} walletAddress=${toAddress}`);

  const receipt = await withdrawAmount(
    toAddress,
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

  await updatePartialWithdrawal(receipt?.transactionHash);

  // Server-side transfer succeeded → consume the joining credit + 24h quota now.
  await consumeQuotaOnce(withdrawal, userId);

  response.success = true;
  response.message = "Withdrawal added successfully";
  response.status = 201;
  response.data = {};
  return response;
};
const createPartialWithdrawal = async (payload) => {
  return await PartialWithdrawal.create(payload);
};

/**
 * Consume the fast-track quota (1 joining credit + 24h window) exactly once
 * per withdrawal. Idempotent via Withdrawal.fastTrackQuotaConsumedAt so a
 * re-delivered blockchain event can never double-charge the user.
 */
const consumeQuotaOnce = async (withdrawal, userId) => {
  const joinings = Number(withdrawal?.requiredJoinings || 1);
  const uid = userId || withdrawal?.userId?._id || withdrawal?.userId;
  if (!uid) return;

  if (withdrawal?._id) {
    const res = await Withdrawal.updateOne(
      { _id: withdrawal._id, fastTrackQuotaConsumedAt: null },
      { $set: { fastTrackQuotaConsumedAt: new Date() } }
    );
    if (res.matchedCount === 0) {
      // Not matched: either already consumed, or the doc was never persisted
      // (partial-only path builds the Withdrawal in memory). Only skip when
      // it exists in DB (= already consumed).
      const exists = await Withdrawal.exists({ _id: withdrawal._id });
      if (exists) return;
    }
  }

  await fastTrack.consumeWithdrawalQuota(uid, joinings);
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

      // ── 2X Fast-Track: withdrawal CONFIRMED → consume joining credit + 24h quota
      if (payoutPct === 80) {
        await consumeQuotaOnce(withdrawal, withdrawal.userId).catch((err) =>
          console.error("handleWithdrawalEvent: quota consumption failed:", err?.message)
        );
      }

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

  // Fetch the platform withdrawal deduction percentage (e.g. 5) in parallel
  // with the gas fee estimate so the UI can always show the fee row.
  let networkFeeKgc = 0;
  let withdrawalDeductionPercentage = 0;
  try {
    const [user, deductionPct] = await Promise.all([
      User.findById(userId).select("walletAddress").lean(),
      getSettingWithKey(SETTING.WITHDRAWAL_DEDUCTION_PERCENTAGE),
    ]);
    withdrawalDeductionPercentage = Number(deductionPct || 0);
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
    withdrawalDeductionPercentage,
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
  getWithdrawalHistoryByID,
  consumeQuotaOnce,
  validateFastTrackWithdrawal,
};
