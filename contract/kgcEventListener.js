const conractInfo = require("./contractInfo");
// const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
const services = require("../services/index");
const { DEFAULT_STATUS, CONTRACT_EVENTS } = require("../config/constants");
const Web3 = require("web3");
class EventListener {
  constructor() {
    this.contractListeners = {}; // Store contract listeners
  }

  async listenKGCEvent(address) {
    const web3 = new Web3(process.env.CHAIN_STACK_SOCKET_URL);
    const marketContract = new web3.eth.Contract(conractInfo.kgc.abi, address);

    const eventListener = marketContract.events.allEvents();

    eventListener
      .on("data", async (event) => {
        const txHash = event?.transactionHash;
        switch (event.event) {
          case CONTRACT_EVENTS.TRANSFER: // event
            await services.withdrawalService.updatePartialWithdrawal(txHash);
            // event handle code here
            break;
          default:
            console.log("could not found relative event=>", event);
        }
      })
      .on("error", (error) => {
        console.error("Error:", error);
      });

    // Store the event listener for future reference
    this.contractListeners[address] = eventListener;
  }

  // Method to dynamically add contracts to listen to
  addContractToListen(address) {
    if (address) {
      if (!this.contractListeners[address]) {
        this.listenKGCEvent(address);
      }
    }
  }
}

// Create a singleton instance for the EventListener
const eventListener = new EventListener();
module.exports = eventListener;
