const registerAbiMainnet = require("./register/abi.json");
const registerAbiTestnet = require("./registerTestnet/abi.json");
const stakingAbi=require('./staking/abi.json')
const kgcAbi = require("./kgc/abi.json");
const CONTRACT_DETAILS = {
  register: {
    registerAbi:process.env.APP_ENV === "production"?registerAbiMainnet:registerAbiTestnet,
    address: process.env.REGISTER_CONTRACT_ADDRESS,
  },
  kgc: {
    abi: kgcAbi,
    address: process.env.KGC_TOKEN_ADDRESS,
  },
  staking:{
   abi:stakingAbi,
   address:process.env.MAIN_CONTRACT_ADDRESS
  }
};

module.exports = CONTRACT_DETAILS;
