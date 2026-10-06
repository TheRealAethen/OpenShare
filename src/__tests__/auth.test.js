const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const mockUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'openshare-auth-test-'));
const mockOpenExternal = jest.fn();
const mockFetch = jest.fn();

jest.mock('electron', () => ({
  app: { isPackaged: true, getPath: () => mockUserData },
  shell: { openExternal: (...args) => mockOpenExternal(...args) },
}));
jest.mock('node-fetch', () => (...args) => mockFetch(...args));

const SECRET = 'SUPER-SECRET-VALUE';
fs.writeFileSync(
  path.join(mockUserData, 'secrets.json'),
  JSON.stringify({ instagram: { clientId: 'ig-client-id', clientSecret: SECRET } })
);

const {
  authenticate,
  buildAuthorizeUrl,
  exchangeInstagramCode,
  createState,
  consumeState,
  deliverProtocolCallback,
  redirectUriFor,
  STATE_TTL_MS,
  CLIENTS,
} = require('../auth');

const INSTAGRAM_BRIDGE = 'https://theRealAethen.github.io/OpenShare/callback';

describe('redirect URIs', () => {
  test('instagram uses the HTTPS bridge page, other platforms keep localhost', () => {
    expect(redirectUriFor('instagram')).toBe(INSTAGRAM_BRIDGE);
    expect(redirectUriFor('youtube')).toBe('http://localhost:18923/callback');
    expect(redirectUriFor('tiktok')).toBe('http://localhost:18923/callback');
  });

  test('the authorize URL carries the bridge URI for instagram', () => {
    const url = new URL(buildAuthorizeUrl('instagram', { clientId: 'c', clientSecret: 's' }, 'st'));

    expect(url.searchParams.get('redirect_uri')).toBe(INSTAGRAM_BRIDGE);
  });

  test('deliverProtocolCallback is refused when no login is pending', () => {
    expect(deliverProtocolCallback('openshare://callback?code=x&state=y')).toBe(false);
  });
});

