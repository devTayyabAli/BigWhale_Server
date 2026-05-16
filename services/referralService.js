const TeamMember = require("../models/teamMember.model");
const Team = require("../models/team.model");
const { ObjectId } = require("mongoose").Types;

exports.setRefererTeamMember = async (referredBy, userId) => {
  try {
    // Find or create team for the referredBy user
    const team =
      (await Team.findOne({ userId: referredBy })) ||
      (await Team.create({ userId: referredBy }));
    // Find referral members
    const referralMemberList = await TeamMember.find({ userId: referredBy }).sort({ level: 1 });
    let count = 1;
    // Update referral member list for the new user
    const parentMembers = referralMemberList.map((child) => {
      count++;
      child._id = new ObjectId();
      child.userId = userId;
      child.level = count;
      return child;
    });
    // Create TeamMember for the new user
    const newUserTeamMember = {
      teamId: team._id,
      userId,
      level: 1,
    };
    parentMembers.sort((a, b) => b.level - a.level);
    // Insert the new user's TeamMember entry along with the updated referral member list
    await TeamMember.insertMany([...parentMembers, newUserTeamMember]);
  } catch (error) {
    console.error("Error:", error);
  }
};
