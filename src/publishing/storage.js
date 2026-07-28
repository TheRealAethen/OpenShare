const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const Store = require('electron-store');

const store = new Store({ name: 'openshare-config' });

const DAILY_LIMIT = 30;
const PLATFORMS = ['tiktok', 'youtube', 'instagram'];

const storageRoot = path.join(app.getPath('userData'), 'profiles');

function ensureDir(p) {
  console.time(`[TRACE] ensureDir(${p})`);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  console.timeEnd(`[TRACE] ensureDir(${p})`);
}

function profileDir(profileId) {
  const d = path.join(storageRoot, profileId);
  console.time(`[TRACE] profileDir(${profileId})`);
  ensureDir(d);
  console.timeEnd(`[TRACE] profileDir(${profileId})`);
  return d;
}

function getProfiles() {
  return store.get('profiles', []);
}

function saveProfiles(profiles) {
  store.set('profiles', profiles);
}

function getProfile(id) {
  return getProfiles().find((p) => p.id === id);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getQuota(profileId) {
  const q = store.get(`quota.${profileId}`, { date: todayKey(), used: 0 });
  if (q.date !== todayKey()) {
    q.date = todayKey();
    q.used = 0;
    store.set(`quota.${profileId}`, q);
  }
  return q;
}

function incrementQuota(profileId, count) {
  const q = getQuota(profileId);
  q.used += count;
  store.set(`quota.${profileId}`, q);
  return q;
}

function listFiles(profileId) {
  const tag = `[TRACE] listFiles(profileId=${profileId})`;
  console.time(tag + ' → total');
  const dir = profileDir(profileId);
  const metaPath = path.join(dir, 'meta.json');
  let meta = {};
  console.time(tag + ' → fs.existsSync + fs.readFileSync(meta.json)');
  if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  console.timeEnd(tag + ' → fs.existsSync + fs.readFileSync(meta.json)');
  console.time(tag + ' → fs.readdirSync(filter meta.json)');
  const files = fs.readdirSync(dir).filter((f) => f !== 'meta.json' && !f.endsWith('.json'));
  console.timeEnd(tag + ' → fs.readdirSync(filter meta.json)');
  console.time(tag + ' → map + build result array');
  const result = files.map((f) => ({
    name: f,
    path: path.join(dir, f),
    scheduledAt: meta[f]?.scheduledAt || null,
    status: meta[f]?.status || 'pending',
    uploadedAt: meta[f]?.uploadedAt || null,
    lastError: meta[f]?.lastError || null,
    platforms: meta[f]?.platforms || ['tiktok', 'youtube', 'instagram'],
    privacy: meta[f]?.privacy || 'private',
    madeForKids: meta[f]?.madeForKids || false,
    title: meta[f]?.title || null,
    desc: meta[f]?.desc || null,
  }));
  console.timeEnd(tag + ' → map + build result array');
  console.timeEnd(tag + ' → total');
  return result;
}

function setFileMeta(profileId, fileName, patch) {
  const tag = `[TRACE] setFileMeta(profileId=${profileId}, fileName=${fileName})`;
  console.time(tag + ' → total');
  const dir = profileDir(profileId);
  const metaPath = path.join(dir, 'meta.json');
  let meta = {};
  console.time(tag + ' → fs.existsSync + fs.readFileSync + JSON.parse(meta.json)');
  if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  console.timeEnd(tag + ' → fs.existsSync + fs.readFileSync + JSON.parse(meta.json)');
  const key = fileName.trim();
  meta[key] = { ...(meta[key] || {}), ...patch };
  console.time(tag + ' → JSON.stringify + fs.writeFileSync(meta.json)');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  console.timeEnd(tag + ' → JSON.stringify + fs.writeFileSync(meta.json)');
  console.timeEnd(tag + ' → total');
}

module.exports = {
  store,
  DAILY_LIMIT,
  PLATFORMS,
  ensureDir,
  profileDir,
  getProfiles,
  saveProfiles,
  getProfile,
  todayKey,
  getQuota,
  incrementQuota,
  listFiles,
  setFileMeta,
};
