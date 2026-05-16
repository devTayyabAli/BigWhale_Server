const TokenExchange = require("../models/tokenExchange.model");
const Transaction = require("../models/transaction.model");
const { ObjectId } = require("mongoose").Types;
const createPaginator = require("../helpers/paginate");
const { TRANSACTION_STATUS, EXCHANGE_TYPES, TRANSACTION_TYPES } = require("../config/constants");
const socket = require("../helpers/sockets");
const User = require("../models/user.model");
const Web3 = require("web3");

// 👇 Use WSS endpoint here
const web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.CHAIN_STACK_SOCKET_URL));

const createTokenExchange = async (payload, response) => {
  await TokenExchange.deleteMany({
    userId: new ObjectId(payload.userId),
    status: "pending",
  });
  const tokensExchange = await TokenExchange.create(payload);
  response.success = true;
  response.message = "tokens Exchange successfully";
  response.status = 200;
  response.data = tokensExchange;
  return response;
};

const completeTokenExchange = async (req, response) => {
  const { id, type } = req.params;
  const data = await TokenExchange.findOne({ _id: id });
  if (!data) {
    response.success = false;
    response.message = "Something went wrong";
    response.status = 400;
    return response;
  }

  const transaction = await Transaction.create({
    ...req.body,
    type: type,
  });

  const fundTransfers = await TokenExchange.findOneAndUpdate(
    { _id: id },
    { transactionId: transaction?._id }
  );

  response.success = true;
  response.message = "Record updated successfully";
  response.status = 200;
  response.data = fundTransfers;
  return response;
};

const handleExchangeTx = async (txHash) => {
  const transaction = await Transaction.findOneAndUpdate(
    { txHash },
    { status: TRANSACTION_STATUS.COMPLETED }
  );
  if (transaction) {
    const tokenExchange = await TokenExchange.findOneAndUpdate(
      { transactionId: transaction?._id },
      { status: TRANSACTION_STATUS.COMPLETED }
    ).populate("userId");
    console.log(tokenExchange.type.toUpperCase(), tokenExchange?.userId?._id, tokenExchange, 'sending an event  to')
    socket.io.to(`${tokenExchange?.userId?._id}`).emit(tokenExchange.type.toUpperCase(), {});
  }
  return
};

const getTokenExchangeByType = async (userId, type, page, limit) => {
  try {
    const result = await TokenExchange.aggregate([
      {
        $match: {
          userId: new ObjectId(userId),
          type: type
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'transactions',
          localField: 'transactionId',
          foreignField: '_id',
          as: 'transaction'
        }
      },
      { $unwind: { path: "$transaction", preserveNullAndEmptyArrays: true } },
      // {
      //   $group: {
      //     _id: null, // Group all documents into a single group
      //     // totalAmount: { $sum: { $toDouble: "$amount" } }, // Sum the amount field
      //     // user: { $first: "$user" }, // Retain the first user document
      //     amount: { $first: "$amount" }, // Retain the first amount value
      //     type: { $first: "$type" }, // Retain the first type value
      //     transaction: { $first: "$transaction" }, // Retain the first transaction document
      //     createdAt: { $first: "$createdAt" }
      //   },
      // },
      {
        $project: {
          _id: 0, // Exclude _id field from the output
          user: 1,
          amount: 1,
          type: 1,
          transaction: 1,
          // totalAmount: 1,
          createdAt: 1
        }
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $skip: (page - 1) * limit,
      },
      {
        $limit: parseInt(limit),
      },
    ]);
    const totalAmount = await TokenExchange.aggregate([
      {
        $match: {
          userId: new ObjectId(userId),
          type: type
        }
      },
      {
        $lookup: {
          from: "transactions", // Name of the transactions collection
          localField: "transactionId",
          foreignField: "_id",
          as: "populatedTransaction"
        }
      },
      {
        $unwind: "$populatedTransaction"
      },
      {
        $group: {
          _id: {
            userId: "$userId",
            transactionId: "$transactionId"
          },
          totalAmount: { $sum: "$populatedTransaction.fiatAmount" }
        }
      },
      {
        $group: {
          _id: "$_id.userId",
          totalAmount: { $sum: "$totalAmount" }
        }
      }
    ]);

    const sum = totalAmount.length > 0 ? JSON.parse(JSON.stringify(totalAmount)).reduce((acc, curr) => acc + curr.totalAmount, 0) : 0;
    const total = await TokenExchange.countDocuments({
      userId: new ObjectId(userId),
      type: type
    });
    const tokenExchangeData =
      result.length > 0 ? result : [];

    return { total, tokenExchangeData, sum };
  } catch (err) {
    console.log(err);
    return err;
  }
};

async function syncTokenSaleFromChain(saleData, receipt) {
  try {
    const { seller, amount, price, txHash, blockNumber, timestamp } = saleData;
// Check if transaction already exists (avoid duplicate)
    const existingTx = await Transaction.findOne({ txHash });
    if (existingTx) {
      console.log(`⚠️ Transaction already exists for txHash: ${txHash}`);
      return; // stop here
    }
    // Find user in DB by wallet address
    const dbUser = await User.findOne({
      walletAddress: { $regex: new RegExp(`^${seller}$`, "i") }
    });
    if (!dbUser) {
      console.warn(`⚠️ No user found for wallet: ${seller}`);
      return;
    }

    const cryptoAmount = Number(web3.utils.fromWei(amount || "0", "ether"));
    const fiatAmount = Number(web3.utils.fromWei(price || "0", "ether"));
    // Create transaction
    const newTransaction = new Transaction({
      userId: dbUser._id,
      txHash,
      type: TRANSACTION_TYPES.REGISTER,
      cryptoAmount,
      fiatAmount,
      status: "completed",
      blockNumber,
      timestamp,
    });
    const savedTx = await newTransaction.save();

    // Create exchange
    const newExchange = new TokenExchange({
      userId: dbUser._id,
      amount: cryptoAmount,
      type: EXCHANGE_TYPES.SELL,
      status: TRANSACTION_STATUS.COMPLETED,
      transactionId: savedTx._id,
    });
    await newExchange.save();

    console.log(`✅ Synced SELL event for ${seller} | tx: ${txHash}`);
  } catch (error) {
    console.error("❌ Error syncing TokenSold event:", error);
  }
}



module.exports = {
  createTokenExchange,
  completeTokenExchange,
  getTokenExchangeByType,
  handleExchangeTx,
  syncTokenSaleFromChain
};
