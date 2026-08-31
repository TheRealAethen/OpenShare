const AdapterRegistry = require('../AdapterRegistry');
const BaseAdapter = require('../BaseAdapter');

describe('AdapterRegistry', () => {
  let registry;
  let mockAdapter;

  beforeEach(() => {
    registry = new AdapterRegistry();
    mockAdapter = new (class extends BaseAdapter {
      async authenticate(_credentials) {
        return { ok: true };
      }
      async upload(file, _metadata, _onProgress) {
        return { id: 'vid-' + file };
      }
      async getStatus(_jobId) {
        return { status: 'done' };
      }
    })();
  });

  describe('register()', () => {
    it('registers an adapter for a platform', () => {
      registry.register('youtube', mockAdapter);
      expect(registry.has('youtube')).toBe(true);
    });

    it('throws when registering an adapter without upload()', () => {
      expect(() => registry.register('bad', { authenticate() {} })).toThrow(
        'Invalid adapter for platform "bad": must implement upload()'
      );
    });

    it('throws when registering null', () => {
      expect(() => registry.register('null', null)).toThrow(
        'Invalid adapter for platform "null": must implement upload()'
      );
    });
  });

  describe('get()', () => {
    it('returns the registered adapter instance', () => {
      registry.register('youtube', mockAdapter);
      const retrieved = registry.get('youtube');
      expect(retrieved).toBe(mockAdapter);
    });

    it('throws a clear error for an unregistered platform', () => {
      expect(() => registry.get('unknown')).toThrow(
        'Unsupported platform: "unknown"'
      );
    });
  });

  describe('has()', () => {
    it('returns true for a registered platform', () => {
      registry.register('tiktok', mockAdapter);
      expect(registry.has('tiktok')).toBe(true);
    });

    it('returns false for an unregistered platform', () => {
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('listPlatforms()', () => {
    it('returns an empty array when no adapters are registered', () => {
      expect(registry.listPlatforms()).toEqual([]);
    });

    it('lists all registered platform names', () => {
      registry.register('tiktok', mockAdapter);
      registry.register('youtube', mockAdapter);
      registry.register('instagram', mockAdapter);
      expect(registry.listPlatforms().sort()).toEqual(['instagram', 'tiktok', 'youtube']);
    });
  });

  describe('integration with BaseAdapter', () => {
    it('works with a concrete BaseAdapter subclass', () => {
      class YouTubeAdapter extends BaseAdapter {
        async upload(file, _metadata) {
          return { id: 'yt-' + file };
        }
      }
      const yt = new YouTubeAdapter();
      registry.register('youtube', yt);
      expect(registry.get('youtube')).toBe(yt);
      expect(registry.has('youtube')).toBe(true);
    });
  });
});
