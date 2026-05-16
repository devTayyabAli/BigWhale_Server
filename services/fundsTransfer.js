const FundsTransfer = require("../models/fundsTransfer.model");
const Transaction = require("../models/transaction.model");
const { ObjectId } = require("mongoose").Types;
const { TRANSACTION_STATUS, CONTRACT_EVENTS } = require("../config/constants");
const socket = require("../helpers/sockets");
const createPaginator = require("../helpers/paginate");
const createFundsTransfer = async (payload, response) => {
  await FundsTransfer.deleteMany({
    fromUserId: new ObjectId(payload.fromUserId),
    status: "pending",
  });
  const transferedFunds = await FundsTransfer.create(payload);
  response.success = true;
  response.message = "Funds Transfered successfully";
  response.status = 201;
  response.data = transferedFunds;
  return response;
};

const completeFundsTransfer = async (req, response) => {
  const { id } = req.params;

  const data = await FundsTransfer.findOne({ _id: id });
  if (!data) {
    response.success = false;
    response.message = "Something went wrong";
    response.status = 400;
    return response;
  }

  const transaction = await Transaction.create({
    ...req.body,
    type: "fundsTransfer",
  });

  const fundTransfers = await FundsTransfer.findOneAndUpdate(
    { _id: id },
    { transactionId: transaction?._id }
  );

  response.success = true;
  response.message = "Record updated successfully";
  response.status = 200;
  response.data = fundTransfers;
  return response;
};

const getFundsTransferByPayload = async (req, response) => {
  const { userId } = req.params;
  const { page = 1, limit = 10, status, receive = false } = req.query;
  const skip = (page - 1) * limit;
  const query = {
    ...(receive
      ? { toUserId: new ObjectId(userId) }
      : { fromUserId: new ObjectId(userId) }),
    ...(status ? { status } : { status: { $ne: "pending" } }),
  };

  const data = await FundsTransfer.find(query)
    .populate("fromUserId")
    .populate("toUserId")
    .populate("transactionId")
    .sort({ createdAt: -1 }) // Sort by createdAt in descending order
    .skip(skip)
    .limit(parseInt(limit));  

  const totalAmount = await FundsTransfer.aggregate([
    {
      $match: {
        ...query,
      },
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
          userId: "$toUserId",
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
  const totalCount = await FundsTransfer.countDocuments(query);
  response.success = true;
  response.message = "Funds Transfers fetched successfully";
  response.status = 200;
  response.data = {
    data,
    totalAmount: sum||0,
    paginate: createPaginator.paginate(totalCount, limit, page),
  };
  return response;
};

const handleFundsTransferEvent = async (txHash) => {
  const transaction = await Transaction.findOneAndUpdate(
    { txHash },
    { status: TRANSACTION_STATUS.COMPLETED }
  );

  if (transaction) {
    const fundsTransfered = await FundsTransfer.findOneAndUpdate(
      {
        transactionId: new ObjectId(transaction._id),
        status: TRANSACTION_STATUS.PENDING,
      },
      { status: TRANSACTION_STATUS.COMPLETED }
    );

    if (fundsTransfered) {
      socket.io
        .to(`${fundsTransfered?.fromUserId}`)
        .emit(CONTRACT_EVENTS.KGCTRANSFER, {});
    }
  }
};

const getPendingFundsTransferTx = async () => {
  const ninetySecondsAgo = new Date(Date.now() - 90 * 1000);
  return await FundsTransfer.find({
    status: "pending",
    createdAt: { $lt: ninetySecondsAgo },
    transactionId: { $ne: null },
  }).populate("transactionId");
};
const updateFundsTransfer = async (query, payload) => {
  return await FundsTransfer.findOneAndUpdate(query, payload);
};

module.exports = {
  createFundsTransfer,
  getFundsTransferByPayload,
  handleFundsTransferEvent,
  completeFundsTransfer,
  getPendingFundsTransferTx,
  updateFundsTransfer,
};
