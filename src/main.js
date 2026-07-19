const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const Store = require('electron-store');

const store = new Store({ name: 'openshare-config' });

const DAILY_LIMIT = 30;
const PLATFORMS = ['tiktok', 'youtube', 'instagram'];

const storageRoot = path.join(app.getPath('userData'), 'profiles');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function profileDir(profileId) {
  const d = path.join(storageRoot, profileId);
  ensureDir(d);
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
  const dir = profileDir(profileId);
  const metaPath = path.join(dir, 'meta.json');
  let meta = {};
  if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const files = fs.readdirSync(dir).filter((f) => f !== 'meta.json' && !f.endsWith('.json'));
  return files.map((f) => ({
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
}

function setFileMeta(profileId, fileName, patch) {
  const dir = profileDir(profileId);
  const metaPath = path.join(dir, 'meta.json');
  let meta = {};
  if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  meta[fileName] = { ...(meta[fileName] || {}), ...patch };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

let winRef = null;

function createWindow() {
  winRef = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  winRef.loadFile('src/renderer/index.html');
}

app.whenReady().then(() => {
  worker.start();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  worker.stop();
});

let uploadToPlatform;
try { uploadToPlatform = require('./uploader').uploadToPlatform; } catch (e) { console.error('uploader load error:', e); }

const { worker } = require('./publishing');

ipcMain.handle('get-profiles', () => getProfiles());
ipcMain.handle('create-profile', (_e, name) => {
  const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const profiles = getProfiles();
  profiles.push({ id, name, auth: {}, defaultDesc: '' });
  saveProfiles(profiles);
  profileDir(id);
  return profiles;
});
ipcMain.handle('set-profile-desc', (_e, { profileId, defaultDesc }) => {
  const profiles = getProfiles();
  const profile = profiles.find((p) => p.id === profileId);
  profile.defaultDesc = defaultDesc || '';
  saveProfiles(profiles);
  return profiles;
});
ipcMain.handle('delete-profile', (_e, id) => {
  const profiles = getProfiles().filter((p) => p.id !== id);
  saveProfiles(profiles);
  fs.rmSync(profileDir(id), { recursive: true, force: true });
  return profiles;
});

ipcMain.handle('list-files', (_e, profileId) => listFiles(profileId));
ipcMain.handle('add-file', async (_e, { profileId, fileName, buffer, scheduledAt }) => {
  const dir = profileDir(profileId);
  const dest = path.join(dir, fileName);
  fs.writeFileSync(dest, Buffer.from(buffer));
  const profile = getProfile(profileId);
  const defaultDesc = (profile && profile.defaultDesc) || '';
  setFileMeta(profileId, fileName, { scheduledAt: scheduledAt || null, status: 'pending', desc: defaultDesc });
  return listFiles(profileId);
});
ipcMain.handle('schedule-file', (_e, { profileId, fileName, scheduledAt }) => {
  setFileMeta(profileId, fileName, { scheduledAt });
  return listFiles(profileId);
});
ipcMain.handle('delete-file', async (_e, { profileId, fileName }) => {
  const dir = profileDir(profileId);
  const filePath = path.join(dir, fileName);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(filePath, { force: true });
      break;
    } catch (err) {
      if (err.code === 'EBUSY' && attempt < 4) {
        await new Promise((r) => setTimeout(r, 250));
        continue;
      }
      throw err;
    }
  }
  setFileMeta(profileId, fileName, {});
  return listFiles(profileId);
});
ipcMain.handle('set-file-platforms', (_e, { profileId, fileName, platforms }) => {
  setFileMeta(profileId, fileName, { platforms });
  return listFiles(profileId);
});
ipcMain.handle('set-file-privacy', (_e, { profileId, fileName, privacy }) => {
  setFileMeta(profileId, fileName, { privacy });
  return listFiles(profileId);
});
ipcMain.handle('set-file-kids', (_e, { profileId, fileName, madeForKids }) => {
  setFileMeta(profileId, fileName, { madeForKids });
  return listFiles(profileId);
});
ipcMain.handle('reset-file', (_e, { profileId, fileName }) => {
  setFileMeta(profileId, fileName, { status: 'pending', uploadedAt: null, lastError: null, platformResults: null });
  return listFiles(profileId);
});
ipcMain.handle('rename-file', async (_e, { profileId, fileName, newName, title, desc }) => {
  const dir = profileDir(profileId);
  const oldPath = path.join(dir, fileName);
  let finalName = fileName;
  if (newName && newName.trim() && newName.trim() !== fileName) {
    const ext = path.extname(fileName);
    let base = newName.trim().replace(/[\\/:*?"<>|]/g, '_');
    finalName = base + ext;
    let dest = path.join(dir, finalName);
    let i = 1;
    while (fs.existsSync(dest) && dest !== oldPath) {
      finalName = `${base} (${i})${ext}`;
      dest = path.join(dir, finalName);
      i++;
    }
    fs.renameSync(oldPath, dest);
  }
  const patch = {};
  if (title !== undefined) patch.title = title || null;
  if (desc !== undefined) patch.desc = desc || null;
  setFileMeta(profileId, finalName, patch);
  return listFiles(profileId);
});
ipcMain.handle('get-quota', (_e, profileId) => getQuota(profileId));

function getSettings() {
  return store.get('settings', { darkMode: false, scale: 100 });
}
ipcMain.handle('get-settings', () => getSettings());
ipcMain.handle('save-settings', (_e, settings) => {
  store.set('settings', settings);
  return settings;
});

ipcMain.handle('get-secrets', () => {
  const auth = require('./auth');
  return auth.loadSecrets();
});
ipcMain.handle('save-secrets', (_e, secrets) => {
  const auth = require('./auth');
  auth.saveSecrets(secrets);
  return secrets;
});

ipcMain.handle('auth-platform', async (_e, { profileId, platform }) => {
  const profiles = getProfiles();
  const profile = profiles.find((p) => p.id === profileId);
  const auth = require('./auth');
  if (platform === 'youtube') delete profile.auth.youtube;
  const tokens = await auth.authenticate(platform, winRef);
  profile.auth[platform] = tokens;
  if (platform === 'youtube') {
    try {
      const { getYouTubeChannel } = require('./uploader');
      const channel = await getYouTubeChannel(tokens);
      if (channel) profile.auth[platform].channel = channel;
    } catch (e) {
      console.error('Failed to fetch YouTube channel:', e.message);
    }
  }
  saveProfiles(profiles);
  return profile.auth;
});

ipcMain.handle('disconnect-platform', (_e, { profileId, platform }) => {
  const profiles = getProfiles();
  const profile = profiles.find((p) => p.id === profileId);
  if (profile && profile.auth) delete profile.auth[platform];
  saveProfiles(profiles);
  return profiles;
});

ipcMain.handle('run-daily', async (_e, profileId) => {
  worker.enqueue(() => runDailyForProfile(profileId));
  return { enqueued: true };
});

async function runDailyForProfile(profileId) {
  const quota = getQuota(profileId);
  const remaining = DAILY_LIMIT - quota.used;
  if (remaining <= 0) return { done: true, reason: 'limit-reached', uploaded: 0 };

  const now = Date.now();
  const all = listFiles(profileId);
  const due = all
    .filter((f) => f.status === 'pending' && (!f.scheduledAt || new Date(f.scheduledAt).getTime() <= now))
    .slice(0, remaining);

  const skipped = all.length - due.length;
  if (skipped > 0) console.log(`[run-daily] ${skipped} file(s) skipped (already uploaded, scheduled for later, or failed). ${due.length} due now.`);

  const total = due.length;
  let uploaded = 0;
  const results = [];
  const send = (data) => { if (winRef && winRef.webContents) winRef.webContents.send('upload-progress', data); };

  if (total > 0) send({ type: 'start', files: due.map((f) => f.name) });

  for (let i = 0; i < due.length; i++) {
    const file = due[i];
    setFileMeta(profileId, file.name, { status: 'uploading' });
    const targetPlatforms = (file.platforms && file.platforms.length) ? file.platforms : PLATFORMS;
    const perPlatform = {};
    for (let p = 0; p < targetPlatforms.length; p++) {
      const platform = targetPlatforms[p];
      try {
        const profile = getProfile(profileId);
        const tokens = profile.auth[platform];
        if (!tokens) { perPlatform[platform] = { ok: false, error: 'not-authenticated' }; continue; }
        const res = await uploadToPlatform(platform, tokens, file.path, { privacy: file.privacy || 'private', title: file.title || file.name, desc: file.desc || '', madeForKids: file.madeForKids || false, onStatus: (msg) => send({ type: 'status', file: file.name, platform, msg }) });
        perPlatform[platform] = { ok: true, id: res.id };
      } catch (err) {
        perPlatform[platform] = { ok: false, error: err.message };
      }
      const filePct = Math.round(((p + 1) / targetPlatforms.length) * 100);
      send({ type: 'file', file: file.name, pct: filePct });
    }
    const allOk = targetPlatforms.every((p) => perPlatform[p]?.ok);
    setFileMeta(profileId, file.name, {
      status: allOk ? 'uploaded' : 'failed',
      uploadedAt: allOk ? new Date().toISOString() : null,
      lastError: allOk ? null : JSON.stringify(perPlatform),
      platformResults: perPlatform,
    });
    if (allOk) uploaded++;
    else send({ type: 'file', file: file.name, pct: 100, failed: true });
    results.push({ file: file.name, perPlatform });
    send({ type: 'overall', pct: Math.round(((i + 1) / total) * 100) });
  }

  incrementQuota(profileId, uploaded);
  return { done: false, uploaded, results, quota: getQuota(profileId), skipped };
}
