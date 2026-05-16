const mongoose = require('mongoose');

const inviteSchema = new mongoose.Schema({
  senderUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  receiverEmail: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
  },
},
{ timestamps: true,
  // collection: 'invites' 
},
);

const Invite = mongoose.model('Invite', inviteSchema);

module.exports = Invite;
