const path = require('node:path');
const fs = require('node:fs');
const { SkipReason, SkipMessage, evaluateFile, selectEligibleFiles } = require('./selection');
const {
  DAILY_LIMIT,
  PLATFORMS,
  getProfiles,
  saveProfiles,
  getProfile,
  getQuota,
  incrementQuota,
  listFiles,
  setFileMeta,
  profileDir,
} = require('./storage');

let uploadToPlatform;
try { uploadToPlatform = require('../uploader').uploadToPlatform; } catch (e) { console.error('uploader load error:', e); }

let _worker = null;
let _notifyProgress = null;
let _schedulerTimer = null;
const _activeProfiles = new Set();
const _activeFiles = new Set();

const PROGRESS_THROTTLE_MS = 250;

function createThrottledSender(rawSender) {
  const lastSent = {};
  let queueTimer = null;

  function sendNow(payload) {
    lastSent[payload.type] = Date.now();
    rawSender(payload);
  }

  function schedule(payload) {
    if (queueTimer) clearTimeout(queueTimer);
    queueTimer = setTimeout(() => {
      queueTimer = null;
      sendNow(payload);
    }, PROGRESS_THROTTLE_MS);
  }

  return function sendProgress(payload) {
    if (payload.type === 'log:append') {
      sendNow(payload);
      return;
    }
    const now = Date.now();
    const last = lastSent[payload.type] || 0;
    const alwaysSend = payload.type === 'upload:file-done' || payload.type === 'upload:run-complete' || payload.type === 'upload:run-start';
    if (alwaysSend) {
      if (queueTimer) clearTimeout(queueTimer);
      queueTimer = null;
      sendNow(payload);
      return;
    }
    if (now - last >= PROGRESS_THROTTLE_MS) {
      sendNow(payload);
    } else {
      schedule(payload);
    }
  };
}

function init(worker, opts) {
  _worker = worker;
  _notifyProgress = (opts && opts.notifyProgress) || null;
  resetStaleUploadingStates();
  if (worker) {
    const raw = _notifyProgress || (() => {});
    worker.on('worker:status', (statusPayload) => {
      raw({ type: 'worker:status', ...statusPayload });
    });
  }
  if (!opts || opts.schedulerInterval !== false) {
    startScheduler((opts && opts.schedulerInterval) || 60000);
  }
}

function startScheduler(intervalMs) {
  stopScheduler();
  console.log('[scheduler] Starting tick every ' + intervalMs + 'ms');
  _schedulerTimer = setInterval(() => { tick(); }, intervalMs);
  tick();
}

function stopScheduler() {
  if (_schedulerTimer) {
    clearInterval(_schedulerTimer);
    _schedulerTimer = null;
    console.log('[scheduler] Stopped');
  }
}

async function tick() {
  const profiles = getProfiles();
  if (!profiles.length) return;
  for (const profile of profiles) {
    if (!_worker) continue;
    const key = 'scheduler:tick:' + profile.id;
    if (_worker.getRuntimeState(key)) continue;
    _worker.setRuntimeState(key, true);
    try {
      const result = await runDailyForProfile(profile.id, _notifyProgress);
      if (result.uploaded > 0) {
        console.log('[scheduler] Profile ' + profile.id + ' uploaded ' + result.uploaded + ' file(s).');
      }
    } catch (err) {
      console.error('[scheduler] Error for profile ' + profile.id + ':', err && (err.message || err));
      if (err && err.stack) console.error('[scheduler] Stack:', err.stack);
    } finally {
      _worker.deleteRuntimeState(key);
    }
  }
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
      if (meta[fileName].status === 'uploading') {
        meta[fileName].status = 'pending';
        changed = true;
        totalReset++;
      }
    }
    if (changed) {
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    }
  }
  if (totalReset > 0) {
    console.log('[startup] Reset ' + totalReset + ' stale uploading file(s) to pending.');
  } else {
    console.log('[startup] No stale uploading files found.');
  }
}

function logSkip(profileId, fileName, reason, emitLog) {
  console.log('[selection] profile=' + profileId + ' file=' + JSON.stringify(fileName) + ' ' + reason + ' (' + SkipMessage[reason] + ')');
  if (reason !== SkipReason.ALREADY_UPLOADED) {
    emitLog('info', '\'' + fileName + '\' skipped: ' + SkipMessage[reason]);
  }
}

