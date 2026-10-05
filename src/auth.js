const { app, shell } = require('electron');
const http = require('node:http');
const fetch = require('node-fetch');
const { URL } = require('node:url');

const REDIRECT_PORT = 18923;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

const CLIENTS = {
  youtube: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
  },
  tiktok: {
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scope: 'video.upload',
  },
  instagram: {
    authUrl: 'https://www.instagram.com/oauth/authorize',
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    scope: 'instagram_business_basic,instagram_business_content_publish',
  },
};

const INSTAGRAM_PROFESSIONAL_ACCOUNT_TYPES = ['BUSINESS', 'MEDIA_CREATOR'];

async function instagramJson(res) {
  const json = await res.json();
  if (!res.ok || json.error_type || json.error) {
    throw new Error(json.error_message || (json.error && json.error.message) || 'Instagram request failed');
  }
  return json;
}

async function exchangeInstagramCode(cfg, code) {
  const shortRes = await fetch(CLIENTS.instagram.tokenUrl, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      code,
    }),
  });
  const short = (await instagramJson(shortRes)).data?.[0];
  if (!short || !short.access_token) throw new Error('Instagram did not return an access token.');

  const longUrl = new URL('https://graph.instagram.com/access_token');
  longUrl.searchParams.set('grant_type', 'ig_exchange_token');
  longUrl.searchParams.set('client_secret', cfg.clientSecret);
  longUrl.searchParams.set('access_token', short.access_token);
  const long = await instagramJson(await fetch(longUrl.toString()));

  const meRes = await fetch('https://graph.instagram.com/me?fields=user_id,username,account_type', {
    headers: { Authorization: `Bearer ${long.access_token}` },
  });
  const me = await instagramJson(meRes);
  if (!INSTAGRAM_PROFESSIONAL_ACCOUNT_TYPES.includes(me.account_type)) {
    throw new Error(`Instagram account "${me.username || ''}" is not a professional account. Switch it to a Business or Creator account in the Instagram app and try again.`);
  }

  return {
    access_token: long.access_token,
    user_id: String(me.user_id || short.user_id),
    account_type: me.account_type,
    expires_at: new Date(Date.now() + long.expires_in * 1000).toISOString(),
  };
}

const fs = require('node:fs');
const path = require('node:path');

function secretsPath() {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'secrets.json');
  }
  return path.join(__dirname, 'secrets.json');
}

function loadSecrets() {
  try {
    return JSON.parse(fs.readFileSync(secretsPath(), 'utf8'));
  } catch {
    return {};
  }
}

function saveSecrets(secrets) {
  const dir = path.dirname(secretsPath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(secretsPath(), JSON.stringify(secrets, null, 2));
}

let activeServer = null;

function killExistingServer() {
  return new Promise((resolve) => {
    if (!activeServer) return resolve();
    activeServer.close(() => resolve());
    activeServer = null;
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    (async () => {
      await killExistingServer();

      const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
        if (url.pathname === '/callback') {
          res.end('<html><body>Authentication complete. You may close this window.</body></html>');
          const params = url.searchParams;
          activeServer = null;
          server.close();
          resolve(Object.fromEntries(params.entries()));
        }
      });

      activeServer = server;

      server.on('error', (err) => {
        activeServer = null;
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${REDIRECT_PORT} is busy. Close any other OpenShare windows or browser tabs using that port, then try again.`));
        } else {
          reject(err);
        }
      });

      server.listen(REDIRECT_PORT);

      setTimeout(() => {
        if (activeServer === server) {
          activeServer = null;
          server.close();
          reject(new Error('Auth timed out after 2 minutes. No response was received from the platform.'));
        }
      }, 120000);
    })();
  });
}

function buildAuthorizeUrl(platform, cfg, state) {
  const def = CLIENTS[platform];
  const authUrl = new URL(def.authUrl);
  authUrl.searchParams.set('client_id', cfg.clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', def.scope);
  authUrl.searchParams.set('state', state);
  if (platform === 'youtube') authUrl.searchParams.set('prompt', 'consent');
  return authUrl.toString();
}

async function authenticate(platform, _win) {
  const secrets = loadSecrets();
  const cfg = secrets[platform];
  const def = CLIENTS[platform];
  if (!cfg || !cfg.clientId) {
    throw new Error(`Missing clientId for ${platform}. Add it to secrets.json (${secretsPath()})`);
  }

  const server = startServer();
  const state = Math.random().toString(36).slice(2);
  shell.openExternal(buildAuthorizeUrl(platform, cfg, state));
  const params = await server;

  if (params.state !== state) throw new Error('OAuth state mismatch');
  if (params.error) throw new Error(params.error);

  if (platform === 'instagram') return exchangeInstagramCode(cfg, params.code);

  const tokenBody = {
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code: params.code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
    access_type: 'offline',
  };
  const tokenRes = await fetch(def.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tokenBody),
  });
  const tokens = await tokenRes.json();
  if (tokens.error) throw new Error(tokens.error_description || tokens.error);
  return tokens;
}

module.exports = { authenticate, buildAuthorizeUrl, exchangeInstagramCode, REDIRECT_URI, CLIENTS, loadSecrets, saveSecrets };
