
const User = require("../../models/user.model");
const Stake = require("../../models/stake.model");
const UserOtherReward = require("../../models/userOtherReward.model");
const { ObjectId } = require("mongoose").Types;
const createPaginator = require("../../helpers/paginate");
const admin = require("../../services/admin");
const referral = require("../../services/referral");
const UserStakeReward = require("../../models/userStakingReward.model");
const { SEARCH_KEY, HTTP_STATUS_CODE, DEFAULT_STATUS, EXCHANGE_TYPES, TRANSACTION_STATUS } = require("../../config/constants");
const moment = require('moment');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Team = require("../../models/team.model");
const TokenRate = require("../../models/tokenRate.model");
const ResponseHelper = require("../../helpers/response");
const socket = require('../../helpers/sockets');
const Withdrawal = require('../../models/withdrawal.model'); // Adjust the path as necessary
const PartialWithdrawals = require("../../models/partialWithdrawal.model");
const TokenExchange = require("../../models/tokenExchange.model");
const FundsTransfer = require("../../models/fundsTransfer.model");
const TeamMember = require("../../models/teamMember.model");
const { getWithdrawalAmountFromContract } = require("../../helpers/web3");



/**
   * @param req request body
   * @param res callback response object
   * @description Method to user list
   */
const userList = async (req, res) => {
  try {
    const { page, limit, search, status } = req.query;
    const skip = (page - 1) * limit;
    const filter = { role: { $ne: 'admin' } };

    if (status && ['pending', 'active', 'banned']?.includes(status)) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: `${search}`, $options: 'i' } },
        { userName: { $regex: `${search}`, $options: 'i' } },
        { email: { $regex: `${search}`, $options: 'i' } },
        { walletAddress: { $regex: `${search}`, $options: 'i' } }

      ];
    }

    const numOfUsers = await User.countDocuments(filter);
    const users = await User.find(filter)
      .skip(skip)
      .limit(parseInt(limit));

    return res.status(200).json({
      success: true,
      message: "Users found successfully.",
      paginate: createPaginator.paginate(numOfUsers, limit, page),
      data: users || []
    });
  } catch (err) {
    console.error("Error: ", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
      data: {}
    });
  }
};


const getWithdrawals = async (req, res) => {
  try {
    const { userId } = req.params; // Get userId from route parameters
    const { page = 1, limit = 10 } = req.query; // Default page = 1, limit = 10
    const skip = (page - 1) * limit; // Calculate skip for pagination


    // Define the filter for active withdrawals
    const filter = { userId, status: "active" };
    const user = await User.findById(new ObjectId(userId))

    // Fetch all withdrawals and partial withdrawals (without pagination)
    const withdrawals = await Withdrawal.find(filter)
      .populate('userId', 'userName'); // Populate userId field with userName from User model

    const partialWithdrawals = await PartialWithdrawals.find(filter)
      .populate('userId', 'userName'); // Populate userId field with userName from User model

    // Combine results from both models
    const combinedResults = [...withdrawals, ...partialWithdrawals];

    // Calculate the total count of combined results
    const totalCount = combinedResults.length;

    // Apply pagination to the combined results
    const paginatedResults = combinedResults.slice(skip, skip + parseInt(limit));

    // Convert contract amount to float safely
    const contractAmount = parseFloat(await getWithdrawalAmountFromContract(user?.walletAddress)) || 0;

    // Calculate only the sum of partial withdrawals
    const partialWithdrawalsSum = partialWithdrawals.reduce((sum, item) => {
      const amt = parseFloat(item.amount);
      return !isNaN(amt) ? sum + amt : sum;
    }, 0);

    // Sum of partialWithdrawals + contract
    const totalWithdrawalWithContract = partialWithdrawalsSum + contractAmount;

    // Calculate the sum of all withdrawals (both Withdrawal and PartialWithdrawals)
    const totalWithdrawalSum = combinedResults.reduce((sum, item) => {
      // Check if the amount exists and is a valid number
      const amount = parseFloat(item.amount);
      if (!isNaN(amount)) {
        return sum + amount;
      }
      return sum; // If amount is not valid, just return the sum
    }, 0);
    return res.status(200).json({
      success: true,
      message: "Withdrawals fetched successfully",
      paginate: createPaginator.paginate(totalCount, limit, page), // Pagination details
      totalWithdrawalSum: totalWithdrawalSum, // Sum of all withdrawals
      totalWithdrawalWithContract,
      data: paginatedResults || [] // Return paginated results or empty array if none found
    });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
      data: []
    });
  }
};


const getUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findOne({ _id: id }).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        data: {}
      });
    }
    return res.status(200).json({
      success: true,
      message: "Account Information.",
      data: { ...user?._doc }
    });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
      data: [],
    });
  }
};


const getSellToken = async (req, res) => {
  try {
    const userId = req.params.userId; // Get userId from route parameters
    const { page = 1, limit = 10, type = 'sell' } = req.query; // Default page = 1, limit = 10
    const skip = (page - 1) * limit; // Calculate skip for pagination

    const result = await TokenExchange.aggregate([
      {
        $match: {
          userId: new ObjectId(userId),
          type: type,
          status: "completed"
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
          pipeline: [
            {
              $project: {
                _id: 1, // Keep _id if needed
                userName: 1 // Include only userName
              }
            }
          ]
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'transactions',
          localField: 'transactionId',
          foreignField: '_id',
          as: 'transaction'
        }
      },
      { $unwind: { path: "$transaction", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          user: 1,  // Contains only `userName` from `users`
          amount: 1,
          type: 1,
          status: 1,
          transaction: 1,
          createdAt: 1
        }
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $skip: (page - 1) * limit,
      },
      {
        $limit: parseInt(limit),
      },
    ]);

    const totalAmount = await TokenExchange.aggregate([
      {
        $match: {
          userId: new ObjectId(userId),
          type: type
        }
      },
      {
        $lookup: {
          from: "transactions", // Name of the transactions collection
          localField: "transactionId",
          foreignField: "_id",
          as: "populatedTransaction"
        }
      },
      {
        $unwind: "$populatedTransaction"
      },
      {
        $group: {
          _id: {
            userId: "$userId",
            transactionId: "$transactionId"
          },
          totalAmount: { $sum: "$populatedTransaction.fiatAmount" }
        }
      },
      {
        $group: {
          _id: "$_id.userId",
          totalAmount: { $sum: "$totalAmount" }
        }
      }
    ]);

    const sum = totalAmount.length > 0 ? JSON.parse(JSON.stringify(totalAmount)).reduce((acc, curr) => acc + curr.totalAmount, 0) : 0;
    const total = await TokenExchange.countDocuments({
      userId: new ObjectId(userId),
      type: type
    });
    const tokenExchangeData =
      result.length > 0 ? result : [];

    // console.log("result",result)

    // // Define the filter for "Sell" transactions
    // const filter = { userId, type: EXCHANGE_TYPES.SELL, status: TRANSACTION_STATUS.COMPLETED };

    // // Fetch "Sell" transactions from the TokenExchange model
    // const sellTransactions = await TokenExchange.find(filter)
    //   .populate('userId', 'userName') // Populate userId field with userName from User model
    // // .skip(skip) // Apply pagination skip
    // // .limit(parseInt(limit)); // Apply pagination limit

    // // Calculate the total count of "Sell" transactions
    // const totalCount = await TokenExchange.countDocuments(filter);
    // const paginatedResults = sellTransactions.slice(skip, skip + parseInt(limit));
    // // Calculate the sum of amounts for "Sell" transactions
    // const totalSellSum = sellTransactions.reduce((sum, transaction) => {
    //   const amount = parseFloat(transaction.amount);
    //   if (!isNaN(amount)) {
    //     return sum + amount;
    //   }
    //   return sum; // If amount is not valid, just return the sum
    // }, 0);

    return res.status(200).json({
      success: true,
      message: "Sell transactions fetched successfully",
      paginate: createPaginator.paginate(total, limit, page),
      // Pagination details
      totalSellSum: sum, // Sum of all "Sell" transactions
      data: result || [], // Return paginated results or empty array if none found
    });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
      data: [],
    });
  }
};



