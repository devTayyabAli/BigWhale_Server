const { DEFAULT_STATUS } = require("../config/constants");
const Team = require("../models/team.model");

const getTeamMemberAlongStakedAmount = async (userId, startDate) => {
  let response = [];
  const teamAggregate = await Team.aggregate([
    {
      $match: { userId: userId },
    },
    {
      $lookup: {
        from: "teammembers",
        localField: "_id",
        foreignField: "teamId",
        as: "members",
      },
    },
    {
      $unwind: "$members", // Unwind the members array
    },
    {
      $lookup: {
        from: "stakes",
        let: { memberId: "$members.userId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$userId", "$$memberId"] },
                    { $eq: ["$status", DEFAULT_STATUS.ACTIVE] },
                  { $gt: ["$endDate", startDate] },
                ],
              },
            },
          },
          {
            $group: {
              _id: "$userId",
              totalStakedAmount: { $sum: "$amount" },
            },
          },
        ],
        as: "members.stakedAmount", // Store the total staked amount for each member
      },
    },
    {
      $group: {
        _id: "$_id",
        totalStakedAmounts: {
          $push: { $arrayElemAt: ["$members.stakedAmount", 0] },
        },
      },
    },
  ]);

  if (teamAggregate.length > 0) response = teamAggregate[0];
  return response;
};

module.exports = {
  getTeamMemberAlongStakedAmount,
};
3