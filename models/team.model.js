const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
},
  { timestamps: true,
    // collection: 'teams' 
 },
);

const Team = mongoose.model('Team', teamSchema);

module.exports = Team;
