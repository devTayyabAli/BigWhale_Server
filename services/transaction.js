const Transaction = require("../models/transaction.model");
const createTransaction = (payload) => {
  return Transaction.create(payload);
};
const updateTransaction=(query,payload)=>{
  return Transaction.findOneAndUpdate(query,payload);
}

module.exports = {
  createTransaction,
  updateTransaction
};
