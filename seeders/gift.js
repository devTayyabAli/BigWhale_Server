const Gift = require("../models/gift.model");

const giftDetails = [
  {
    title: "Laptop",
    amount: 300,
  },
  {
    title: "Iphone 15 Pro Max",
    amount: 1200,
  },
  {
    title: "Heavy Bike",
    amount: 7000,
  },
  {
    title: "MG Car",
    amount: 25000,
  },
  {
    title: "Fortuner Car + International Tours",
    amount: 40000,
  },
  {
    title: "Mercedes C Class + Home",
    amount: 200000,
  },
  {
    title: "Farm Aircraft Helicopter",
    amount: 500000,
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
