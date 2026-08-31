class BaseAdapter {
  async authenticate(_credentials) {
    throw new Error('Not Implemented: authenticate() must be implemented by subclass');
  }

  async upload(_file, _metadata, _onProgress) {
    throw new Error('Not Implemented: upload() must be implemented by subclass');
  }

  async getStatus(_jobId) {
    throw new Error('Not Implemented: getStatus() must be implemented by subclass');
  }
}

module.exports = BaseAdapter;