const getFundsTransfer = async (req, res) => {
  try {
    const userId = req.params.userId; // Get userId from route parameters

    const { page = 1, limit = 10, status, receive = false } = req.query;
    const skip = (page - 1) * limit;
    const query = {
      ...(receive
        ? { toUserId: new ObjectId(userId) }
        : { fromUserId: new ObjectId(userId) }),
      ...(status ? { status } : { status: { $ne: "pending" } }),
    };

    const data = await FundsTransfer.find(query)
      .populate("fromUserId")
      .populate("toUserId")
      .populate("transactionId")
      .sort({ createdAt: -1 }) // Sort by createdAt in descending order
      .skip(skip)
      .limit(parseInt(limit));

    const totalAmount = await FundsTransfer.aggregate([
      {
        $match: {
          ...query,
        },
      },
      {
        $lookup: {
          from: "transactions", // Name of the transactions collection
          localField: "transactionId",
          foreignField: "_id",
          as: "populatedTransaction"
        }
      },
      {
        $unwind: "$populatedTransaction"
      },
      {
        $group: {
          _id: {
            userId: "$toUserId",
            transactionId: "$transactionId"
          },
          totalAmount: { $sum: "$populatedTransaction.fiatAmount" }
        }
      },
      {
        $group: {
          _id: "$_id.userId",
          totalAmount: { $sum: "$totalAmount" }
        }
      }
    ]);

    const sum = totalAmount.length > 0 ? JSON.parse(JSON.stringify(totalAmount)).reduce((acc, curr) => acc + curr.totalAmount, 0) : 0;
    const totalCount = await FundsTransfer.countDocuments(query);


    return res.status(200).json({
      success: true,
      message: "FundsTransfer transactions fetched successfully",
      paginate: createPaginator.paginate(totalCount, limit, page),
      // Pagination details
      totalFundsTransferSum: sum, // Sum of all "Sell" transactions
      data: data || [], // Return paginated results or empty array if none found
    });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
      data: [],
    });
  }
};


const changePassword = async (req, res) => {
  let response = ResponseHelper.getResponse(
    false,
    "Something went wrong",
    {},
    400
  );


  try {
    const { oldPassword, password } = req.body;

    const authorizationToken = req.headers["authorization"].split(" ");
    const userEmail = jwt.verify(
      authorizationToken[1],
      process.env.JWT_SECRET_STRING
    );

    const user = await User.findOne({ email: userEmail?.email });

    const compareHashPassword = bcrypt.compareSync(
      oldPassword,
      user?.password
    );

    if (!compareHashPassword) {
      response.message = "Old password is incorrect.";
      return;
    }

    // Update the password directly on the user object
    user.password = password;
    await user.save(); // Save the updated user object

    response.success = true;
    response.message = "Password changed successfully.";
    response.data = { ...user?._doc };
    response.status = 200;
  } catch (err) {
    console.log("changePasswordError: ", err);
    response.message = err;
    response.status = 500;
  } finally {
    return res.status(response.status).json(response);
  }
}

