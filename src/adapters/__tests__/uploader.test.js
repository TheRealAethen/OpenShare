const { uploadToPlatform } = require('../../uploader');
const TikTokAdapter = require('../TikTokAdapter');
const YouTubeAdapter = require('../YouTubeAdapter');
const InstagramAdapter = require('../InstagramAdapter');

describe('uploadToPlatform dispatch via AdapterRegistry', () => {
  afterEach(() => jest.restoreAllMocks());

  test.each([
    ['tiktok', TikTokAdapter],
    ['youtube', YouTubeAdapter],
    ['instagram', InstagramAdapter],
  ])('routes %s to its adapter upload()', async (platform, AdapterClass) => {
    const spy = jest.spyOn(AdapterClass.prototype, 'upload').mockResolvedValue({ id: 'x' });
    const tokens = { access_token: 't' };
    const opts = { title: 'clip' };

    const result = await uploadToPlatform(platform, tokens, '/tmp/clip.mp4', opts);

    expect(spy).toHaveBeenCalledWith(tokens, '/tmp/clip.mp4', opts);
    expect(result).toEqual({ id: 'x' });
  });

  test('rejects unknown platforms', async () => {
    await expect(uploadToPlatform('myspace', {}, '/tmp/clip.mp4')).rejects.toThrow('Unsupported platform');
  });
});
