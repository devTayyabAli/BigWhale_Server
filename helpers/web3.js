const Web3 = require("web3");
const CONTRACT_DETAILS = require("../contract/contractInfo");
const { TRANSACTION_TYPES } = require("../config/constants");
const axios = require("axios");
const Transaction = require("../models/transaction.model");
const PartialWithdrawals = require("../models/partialWithdrawal.model");
const Stake = require("../models/stake.model");
const { TRANSACTION_STATUS } = require("../config/constants");
const getWeb3 = () => {
  const provider = process.env.CHAIN_STACK_HTTP_URL;
  const web3 = new Web3(provider);
  return web3;
};
const getContractMethods = async (abi, address) => {
  const web3 = getWeb3();
  // console.log(marketAddress, 'marketAddress');
  const { methods } = new web3.eth.Contract(abi, address);
  // console.log(methods, 'methods factory==>>');
  return methods;
};
const transferFunds = async (
  toAddress,
  amount,
  userId,
  partialWithdrawalAmountId
) => {
  try {
    const web3 = await getWeb3();
    const { abi, address } = CONTRACT_DETAILS.kgc;
    const methods = await getContractMethods(abi, address);
    const transferFunc = methods.transfer(
      toAddress,
      web3.utils.toWei(`${Number(Number(amount)?.toFixed(8))}`, "ether")
    );

    const gasFee = await transferFunc.estimateGas({
      from: process.env.KGC_TOKENS_ADMIN_ADDRESS,
    });
    const gasPrice = await web3.eth.getGasPrice();
    const txTotalGasPrice = gasFee * Number(gasPrice);
    const OneUSDC = await getUSDCLivePrice();
    const txTotalGasPriceInBNB = web3.utils.fromWei(
      `${Number(txTotalGasPrice?.toFixed(8))}`,
      "ether"
    );
    const UDCToDeduct = txTotalGasPriceInBNB * OneUSDC;
    const KGCToDeduct = await getKGCAmount(UDCToDeduct);
    let tranferAmount=Number((Number(amount) - KGCToDeduct)?.toFixed(8))
    if(tranferAmount<=0){
      tranferAmount=Number(Number(amount)?.toFixed(8))
    }
    const transferTxFunc = methods.transfer(
      toAddress,
      web3.utils.toWei(`${tranferAmount}`, "ether")
    );
    const gasPrice2 = await transferTxFunc.estimateGas({
      from: process.env.KGC_TOKENS_ADMIN_ADDRESS,
    });
    const funcData = transferTxFunc.encodeABI();
    const rawTransaction = {
      from: process.env.KGC_TOKENS_ADMIN_ADDRESS,
      // nonce: web3.utils.toHex(nonce)
      gasPrice: web3.utils.toHex(gasPrice),
      gasLimit: web3.utils.toHex(900000),
      to: CONTRACT_DETAILS.kgc.address,
      data: funcData,
    };
    const signTransaction = await web3.eth.accounts.signTransaction(
      rawTransaction,
      process.env.KGC_TOKENS_PRIVATE_KEY
    );
    const receipt = await web3.eth
      .sendSignedTransaction(signTransaction.rawTransaction)
      .on("transactionHash", async (txHash) => {
        const tx = await Transaction.create({
          userId,
          txHash,
          type: TRANSACTION_TYPES.PARTIALWITHDRAWAL,
          fiatAmount: UDCToDeduct,
          cryptoAmount: tranferAmount,
        });
        await PartialWithdrawals.findOneAndUpdate(
          { _id: partialWithdrawalAmountId },
          { transactionId: tx?._id }
        );
        // return txHash;
      });
    return receipt;
  } catch (err) {
    console.log(err, "error==>");
  }
};
const getUSDCLivePrice = async () => {
  const res = await axios.get(process.env.LIVE_USDC_URL);
  return res?.data?.USDC || 0;
};
const getKGCAmount = async (amount) => {
  const web3 = await getWeb3();
  const { registerAbi, address } = CONTRACT_DETAILS.register;
  const methods = await getContractMethods(registerAbi, address);
  let kgcAmountToDeduct = await methods
    .getKGCAmount(web3.utils.toWei(`${amount}`, "ether"))
    .call();
  kgcAmountToDeduct = web3.utils.fromWei(`${kgcAmountToDeduct}`, "ether");
  return +kgcAmountToDeduct;
};
const getAdminBlnc=async ()=>{
  const web3 = await getWeb3();
  const { abi, address } = CONTRACT_DETAILS.kgc;
  const methods = await getContractMethods(abi, address);
  const adminAddress=process.env.KGC_TOKENS_ADMIN_ADDRESS
  let blnc = await methods
    .balanceOf(adminAddress)
    .call();
    blnc = web3.utils.fromWei(`${blnc}`, "ether");
    return blnc|| 0
}
 const  truncateDecimals=(number, digits)=> {
  const power = Math.pow(10, digits);
  return Math.floor(number * power) / power;
}

const getWithdrawalAmountFromContract=async(userAddress)=>{
  const web3 = await getWeb3();
  const { abi, address } = CONTRACT_DETAILS.staking;
  const methods = await getContractMethods(abi, address);
  let blnc = await methods
    .userRegistered(userAddress)
    .call();
    blnc = web3.utils.fromWei(`${blnc?.withdrawedAmount}`, "ether");
    return blnc>0?truncateDecimals(Number(blnc),8):Number(blnc)|| 0
}
const stakeTokenOnChain = async (userAddress, amount, userId, stakeId) => {
  try {
    const web3 = await getWeb3();
    const { abi, address } = CONTRACT_DETAILS.staking;
    const methods = await getContractMethods(abi, address);
    const stakeFunc = methods.stakeTokenByOwner(
      userAddress,
      web3.utils.toWei(`${Number(Number(amount)?.toFixed(8))}`, "ether")
    );

    const gasPrice = await web3.eth.getGasPrice();
    const funcData = stakeFunc.encodeABI();
    const rawTransaction = {
      from: process.env.KGC_TOKENS_ADMIN_ADDRESS,
      gasPrice: web3.utils.toHex(gasPrice),
      gasLimit: web3.utils.toHex(900000),
      to: address,
      data: funcData,
    };
    const signTransaction = await web3.eth.accounts.signTransaction(
      rawTransaction,
      process.env.KGC_TOKENS_PRIVATE_KEY
    );
    const receipt = await web3.eth
      .sendSignedTransaction(signTransaction.rawTransaction)
      .on("transactionHash", async (txHash) => {
        const tx = await Transaction.create({
          userId,
          txHash,
          type: "staking",
          fiatAmount: 0,
          cryptoAmount: Number(amount),
          status: TRANSACTION_STATUS.PENDING,
        });
        await Stake.findByIdAndUpdate(
          stakeId,
          { transactionId: tx?._id }
        );
      });
    return receipt;
  } catch (err) {
    console.error("Error in stakeTokenOnChain helper:", err);
  }
};

module.exports = {
  transferFunds,
  getUSDCLivePrice,
  getAdminBlnc,
  getWithdrawalAmountFromContract,
  truncateDecimals,
  stakeTokenOnChain
};
