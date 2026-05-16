// const { Server } = require('socket.io')
const socket = (() => {
  this.io = null;
  this.configure = (server) => {
    if (!this.io) {
      this.io = server;
    }
    return this;
  };
  return this;
})();

module.exports = socket;
