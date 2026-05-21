const User = require("../models/user.model");
const Stake = require("../models/stake.model");
const UserOtherReward = require("../models/userOtherReward.model");
const { ObjectId } = require("mongoose").Types;
const UserStakeReward = require("../models/userStakingReward.model");
const socket = require('../helpers/sockets');

const {
  DEFAULT_STATUS, SEARCH_KEY
} = require("../config/constants");
const moment = require('moment');
const TokenExchange = require("../models/tokenExchange.model");
const TeamMember = require("../models/teamMember.model");
const { default: mongoose } = require("mongoose");

const statistics = async (search, startDate, endDate) => {
  try {
    let matchQuery = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23 + 5, 59, 59, 999);
      matchQuery.createdAt = {
        $gte: new Date(start),
        $lte: new Date(end),
      };
    } else {
      if (search === SEARCH_KEY.DAILY) {
        matchQuery = {
          $expr: {
            $eq: [
              { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              moment().format("YYYY-MM-DD"),
            ],
          },
        };
      } else if (search === SEARCH_KEY.WEEKLY) {
        const startOfWeek = moment().startOf("week").format("YYYY-MM-DD");
        const endOfWeek = moment().endOf("week").format("YYYY-MM-DD");
        matchQuery.createdAt = {
          $gte: new Date(startOfWeek),
          $lte: new Date(endOfWeek),
        };
      } else if (search === SEARCH_KEY.MONTHLY) {
        const startOfMonth = moment().startOf("month").format("YYYY-MM-DD");
        const endOfMonth = moment().endOf("month").format("YYYY-MM-DD");
        matchQuery.createdAt = {
          $gte: new Date(startOfMonth),
          $lte: new Date(endOfMonth),
        };
      } else {
        matchQuery = {
          $expr: {
            $eq: [
              { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              moment().format("YYYY-MM-DD"),
            ],
          },
        };
      }
    }
    const users = await User.countDocuments({ role: { $ne: "admin" } });

    const globalTurnOver = await Stake.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      { $unwind: "$userDetails" },
      { $match: { "userDetails.status": "active", "status": "active" } },
      {
        $group: {
          _id: null,
          totalAmount: {
            $sum: {
              $cond: [
                { $ifNull: ["$transactionId", false] },
                "$amount",
                0,
              ],
            },
          },
        },
      },
    ]);

    const totalRewardAggregate = await UserOtherReward.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      { $unwind: "$userDetails" },
      { $match: { "userDetails.status": "active" } },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          totalAmount: {
            $sum: {
              $cond: [
                { $regexMatch: { input: "$amount", regex: /^[0-9.]+$/ } },
                { $toDouble: "$amount" },
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalCount: 1,
          totalAmount: 1,
        },
      },
    ]);

    const totalUserStakeAggregate = await UserStakeReward.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      { $unwind: "$userDetails" },
      { $match: { "userDetails.status": "active" } },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
      {
        $project: {
          _id: 0,
          totalCount: 1,
          totalAmount: 1,
        },
      },
    ]);

    const totalRewardDistribute =
      totalRewardAggregate.length > 0
        ? totalRewardAggregate[0]
        : { totalCount: 0, totalAmount: 0 };
    const totalUserStake =
      totalUserStakeAggregate.length > 0
        ? totalUserStakeAggregate[0]
        : { totalCount: 0, totalAmount: 0 };

    // const totalReward = {
    //   totalCount: totalRewardDistribute.totalCount + totalUserStake.totalCount,
    //   totalAmount: totalRewardDistribute.totalAmount + totalUserStake.totalAmount,
    // };

    return { users, globalTurnOver, totalRewardDistribute, totalUserStake };
  } catch (err) {
    console.log(err);
    return err;
  }
};


