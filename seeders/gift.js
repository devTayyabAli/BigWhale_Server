const Gift = require("../models/gift.model");

const giftDetails = [
  {
    title: "Rank 1 - Cash Reward",
    amount: 120,
  },
  {
    title: "Rank 2 - Cash Reward",
    amount: 400,
  },
  {
    title: "Rank 3 - Cash Reward",
    amount: 600,
  },
  {
    title: "Rank 4 - Cash Reward + Mobile",
    amount: 1000,
  },
  {
    title: "Rank 5 - Cash Reward + International Tour",
    amount: 1500,
  },
  {
    title: "Rank 6 - Cash Reward + Yamaha YB125Z-DX",
    amount: 2000,
  },
  {
    title: "Rank 7 - Cash Reward + Suzuki Cultus AGS",
    amount: 5000,
  },
];

async function seedGifts() {
  try {
    if (giftDetails.length > 0) {
      const gifts = await Gift.find({});

      if (gifts.length == 0) {
        const result = await Gift.insertMany(giftDetails, { ordered: true });
        console.log("🚀 ~ seedGifts ~ result:", result);
        console.log(`Documents inserted successfully`);
      }
    }
  } catch (error) {
    console.error("Error seeding gifts", error);
  }
}

seedGifts();