async function runDailyForProfile(profileId, notifyProgress) {
  if (_activeProfiles.has(profileId)) {
    console.log('[TELEMETRY] profile=' + profileId + ' run already in progress — skipping');
    return { done: true, reason: 'already-running', uploaded: 0 };
  }
  _activeProfiles.add(profileId);
  try {
    return await runProfileUpload(profileId, notifyProgress);
  } finally {
    _activeProfiles.delete(profileId);
  }
}

async function runProfileUpload(profileId, notifyProgress) {
  const raw = notifyProgress || (() => {});
  const sendProgress = createThrottledSender(raw);
  const emitLog = (level, message) => sendProgress({ type: 'log:append', level, message, timestamp: Date.now() });
  console.log('[TELEMETRY] ===== runDailyForProfile START profileId=' + profileId + ' =====');
  const profile = getProfile(profileId);
  const quota = getQuota(profileId);
  const remaining = DAILY_LIMIT - quota.used;
  const authState = profile ? profile.auth || {} : {};
  console.log('[TELEMETRY] Profile auth: tiktok=' + (!!authState.tiktok) + ' youtube=' + (!!authState.youtube) + ' instagram=' + (!!authState.instagram));
  console.log('[TELEMETRY] Quota: used=' + quota.used + ' / limit=' + DAILY_LIMIT + ' remaining=' + remaining);
  if (remaining <= 0) {
    emitLog('warn', 'Daily upload limit reached for profile ' + profileId);
    return { done: true, reason: 'limit-reached', uploaded: 0 };
  }

  const auth = require('../auth');
  const secrets = auth.loadSecrets();
  const ytCreds = (secrets && secrets.youtube && secrets.youtube.clientId)
    ? { clientId: secrets.youtube.clientId, clientSecret: secrets.youtube.clientSecret }
    : {};

  const now = Date.now();
  console.log('[TELEMETRY] System time now=' + new Date(now).toISOString() + ' (' + now + 'ms)');
  const { selected: due, skipped } = selectEligibleFiles(listFiles(profileId), { now, remainingQuota: remaining });
  for (const { file, reason } of skipped) {
    logSkip(profileId, file.name, reason, emitLog);
  }
  console.log('[selection] profile=' + profileId + ' selected=' + due.length + ' skipped=' + skipped.length + ' remainingQuota=' + remaining);

  const total = due.length;
  let uploaded = 0;
  const results = [];

  if (total > 0) {
    console.log('[TELEMETRY] profile=' + profileId + ' starting upload loop for ' + total + ' file(s)');
    sendProgress({ type: 'upload:run-start', profileId, files: due.map((f) => f.name), total });
    emitLog('info', 'Upload run started — ' + total + ' file(s) due');
  } else {
    console.log('[TELEMETRY] profile=' + profileId + ' zero due files — returning uploaded=0');
  }

  for (let i = 0; i < due.length; i++) {
    const file = due[i];
    const fileKey = profileId + ':' + file.name;
    if (_activeFiles.has(fileKey)) {
      logSkip(profileId, file.name, SkipReason.IN_FLIGHT, emitLog);
      continue;
    }
    const current = listFiles(profileId).find((f) => f.name === file.name);
    const staleReason = current ? evaluateFile(current, Date.now()) : SkipReason.NOT_ELIGIBLE_STATUS;
    if (staleReason) {
      logSkip(profileId, file.name, staleReason, emitLog);
      continue;
    }
    _activeFiles.add(fileKey);
    try {
      const targetPlatforms = (current.platforms && current.platforms.length) ? current.platforms : PLATFORMS;
      console.log('[TELEMETRY] profile=' + profileId + ' processing file=' + JSON.stringify(file.name) + ' targetPlatforms=' + JSON.stringify(targetPlatforms) + ' hasYouTube=' + targetPlatforms.includes('youtube'));
      const perPlatform = Object.assign({}, current.platformResults || {});
      for (let p = 0; p < targetPlatforms.length; p++) {
        const platform = targetPlatforms[p];
        if (perPlatform[platform] && perPlatform[platform].ok) {
          console.log('[TELEMETRY] profile=' + profileId + ' file=' + JSON.stringify(file.name) + ' platform=' + platform + ' already published — skipping');
          continue;
        }
        sendProgress({ type: 'upload:platform-start', profileId, fileName: file.name, platform, index: p, total: targetPlatforms.length });
        try {
          const profile = getProfile(profileId);
          const tokens = profile.auth[platform];
          if (!tokens) {
            console.log('[TELEMETRY] profile=' + profileId + ' file=' + JSON.stringify(file.name) + ' platform=' + platform + ' SKIPPED: not-authenticated');
            perPlatform[platform] = { ok: false, error: 'not-authenticated' };
            sendProgress({ type: 'upload:platform-done', profileId, fileName: file.name, platform, ok: false, error: 'not-authenticated' });
            continue;
          }
          console.log('[TELEMETRY] profile=' + profileId + ' file=' + JSON.stringify(file.name) + ' platform=' + platform + ' START upload');
          emitLog('info', 'Uploading \'' + file.name + '\' to ' + platform + '...');
          const uploadOpts = {
            privacy: file.privacy || 'private',
            title: file.title || file.name,
            desc: file.desc || '',
            madeForKids: file.madeForKids || false,
            onStatus: function (msg) {
              sendProgress({ type: 'upload:platform-status', profileId, fileName: file.name, platform, msg: msg });
            },
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
          setFileMeta(profileId, file.name, { platformResults: perPlatform });
          sendProgress({ type: 'upload:platform-done', profileId, fileName: file.name, platform, ok: true, id: res.id });
          emitLog('ok', '\'' + file.name + '\' uploaded to ' + platform + ' (id=' + res.id + ')');
        } catch (err) {
          const errMsg = err && (err.message || String(err));
          const errStack = err && err.stack;
          console.log('[TELEMETRY] profile=' + profileId + ' file=' + JSON.stringify(file.name) + ' platform=' + platform + ' FAILED: ' + errMsg);
          if (errStack) console.log('[TELEMETRY] stack:', errStack);
          perPlatform[platform] = { ok: false, error: errMsg, stack: errStack || '' };
          if (err.authError) perPlatform[platform].authError = true;
          sendProgress({ type: 'upload:platform-done', profileId, fileName: file.name, platform, ok: false, error: errMsg });
          emitLog('error', '\'' + file.name + '\' upload to ' + platform + ' failed: ' + errMsg);
        }

      }
      const allOk = targetPlatforms.every((p) => perPlatform[p]?.ok);
      const failureReason = allOk ? '' : Object.keys(perPlatform)
        .filter((p) => perPlatform[p] && !perPlatform[p].ok)
        .map((p) => p + ': ' + (perPlatform[p].error || 'unknown'))
        .join('; ');
      console.log('[TELEMETRY] profile=' + profileId + ' file=' + JSON.stringify(file.name) + ' allOk=' + allOk + ' perPlatform=' + JSON.stringify(perPlatform));
      setFileMeta(profileId, file.name, {
        status: allOk ? 'uploaded' : 'failed',
        uploadedAt: allOk ? new Date().toISOString() : null,
        lastError: allOk ? null : JSON.stringify(perPlatform),
        failureReason: failureReason,
        platformResults: perPlatform,
      });
      if (allOk) uploaded++;
      results.push({ file: file.name, perPlatform });
      sendProgress({ type: 'upload:file-done', profileId, fileName: file.name, ok: allOk, perPlatform, results: perPlatform, failureReason });
      sendProgress({ type: 'upload:run-progress', profileId, pct: Math.round((uploaded / total) * 100), uploaded, total });
      if (allOk) {
        emitLog('ok', '\'' + file.name + '\' — all platforms succeeded');
      } else {
        emitLog('error', '\'' + file.name + '\' upload failed: ' + failureReason);
      }
    } finally {
      _activeFiles.delete(fileKey);
    }
  }

  incrementQuota(profileId, uploaded);
  console.log('[TELEMETRY] ===== runDailyForProfile END profile=' + profileId + ' uploaded=' + uploaded + ' due=' + total + ' skipped=' + skipped.length + ' =====');
  sendProgress({ type: 'upload:run-complete', profileId, uploaded, total, results, quota: getQuota(profileId), skipped: skipped.length });
  if (total > 0) {
    emitLog(uploaded === total ? 'ok' : 'warn', 'Upload run complete — ' + uploaded + '/' + total + ' files uploaded');
  }
  return { done: false, uploaded, results, quota: getQuota(profileId), skipped: skipped.length };
}

module.exports = { init, resetStaleUploadingStates, runDailyForProfile, startScheduler, stopScheduler, tick };
