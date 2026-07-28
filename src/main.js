const { app, BrowserWindow, ipcMain, shell } = require('electron');
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

function resetStaleUploadingStates() {
  const profiles = getProfiles();
  let totalReset = 0;
  for (const profile of profiles) {
    const dir = profileDir(profile.id);
    const metaPath = path.join(dir, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;
    let meta;
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      continue;
    }
    let changed = false;
    for (const fileName of Object.keys(meta)) {
      if (meta[fileName].status === 'uploading' || meta[fileName].status === 'failed') {
        meta[fileName].status = 'pending';
        meta[fileName].uploadedAt = null;
        meta[fileName].lastError = null;
        meta[fileName].platformResults = null;
        changed = true;
        totalReset++;
      }
    }
    if (changed) {
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    }
  }
  if (totalReset > 0) {
    console.log('[startup] Reset ' + totalReset + ' stale uploading/failed file(s) to pending.');
  } else {
    console.log('[startup] No stale uploading or failed files found.');
  }
}

app.whenReady().then(() => {
  worker.start();
  resetStaleUploadingStates();
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
  worker.enqueue(() => runDailyForProfile(profileId));
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
      console.error('Failed to fetch YouTube channel:', e && (e.message || e));
      if (e && e.stack) console.error('Stack:', e.stack);
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
  worker.enqueue(() => runDailyForProfile(profileId));
  return { enqueued: true };
});

