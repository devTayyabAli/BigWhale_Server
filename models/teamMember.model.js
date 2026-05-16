const mongoose = require('mongoose');

const teamMemberSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  level: { type: Number, required: true },
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true,
  },
},
  { timestamps: true,
    // collection: 'team_members' 
 },
);

const TeamMember = mongoose.model('TeamMember', teamMemberSchema);

module.exports = TeamMember;