const deleteUserById = async (req, res) => {
  const userId = req.params.userId;

  try {
    // Find the user by ID and delete it
    const deletedUser = await User.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateUserWithdrawStatus = async (req, res) => {
  const userId = req.params.userId;
  const newStatus = req.body.status;

  try {
    // ✅ Correct: update both fields in a single object
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        isKGCSaleInactive: newStatus,
        isWithdrawInactive: newStatus
      },
      { new: true }
    );


    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'User status updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateUserLevelIncomeRewardStatus = async (req, res) => {
  const userId = req.params.userId;
  const newStatus = req.body.status;

  try {

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        isLevelIncomeInactive: newStatus,
      },
      { new: true }
    );


    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'User status updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};



const updateUserStatus = async (req, res) => {
  const userId = req.params.userId;
  const newStatus = req.body.status;

  try {
    // Find the user by ID and update its status
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { status: newStatus },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If the new status is BANNED
    if (updatedUser?.status === DEFAULT_STATUS.BANNED) {
      // Store the current userRankId in userRankIdRecord before nullifying it
      await User.findOneAndUpdate(
        { _id: new ObjectId(userId) },
        {
          $set: {
            BannedAt: new Date(),
            userRankIdRecord: updatedUser.userRankId, // Store old rank
            userRankId: null, // Nullify userRankId
          },
        },
        { new: true }
      );

      // Set user's Stake status to INACTIVE
      await Stake.findOneAndUpdate(
        { userId: new ObjectId(userId) },
        {
          $set: { status: DEFAULT_STATUS.INACTIVE },
        },
        { new: true }
      );

      // Emit 'bannedUserSession' event
      socket.io.to(userId).emit("bannedUserSession", {}, (confirmation) => {
        if (confirmation) {
          console.log('bannedUserSession-Event emitted successfully to user with ID:', userId);
        } else {
          console.log('bannedUserSession-Event failed to emit to user with ID:', userId);
        }
      });
    } else {
      // If the status is being re-activated
      if (updatedUser?.status === DEFAULT_STATUS.ACTIVE) {
        // Restore userRankId from userRankIdRecord
        await User.findOneAndUpdate(
          { _id: new ObjectId(userId) },
          {
            $set: {
              userRankId: updatedUser.userRankIdRecord, // Restore old rank
              status: DEFAULT_STATUS.ACTIVE, // Set status to ACTIVE
            },
          },
          { new: true }
        );

        // Optionally, update Stake status back to ACTIVE
        await Stake.findOneAndUpdate(
          { userId: new ObjectId(userId) },
          {
            $set: { status: DEFAULT_STATUS.ACTIVE },
          },
          { new: true }
        );
      }
    }

    res.status(200).json({ message: 'User status updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// const updateUserStatus = async (req, res) => {
//   const userId = req.params.userId;
//   const newStatus = req.body.status;
//   try {
//     // Find the user by ID and update its status
//     const updatedUser = await User.findByIdAndUpdate(
//       userId,
//       { status: newStatus },
//       { new: true }
//     );

//     if (!updatedUser) {
//       return res.status(404).json({ message: 'User not found' });
//     }

//     if (updatedUser?.status === DEFAULT_STATUS.BANNED) {
//       await Stake.findOneAndUpdate(
//         { userId: new ObjectId(userId) },
//         {
//           $set: {
//             status: DEFAULT_STATUS.INACTIVE
//           }
//         },
//         { new: true }
//       );

//       await User.findOneAndUpdate(
//         { _id: new ObjectId(userId) },
//         {
//           $set: {
//             userRankId: null,
//           },
//         },
//         { new: true }
//       );

//       socket.io.to(userId).emit("bannedUserSession", {}, (confirmation) => {
//         if (confirmation) {
//           console.log('bannedUserSession-Event emitted successfully to user with ID:', userId);
//         } else {
//           console.log('bannedUserSession-Event Failed to emit to user with ID:', userId);
//         }
//       });
//     }

//     res.status(200).json({ message: 'User status updated successfully', user: updatedUser });
//   } catch (error) {
//     console.error('Error updating user status:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };


const updateStakingStatus = async (req, res) => {
  const userId = req.params.userId;
  const newStatus = req.body.status;

  if (!ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  if (!newStatus) {
    return res.status(400).json({ error: 'Status is required' });
  }

  try {
    const updatedStaking = await Stake.findByIdAndUpdate(
      { _id: new ObjectId(userId) }, // or just userId if it's a string
      { $set: { status: newStatus } },
      { new: true }
    );

    if (!updatedStaking) {
      return res.status(404).json({ error: 'Staking record not found' });
    }

    res.status(200).json({
      message: 'Staking status updated successfully',
      stake: updatedStaking,
    });
  } catch (error) {
    console.error('Error updating staking status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
const stakingList = async (req, res) => {
  try {

    const userId = req.params.userId;
    const { page, limit, search, startDate, endDate, status } = req.query;
    const skip = (page - 1) * limit;

    let matchQuery = { rewardPercentage: 0.4 };

    if (userId && ObjectId.isValid(userId)) {
      matchQuery.userId = new ObjectId(userId);
    }
    // matchQuery.rewardPercentage = 0.4

    if (status && ['active', 'pending', 'inactive'].includes(status)) {
      matchQuery.status = status;
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23 + 5, 59, 59, 999);
      matchQuery.createdAt = {
        $gte: new Date(start),
        $lte: new Date(end)
      };
    } else if (search === SEARCH_KEY.DAILY) {
      matchQuery.createdAt = {
        $gte: new Date(moment().startOf('day')),
        $lte: new Date(moment().endOf('day'))
      };
    } else if (search === SEARCH_KEY.WEEKLY) {
      matchQuery.createdAt = {
        $gte: new Date(moment().startOf('week')),
        $lte: new Date(moment().endOf('week'))
      };
    } else if (search === SEARCH_KEY.MONTHLY) {
      matchQuery.createdAt = {
        $gte: new Date(moment().startOf('month')),
        $lte: new Date(moment().endOf('month'))
      };
    }

    const numOfStakes = await Stake.countDocuments(matchQuery);
    const stakeList = await Stake.find(matchQuery)
      .sort({ createdAt: -1 })
      .populate('transactionId')
      .skip(skip)
      .limit(parseInt(limit));
    // const stakeListSum = stakeList.reduce((sum, transaction) => {
    //   const amount = parseFloat(transaction.amount);
    //   if (!isNaN(amount)) {
    //     return sum + amount;
    //   }
    //   return sum; // If amount is not valid, just return the sum
    // }, 0);

    const stakeListSumAgg = await Stake.aggregate([
      { $match: matchQuery },
      { $group: { _id: null, totalAmount: { $sum: "$amount" } } }
    ]);
    const stakeListSum = stakeListSumAgg.length > 0 ? stakeListSumAgg[0].totalAmount : 0;
    // Calculate total amount
    const activeAmountSum = await Stake.aggregate([
      {
        $match: { status: DEFAULT_STATUS.ACTIVE }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" }
        }
      }
    ]);

    const totalAmount = activeAmountSum.length > 0 ? activeAmountSum[0].totalAmount : 0;
    console.log("totalAmount", stakeListSum)
    return res.status(200).json({
      success: true,
      message: "Stake found successfully.",
      paginate: createPaginator.paginate(numOfStakes, limit, page),
      totalAmount: totalAmount,
      stakeListSum: stakeListSum,
      data: stakeList || []
    });
  } catch (err) {
    console.error("Error: ", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
      data: null
    });
  }
};

const stakingRewardByStakeId = async (req, res) => {
  try {
    const stakeId = req.params.stakeId;
    const { page, limit } = req.query;
    const skip = (page - 1) * limit;
    const numOfStakes = await UserStakeReward.countDocuments({ stakeId: new ObjectId(stakeId) });
    const stakeReward = await UserStakeReward.find({ stakeId: new ObjectId(stakeId) })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    return res.status(200).json({
      success: true,
      message: "Stake found successfully.",
      paginate: createPaginator.paginate(numOfStakes, limit, page),
      data: stakeReward || []
    });
  } catch (err) {
    console.error("Error: ", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
      data: null
    });
  }
};


const rewardList = async (req, res) => {
  try {
    const userId = req.params.userId;
    const { page = 1, limit = 10, rewardPercentage, startDate, endDate, search, type } = req.query;
    const skip = (page - 1) * limit;

    // Initialize filter with userId
    let filter = { userId: userId };

    // Add rewardPercentage filter if provided and not 'all'
    if (rewardPercentage && rewardPercentage !== 'all') {
      filter.rewardPercentage = rewardPercentage;
    }

    // Add date filter
    const today = moment().format("YYYY-MM-DD");

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      // Set time to end of the day (23:59:59.999 UTC+5)
      end.setHours(23 + 5, 59, 59, 999);
      filter = {
        userId: userId,
        createdAt: {
          $gte: new Date(start),
          $lte: new Date(end)
        }
      };
    } else if (search === 'all') {
      filter = {
        userId: userId,
      };

    } else if (search === 'daily') {
      // Match only today's records

      filter = {
        userId: userId,
        $expr: {
          $eq: [
            { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            today
          ]
        }
      };

    } else if (search === 'weekly') {
      const startOfWeek = moment().startOf("week").toDate();
      filter = {
        userId: userId,
        $expr: {
          $eq: [
            { $isoWeek: "$createdAt" },
            { $isoWeek: startOfWeek }
          ]
        }
      };

    } else if (search === 'monthly') {
      filter = {
        userId: userId,
        $expr: {
          $eq: [
            { $month: "$createdAt" },
            { $month: new Date(today) }
          ]
        }
      };
    }

    let userOtherReward = [];
    let userStakeRewardList = [];

    // Fetch UserOtherReward
    if (!type || type === 'all' || type === 'Incom Reward') {
      userOtherReward = await UserOtherReward.find(filter)
        .populate('rankId', 'title')
        .populate({
          path: 'stakeId',
          select: 'userId',
          populate: {
            path: 'userId',
            select: 'userName',
          },
        });
    }
    // Fetch UserStakeReward
    if (!type || type === 'all' || type === 'Staking') {
      userStakeRewardList = await UserStakeReward.find(filter)
        .populate('userId', 'userName')
        .populate({
          path: 'stakeId',
          select: 'userId',
          populate: {
            path: 'userId',
            select: 'userName',
          },
        });
    }

    // Combine and paginate
    const combinedResults = [...userOtherReward, ...userStakeRewardList];
    const totalCount = combinedResults.length;
    const paginatedResults = combinedResults.slice(skip, skip + parseInt(limit));

    const totalUserRewardSum = combinedResults.reduce((sum, item) => {
      const amount = parseFloat(item.amount);
      return !isNaN(amount) ? sum + amount : sum;
    }, 0);

    return res.status(200).json({
      success: true,
      message: "User rewards fetched successfully",
      paginate: createPaginator.paginate(totalCount, limit, page),
      totalUserRewardSum,
      data: paginatedResults || [],
    });

  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
      data: [],
    });
  }
};


const userDetail = async (req, res) => {
  try {
    const userId = req.params.userId;
    const userDetail = await User.findById(userId)
      .populate({
        path: 'registrationTransactionId',
        select: 'fiatAmount'
      })
      .populate({
        path: 'referredBy',
        select: 'userName _id'
      });

    if (!userDetail) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        data: null,
      });
    }
    return res.status(200).json({
      success: true,
      message: "User details fetched successfully",
      data: userDetail,
      userRank: userDetail?.userRankId
    });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
      data: null,
    });
  }
};