async function runDailyForProfile(profileId) {
  console.log('[TELEMETRY] ===== runDailyForProfile START profileId=' + profileId + ' =====');
  const profile = getProfile(profileId);
  const quota = getQuota(profileId);
  const remaining = DAILY_LIMIT - quota.used;
  const authState = profile ? profile.auth || {} : {};
  console.log('[TELEMETRY] Profile auth: tiktok=' + (!!authState.tiktok) + ' youtube=' + (!!authState.youtube) + ' instagram=' + (!!authState.instagram));
  console.log('[TELEMETRY] Quota: used=' + quota.used + ' / limit=' + DAILY_LIMIT + ' remaining=' + remaining);
  if (remaining <= 0) return { done: true, reason: 'limit-reached', uploaded: 0 };

  const auth = require('./auth');
  const secrets = auth.loadSecrets();
  const ytCreds = (secrets && secrets.youtube && secrets.youtube.clientId)
    ? { clientId: secrets.youtube.clientId, clientSecret: secrets.youtube.clientSecret }
    : {};

  const now = Date.now();
  console.log('[TELEMETRY] System time now=' + new Date(now).toISOString() + ' (' + now + 'ms)');
  let all = listFiles(profileId);
  /* Reset any stale failed files to pending so they get retried */
  let staleCount = 0;
  for (const f of all) {
    if (f.status === 'failed') {
      setFileMeta(profileId, f.name, { status: 'pending', uploadedAt: null, lastError: null, platformResults: null });
      staleCount++;
    }
  }
  if (staleCount > 0) {
    console.log('[TELEMETRY] Reset ' + staleCount + ' stale failed file(s) to pending for retry.');
    all = listFiles(profileId);
  }
  console.log('[TELEMETRY] listFiles returned ' + all.length + ' file(s) total');
  all.forEach((f) => {
    const schedMs = f.scheduledAt ? new Date(f.scheduledAt).getTime() : null;
    const alreadyUploaded = f.status === 'uploaded';
    const scheduledLater = !!(f.scheduledAt && schedMs > now);
    const failed = f.status === 'failed';
    const isPending = f.status === 'pending';
    const hasYouTube = (f.platforms || []).includes('youtube');
    let reason;
    if (alreadyUploaded) reason = 'already-uploaded';
    else if (failed) reason = 'failed';
    else if (scheduledLater) reason = 'scheduled-later (sched=' + f.scheduledAt + ' > now=' + new Date(now).toISOString() + ')';
    else if (!isPending) reason = 'not-pending(status=' + f.status + ')';
    else reason = 'DUE';
    console.log('[TELEMETRY] profile=' + profileId + ' file=' + JSON.stringify(f.name) +
      ' status=' + f.status +
      ' scheduledAt=' + f.scheduledAt +
      ' schedMs=' + schedMs +
      ' now=' + now +
      ' nowISO=' + new Date(now).toISOString() +
      ' alreadyUploaded=' + alreadyUploaded +
      ' scheduledLater=' + scheduledLater +
      ' failed=' + failed +
      ' isPending=' + isPending +
      ' platforms=' + JSON.stringify(f.platforms) +
      ' hasYouTube=' + hasYouTube +
      ' => reason=' + reason);
  });
  const due = all
    .filter((f) => f.status === 'pending' && (!f.scheduledAt || new Date(f.scheduledAt).getTime() <= now))
    .slice(0, remaining);

  const skipped = all.length - due.length;
  console.log('[TELEMETRY] profile=' + profileId + ' due=' + due.length + ' skipped=' + skipped + ' (out of ' + all.length + ' total files, remaining quota slots=' + remaining + ')');
  due.forEach((f) => {
    console.log('[TELEMETRY] profile=' + profileId + ' DUE file=' + JSON.stringify(f.name) + ' platforms=' + JSON.stringify(f.platforms) + ' hasYouTube=' + (f.platforms || []).includes('youtube'));
  });

  const total = due.length;
  let uploaded = 0;
  const results = [];
  const send = (data) => { console.log('[DBG] send progress:', JSON.stringify(data)); if (winRef && winRef.webContents) winRef.webContents.send('upload-progress', data); };

  if (total > 0) {
    console.log('[TELEMETRY] profile=' + profileId + ' starting upload loop for ' + total + ' file(s)');
    send({ type: 'start', files: due.map((f) => f.name) });
  } else {
    console.log('[TELEMETRY] profile=' + profileId + ' zero due files — returning uploaded=0');
  }

  for (let i = 0; i < due.length; i++) {
    const file = due[i];
    worker.setRuntimeState('uploading:' + profileId + ':' + file.name, true);
    const targetPlatforms = (file.platforms && file.platforms.length) ? file.platforms : PLATFORMS;
    console.log('[TELEMETRY] profile=' + profileId + ' processing file=' + JSON.stringify(file.name) + ' targetPlatforms=' + JSON.stringify(targetPlatforms) + ' hasYouTube=' + targetPlatforms.includes('youtube'));
    const perPlatform = {};
    for (let p = 0; p < targetPlatforms.length; p++) {
      const platform = targetPlatforms[p];
      try {
        const profile = getProfile(profileId);
        const tokens = profile.auth[platform];
        if (!tokens) {
          console.log('[TELEMETRY] profile=' + profileId + ' file=' + JSON.stringify(file.name) + ' platform=' + platform + ' SKIPPED: not-authenticated');
          perPlatform[platform] = { ok: false, error: 'not-authenticated' }; continue;
        }
        console.log('[TELEMETRY] profile=' + profileId + ' file=' + JSON.stringify(file.name) + ' platform=' + platform + ' START upload');
        const uploadOpts = {
          privacy: file.privacy || 'private',
          title: file.title || file.name,
          desc: file.desc || '',
          madeForKids: file.madeForKids || false,
          onStatus: function (msg) { send({ type: 'status', file: file.name, platform: platform, msg: msg }); },
        };
        if (platform === 'youtube' && ytCreds.clientId) {
          uploadOpts.clientId = ytCreds.clientId;
          uploadOpts.clientSecret = ytCreds.clientSecret;
        }
        const res = await uploadToPlatform(platform, tokens, file.path, uploadOpts);
        console.log('[TELEMETRY] profile=' + profileId + ' file=' + JSON.stringify(file.name) + ' platform=' + platform + ' DONE upload id=' + res.id);
        if (res.updatedTokens) {
          const p = getProfile(profileId);
          if (p && p.auth && p.auth[platform]) {
            p.auth[platform].access_token = res.updatedTokens.access_token;
            if (res.updatedTokens.refresh_token) p.auth[platform].refresh_token = res.updatedTokens.refresh_token;
            saveProfiles(getProfiles());
            console.log('[TELEMETRY] profile=' + profileId + ' platform=' + platform + ' refreshed tokens persisted');
          }
        }
        perPlatform[platform] = { ok: true, id: res.id };
      } catch (err) {
        console.log('[TELEMETRY] profile=' + profileId + ' file=' + JSON.stringify(file.name) + ' platform=' + platform + ' FAILED: ' + err.message);
        perPlatform[platform] = { ok: false, error: err.message };
        if (err.authError) perPlatform[platform].authError = true;
      }
      const filePct = Math.round(((p + 1) / targetPlatforms.length) * 100);
      send({ type: 'file', file: file.name, pct: filePct });
    }
    const allOk = targetPlatforms.every((p) => perPlatform[p]?.ok);
    worker.deleteRuntimeState('uploading:' + profileId + ':' + file.name);
    console.log('[TELEMETRY] profile=' + profileId + ' file=' + JSON.stringify(file.name) + ' allOk=' + allOk + ' perPlatform=' + JSON.stringify(perPlatform));
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
  console.log('[TELEMETRY] ===== runDailyForProfile END profile=' + profileId + ' uploaded=' + uploaded + ' due=' + total + ' skipped=' + skipped + ' =====');
  return { done: false, uploaded, results, quota: getQuota(profileId), skipped };
}
