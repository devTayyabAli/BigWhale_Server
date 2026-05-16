const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  key: { type: String, required: true },
  value: { type: String, required: true },

},
{ timestamps: true,
  // collection: 'settings' 
},
);

const Setting = mongoose.model('Setting', settingSchema);

module.exports = Setting;
