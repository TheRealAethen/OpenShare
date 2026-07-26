const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const {
  store,
  profileDir,
  getProfiles,
  saveProfiles,
  getProfile,
  getQuota,
  listFiles,
  setFileMeta,
} = require('./publishing/storage');

const { worker, engine } = require('./publishing');

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
  engine.init(worker, {
    notifyProgress: (data) => {
      console.log('[DBG] send progress:', JSON.stringify(data));
      if (winRef && winRef.webContents) winRef.webContents.send('upload-progress', data);
    },
    schedulerInterval: 60000,
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  worker.stop();
});

/* ---------- IPC handlers ---------- */

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
  const bufSizeMB = (buffer.byteLength / 1024 / 1024).toFixed(2);
  const tag = `[ADD-FILE] ${fileName} (${bufSizeMB} MB)`;
  console.time(tag + ' → total handler');
  console.time(tag + ' → profileDir() + mkdirSync');
  const dir = profileDir(profileId);
  console.timeEnd(tag + ' → profileDir() + mkdirSync');
  const dest = path.join(dir, fileName);
  console.time(tag + ' → async write stream (video bytes to disk)');
  const buf = Buffer.from(buffer);
  const CHUNK_SIZE = 1024 * 1024;
  const ws = fs.createWriteStream(dest);
  try {
    await new Promise((resolve, reject) => {
      ws.on("error", reject);
      ws.on("finish", resolve);
      let offset = 0;
      function writeNext() {
        let drained = true;
        while (drained && offset < buf.length) {
          const end = Math.min(offset + CHUNK_SIZE, buf.length);
          drained = ws.write(buf.slice(offset, end));
          offset = end;
          if (winRef && winRef.webContents) {
            winRef.webContents.send("import-progress", {
              fileName,
              pct: Math.round((offset / buf.length) * 100),
            });
          }
        }
        if (offset >= buf.length) {
          ws.end();
        } else {
          ws.once("drain", writeNext);
        }
      }
      writeNext();
    });
  } catch (err) {
    await fs.promises.unlink(dest).catch(() => {});
    throw err;
  }
  console.timeEnd(tag + ' → async write stream (video bytes to disk)');
  console.time(tag + ' → getProfile (electron-store)');
  const profile = getProfile(profileId);
  console.timeEnd(tag + ' → getProfile (electron-store)');
  const defaultDesc = (profile && profile.defaultDesc) || '';
  console.time(tag + ' → setFileMeta (read+write meta.json)');
  setFileMeta(profileId, fileName, { scheduledAt: scheduledAt || null, status: 'pending', desc: defaultDesc });
  console.timeEnd(tag + ' → setFileMeta (read+write meta.json)');
  console.time(tag + ' → listFiles (fs.readdirSync + read meta.json)');
  const result = listFiles(profileId);
  console.timeEnd(tag + ' → listFiles (fs.readdirSync + read meta.json)');
  console.timeEnd(tag + ' → total handler');
  return result;
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
  const metaPath = path.join(dir, 'meta.json');
  if (fs.existsSync(metaPath)) {
    let meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    delete meta[fileName];
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }
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
ipcMain.handle('retry-file', async (_e, { profileId, fileName }) => {
  setFileMeta(profileId, fileName, { status: 'pending', uploadedAt: null, lastError: null, platformResults: null });
  const send = (data) => { console.log('[DBG] send progress:', JSON.stringify(data)); if (winRef && winRef.webContents) winRef.webContents.send('upload-progress', data); };
  worker.enqueue(() => engine.runDailyForProfile(profileId, send));
  return { enqueued: true };
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
  if (finalName !== fileName) {
    const metaPath = path.join(dir, 'meta.json');
    if (fs.existsSync(metaPath)) {
      let meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      delete meta[fileName];
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    }
  }
  return listFiles(profileId);
});
ipcMain.handle('get-quota', (_e, profileId) => getQuota(profileId));

function getSettings() {
  return store.get('settings', { darkMode: false, scale: 100, devMode: false });
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
  console.log('[DBG] run-daily handler: enqueueing job for', profileId);
  const send = (data) => { console.log('[DBG] send progress:', JSON.stringify(data)); if (winRef && winRef.webContents) winRef.webContents.send('upload-progress', data); };
  worker.enqueue(() => engine.runDailyForProfile(profileId, send));
  return { enqueued: true };
});
