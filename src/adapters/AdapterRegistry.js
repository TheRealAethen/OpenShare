class AdapterRegistry {
  constructor() {
    this._adapters = new Map();
  }

  register(platformName, adapterInstance) {
    if (!adapterInstance || typeof adapterInstance.upload !== 'function') {
      throw new Error(
        'Invalid adapter for platform "' + platformName + '": must implement upload()'
      );
    }
    this._adapters.set(platformName, adapterInstance);
  }

  get(platformName) {
    if (!this._adapters.has(platformName)) {
      throw new Error('Unsupported platform: "' + platformName + '"');
    }
    return this._adapters.get(platformName);
  }

  has(platformName) {
    return this._adapters.has(platformName);
  }

  listPlatforms() {
    return Array.from(this._adapters.keys());
  }
}

module.exports = AdapterRegistry;
