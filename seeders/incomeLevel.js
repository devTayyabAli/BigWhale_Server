const incomeLevel = require('../models/incomeLevel.model');

const incomeLevelData = [
  {
    title: 'L1',
    minimumRewardPercentage: '50',
    minimumRequiredReferrals: '1',
    maxLevel:1,
    minLevel:1,
  },
  {
    title: 'L2',
    minimumRewardPercentage: '10',
    maximumRewardPercentage: '50',
    minimumRequiredReferrals: '2',
    directBussiness: 3000,
    directReferral: 5,
    activationDays: 30,
    maxLevel:2,
    minLevel:2
  },
  {
    title: 'L3-L5',
    minimumRewardPercentage: '5',
    minimumRequiredReferrals: '3',
    minLevel: 3,
    maxLevel: 5,
  },
  {
    title: 'L6-L10',
    minimumRewardPercentage: '3',
    minimumRequiredReferrals: '5',
    minLevel: 6,
    maxLevel: 10,
  },
  {
    title: 'L11-L30',
    minimumRewardPercentage: '2',
    minimumRequiredReferrals: '10',
    minLevel: 11,
    maxLevel: 30,
  },
  {
    title: 'L31-L50',
    minimumRewardPercentage: '1',
    minimumRequiredReferrals: '15',
    minLevel: 31,
    maxLevel: 50,
  }
];

// Function to seed incomeLevel
async function seedIncomeLevels() {
  try {
    if (incomeLevelData.length > 0) {
      let added = 0;
      for (const income of incomeLevelData) {
        const existingIncome = await incomeLevel.findOne({ title: income?.title });
  
        if (!existingIncome) {
          await incomeLevel.create(income);
          added++;
        }
      }
      
      if (added) console.error('Income Level seeder executed.');
    }

  } catch (error) {
    console.error('Error seeding Income Level:', error);
  }
}

seedIncomeLevels();
