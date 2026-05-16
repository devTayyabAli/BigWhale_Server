const Web3 = require("web3");
const conractInfo = require("./contractInfo");
const { syncTokenSaleFromChain } = require("../services/tokensExchange");

// 👇 Use WSS endpoint here
const web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.CHAIN_STACK_SOCKET_URL));


const contract = new web3.eth.Contract(
  conractInfo.register.registerAbi,
  conractInfo.register.address
);

const listenTokenSales = () => {
  contract.events.KGCSold({})
    .on("connected", (subscriptionId) => {
      console.log("🔗 Subscribed with ID:", subscriptionId);
    })
    .on("data", async (event) => {
      try {
        const { returnValues, transactionHash, blockNumber } = event;
        const { seller, kgcAmount, usdtAmount } = returnValues;

        // Fetch receipt & block for timestamp
        const receipt = await web3.eth.getTransactionReceipt(transactionHash);
        const block = await web3.eth.getBlock(blockNumber);

        const saleData = {
          seller: seller.toLowerCase(),
          amount: kgcAmount.toString(),
          price: usdtAmount.toString(),
          txHash: transactionHash,
          blockNumber,
          timestamp: block.timestamp,
        };

        console.log("✅ Parsed KGCSold Event:", saleData);

        await syncTokenSaleFromChain(saleData, receipt);
      } catch (err) {
        console.error("❌ Error handling KGCSold event:", err);
      }
    })
    .on("error", (err) => {
      console.error("❌ Subscription error:", err);
    });

  console.log("👂 Listening for KGCSold events on contract:", conractInfo.register.address);
};

module.exports = { listenTokenSales };
