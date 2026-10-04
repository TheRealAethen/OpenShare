const fetch = require('node-fetch');
const BaseAdapter = require('./BaseAdapter');

class InstagramAdapter extends BaseAdapter {
  async upload(tokens, filePath, opts = {}) {
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
}

module.exports = InstagramAdapter;
