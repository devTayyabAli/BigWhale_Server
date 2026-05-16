const User = require('../models/user.model'); // Import the User model

// Sample user data
const userData = [
  {
    name: "John Doe",
    email: "johndoe@gmail.com",
    password: "Admin@123",
    userName: "johndoe",
    emailVerified: true,
    is2faEnabled: false,
    status: "active",
    walletAddress: "0x2de332A5F75e863E90A369C9Db02f9DBA10AB903",
    role: "user",
  },
  {
    name: "Admin",
    email: "admin@gmail.com",
    password: "Admin@123",
    userName: "admin",
    emailVerified: true,
    is2faEnabled: false,
    status: "active",
    role: "admin",
  }
];

// Function to seed users
async function seedUsers() {
  try {
    if (userData.length > 0) {
      let added = 0;
      for (const user of userData) {
        const existingUser = await User.findOne({ email: user.email });
  
        if (!existingUser) {
          await User.create(user);
          added++;
        }
      }
      
      if (added) console.error('User seeder executed.');
    }
  } catch (error) {
    console.error('Error seeding users:', error);
  }
}

// Seed the users
seedUsers();
