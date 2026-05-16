const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationSchema = new mongoose.Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  notificationType: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
},
{ timestamps: true,
  // collection: 'notifications'
},
);

// Add a pre-save middleware to update the `updatedAt` field before saving
notificationSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