const Statistics = async (req, res) => {
  try {
    const { search, startDate, endDate, userName = null } = req.query;

    const { users, globalTurnOver, totalRewardDistribute, totalUserStake } = await admin.statistics(search, startDate, endDate, userName);
    return res.status(200).json({
      success: true,
      message: "Details found successfully.",
      totalusers: users || 0,
      totalGlobal: globalTurnOver?.[0]?.totalAmount || 0,
      totalRewardDistribute,
      totalUserStake

    });
  } catch (err) {
    console.error("Error: ", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
      data: {}
    });
  }
};

const getStakeHistory = async (req, response) => {
  const { status, page, limit, fromDate, toDate } = req.query;
  const stakeId = req.params.stakeId;

  const { totalCount, totalStakes, stakes } = await admin.getStakeHistory(status, stakeId, fromDate, toDate, page, limit);

  return response.status(200).json({
    success: true,
    message: "Details found successfully.",
    stakes,
    totalStakeAmount: totalStakes[0]?.totalAmount || 0,
    paginate: createPaginator.paginate(totalCount, limit, page)
  });
};

const getTodayStakeReward = async (request, response) => {
  try {
    const { page, limit, startDate, endDate, search, userName } = request.query;
    const { userStakeReward, totalCount, totalStakeAmount } = await admin.getTodayStakeReward(page, limit, startDate, endDate, search, userName);

    return response.status(200).json({
      success: true,
      message: "Details found successfully.",
      userStakeReward,
      totalStakeAmount,
      paginate: createPaginator.paginate(totalCount, limit, page),

    });
  } catch (err) {
    console.log(err);
    return err;
  }
};

