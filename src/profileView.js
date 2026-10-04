const PLATFORMS = ['tiktok', 'youtube', 'instagram'];

function toPublicProfile(profile) {
  const auth = profile.auth || {};
  const isConnected = {};
  const channels = {};
  for (const platform of PLATFORMS) {
    const tokens = auth[platform];
    isConnected[platform] = !!tokens;
    if (tokens && tokens.channel) {
      channels[platform] = { name: tokens.channel.name || null, avatar: tokens.channel.avatar || null };
    }
  }
  return { id: profile.id, name: profile.name, defaultDesc: profile.defaultDesc || '', isConnected, channels };
}

function toSecretStatus(secrets) {
  const status = {};
  for (const platform of PLATFORMS) {
    const cfg = (secrets && secrets[platform]) || {};
    status[platform] = { hasClientId: !!cfg.clientId, hasClientSecret: !!cfg.clientSecret };
  }
  return status;
}

function mergeSecret(secrets, platform, { clientId, clientSecret }) {
  if (!PLATFORMS.includes(platform)) throw new Error(`Unknown platform: ${platform}`);
  const existing = (secrets && secrets[platform]) || {};
  const nextId = (clientId || '').trim() || existing.clientId || '';
  const nextSecret = (clientSecret || '').trim() || existing.clientSecret || '';
  if (!nextId || !nextSecret) throw new Error(`Both client id and client secret are required for ${platform}.`);
  return { ...(secrets || {}), [platform]: { clientId: nextId, clientSecret: nextSecret } };
}

module.exports = { PLATFORMS, toPublicProfile, toSecretStatus, mergeSecret };
