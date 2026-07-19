const { Worker } = require("./worker");

const worker = new Worker();

module.exports = { worker, Worker };
