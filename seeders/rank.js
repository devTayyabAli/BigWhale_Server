const Gift = require("../models/gift.model");
const Rank = require("../models/rank.model");

async function seedRank() {
  try {
    const gifts = await Gift.find({});
    const rankDetails = await prepareRankPayload(gifts);

    if (rankDetails.length > 0) {
      let added = 0;
      for (const rank of rankDetails) {
        const isExists = await Rank.findOne({ title: rank.title });
        if (!isExists) {
          await Rank.create(rank);
          added++;
        }
      }

      if (added) console.error("Rank seeder executed successfully.");
    }
  } catch (error) {
    console.error("Error seeding ranks", error);
  }
}

async function prepareRankPayload(gifts) {
 const rankData = [
   {
     _id: "658bd448558e0cb0ee98f5e8",
     title: "1 star reward",
     starKey: 1,
     selfBusiness: 100,
     directTeam: 5,
     directBussiness: 1000,
     totalTeamBusiness: 2500,
     totalTeamSize: 20,
     rewardPercentage: 2,
     giftId: gifts.find((gift) => gift.title.toLowerCase().includes("rank 1"))?._id || null,
   },
   {
     _id: "65cb2bec882bc22db4b56df2",
     title: "2 star reward",
     starKey: 2,
     selfBusiness: 500,
     directTeam: 7,
     directBussiness: 2500,
     totalTeamBusiness: 10000,
     totalTeamSize: 50,
     rewardPercentage: 2,
     giftId: gifts.find((gift) => gift.title.toLowerCase().includes("rank 2"))?._id || null,
   },
   {
     _id: "65cb2bec882bc22db4b56df5",
     title: "3 star reward",
     starKey: 3,
     selfBusiness: 1500,
     directTeam: 10,
     directBussiness: 3000,
     totalTeamBusiness: 30000,
     totalTeamSize: 150,
     rewardPercentage: 2,
     giftId: gifts.find((gift) => gift.title.toLowerCase().includes("rank 3"))?._id || null,
   },
   {
     _id: "65cb2bec882bc22db4b56df8",
     title: "4 star reward",
     starKey: 4,
     selfBusiness: 5000,
     directTeam: 15,
     directBussiness: 10000,
     totalTeamBusiness: 0,
     totalTeamSize: 0,
     rankId: "65cb2bec882bc22db4b56df5",
     referralCount: 3,
     rewardPercentage: 2.5,
     giftId: gifts.find((gift) => gift.title.toLowerCase().includes("rank 4"))?._id || null,
   },
   {
     _id: "65cb2bec882bc22db4b56df6",
     title: "5 star reward",
     starKey: 5,
     selfBusiness: 10000,
     directTeam: 20,
     directBussiness: 20000,
     totalTeamBusiness: 0,
     totalTeamSize: 0,
     rankId: "65cb2bec882bc22db4b56df8",
     referralCount: 3,
     rewardPercentage: 3,
     giftId: gifts.find((gift) => gift.title.toLowerCase().includes("rank 5"))?._id || null,
   },
   {
     _id: "65cb2bec882bc22db4b56dfe",
     title: "6 star reward",
     starKey: 6,
     selfBusiness: 15000,
     directTeam: 25,
     directBussiness: 30000,
     totalTeamBusiness: 0,
     totalTeamSize: 0,
     rankId: "65cb2bec882bc22db4b56df6",
     referralCount: 3,
     rewardPercentage: 3.5,
     giftId: gifts.find((gift) => gift.title.toLowerCase().includes("rank 6"))?._id || null,
   },
   {
     _id: "65cb2bec882bc22db4b56e01",
     title: "7 star reward",
     starKey: 7,
     selfBusiness: 25000,
     directTeam: 30,
     directBussiness: 50000,
     totalTeamBusiness: 0,
     totalTeamSize: 0,
     rankId: "65cb2bec882bc22db4b56dfe",
     referralCount: 3,
     rewardPercentage: 5,
     giftId: gifts.find((gift) => gift.title.toLowerCase().includes("rank 7"))?._id || null,
   },
 ];
 return rankData;
}

seedRank();