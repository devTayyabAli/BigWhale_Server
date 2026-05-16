const Web3 = require("web3");
const getWeb3 = () => {
  const web3 = new Web3(process.env.CHAIN_STACK_SOCKET_URL);
  return web3;
};
module.exports={
    getWeb3 
}
