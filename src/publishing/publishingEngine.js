const path = require('node:path');
const fs = require('node:fs');
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

function init(worker) {
  _worker = worker;
  resetStaleUploadingStates();
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

async function runDailyForProfile(profileId, notifyProgress) {
  const send = notifyProgress || (() => {});
  console.log('[TELEMETRY] ===== runDailyForProfile START profileId=' + profileId + ' =====');
  const profile = getProfile(profileId);
  const quota = getQuota(profileId);
  const remaining = DAILY_LIMIT - quota.used;
  const authState = profile ? profile.auth || {} : {};
  console.log('[TELEMETRY] Profile auth: tiktok=' + (!!authState.tiktok) + ' youtube=' + (!!authState.youtube) + ' instagram=' + (!!authState.instagram));
  console.log('[TELEMETRY] Quota: used=' + quota.used + ' / limit=' + DAILY_LIMIT + ' remaining=' + remaining);
  if (remaining <= 0) return { done: true, reason: 'limit-reached', uploaded: 0 };

  const auth = require('../auth');
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

  if (total > 0) {
    console.log('[TELEMETRY] profile=' + profileId + ' starting upload loop for ' + total + ' file(s)');
    send({ type: 'start', files: due.map((f) => f.name) });
  } else {
    console.log('[TELEMETRY] profile=' + profileId + ' zero due files — returning uploaded=0');
  }

  for (let i = 0; i < due.length; i++) {
    const file = due[i];
    if (_worker) _worker.setRuntimeState('uploading:' + profileId + ':' + file.name, true);
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
    if (_worker) _worker.deleteRuntimeState('uploading:' + profileId + ':' + file.name);
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

module.exports = { init, resetStaleUploadingStates, runDailyForProfile };
