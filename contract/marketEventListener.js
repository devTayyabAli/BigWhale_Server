const conractInfo = require("./contractInfo");
const services = require("../services/index");
const { CONTRACT_EVENTS, DEFAULT_STATUS } = require("../config/constants");
const MarketEventLogs = require("../models/marketEventListenerLog.model");
const Web3 = require("web3");

class EventListener {
  constructor() {
    this.contractListeners = {}; // Store contract listeners
  }

  async listenMarketEvent(address) {
    const web3 = new Web3(process.env.CHAIN_STACK_SOCKET_URL);
    const marketContract = new web3.eth.Contract(
      conractInfo.register.registerAbi,
      address
    );

    const eventListener = marketContract.events.allEvents();

    eventListener
      .on("data", async (event) => {
        const txHash = event?.transactionHash;

        switch (event.event) {
          case CONTRACT_EVENTS.REGISTER: // event
            await services.authService.handleRegisterEvent(txHash);
            // event handle code here
            break;
          case CONTRACT_EVENTS.STAKE: // event
            await services.stakeService.handleStakeEvent(txHash);
            // event handle code here
            break;
          case CONTRACT_EVENTS.WITHDRAWAL: // event
            await services.withdrawalService.handleWithdrawalEvent(txHash);
            // event handle code here
            break;
          case CONTRACT_EVENTS.KGCTRANSFER: // event
            await services.fundsTranferService.handleFundsTransferEvent(txHash);
            // event handle code here
            break;

          default:
            console.log("could not found relative event=>", event);
        }
      })
      .on("error", (error) => {
        console.error("MarketEventListenerError:", error);
      });

    // Store the event listener for future reference
    this.contractListeners[address] = eventListener;
  }

  // Method to dynamically add contracts to listen to
  async addContractToListen(address, debugingMode) {
    // if (address) {
      // if (!this.contractListeners[address]) {
        // if (debugingMode) {
          //Event  listener is stopped
          // return await MarketEventLogs.create({ address });
        // }
        // this.listenMarketEvent(address);
      // } else {
        // return this.contractListeners[address];
      // }
    }
  // }
}


// Create a singleton instance for the EventListener
const eventListener = new EventListener();
module.exports = eventListener;
