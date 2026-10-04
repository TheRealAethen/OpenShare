const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { google } = require('googleapis');
const os = require('node:os');
const path = require('node:path');
const BaseAdapter = require('./BaseAdapter');

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

class YouTubeAdapter extends BaseAdapter {
  async upload(tokens, filePath, opts = {}) {
    const privacy = opts.privacy || 'private';
    const madeForKids = opts.madeForKids || false;
    const oauth2 = new google.auth.OAuth2(opts.clientId, opts.clientSecret);
    oauth2.setCredentials({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
    const yt = google.youtube({ version: 'v3', auth: oauth2 });

    const title = opts.title || path.basename(filePath).replace(/\.[^.]+$/, '');
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
        ? 'YouTube auth expired — reconnect required (' + detail + ')'
        : 'YouTube upload failed: ' + detail;
      const uploadErr = new Error(msg);
      if (isAuth) uploadErr.authError = true;
      throw uploadErr;
    } finally {
      if (transcoded && uploadPath !== filePath) {
        try { fs.unlinkSync(uploadPath); } catch { /* ignore */ }
      }
    }
  }

  async getChannel(tokens) {
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
}

module.exports = YouTubeAdapter;