describe('OAuth state', () => {
  test('createState returns 64 hex characters from a fresh random source', () => {
    const a = createState('youtube');
    const b = createState('youtube');

    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  test('a valid state is accepted once', () => {
    const state = createState('youtube');

    expect(consumeState(state, 'youtube')).toBe(true);
    expect(() => consumeState(state, 'youtube')).toThrow('OAuth state invalid');
  });

  test('an unknown state is rejected', () => {
    expect(() => consumeState('f'.repeat(64), 'youtube')).toThrow('OAuth state invalid');
  });

  test('a missing state is rejected', () => {
    expect(() => consumeState(undefined, 'youtube')).toThrow('OAuth state missing');
    expect(() => consumeState('', 'youtube')).toThrow('OAuth state missing');
  });

  test('a state issued for one platform cannot complete another', () => {
    const state = createState('youtube');

    expect(() => consumeState(state, 'instagram')).toThrow('OAuth state invalid');
    expect(() => consumeState(state, 'youtube')).toThrow('OAuth state invalid');
  });

  test('an expired state is rejected', () => {
    const issuedAt = 1_000_000;
    const state = createState('tiktok', issuedAt);

    expect(() => consumeState(state, 'tiktok', issuedAt + STATE_TTL_MS)).toThrow('OAuth state expired');
  });

  test('a state is still valid just before its TTL', () => {
    const issuedAt = 1_000_000;
    const state = createState('tiktok', issuedAt);

    expect(consumeState(state, 'tiktok', issuedAt + STATE_TTL_MS - 1)).toBe(true);
  });
});

const cfg = { clientId: 'ig-client-id', clientSecret: SECRET };

function fakeResponse(body, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}

function routeIgFetch({ me = { user_id: '42', username: 'brand', account_type: 'BUSINESS' } } = {}) {
  mockFetch.mockImplementation((url) => {
    const u = String(url);
    if (u.startsWith('https://api.instagram.com/oauth/access_token')) {
      return fakeResponse({ data: [{ access_token: 'short-token', user_id: '42', permissions: 'x' }] });
    }
    if (u.startsWith('https://graph.instagram.com/access_token')) {
      return fakeResponse({ access_token: 'long-token', token_type: 'bearer', expires_in: 5183944 });
    }
    if (u.startsWith('https://graph.instagram.com/me')) return fakeResponse(me);
    return fakeResponse({ error: 'unexpected url ' + u }, false);
  });
}

describe('buildAuthorizeUrl', () => {
  test('instagram URL requests the current scopes and never contains the client secret', () => {
    const url = buildAuthorizeUrl('instagram', cfg, 'state-1');
    const parsed = new URL(url);

    expect(parsed.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_content_publish');
    expect(parsed.searchParams.has('client_secret')).toBe(false);
    expect(url).not.toContain(SECRET);
    expect(parsed.searchParams.get('client_id')).toBe('ig-client-id');
    expect(parsed.searchParams.get('state')).toBe('state-1');
  });

  test('building the URL does not log anything', () => {
    const spies = ['log', 'info', 'warn', 'error'].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));

    buildAuthorizeUrl('instagram', cfg, 'state-2');

    spies.forEach((s) => expect(s).not.toHaveBeenCalled());
    jest.restoreAllMocks();
  });
});

describe('authenticate (instagram)', () => {
  afterEach(() => {
    mockOpenExternal.mockReset();
    mockFetch.mockReset();
  });

  test('runs the full login: form-encoded short-lived exchange, long-lived exchange, account lookup', async () => {
    let openedUrl = null;
    mockOpenExternal.mockImplementation((url) => {
      openedUrl = url;
      const state = new URL(url).searchParams.get('state');
      setTimeout(() => {
        deliverProtocolCallback(`openshare://callback?code=auth-code&state=${state}`);
      }, 10);
    });
    routeIgFetch();

    const tokens = await authenticate('instagram');

    expect(openedUrl).not.toContain(SECRET);
    expect(new URL(openedUrl).searchParams.get('redirect_uri')).toBe(INSTAGRAM_BRIDGE);

    const [shortUrl, shortOpts] = mockFetch.mock.calls[0];
    expect(shortUrl).toBe(CLIENTS.instagram.tokenUrl);
    expect(shortOpts.method).toBe('POST');
    expect(shortOpts.body).toBeInstanceOf(URLSearchParams);
    expect(shortOpts.body.get('client_secret')).toBe(SECRET);
    expect(shortOpts.body.get('grant_type')).toBe('authorization_code');
    expect(shortOpts.body.get('code')).toBe('auth-code');
    expect(shortOpts.body.get('redirect_uri')).toBe(INSTAGRAM_BRIDGE);

    const [longUrl, longOpts] = mockFetch.mock.calls[1];
    expect(new URL(longUrl).host).toBe('graph.instagram.com');
    expect(new URL(longUrl).searchParams.get('grant_type')).toBe('ig_exchange_token');
    expect(new URL(longUrl).searchParams.get('access_token')).toBe('short-token');
    expect(longOpts).toBeUndefined();

    const [meUrl, meOpts] = mockFetch.mock.calls[2];
    expect(meUrl).toContain('graph.instagram.com/me');
    expect(meOpts.headers.Authorization).toBe('Bearer long-token');
    expect(meUrl).not.toContain('long-token');

    expect(tokens).toEqual({
      access_token: 'long-token',
      user_id: '42',
      account_type: 'BUSINESS',
      expires_at: expect.any(String),
    });
    expect(Date.parse(tokens.expires_at)).toBeGreaterThan(Date.now() + 50 * 86400 * 1000);
  });

  test('a personal account is rejected with a clear message', async () => {
    routeIgFetch({ me: { user_id: '42', username: 'me', account_type: 'PERSONAL' } });

    await expect(exchangeInstagramCode(cfg, 'code')).rejects.toThrow(/not a professional account/);
  });

  test('an Instagram error response surfaces Meta\'s message', async () => {
    mockFetch.mockImplementation(() => fakeResponse({ error_type: 'OAuthException', error_message: 'Invalid code' }, false));

    await expect(exchangeInstagramCode(cfg, 'bad')).rejects.toThrow('Invalid code');
  });

  test('stray or malformed links are ignored and the real link still completes the login', async () => {
    const results = {};
    mockOpenExternal.mockImplementation((url) => {
      const state = new URL(url).searchParams.get('state');
      setTimeout(() => {
        results.noState = deliverProtocolCallback('openshare://callback?code=forged');
        results.wrongState = deliverProtocolCallback('openshare://callback?code=forged&state=wrong');
        results.wrongScheme = deliverProtocolCallback(`https://callback?code=forged&state=${state}`);
        results.wrongHost = deliverProtocolCallback(`openshare://other?code=forged&state=${state}`);
        results.real = deliverProtocolCallback(`openshare://callback?code=auth-code&state=${state}`);
      }, 10);
    });
    routeIgFetch();

    const tokens = await authenticate('instagram');

    expect(results).toEqual({ noState: false, wrongState: false, wrongScheme: false, wrongHost: false, real: true });
    expect(tokens.access_token).toBe('long-token');
    const shortTokenCalls = mockFetch.mock.calls.filter(([u]) => String(u).startsWith('https://api.instagram.com'));
    expect(shortTokenCalls).toHaveLength(1);
    expect(shortTokenCalls[0][1].body.get('code')).toBe('auth-code');
  });
});