const getStakeHistory = async (status, stakeId, fromDate, toDate, page, limit) => {
  try {
    const skip = (page - 1) * limit;
    const query = {
      _id: new ObjectId(stakeId),
      ...(status ? { status } : { status: { $ne: DEFAULT_STATUS.PENDING } }),
    };

    if (fromDate && toDate) {
      query.createdAt = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      };
    } else if (fromDate) {
      query.createdAt = { $gte: new Date(fromDate) };
    } else if (toDate) {
      query.createdAt = { $lte: new Date(toDate) };
    }

    const stakes = await Stake.find(query)
      .populate("userId")
      .populate("transactionId")
      .skip(skip)
      .limit(parseInt(limit));

    const totalCount = await Stake.countDocuments(query);

    const totalStakes = await Stake.aggregate([
      {
        $match: {
          status: { $nin: [DEFAULT_STATUS.PENDING, DEFAULT_STATUS.INACTIVE] }, // Filter out documents with status "pending" or "inactive"
        },
      },
      {
        $group: {
          _id: "$userId",
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    return { totalCount, totalStakes, stakes }
  } catch (err) {
    console.log(err);
    return err;
  }
};

// const getTodayStakeReward = async (page, limit, startDate, endDate, search) => {
//   try {
//     const skip = (page - 1) * limit;
//     const limitValue = parseInt(limit);
//     const today = moment().utc().format('YYYY-MM-DD');
//     const todayStart = moment().startOf('day').add(5, 'hours').toDate();
//     const todayEnd = moment().endOf('day').add(5, 'hours').toDate();

//     let matchStage = {};
//     if (startDate && endDate) {
//       matchStage = {
//         $expr: {
//           $and: [
//             { $gte: ["$stake.createdAt", new Date(startDate)] },
//             { $lte: ["$stake.createdAt", new Date(endDate)] }
//           ]
//         }
//       };
//     } else {
//       if (search === SEARCH_KEY.DAILY) {
//         matchQuery = {
//           $expr: {
//             $eq: [
//               { $dateToString: { format: "%Y-%m-%d", date: "$stake.createdAt" } },
//               today,
//             ],
//           },
//         };



//       } else if (search === SEARCH_KEY.WEEKLY) {
//         const startOfWeek = moment().startOf("week").toDate();
//         const endOfWeek = moment().endOf("week").format("YYYY-MM-DD");
//         matchStage = {
//           $expr: {
//             $eq: [
//               { $isoWeek: "$stake.createdAt" },
//               { $isoWeek: startOfWeek }
//             ]
//           }
//         };
//         // matchQuery.createdAt = {
//         //   $gte: new Date(startOfWeek),
//         //   $lte: new Date(endOfWeek),
//         // };
//       } else if (search === SEARCH_KEY.MONTHLY) {
//         matchStage = {
//           $expr: {
//             $eq: [
//               { $month: "$stake.createdAt" },
//               { $month: new Date(today) }
//             ]
//           }
//         };
//       } else {
//         matchStage = {
//           // "stake.status": DEFAULT_STATUS.ACTIVE,
//           $expr: {
//             $eq: [
//               { $dateToString: { format: "%Y-%m-%d", date: "$stake.createdAt" } }, // Convert createdAt to date string
//               today
//             ]
//           }
//         };
//       }
//     }

//     const totalCountPipeline = [
//       {
//         $lookup: {
//           from: "stakes",
//           localField: "stakeId",
//           foreignField: "_id",
//           as: "stake"
//         }
//       },
//       {
//         $unwind: {
//           path: "$reward",
//           preserveNullAndEmptyArrays: true // Keep stakes even if no reward exists
//         }
//       },
//       {
//         $match: matchStage
//       },
//       {
//         $group: {
//           _id: "$stakeId",
//           totalRewardAmount: { $sum: { $toDouble: "$amount" } },
//           stakeAmount: { $first: "$stake.amount" },
//           date: { $first: "$stake.createdAt" }
//         }
//       },
//       {
//         $count: "totalCount"
//       }
//     ];

//     const totalCountResult = await UserStakeReward.aggregate(totalCountPipeline);
//     console.log('totalCountResult', totalCountResult);
//     const totalCount = totalCountResult.length > 0 ? totalCountResult[0].totalCount : 0;

//     const resultPipeline = [
//       {
//         $lookup: {
//           from: "stakes",
//           localField: "stakeId",
//           foreignField: "_id",
//           as: "stake"
//         }
//       },
//       {
//         $unwind: "$stake"
//       },
//       {
//         $match: matchStage
//       },
//       {
//         $group: {
//           _id: "$stakeId",
//           totalRewardAmount: { $sum: { $toDouble: "$amount" } },
//           stakeAmount: { $first: "$stake.amount" },
//           date: { $first: "$stake.createdAt" }
//         }
//       },
//       {
//         $project: {
//           _id: 0,
//           totalRewardAmount: 1,
//           stakeAmount: 1,
//           date: 1
//         }
//       },
//       {
//         $skip: skip,
//       },
//       {
//         $limit: limitValue,
//       }
//     ];

//     const result = await UserStakeReward.aggregate(resultPipeline);
//     return { userStakeReward: result || [], totalCount };
//   } catch (err) {
//     console.log(err);
//     return err;
//   }
// }

// const getTodayStakeReward = async (page, limit, startDate, endDate, search, userName) => {
//   try {
//     const skip = (page - 1) * limit;
//     const limitValue = parseInt(limit);
//     const today = moment().format('YYYY-MM-DD');

//     let matchStage = {};
//     if (startDate && endDate) {
//       const start = new Date(startDate);
//       const end = new Date(endDate);
//       end.setHours(23 + 5, 59, 59, 999);
//       matchStage = {
//         "status": DEFAULT_STATUS.ACTIVE,
//         createdAt: {
//           $gte: new Date(start),
//           $lte: new Date(end)
//         }
//       };
//     } else if (search === SEARCH_KEY.DAILY) {
//       matchStage = {
//         "status": DEFAULT_STATUS.ACTIVE,
//         $expr: {
//           $eq: [
//             { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
//             today
//           ]
//         }
//       };
//     } else if (search === SEARCH_KEY.WEEKLY) {
//       const startOfWeek = moment().startOf("week").toDate();
//       matchStage = {
//         "status": DEFAULT_STATUS.ACTIVE,
//         $expr: {
//           $eq: [
//             { $isoWeek: "$createdAt" },
//             { $isoWeek: startOfWeek }
//           ]
//         }
//       };
//     } else if (search === SEARCH_KEY.MONTHLY) {
//       matchStage = {
//         "status": DEFAULT_STATUS.ACTIVE,
//         $expr: {
//           $eq: [
//             { $month: "$createdAt" },
//             { $month: new Date(today) }
//           ]
//         }
//       };
//     }

//     // Apply user filter if userName is provided
//     if (userName) {
//       const user = await User.findOne({ userName }); // Find user by userName
//       if (user) {
//         matchStage.userId = user._id; // Filter by userId if userName is provided
//         matchStage.status = DEFAULT_STATUS.ACTIVE;
//       } else {
//         // If no user is found, return empty results
//         return { userStakeReward: [], totalCount: 0, totalStakeAmount: 0 };
//       }
//     }


//     // Calculate total stake amount for all records
//     const totalStakeAmountPipeline = [
//       {
//         $match: matchStage // Match based on stake date
//       },
//       {
//         $lookup: {
//           from: "userstakerewards",
//           localField: "_id",
//           foreignField: "stakeId",
//           as: "rewards"
//         }
//       },
//       {
//         $unwind: {
//           path: "$rewards",
//           preserveNullAndEmptyArrays: true
//         }
//       },
//       {
//         $group: {
//           _id: "$_id",
//           stakeAmount: { $first: "$amount" }
//         }
//       },
//       {
//         $group: {
//           _id: null,
//           totalStakeAmount: { $sum: "$stakeAmount" }
//         }
//       }
//     ];

//     // Get total stake amount across all records
//     const totalStakeAmountResult = await Stake.aggregate(totalStakeAmountPipeline);
//     const totalStakeAmount = totalStakeAmountResult.length > 0 ? totalStakeAmountResult[0].totalStakeAmount : 0;

//     // Get total count
//     const totalCountPipeline = [
//       {
//         $match: matchStage // Match based on stake date
//       },
//       {
//         $lookup: {
//           from: "userstakerewards",
//           localField: "_id",
//           foreignField: "stakeId",
//           as: "rewards"
//         }
//       },
//       {
//         $unwind: {
//           path: "$rewards",
//           preserveNullAndEmptyArrays: true // Keep stakes even if no rewards exist
//         }
//       },
//       {
//         $lookup: {
//           from: "users", // Join with User collection
//           localField: "userId",
//           foreignField: "_id",
//           as: "user"
//         }
//       },
//       {
//         $unwind: {
//           path: "$user",
//           preserveNullAndEmptyArrays: true // Keep stakes even if no user exists
//         }
//       },
//       {
//         $group: {
//           _id: "$_id",
//           userId: { $first: "$userId" },
//           userName: { $first: "$user.userName" },
//           totalRewardAmount: {
//             $sum: { $ifNull: [{ $toDouble: "$rewards.amount" }, 0] }
//           },
//           stakeAmount: { $first: "$amount" },
//           date: { $first: "$createdAt" },
//           status: { $first: "$status" }
//         }
//       },
//       {
//         $count: "totalCount"
//       }
//     ];

//     const totalCountResult = await Stake.aggregate(totalCountPipeline);

//     const totalCount = totalCountResult.length > 0 ? totalCountResult[0].totalCount : 0;

//     // Get result with pagination
//     const resultPipeline = [
//       {
//         $match: matchStage // Match based on stake date
//       },
//       {
//         $lookup: {
//           from: "userstakerewards",
//           localField: "_id",
//           foreignField: "stakeId",
//           as: "rewards"
//         }
//       },
//       {
//         $unwind: {
//           path: "$rewards",
//           preserveNullAndEmptyArrays: true
//         }
//       },
//       {
//         $lookup: {
//           from: "users", // Join with User collection
//           localField: "userId",
//           foreignField: "_id",
//           as: "user"
//         }
//       },
//       {
//         $unwind: {
//           path: "$user",
//           preserveNullAndEmptyArrays: true // Keep stakes even if no user exists
//         }
//       },
//       {
//         $group: {
//           _id: "$_id",
//           userId: { $first: "$userId" },
//           userName: { $first: "$user.userName" },
//           totalRewardAmount: {
//             $sum: { $ifNull: [{ $toDouble: "$rewards.amount" }, 0] }
//           },
//           stakeAmount: { $first: "$amount" },
//           date: { $first: "$createdAt" },
//           status: { $first: "$status" }
//         }
//       },
//       {
//         $project: {
//           userName: 1,
//           totalRewardAmount: 1,
//           stakeAmount: 1,
//           date: 1,
//           status: 1
//         }
//       },
//       {
//         $sort: { date: 1 } // Sort by date in ascending order
//       },
//       {
//         $skip: skip,
//       },
//       {
//         $limit: limitValue,
//       }
//     ];

//     const result = await Stake.aggregate(resultPipeline);
//     return { userStakeReward: result || [], totalCount, totalStakeAmount };
//   } catch (err) {
//     console.log(err);
//     return err;
//   }
// };


const getTodayStakeReward = async (page, limit, startDate, endDate, search, userName) => {
  try {
    const skip = (page - 1) * limit;
    const limitValue = parseInt(limit);
    const today = moment().format('YYYY-MM-DD');

    // --- OPTIMIZATION 1: Create index-friendly date ranges ---
    // This allows MongoDB to use an index on `createdAt` for faster queries.

    let matchStage = {
      "status": DEFAULT_STATUS.ACTIVE,
      rewardPercentage: 0.4
    };

    // if (startDate && endDate) {
    //   const start = moment(startDate).startOf('day').toDate();
    //   const end = moment(endDate).endOf('day').toDate();
    //   matchStage.createdAt = { $gte: start, $lte: end };
    // } else if (search === SEARCH_KEY.DAILY) {
    //   const todayStart = moment().startOf('day').toDate();
    //   const todayEnd = moment().endOf('day').toDate();
    //   matchStage.createdAt = { $gte: todayStart, $lte: todayEnd };
    // } else if (search === SEARCH_KEY.WEEKLY) {
    //   const weekStart = moment().startOf("week").toDate();
    //   const weekEnd = moment().endOf("week").toDate();
    //   matchStage.createdAt = { $gte: weekStart, $lte: weekEnd };
    // } else if (search === SEARCH_KEY.MONTHLY) {
    //   const monthStart = moment().startOf("month").toDate();
    //   const monthEnd = moment().endOf("month").toDate();
    //   matchStage.createdAt = { $gte: monthStart, $lte: monthEnd };
    // }

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23 + 5, 59, 59, 999);
      matchStage = {
        "status": DEFAULT_STATUS.ACTIVE,
        rewardPercentage: 0.4,
        createdAt: {
          $gte: new Date(start),
          $lte: new Date(end)
        }
      };
    } else if (search === SEARCH_KEY.DAILY) {
      matchStage = {
        "status": DEFAULT_STATUS.ACTIVE,
        rewardPercentage: 0.4,
        $expr: {
          $eq: [
            { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            today
          ]
        }
      };
    } else if (search === SEARCH_KEY.WEEKLY) {
      const startOfWeek = moment().startOf("week").toDate();
      matchStage = {
        "status": DEFAULT_STATUS.ACTIVE,
        rewardPercentage: 0.4,
        $expr: {
          $eq: [
            { $isoWeek: "$createdAt" },
            { $isoWeek: startOfWeek }
          ]
        }
      };
    } else if (search === SEARCH_KEY.MONTHLY) {
      matchStage = {
        "status": DEFAULT_STATUS.ACTIVE,
        rewardPercentage: 0.4,
        $expr: {
          $eq: [
            { $month: "$createdAt" },
            { $month: new Date(today) }
          ]
        }
      };
    }

    // Partial, case-insensitive username search
    if (userName) {
      const user = await User.findOne({ userName: { $regex: userName, $options: 'i' } });
      if (user) {
        matchStage.userId = user._id;
      } else {
        return { userStakeReward: [], totalCount: 0, totalStakeAmount: 0 };
      }
    }

    // --- OPTIMIZATION 2: Use a single aggregation pipeline with $facet ---
    const aggregationPipeline = [
      {
        $match: matchStage // The first stage uses an index for speed.
      },
      {
        $lookup: {
          from: "userstakerewards",
          localField: "_id",
          foreignField: "stakeId",
          as: "rewards"
        }
      },
      {
        $unwind: {
          path: "$rewards",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $group: {
          _id: "$_id",
          userId: { $first: "$userId" },
          stakeAmount: { $first: "$amount" },
          totalRewardAmount: { $sum: { $ifNull: [{ $toDouble: "$rewards.amount" }, 0] } },
          date: { $first: "$createdAt" },
          status: { $first: "$status" }
        }
      },
      {
        $lookup: { // We only lookup users for the documents that passed the first match.
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        // $facet runs multiple aggregation pipelines on the same set of input documents.
        $facet: {
          // Pipeline 1: Get the paginated data
          data: [
            { $sort: { date: 1 } },
            { $skip: skip },
            { $limit: limitValue },
            {
              $project: {
                _id: 0, // Exclude _id
                userName: "$user.userName",
                totalRewardAmount: 1,
                stakeAmount: 1,
                date: 1,
                status: 1
              }
            }
          ],
          // Pipeline 2: Get the metadata (total count and amount)
          metadata: [
            {
              $group: {
                _id: null,
                totalCount: { $sum: 1 },
                totalStakeAmount: { $sum: "$stakeAmount" }
              }
            }
          ]
        }
      }
    ];

    const result = await Stake.aggregate(aggregationPipeline);

    const data = result[0].data;
    const metadata = result[0].metadata[0];

    return {
      userStakeReward: data || [],
      totalCount: metadata ? metadata.totalCount : 0,
      totalStakeAmount: metadata ? metadata.totalStakeAmount : 0
    };

  } catch (err) {
    console.log(err);
    return err; // Consider more robust error handling
  }
};

const getTodaySaleDetails = async (
  page,
  limit,
  startDate,
  endDate,
  search,
  userName
) => {
  try {
    const skip = (page - 1) * limit;
    const limitValue = parseInt(limit, 10);
    let matchStage = { status: "completed", type: "sell" };

    /* ------------------------------------------------------------------
       Helper: treat an ISO‑like YYYY‑MM‑DD string as Dubai local time.
    ------------------------------------------------------------------ */
    const dubaiRange = (s, e) => ({
      $gte: moment.tz(s, "YYYY-MM-DD", "Asia/Karachi").startOf("day").toDate(),
      $lte: moment.tz(e, "YYYY-MM-DD", "Asia/Karachi").endOf("day").toDate(),
    });

    /* ------------------------------------------------------------------
       1. Build createdAt range according to query.
    ------------------------------------------------------------------ */
    if (startDate && endDate) {
      matchStage.createdAt = dubaiRange(startDate, endDate);
    } else if (search === SEARCH_KEY.DAILY) {
      const today = moment().tz("Asia/Karachi").format("YYYY-MM-DD");
      matchStage.createdAt = dubaiRange(today, today);
    } else if (search === SEARCH_KEY.WEEKLY) {
      matchStage.createdAt = {
        $gte: moment().tz("Asia/Karachi").startOf("isoWeek").toDate(),
        $lte: moment().tz("Asia/Karachi").endOf("isoWeek").toDate(),
      };
    } else if (search === SEARCH_KEY.MONTHLY) {
      matchStage.createdAt = {
        $gte: moment().tz("Asia/Karachi").startOf("month").toDate(),
        $lte: moment().tz("Asia/Karachi").endOf("month").toDate(),
      };
    }

    /* ------------------------------------------------------------------
       2. Optional user filter.
    ------------------------------------------------------------------ */
    if (userName) {
      const user = await User.findOne({ userName: { $regex: userName, $options: 'i' } });
      if (!user) {
        return { salesData: [], totalCount: 0, totalSaleAmount: 0 };
      }
      matchStage.userId = user._id;
    }

    /* ------------------------------------------------------------------
       3. Aggregate totals.
    ------------------------------------------------------------------ */
    const [{ totalSaleAmount = 0 } = {}] = await TokenExchange.aggregate([
      { $match: matchStage },
      { $group: { _id: null, totalSaleAmount: { $sum: "$amount" } } },
    ]);

    const totalCount = await TokenExchange.countDocuments(matchStage);

    /* ------------------------------------------------------------------
       4. Paged result with Dubai‑formatted date.
    ------------------------------------------------------------------ */
    const salesData = await TokenExchange.aggregate([
      { $match: matchStage },
      { $sort: { createdAt: 1 } },
      { $skip: skip },
      { $limit: limitValue },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: 0,
          userId: 1,
          userName: "$user.userName",
          totalSaleAmount: "$amount",
          createdAtUtc: "$createdAt",         // raw UTC if you still need it
          createdAtDubai: {
            $dateToString: {
              format: "%Y-%m-%d %H:%M:%S",
              date: "$createdAt",
              timezone: "Asia/Karachi",
            },
          },
        },
      },
    ]);

    return { salesData, totalCount, totalSaleAmount };
  } catch (err) {
    console.error(err);
    throw err;
  }
};


const getUsersByDateFilter = async (
  page = 1,
  limit = 20,
  startDate = null,
  endDate = null,
  search = null
) => {
  try {
    const skip = (page - 1) * limit;
    const limitValue = parseInt(limit, 10);

    const pkRange = (s, e) => ({
      $gte: moment.tz(s, "YYYY-MM-DD", "Asia/Karachi").startOf("day").toDate(),
      $lte: moment.tz(e, "YYYY-MM-DD", "Asia/Karachi").endOf("day").toDate(),
    });

    const matchStage = { role: { $ne: 'admin' } };
    if (startDate && endDate) {
      matchStage.createdAt = pkRange(startDate, endDate);
    } else if (search === SEARCH_KEY.DAILY) {
      const today = moment().tz("Asia/Karachi").format("YYYY-MM-DD");
      matchStage.createdAt = pkRange(today, today);
    } else if (search === SEARCH_KEY.WEEKLY) {
      matchStage.createdAt = {
        $gte: moment().tz("Asia/Karachi").startOf("isoWeek").toDate(),
        $lte: moment().tz("Asia/Karachi").endOf("isoWeek").toDate(),
      };
    } else if (search === SEARCH_KEY.MONTHLY) {
      matchStage.createdAt = {
        $gte: moment().tz("Asia/Karachi").startOf("month").toDate(),
        $lte: moment().tz("Asia/Karachi").endOf("month").toDate(),
      };
    }



    /* --------------------------------------------------------------
       2. Count total matching users (for pagination UI).
    -------------------------------------------------------------- */
    const totalCount = await User.countDocuments(matchStage);

    /* --------------------------------------------------------------
       3. Paged list with referrer lookup.
    -------------------------------------------------------------- */
    const usersData = await User.aggregate([
      { $match: matchStage },
      { $sort: { createdAt: 1 } },
      { $skip: skip },
      { $limit: limitValue },
      {
        $lookup: {
          from: "users",
          localField: "referredBy",
          foreignField: "_id",
          as: "referrer",
        },
      },
      { $unwind: { path: "$referrer", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          userName: 1,
          name: 1,
          email: 1,
          status: 1,
          profilePicture: 1,
          referrerUserName: "$referrer.userName",
          createdAtUtc: "$createdAt",
          createdAtPk: {
            $dateToString: {
              format: "%Y-%m-%d %H:%M:%S",
              date: "$createdAt",
              timezone: "Asia/Karachi",
            },
          },
        },
      },
    ]);

    return { usersData, totalCount };
  } catch (err) {
    console.error(err);
    throw err;
  }
};


const getBannedUsersByDateFilter = async (
  page = 1,
  limit = 20,
  startDate = null,
  endDate = null,
  search = null
) => {
  try {
    const skip = (page - 1) * limit;
    const limitValue = parseInt(limit, 10);

    const pkRange = (s, e) => ({
      $gte: moment.tz(s, "YYYY-MM-DD", "Asia/Karachi").startOf("day").toDate(),
      $lte: moment.tz(e, "YYYY-MM-DD", "Asia/Karachi").endOf("day").toDate(),
    });

    const matchStage = {
      role: { $ne: 'admin' },
      BannedAt: { $ne: null }, // ensure only banned users are included
    };

    if (startDate && endDate) {
      matchStage.BannedAt = pkRange(startDate, endDate);
    } else if (search === SEARCH_KEY.DAILY) {
      const today = moment().tz("Asia/Karachi").format("YYYY-MM-DD");
      matchStage.BannedAt = pkRange(today, today);
    } else if (search === SEARCH_KEY.WEEKLY) {
      matchStage.BannedAt = {
        $gte: moment().tz("Asia/Karachi").startOf("isoWeek").toDate(),
        $lte: moment().tz("Asia/Karachi").endOf("isoWeek").toDate(),
      };
    } else if (search === SEARCH_KEY.MONTHLY) {
      matchStage.BannedAt = {
        $gte: moment().tz("Asia/Karachi").startOf("month").toDate(),
        $lte: moment().tz("Asia/Karachi").endOf("month").toDate(),
      };
    }

    const totalCount = await User.countDocuments(matchStage);

    const usersData = await User.aggregate([
      { $match: matchStage },
      { $sort: { BannedAt: -1 } },
      { $skip: skip },
      { $limit: limitValue },
      {
        $lookup: {
          from: "users",
          localField: "referredBy",
          foreignField: "_id",
          as: "referrer",
        },
      },
      { $unwind: { path: "$referrer", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          userName: 1,
          name: 1,
          email: 1,
          status: 1,
          profilePicture: 1,
          referrerUserName: "$referrer.userName",
          BannedAtUtc: "$BannedAt",
          BannedAtPk: {
            $dateToString: {
              format: "%Y-%m-%d %H:%M:%S",
              date: "$BannedAt",
              timezone: "Asia/Karachi",
            },
          },
        },
      },
    ]);

    return { usersData, totalCount };
  } catch (err) {
    console.error(err);
    throw err;
  }
};




const getOtherReward = async (options) => {
  try {
    const { page, limit, filterType, startDate, endDate, search } = options;
    const skip = (page - 1) * limit;

    // --- Step 1: Construct the base date/search query ---
    // This query will be applied to all relevant collections.
    let dateMatchQuery = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateMatchQuery.createdAt = { $gte: start, $lte: end };
    } else if (search) {
      if (search === SEARCH_KEY.DAILY) {
        dateMatchQuery.createdAt = {
          $gte: moment().startOf("day").toDate(),
          $lte: moment().endOf("day").toDate(),
        };
      } else if (search === SEARCH_KEY.WEEKLY) {
        dateMatchQuery.createdAt = {
          $gte: moment().startOf("week").toDate(),
          $lte: moment().endOf("week").toDate(),
        };
      } else if (search === SEARCH_KEY.MONTHLY) {
        dateMatchQuery.createdAt = {
          $gte: moment().startOf("month").toDate(),
          $lte: moment().endOf("month").toDate(),
        };
      }
    }

    // --- Step 2: Define base pipelines for each source collection ---
    // These include lookups and projections to create a unified data structure.
    // The initial $match stage is crucial for performance.

    const otherRewardSourcePipeline = [
      { $match: { ...dateMatchQuery } }, // Initial filtering by date
      // Add necessary lookups for UserOtherReward
      {
        $lookup: { from: "stakes", localField: "stakeId", foreignField: "_id", as: "stake" },
      },
      // You can add other lookups here (e.g., for users)
      {
        $project: {
          // Project a consistent shape
          _id: 1,
          type: "$type",
          amount: { $ifNull: ["$amount", 0] },
          stakingAmount: { $ifNull: [{ $arrayElemAt: ["$stake.amount", 0] }, 0] },
          percent: { $ifNull: ["$rewardPercentage", null] },
          date: "$createdAt",
          status: { $ifNull: [{ $arrayElemAt: ["$stake.status", 0] }, null] },
        },
      },
    ];

    const stakeRewardSourcePipeline = [
      { $match: { ...dateMatchQuery } }, // Initial filtering by date
      // Add necessary lookups for UserStakeReward
      {
        $lookup: { from: "stakes", localField: "stakeId", foreignField: "_id", as: "stake" },
      },
      { $unwind: "$stake" }, // Unwind is safe after filtering
      {
        $project: {
          // Project the same consistent shape
          _id: 1,
          type: "staking_reward", // Explicitly set the type
          amount: { $ifNull: ["$amount", 0] },
          stakingAmount: { $ifNull: ["$stake.amount", 0] },
          percent: { $literal: null },
          date: "$createdAt",
          status: "$stake.status",
        },
      },
    ];

    // --- Step 3: Dynamically build the main query based on filterType ---
    let combinedPipeline = [];
    let sourceCollectionModel; // The Mongoose model to run the query on

    if (filterType) {
      if (filterType === "staking_reward") {
        // If user wants ONLY staking rewards, use that pipeline and model
        combinedPipeline = stakeRewardSourcePipeline;
        sourceCollectionModel = UserStakeReward;
      } else {
        // If user wants another specific type, add that filter to the other rewards pipeline
        otherRewardSourcePipeline[0].$match.type = filterType;
        combinedPipeline = otherRewardSourcePipeline;
        sourceCollectionModel = UserOtherReward;
      }
    } else {
      // If no type is specified, get ALL records by unioning the two pipelines
      combinedPipeline = [
        ...otherRewardSourcePipeline,
        {
          $unionWith: {
            coll: "userstakerewards", // The name of the collection in the DB
            pipeline: stakeRewardSourcePipeline,
          },
        },
      ];
      sourceCollectionModel = UserOtherReward; // Start the query from the first collection
    }

    // --- Step 4: Add final stages for sorting, pagination, and totals ---
    // This $facet stage runs on the correctly pre-filtered data
    const finalAggregation = [
      ...combinedPipeline,
      {
        $facet: {
          // Branch 1: Get the data for the current page
          levelBonusData: [
            { $sort: { date: -1 } },
            { $skip: skip },
            { $limit: limit },
          ],
          // Branch 2: Calculate metadata on the ENTIRE filtered result set
          metadata: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 }, // Correctly count all matching documents
                totalAmount: { $sum: { $toDouble: "$amount" } }, // Correctly sum the amount
              },
            },
          ],
        },
      },
      // Deconstruct the $facet output into a clean structure
      {
        $project: {
          levelBonusData: 1,
          total: { $ifNull: [{ $arrayElemAt: ["$metadata.total", 0] }, 0] },
          totalAmount: { $ifNull: [{ $arrayElemAt: ["$metadata.totalAmount", 0] }, 0] },
        },
      },
    ];

    // --- Step 5: Execute the aggregation query ---
    const results = await sourceCollectionModel.aggregate(finalAggregation);

    const result = results[0] || {
      levelBonusData: [],
      total: 0,
      totalAmount: 0,
    };

    return {
      total: result.total,
      rewardsWithLevels: {
        levelBonusData: result.levelBonusData,
        totalAmount: result.totalAmount,
      },
    };
  } catch (err) {
    console.error("Error in getOtherReward service:", err);
    // Throw the error so the controller can catch it and send a 500 response
    throw err;
  }
};



