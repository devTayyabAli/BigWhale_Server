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
     selfBusiness: 0.555555555555555555,
     directTeam: 5,
     directBussiness: 1.111111111111111111,
     totalTeamBusiness: 11.111111111111111111,
     totalTeamSize: 20,
     rewardPercentage: 2,
     giftId: gifts.find((gift) => gift.title == "laptop")?._id || null,
   },
   {
     _id: "65cb2bec882bc22db4b56df2",
     title: "2 star reward",
     starKey: 2,
     selfBusiness: 1.111111111111111111,
     directTeam: 7,
     directBussiness: 2.222222222222222222,
     totalTeamBusiness: 33.333333333333333333
     ,
     totalTeamSize: 50,
     rewardPercentage: 1.5,
     giftId:
       gifts.find((gift) => gift.title.toLowerCase().includes("iphone"))
         ?._id || null,
   },
   {
     _id: "65cb2bec882bc22db4b56df5",
     title: "3 star reward",
     starKey: 3,
     selfBusiness: 2.222222222222222222,
     directTeam: 10,
     directBussiness: 3.333333333333333333,
     totalTeamBusiness: 111.111111111111111111,
     totalTeamSize: 150,
     rewardPercentage: 1,
     giftId:
       gifts.find((gift) => gift.title.toLowerCase().includes("bike"))?._id ||
       null,
   },
   {
     _id: "65cb2bec882bc22db4b56df8",
     title: "4 star reward",
     starKey: 4,
     selfBusiness: 3.333333333333333333,
     directTeam: 15,
     directBussiness: 5.555555555555555555,
     totalTeamBusiness: 0,
     totalTeamSize: 0,
     rankId: "65cb2bec882bc22db4b56df5",
     referralCount: 3,
     rewardPercentage: 0.75,
     giftId:
       gifts.find((gift) => gift.title.toLowerCase().includes("brv"))?._id ||
       null,
   },
   {
     _id: "65cb2bec882bc22db4b56df6",
     title: "5 star reward",
     starKey: 5,
     selfBusiness: 4.444444444444444444,
     directTeam: 20,
     directBussiness: 7.777777777777777777,
     totalTeamBusiness: 0,
     totalTeamSize: 0,
     rankId: "65cb2bec882bc22db4b56df8",
     referralCount: 3,
     rewardPercentage: 0.5,
     giftId:
       gifts.find((gift) => gift.title.toLowerCase().includes("fortuner"))
         ?._id || null,
   },
   {
     _id: "65cb2bec882bc22db4b56dfe",
     title: "6 star reward",
     starKey: 6,
     selfBusiness: 5.555555555555555555,
     directTeam: 25,
     directBussiness: 11.111111111111111111,
     totalTeamBusiness: 0,
     totalTeamSize: 0,
     rankId: "65cb2bec882bc22db4b56df6",
     referralCount: 3,
     rewardPercentage: 0.5,
     giftId:
       gifts.find((gift) => gift.title.toLowerCase().includes("mercedes"))
         ?._id || null,
   },
   {
     _id: "65cb2bec882bc22db4b56e01",
     title: "7 star reward",
     starKey: 7,
     selfBusiness: 6.666666666666666666,
     directTeam: 30,
     directBussiness: 13.333333333333333333,
     totalTeamBusiness: 0,
     totalTeamSize: 0,
     rankId: "65cb2bec882bc22db4b56dfe",
     referralCount: 3,
     rewardPercentage: 0.5,
     giftId:
       gifts.find((gift) => gift.title.toLowerCase().includes("villa"))?._id ||
       null,
   },
 ];
 return rankData;
}

seedRank();