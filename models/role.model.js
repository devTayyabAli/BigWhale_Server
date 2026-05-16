const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  roleName: {
    type: String,
    required: false,
    unique: true,
  },
  permissions: [{ type: String, ref: 'Permission', required: true }],
},
{ timestamps: true,
  // collection: 'roles' 
},
);

  const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
