const fetch = require('node-fetch');

const GRAPH_API_VERSION = 'v19.0';
const GRAPH_HOST = 'https://graph.instagram.com';

const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_POLL_TIMEOUT_MS = 5 * 60 * 1000;

const CONTAINER_STATUS = Object.freeze({
  IN_PROGRESS: 'IN_PROGRESS',
  FINISHED: 'FINISHED',
  ERROR: 'ERROR',
  EXPIRED: 'EXPIRED',
  PUBLISHED: 'PUBLISHED',
});

const TERMINAL_FAILURE_STATUSES = [CONTAINER_STATUS.ERROR, CONTAINER_STATUS.EXPIRED];

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Every call uses an Authorization header, never a query string or POST
// field, so the access token cannot end up in a URL or a log line.
async function graphRequest(path, { accessToken, method = 'GET', params = {} } = {}) {
  const url = new URL(`${GRAPH_HOST}/${GRAPH_API_VERSION}${path}`);
  const options = { method, headers: { Authorization: `Bearer ${accessToken}` } };
  if (method === 'GET') {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  } else {
    options.body = new URLSearchParams(params);
  }

  const res = await fetch(url.toString(), options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // leave json null; the status code alone drives the error below
  }
  if (!res.ok || !json || json.error) {
    const message = json && json.error && json.error.message;
    throw new Error(message || `Instagram Graph API request to ${path} failed (status ${res.status})`);
  }
  return json;
}

async function createContainer({ accessToken, igUserId, videoUrl, caption }) {
  if (!/^https:\/\//i.test(String(videoUrl || ''))) {
    throw new Error(`Instagram requires a public https:// video URL; received: ${videoUrl}`);
  }
  const json = await graphRequest(`/${igUserId}/media`, {
    accessToken,
    method: 'POST',
    params: { media_type: 'REELS', video_url: videoUrl, caption: caption || '' },
  });
  if (!json.id) throw new Error('Instagram did not return a media container id.');
  return json.id;
}

async function getContainerStatus({ accessToken, containerId }) {
  const json = await graphRequest(`/${containerId}`, { accessToken, params: { fields: 'status_code' } });
  return json.status_code;
}

async function waitForContainerReady({
  accessToken,
  containerId,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
  sleep = defaultSleep,
  now = Date.now,
}) {
  const deadline = now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const status = await getContainerStatus({ accessToken, containerId });
    if (status === CONTAINER_STATUS.FINISHED) return status;
    if (TERMINAL_FAILURE_STATUSES.includes(status)) {
      throw new Error(`Instagram media container ${containerId} failed with status ${status}.`);
    }
    if (now() >= deadline) {
      throw new Error(`Instagram media container ${containerId} did not finish processing within ${timeoutMs}ms (last status: ${status}).`);
    }
    await sleep(pollIntervalMs);
  }
}

async function publishContainer({ accessToken, igUserId, containerId }) {
  const json = await graphRequest(`/${igUserId}/media_publish`, {
    accessToken,
    method: 'POST',
    params: { creation_id: containerId },
  });
  if (!json.id) throw new Error('Instagram did not return a published media id.');
  return json.id;
}

async function publishReel({ accessToken, igUserId, videoUrl, caption, pollIntervalMs, timeoutMs, sleep }) {
  const containerId = await createContainer({ accessToken, igUserId, videoUrl, caption });
  await waitForContainerReady({ accessToken, containerId, pollIntervalMs, timeoutMs, sleep });
  const id = await publishContainer({ accessToken, igUserId, containerId });
  return { id };
}

module.exports = {
  GRAPH_API_VERSION,
  GRAPH_HOST,
  CONTAINER_STATUS,
  createContainer,
  getContainerStatus,
  waitForContainerReady,
  publishContainer,
  publishReel,
};
