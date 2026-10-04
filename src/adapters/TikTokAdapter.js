const fs = require('node:fs');
const path = require('node:path');
const fetch = require('node-fetch');
const BaseAdapter = require('./BaseAdapter');

class TikTokAdapter extends BaseAdapter {
  async upload(tokens, filePath, opts = {}) {
    const videoBuffer = fs.readFileSync(filePath);
    const size = fs.statSync(filePath).size;
    const title = opts.title || path.basename(filePath).replace(/\.[^.]+$/, '');
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
}

module.exports = TikTokAdapter;
