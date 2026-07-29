const { EventEmitter } = require("node:events");

class Worker extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.running = false;
    this.started = false;
    this._looping = false;
    this._runtimeState = new Map();
    this.status = 'stopped';
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.status = 'idle';
    console.log("[DBG-worker] start()");
    this.emit("started");
    this._emitStatus();
    this._loop();
  }

  stop() {
    if (!this.started) return;
    console.log("[DBG-worker] stop()");
    this.started = false;
    if (this.queue.length === 0 && !this.running) {
      this._doStop();
    }
  }

  _doStop() {
    this._runtimeState.clear();
    this.status = 'stopped';
    this.emit("stopped");
    this._emitStatus();
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
    if (this.status === 'idle') {
      this.status = 'queued';
      this._emitStatus();
    }
    if (this.started) this._loop();
  }

  _emitStatus() {
    this.emit('worker:status', { status: this.status, queueLength: this.queue.length, running: this.running });
  }

  async _loop() {
    if (this._looping) return;
    this._looping = true;
    try {
      while (this.started && this.queue.length > 0) {
        const job = this.queue.shift();
        this.running = true;
        this.status = 'running';
        this._emitStatus();
        this.emit("jobStarted", job);
        console.log("[DBG-worker] job START");
        try {
          await job();
          console.log("[DBG-worker] job DONE");
          this.emit("jobCompleted", job);
        } catch (err) {
          console.log("[DBG-worker] job FAILED:", err && (err.message || err));
          if (err && err.stack) console.log("[DBG-worker] stack:", err.stack);
          this.emit("jobFailed", job, err);
        } finally {
          this.running = false;
        }
      }
      if (this.started) {
        this.status = 'idle';
        this._emitStatus();
        this.emit("idle");
      }
    } finally {
      this._looping = false;
    }
    if (!this.started) {
      this._doStop();
    }
  }
}

module.exports = { Worker };
