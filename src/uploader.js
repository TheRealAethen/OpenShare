const fs = require('node:fs');
const { execFile } = require('node:child_process');
const fetch = require('node-fetch');
const { google } = require('googleapis');
const FormData = require('form-data');
const os = require('node:os');
const path = require('node:path');

function ffmpegAvailable() {
  return new Promise((resolve) => {
    execFile('ffmpeg', ['-version'], (err) => resolve(!err));
  });
}

function transcodeToMp4(inputPath) {
  return new Promise((resolve, reject) => {
    const out = path.join(os.tmpdir(), `openshare-${Date.now()}-${Math.round(Math.random() * 1e6)}.mp4`);
    execFile('ffmpeg', [
      '-y', '-i', inputPath,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      out,
    ], (err) => {
      if (err) return reject(err);
      resolve(out);
    });
  });
}

async function uploadToTikTok(tokens, filePath, opts = {}) {
  const videoBuffer = fs.readFileSync(filePath);
  const size = fs.statSync(filePath).size;
  const title = opts.title || require('node:path').basename(filePath).replace(/\.[^.]+$/, '');
  const desc = opts.desc || '';

  const initRes = await fetch('https://open.tiktokapis.com/v2/video/upload/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ upload_type: 'UPLOAD_TYPE_FILE', file_size: size }),
  });
  const init = await initRes.json();
  if (init.error) throw new Error(init.error.message);

  const uploadUrl = init.data.upload_url;
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size) },
    body: videoBuffer,
  });

  const publishRes = await fetch('https://open.tiktokapis.com/v2/video/publish/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      upload_auth: init.data.upload_auth,
      source: 'PULL_FROM_UPLOAD_URL',
      title: title,
      description: desc,
    }),
  });
  const publish = await publishRes.json();
  if (publish.error) throw new Error(publish.error.message);
  return { id: publish.data.publish_id };
}

async function uploadToYouTube(tokens, filePath, opts = {}) {
  const privacy = opts.privacy || 'private';
  const madeForKids = opts.madeForKids || false;
  const oauth2 = new google.auth.OAuth2(opts.clientId, opts.clientSecret);
  oauth2.setCredentials({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
  const yt = google.youtube({ version: 'v3', auth: oauth2 });

  const title = opts.title || require('node:path').basename(filePath).replace(/\.[^.]+$/, '');
  const desc = opts.desc || '';

  let uploadPath = filePath;
  let transcoded = false;
  if (await ffmpegAvailable()) {
    if (opts.onStatus) opts.onStatus('transcoding');
    console.log('[YouTube] ffmpeg found — transcoding to H.264/AAC MP4...');
    try {
      uploadPath = await transcodeToMp4(filePath);
      transcoded = true;
      console.log('[YouTube] Transcode complete.');
    } catch (e) {
      console.error('Transcode failed, uploading original:', e.message);
    }
  }

  try {
    const res = await yt.videos.insert(
      {
        part: 'snippet,status',
        notifySubscribers: false,
        media: { body: fs.createReadStream(uploadPath) },
        requestBody: {
          snippet: {
            title: title,
            description: desc,
            categoryId: '22',
          },
          status: { privacyStatus: privacy, selfDeclaredMadeForKids: madeForKids },
        },
      }
    );
    const creds = oauth2.credentials;
    if (creds.access_token !== tokens.access_token) {
      return {
        id: res.data.id,
        updatedTokens: {
          access_token: creds.access_token,
          refresh_token: creds.refresh_token || tokens.refresh_token,
        },
      };
    }
    return { id: res.data.id };
  } catch (err) {
    const errors = err.errors || [];
    const isAuth = errors.some(function (e) { return e.reason === 'authError' || e.reason === 'expired'; }) ||
      (err.message && (err.message.indexOf('Invalid Credentials') !== -1 || err.message.indexOf('invalid_grant') !== -1));
    const detail = errors.length
      ? errors.map(function (e) { return e.message || e.reason; }).join('; ')
      : (err.response && err.response.data ? JSON.stringify(err.response.data) : err.message);
    const msg = isAuth
      ? 'YouTube auth expired \u2014 reconnect required (' + detail + ')'
      : 'YouTube upload failed: ' + detail;
    const uploadErr = new Error(msg);
    if (isAuth) uploadErr.authError = true;
    throw uploadErr;
  } finally {
    if (transcoded && uploadPath !== filePath) {
      try { fs.unlinkSync(uploadPath); } catch {}
    }
  }
}

async function getYouTubeChannel(tokens) {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
  const yt = google.youtube({ version: 'v3', auth: oauth2 });
  const res = await yt.channels.list({ part: 'snippet', mine: true });
  const ch = res.data.items && res.data.items[0];
  if (!ch) return null;
  return {
    name: ch.snippet.title,
    avatar: ch.snippet.thumbnails && (ch.snippet.thumbnails.default.url || ch.snippet.thumbnails.medium.url),
  };
}

async function uploadToInstagram(tokens, filePath, opts = {}) {
  const igUserId = tokens.user_id;
  const token = tokens.access_token;
  const caption = opts.desc || opts.title || 'Uploaded via OpenShare';

  const createRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'REELS',
      video_url: filePath,
      caption: caption,
      access_token: token,
    }),
  });
  const creation = await createRes.json();
  if (creation.error) throw new Error(creation.error.message);

  const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: creation.id, access_token: token }),
  });
  const publish = await publishRes.json();
  if (publish.error) throw new Error(publish.error.message);
  return { id: publish.id };
}

async function uploadToPlatform(platform, tokens, filePath, opts = {}) {
  switch (platform) {
    case 'tiktok': return uploadToTikTok(tokens, filePath, opts);
    case 'youtube': return uploadToYouTube(tokens, filePath, opts);
    case 'instagram': return uploadToInstagram(tokens, filePath, opts);
    default: throw new Error(`Unknown platform: ${platform}`);
  }
}

module.exports = { uploadToPlatform, getYouTubeChannel };
