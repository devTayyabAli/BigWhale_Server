const crypto = require('crypto');

const generateTransactionHash = (transactionData) => {
  const transactionString = JSON.stringify(transactionData);
  const hash = crypto.createHash('sha256').update(transactionString).digest('hex');
  return hash;
};


module.exports = {
    generateTransactionHash};

