const { app, shell } = require('electron');
const http = require('node:http');
const fetch = require('node-fetch');
const { URL } = require('node:url');

const REDIRECT_PORT = 18923;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const INSTAGRAM_REDIRECT_URI = 'https://theRealAethen.github.io/OpenShare/callback';

function redirectUriFor(platform) {
  return platform === 'instagram' ? INSTAGRAM_REDIRECT_URI : REDIRECT_URI;
}

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

function redactSensitive(value) {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = /token|secret/i.test(key) ? '[REDACTED]' : redactSensitive(v);
    }
    return out;
  }
  return value;
}

// Meta's Instagram Login redirect has been observed appending a trailing
// `#_` (or `#`) fragment marker directly onto the `code` query value in some
// app configurations. Anything from the first `#` onward is not part of the
// code, so it is stripped before use.
function sanitizeAuthorizationCode(code) {
  return String(code || '').split('#')[0];
}

async function instagramRequest(res, context) {
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // leave json null; the raw text is still logged below
  }
  if (!res.ok || !json || json.error_type || json.error) {
    console.error(`[auth] Instagram ${context} failed (status ${res.status}):`, json ? redactSensitive(json) : text);
    const message = json && (json.error_message || (json.error && json.error.message));
    throw new Error(message || `Instagram ${context} failed (status ${res.status})`);
  }
  return json;
}

async function exchangeInstagramCode(cfg, rawCode) {
  const code = sanitizeAuthorizationCode(rawCode);
  const shortRes = await fetch(CLIENTS.instagram.tokenUrl, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUriFor('instagram'),
      code,
    }),
  });
  const shortJson = await instagramRequest(shortRes, 'short-lived token exchange');
  // Meta documents the response wrapped in a `data` array, but some app
  // configurations return the token object directly. Accept both shapes.
  const short = Array.isArray(shortJson.data) ? shortJson.data[0] : shortJson;
  if (!short || !short.access_token) {
    console.error('[auth] Instagram short-lived exchange had no access_token:', redactSensitive(shortJson));
    throw new Error('Instagram did not return an access token.');
  }

  const longUrl = new URL('https://graph.instagram.com/access_token');
  longUrl.searchParams.set('grant_type', 'ig_exchange_token');
  longUrl.searchParams.set('client_secret', cfg.clientSecret);
  longUrl.searchParams.set('access_token', short.access_token);
  const long = await instagramRequest(await fetch(longUrl.toString()), 'long-lived token exchange');

  const meRes = await fetch('https://graph.instagram.com/me?fields=user_id,username,account_type', {
    headers: { Authorization: `Bearer ${long.access_token}` },
  });
  const me = await instagramRequest(meRes, 'account lookup');
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
const crypto = require('node:crypto');

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

const STATE_TTL_MS = 10 * 60 * 1000;
const pendingStates = new Map();

function createState(platform, now = Date.now()) {
  for (const [key, entry] of pendingStates) {
    if (entry.expiresAt <= now) pendingStates.delete(key);
  }
  const state = crypto.randomBytes(32).toString('hex');
  pendingStates.set(state, { platform, expiresAt: now + STATE_TTL_MS });
  return state;
}

function consumeState(state, platform, now = Date.now()) {
  if (!state) throw new Error('OAuth state missing');
  const entry = pendingStates.get(state);
  pendingStates.delete(state);
  if (!entry || entry.platform !== platform) throw new Error('OAuth state invalid');
  if (entry.expiresAt <= now) throw new Error('OAuth state expired');
  return true;
}

let pendingProtocolCallback = null;

function waitForProtocolCallback(platform) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingProtocolCallback = null;
      reject(new Error('Auth timed out after 2 minutes. No response was received from the platform.'));
    }, 120000);
    pendingProtocolCallback = {
      platform,
      settle(params) {
        clearTimeout(timer);
        pendingProtocolCallback = null;
        resolve(params);
      },
    };
  });
}

function deliverProtocolCallback(rawUrl) {
  if (!pendingProtocolCallback) return false;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'openshare:' || url.hostname !== 'callback') return false;
  const params = Object.fromEntries(url.searchParams.entries());
  try {
    consumeState(params.state, pendingProtocolCallback.platform);
  } catch {
    return false;
  }
  pendingProtocolCallback.settle(params);
  return true;
}

let activeServer = null;

function killExistingServer() {
  return new Promise((resolve) => {
    if (!activeServer) return resolve();
    activeServer.close(() => resolve());
    activeServer = null;
  });
}

function startServer(platform) {
  return new Promise((resolve, reject) => {
    (async () => {
      await killExistingServer();

      const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
        if (url.pathname === '/callback') {
          const params = Object.fromEntries(url.searchParams.entries());
          try {
            consumeState(params.state, platform);
          } catch {
            res.statusCode = 400;
            res.end('<html><body>This sign-in link is no longer valid. Start the sign-in again from OpenShare.</body></html>');
            return;
          }
          res.end('<html><body>Authentication complete. You may close this window.</body></html>');
          activeServer = null;
          server.close();
          resolve(params);
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
  authUrl.searchParams.set('redirect_uri', redirectUriFor(platform));
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

  const state = createState(platform);
  const callback = platform === 'instagram' ? waitForProtocolCallback(platform) : startServer(platform);
  shell.openExternal(buildAuthorizeUrl(platform, cfg, state));
  const params = await callback;

  if (params.error) throw new Error(params.error);

  if (platform === 'instagram') return exchangeInstagramCode(cfg, params.code);

  const tokenBody = {
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code: params.code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUriFor(platform),
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

module.exports = {
  authenticate,
  buildAuthorizeUrl,
  exchangeInstagramCode,
  createState,
  consumeState,
  deliverProtocolCallback,
  redirectUriFor,
  STATE_TTL_MS,
  REDIRECT_URI,
  CLIENTS,
  loadSecrets,
  saveSecrets,
};