const getTodaySale = async (request, response) => {
  try {
    const { page, limit, startDate, endDate, search, userName } = request.query;
    const { salesData, totalCount, totalSaleAmount } = await admin.getTodaySaleDetails(page, limit, startDate, endDate, search, userName);
    return response.status(200).json({
      success: true,
      message: "Details found successfully.",
      salesData,
      totalSaleAmount,
      paginate: createPaginator.paginate(totalCount, limit, page),

    });
  } catch (err) {
    console.log(err);
    return err;
  }
};

const getTodayUsers = async (request, response) => {
  try {
    const { page, limit, startDate, endDate, search, userName } = request.query;
    const { totalCount, usersData } = await admin.getUsersByDateFilter(page, limit, startDate, endDate, search, userName);

    return response.status(200).json({
      success: true,
      message: "Details found successfully.",
      usersData,
      paginate: createPaginator.paginate(totalCount, limit, page),

    });
  } catch (err) {
    console.log(err);
    return err;
  }
};


const getTodayBannedUsers = async (request, response) => {
  try {
    const { page, limit, startDate, endDate, search, userName } = request.query;
    const { totalCount, usersData } = await admin.getBannedUsersByDateFilter(page, limit, startDate, endDate, search, userName);

    return response.status(200).json({
      success: true,
      message: "Details found successfully.",
      usersData,
      paginate: createPaginator.paginate(totalCount, limit, page),

    });
  } catch (err) {
    console.log(err);
    return err;
  }
};
const getOtherReward = async (req, response) => {
  try {
    const { page = 1, limit = 10, type, startDate, endDate, search } = req.query;

    const { rewardsWithLevels, total } = await admin.getOtherReward({
      page: parseInt(page),
      limit: parseInt(limit),
      filterType: type,
      startDate,
      endDate,
      search,
    });

    return response.status(200).json({
      success: true,
      message: "Details found successfully.",
      rewards: rewardsWithLevels,
      paginate: createPaginator.paginate(total, limit, page),
    });
  } catch (error) {
    console.error("Error in getOtherReward controller:", error);
    return response.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
};

const getReferralByType = async (request, response) => {
  try {
    const { type, page, limit, startDate,
      endDate,userName } = request.query;
    const { userId } = request.params;
    const team = await Team.findOne({ userId: new ObjectId(userId) });
    const teamId = team?._id;
    if (!team) {
      return response.status(201).json({ data: [] });
    }

    let data = [];
    let total = 0;
    let totalBussiness = 0;
    let referralStatus = DEFAULT_STATUS.ACTIVE;
    switch (type) {
      case "direct":
        break;
      case "directActive":
        referralStatus = DEFAULT_STATUS.ACTIVE;
        break;
      case "downlineActive":
        referralStatus = DEFAULT_STATUS.ACTIVE;

        break;
      case "directPending":
        referralStatus = DEFAULT_STATUS.BANNED;
      case "downlinePending":
        referralStatus = DEFAULT_STATUS.BANNED;
        break;
      default:
        break;
    }

    if (
      type === "direct"
    ) {
      data = await admin.activePendingReferralListAdmin(
        teamId,
        1,
        null,
        page,
        limit,
        startDate,   // Add these two parameters for the date range
        endDate,
        userName
      );
      total = await admin.numOfActivePendigReferralsAdmin(
        teamId,
        1,
        null,
        startDate,
        endDate
      );
      totalBussiness = await admin.numOfDirectReferralBussinessAdmin(
        teamId,
        1,
        null,
        startDate,
        endDate
      );
    } else if (
      type === "directActive" ||
      type === "directPending"
    ) {
      data = await admin.activePendingReferralListAdmin(
        teamId,
        1,
        referralStatus,
        page,
        limit,
        startDate,
        endDate,
        userName
      );
      total = await admin.numOfActivePendigReferralsAdmin(
        teamId,
        1,
        referralStatus,
        startDate,
        endDate
      );
      totalBussiness = await admin.numOfDirectReferralBussinessAdmin(
        teamId,
        1,
        referralStatus,
        startDate,
        endDate
      );
    } else if (type === "downlineActive" || type === "downlinePending") {
      data = await admin.activePendingReferralListAdmin(
        teamId,
        { $ne: 1 },
        referralStatus,
        page,
        limit,
        startDate,
        endDate,
        userName
      );
      total = await admin.numOfActivePendigReferralsAdmin(
        teamId,
        { $ne: 1 },
        referralStatus,
        startDate,
        endDate
      );
      totalBussiness = await admin.numOfDirectReferralBussinessAdmin(
        teamId,
        { $ne: 1 },
        referralStatus,
        startDate,
        endDate
      );
    }
    // console.log("data",data?.data,data?.totalStakingSum)
    return response.status(HTTP_STATUS_CODE.OK).json({
      data: data?.data,
      total: data?.data.length > 0 ? data.totalCount : 0,
      totalBussiness: data?.totalStakingSum,
      paginate: createPaginator.paginate(data?.data.length > 0 ? data?.totalCount : 0, limit, page),
    });
  } catch (error) {
    return response.status(HTTP_STATUS_CODE.INTERNAL_SERVER).json(error);
  }
};
const saveTokenRate = async (request, response) => {
  try {
    const { txHash, amount } = request.body;
    const tokensRate = await TokenRate.create({ txHash, amount });
    response.status(200).json({
      success: true,
      message: "Tokens exchange successfully",
      data: tokensRate
    });
  } catch (error) {
    console.error("Tokens exchange error:", error);
    response.status(500).json({
      success: false,
      message: error.message || "An internal server error occurred"
    });
  }
};
const getLatestTokenRate = async (request, response) => {
  try {
    const tokensRate = await TokenRate.findOne().sort({ createdAt: -1 });

    if (!tokensRate) {
      return response.status(404).json({
        success: false,
        message: "No token rate found"
      });
    }

    return response.status(200).json({
      success: true,
      message: "Fetch latest token rate successfully",
      data: tokensRate
    });
  } catch (error) {
    console.error("Tokens rate error:", error);
    return response.status(500).json({
      success: false,
      message: error.message || "An internal server error occurred"
    });
  }
};

const teamTotalReward = async (req, res) => {
  try {
    const userId = req.params.userId; // Get the userId from request params
    const { startDate, endDate } = req.query;

    // Find the team for the given user
    const team = await Team.findOne({ userId });
    if (!team) {
      return res.status(404).json({ success: false, message: "Team not found" });
    }

    const teamId = team._id;

    // Fetch all team members of the given team
    const teamMembers = await TeamMember.find({ teamId });
    if (!teamMembers.length) {
      return res.status(404).json({ success: false, message: "No team members found" });
    }

    let totalTeamReward = 0;
    let teamRewardDetails = [];

    // Iterate through each team member and call rewardList function
    for (const member of teamMembers) {
      const memberId = member.userId;
      const user = await User.find({ _id: memberId });
      // Fetch rewards for the team member
      if (user[0]?.status == "active") {
        const response = await rewardListHelper(memberId, startDate, endDate);
        console.log("response", response)
        if (response.success) {
          totalTeamReward += response.totalUserRewardSum;
          teamRewardDetails.push({ userId: memberId, totalUserRewardSum: response.totalUserRewardSum, userName: user[0]?.userName });
        }
      } else {
        console.log("User Baned")
      }

    }

    return res.status(200).json({
      success: true,
      message: "Team total rewards fetched successfully",
      totalTeamReward,
      teamRewardDetails,
    });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
    });
  }
};

