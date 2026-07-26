const { shell } = require('electron');
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
    scope: 'instagram_content_publish',
  },
};

const fs = require('node:fs');
const path = require('node:path');

function loadSecrets() {
  const p = path.join(__dirname, 'secrets.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function saveSecrets(secrets) {
  const p = path.join(__dirname, 'secrets.json');
  fs.writeFileSync(p, JSON.stringify(secrets, null, 2));
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

async function authenticate(platform, _win) {
  const secrets = loadSecrets();
  const cfg = secrets[platform];
  const def = CLIENTS[platform];
  if (!cfg || !cfg.clientId) {
    throw new Error(`Missing clientId for ${platform}. Add it to src/secrets.json`);
  }

  const server = startServer();
  const state = Math.random().toString(36).slice(2);
  const authUrl = new URL(def.authUrl);
  authUrl.searchParams.set('client_id', cfg.clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', def.scope);
  authUrl.searchParams.set('state', state);
  if (platform === 'youtube') authUrl.searchParams.set('prompt', 'consent');
  if (platform === 'instagram') authUrl.searchParams.set('client_secret', cfg.clientSecret);

  shell.openExternal(authUrl.toString());
  const params = await server;

  if (params.state !== state) throw new Error('OAuth state mismatch');
  if (params.error) throw new Error(params.error);

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

module.exports = { authenticate, REDIRECT_URI, CLIENTS, loadSecrets, saveSecrets };
