const { EventEmitter } = require("node:events");

class Worker extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.running = false;
    this.started = false;
    this._looping = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.emit("started");
    this._loop();
  }

  stop() {
    this.started = false;
    if (this.queue.length === 0 && !this.running) this.emit("stopped");
  }

  enqueue(job) {
    this.queue.push(job);
    if (this.started) this._loop();
  }

  async _loop() {
    if (this._looping) return;
    this._looping = true;
    try {
      while (this.started && this.queue.length > 0) {
        const job = this.queue.shift();
        this.running = true;
        this.emit("jobStarted", job);
        try {
          await job();
          this.emit("jobCompleted", job);
        } catch (err) {
          this.emit("jobFailed", job, err);
        } finally {
          this.running = false;
        }
      }
      if (this.started) this.emit("idle");
    } finally {
      this._looping = false;
    }
    if (!this.started) this.emit("stopped");
  }
}

module.exports = { Worker };
