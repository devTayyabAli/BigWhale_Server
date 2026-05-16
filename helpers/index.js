const mailHelper = require("./mail");

const calculatePercentage = (percentage, amount) => {
  if (isNaN(percentage) || isNaN(amount)) {
    return "Invalid input";
  }
  return (percentage / 100) * amount;
};
const getAbsoluteAmount = (amount) => {
  return Math.abs(amount);
};
const convertNegativeToZero = (amount) => {
  if (Number(amount) < 0 || Number(amount) < 0.000001) {
    return 0;
  }
  return amount;
};

module.exports = {
  mailHelper,
  calculatePercentage,
  getAbsoluteAmount,
  convertNegativeToZero,
};
