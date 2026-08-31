const BaseAdapter = require('../BaseAdapter');

describe('BaseAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new BaseAdapter();
  });

  describe('authenticate()', () => {
    it('throws "Not Implemented" when called directly', async () => {
      await expect(adapter.authenticate('credentials')).rejects.toThrow(
        'Not Implemented: authenticate() must be implemented by subclass'
      );
    });
  });

  describe('upload()', () => {
    it('throws "Not Implemented" when called directly', async () => {
      await expect(adapter.upload('file', {}, () => {})).rejects.toThrow(
        'Not Implemented: upload() must be implemented by subclass'
      );
    });
  });

  describe('getStatus()', () => {
    it('throws "Not Implemented" when called directly', async () => {
      await expect(adapter.getStatus('job-123')).rejects.toThrow(
        'Not Implemented: getStatus() must be implemented by subclass'
      );
    });
  });

  describe('subclass contract enforcement', () => {
    it('allows a subclass that overrides all methods', async () => {
      class MockAdapter extends BaseAdapter {
        async authenticate(credentials) {
          return { success: true, credentials };
        }
        async upload(_file, _metadata, _onProgress) {
          return { id: 'video-123' };
        }
        async getStatus(jobId) {
          return { status: 'completed', jobId };
        }
      }

      const mock = new MockAdapter();
      await expect(mock.authenticate('tok')).resolves.toEqual({ success: true, credentials: 'tok' });
      await expect(mock.upload('vid.mp4', {})).resolves.toEqual({ id: 'video-123' });
      await expect(mock.getStatus('j-1')).resolves.toEqual({ status: 'completed', jobId: 'j-1' });
    });
  });
});