const rewardListHelper = async (userId, startDate = null, endDate = null) => {
  try {
    // Define the filter
    let filter = { userId };

    // Validate and apply date filter
    if (startDate !== "null" && endDate !== "null") {
      const parsedStartDate = new Date(startDate);
      const parsedEndDate = new Date(endDate);

      if (!isNaN(parsedStartDate) && !isNaN(parsedEndDate)) {
        filter.createdAt = { $gte: parsedStartDate, $lte: parsedEndDate };
      } else {
        throw new Error("Invalid startDate or endDate format. Use YYYY-MM-DD.");
      }
    }


    // Fetch all user rewards and staking rewards with date filter
    const userOtherReward = await UserOtherReward.find(filter).populate({
      path: "userId",
      model: "User", // Ensure correct model name
      select: "userName",
    });;
    const userStakeRewardList = await UserStakeReward.find(filter).populate({
      path: "userId",
      model: "User", // Ensure correct model name
      select: "userName",
    });;

    // Combine results from both models
    const combinedResults = [...userOtherReward, ...userStakeRewardList];

    // Calculate the sum of all rewards
    const totalUserRewardSum = combinedResults.reduce((sum, item) => {
      const amount = parseFloat(item.amount);
      return !isNaN(amount) ? sum + amount : sum;
    }, 0);

    return { success: true, totalUserRewardSum };
  } catch (err) {
    console.error("Error fetching rewards for user", userId, err);
    return { success: false, totalUserRewardSum: 0 };
  }
};


module.exports = {
  userList,
  changePassword,
  deleteUserById,
  updateUserStatus,
  updateStakingStatus,
  stakingList,
  rewardList,
  userDetail,
  Statistics,
  getStakeHistory,
  getTodayStakeReward,
  getTodaySale,
  getOtherReward,
  stakingRewardByStakeId,
  getReferralByType,
  saveTokenRate,
  getLatestTokenRate,
  getWithdrawals,
  getSellToken,
  getFundsTransfer,
  getUserProfile,
  teamTotalReward,
  getTodayUsers,
  updateUserWithdrawStatus,
  updateUserLevelIncomeRewardStatus,
  getTodayBannedUsers
};