const isUserSessionExpired = async (userId) => {
  try {
    const user = await User.findById(userId);

    return user?.status === DEFAULT_STATUS.BANNED;
  } catch (err) {
    console.log(err);
    return err;
  }
};


const activePendingReferralListAdmin = async (
  teamId,
  level,
  status,
  page,
  limit,
  startDate,
  endDate,
  userName // 👈 NEW
) => {
  try {

    const fiveHoursInMs = 5 * 60 * 60 * 1000;

    const parsedStart = new Date(startDate);
    const parsedEnd = new Date(endDate);
    const shiftedStart = new Date(parsedStart.getTime() + fiveHoursInMs);
    const shiftedEnd = new Date(parsedEnd.getTime() + fiveHoursInMs);

    const pipeline = [
      {
        $match: {
          teamId: new ObjectId(teamId),
          // Only filter by level when it's explicitly provided (not null/undefined)
          ...(level !== null && level !== undefined ? { level } : {}),
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
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },

      ...(status
        ? [
            {
              $match: {
                "user.status": status,
              },
            },
          ]
        : []),

      ...(userName
        ? [
            {
              $match: {
                "user.userName": {
                  $regex: userName,
                  $options: "i",
                },
              },
            },
          ]
        : []),

      {
        $lookup: {
          from: "stakes",
          let: { localUserId: "$user._id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$userId", "$$localUserId"],
                },
              },
            },
            {
              $match: { status: "active" },
            },
            ...(startDate && endDate
              ? [
                  {
                    $match: {
                      createdAt: {
                        $gte: shiftedStart,
                        $lte: shiftedEnd,
                      },
                    },
                  },
                ]
              : []),
          ],
          as: "stakes",
        },
      },

      {
        $lookup: {
          from: "userranks",
          localField: "user._id",
          foreignField: "userId",
          as: "uranks",
        },
      },
      {
        $unwind: {
          path: "$uranks",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "ranks",
          localField: "uranks.rankId",
          foreignField: "_id",
          as: "rankInfo",
        },
      },
      {
        $unwind: {
          path: "$rankInfo",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $project: {
          _id: 0,
          level: 1,
          teamMember: "$_id",
          user: 1,
          stakes: 1,
          userRankStars: { $ifNull: ["$user.userRankId", 0] },
        },
      },

      ...(startDate && endDate
        ? [
            {
              $match: {
                $expr: {
                  $gt: [{ $size: "$stakes" }, 0],
                },
              },
            },
          ]
        : []),

      // ✅ Group by user ID to remove duplicates
      {
        $group: {
          _id: "$user._id", // group by user ID to avoid duplicates
          doc: { $first: "$$ROOT" },
        },
      },
      {
        $replaceRoot: {
          newRoot: "$doc",
        },
      },

      {
        $facet: {
          data: [
            { $sort: { level: 1, teamMember: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: parseInt(limit) },
          ],
          totalStakingSum: [
            { $unwind: "$stakes" },
            {
              $group: {
                _id: null,
                totalSum: { $sum: "$stakes.amount" },
              },
            },
          ],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const result = await TeamMember.aggregate(pipeline);

    const data = result[0]?.data ?? [];
    const totalStakingSum = result[0]?.totalStakingSum?.[0]?.totalSum ?? 0;
    const totalCount = result[0]?.totalCount?.[0]?.count ?? 0;

    return {
      data,
      totalStakingSum,
      totalCount,
    };
  } catch (err) {
    console.error(err);
    return err;
  }
};





const numOfActivePendigReferralsAdmin = async (
  teamId,
  level,
  status,
  startDate,
  endDate
) => {
  try {
    const pipeline = [
      // 1) Match the team & level first
      {
        $match: {
          teamId: new ObjectId(teamId),
          level,
        },
      },
      // 2) Lookup the user
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 3) Conditionally match on user status if provided
      ...(status
        ? [
          {
            $match: {
              "user.status": status,
            },
          },
        ]
        : []),

      // 4) Lookup the stakes
      {
        $lookup: {
          from: "stakes",
          localField: "user._id",
          foreignField: "userId",
          as: "stakes",
        },
      },
      {
        $unwind: {
          path: "$stakes",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $match: {
          "stakes.status": "active",
        },
      },

      // 5) Conditionally match on stake creation date if provided
      ...(startDate && endDate
        ? [
          {
            $match: {
              "stakes.createdAt": {
                $gte: new Date(startDate),
                $lte: new Date(endDate),
              },
            },
          },
        ]
        : []),

      // 6) Group by the TeamMember _id so each referral is counted once
      {
        $group: {
          _id: "$_id", // group by the TeamMember document
        },
      },

      // 7) Finally count how many distinct _id's
      {
        $count: "total",
      },
    ];

    const result = await TeamMember.aggregate(pipeline);


    // Return the number if it exists; otherwise 0
    return result.length > 0 ? result[0].total : 0;
  } catch (err) {
    console.error(err);
    return err;
  }
};


const numOfDirectReferralBussinessAdmin = async (teamId, level, status, startDate, endDate) => {
  try {
    const isValidObjectId = mongoose.Types.ObjectId.isValid(teamId);
    if (!isValidObjectId) {
      throw new Error("Invalid teamId format");
    }

    // Dynamically build a single object to match fields on the "user" document
    const userMatchStage = {};

    // If status is provided, filter by status
    if (status) {
      userMatchStage["user.status"] = status;
    }

    // If both startDate and endDate are provided, filter by user creation date range
    if (startDate && endDate) {
      userMatchStage["user.createdAt"] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const result = await TeamMember.aggregate([
      // First, match documents in TeamMember
      {
        $match: {
          teamId: new ObjectId(teamId),
          level: level,
        },
      },
      // Lookup the related users
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Now match against fields in the user document (status, date range)
      {
        $match: userMatchStage,
      },
      // Lookup stakes for each user
      {
        $lookup: {
          from: "stakes",
          localField: "user._id",
          foreignField: "userId",
          as: "stakes",
        },
      },
      {
        $unwind: {
          path: "$stakes",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Sum up stakes amounts (only those with active status)
      {
        $group: {
          _id: null,
          totalAmount: {
            $sum: {
              $cond: [
                { $eq: ["$stakes.status", "active"] },
                { $ifNull: ["$stakes.amount", 0] },
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalAmount: 1,
        },
      },
    ]);

    // Return the total business amount or 0 if no documents
    return result.length > 0 ? result[0].totalAmount : 0;
  } catch (err) {
    console.log(err);
    return err;
  }
};


module.exports = {
  statistics,
  getStakeHistory,
  getTodayStakeReward,
  getTodaySaleDetails,
  getOtherReward,
  isUserSessionExpired,
  activePendingReferralListAdmin,
  numOfActivePendigReferralsAdmin,
  numOfDirectReferralBussinessAdmin,
  getUsersByDateFilter,
  getBannedUsersByDateFilter
};
