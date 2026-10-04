const AdapterRegistry = require('./adapters/AdapterRegistry');
const TikTokAdapter = require('./adapters/TikTokAdapter');
const YouTubeAdapter = require('./adapters/YouTubeAdapter');
const InstagramAdapter = require('./adapters/InstagramAdapter');

const registry = new AdapterRegistry();
registry.register('tiktok', new TikTokAdapter());
registry.register('youtube', new YouTubeAdapter());
registry.register('instagram', new InstagramAdapter());

async function uploadToPlatform(platform, tokens, filePath, opts = {}) {
  return registry.get(platform).upload(tokens, filePath, opts);
}

function getYouTubeChannel(tokens) {
  return registry.get('youtube').getChannel(tokens);
}

module.exports = { uploadToPlatform, getYouTubeChannel };
