const { EventEmitter } = require("node:events");

class Worker extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.running = false;
    this.started = false;
    this._looping = false;
    this._runtimeState = new Map();
  }

  start() {
    if (this.started) return;
    this.started = true;
    console.log("[DBG-worker] start()");
    this.emit("started");
    this._loop();
  }

  stop() {
    console.log("[DBG-worker] stop()");
    this.started = false;
    this._runtimeState.clear();
    if (this.queue.length === 0 && !this.running) this.emit("stopped");
  }

  setRuntimeState(key, value) {
    this._runtimeState.set(key, value);
  }

  getRuntimeState(key) {
    return this._runtimeState.get(key);
  }

  deleteRuntimeState(key) {
    this._runtimeState.delete(key);
  }

  clearRuntimeState() {
    this._runtimeState.clear();
  }

  enqueue(job) {
    console.log("[DBG-worker] enqueue() queueLen=", this.queue.length + 1);
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
        console.log("[DBG-worker] job START");
        try {
          await job();
          console.log("[DBG-worker] job DONE");
          this.emit("jobCompleted", job);
        } catch (err) {
          console.log("[DBG-worker] job FAILED:", err && err.message);
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
