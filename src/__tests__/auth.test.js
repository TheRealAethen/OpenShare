const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

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

const { authenticate, buildAuthorizeUrl, exchangeInstagramCode, CLIENTS } = require('../auth');

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
        http.get(`http://localhost:18923/callback?code=auth-code&state=${state}`, (res) => res.resume());
      }, 100);
    });
    routeIgFetch();

    const tokens = await authenticate('instagram');

    expect(openedUrl).not.toContain(SECRET);

    const [shortUrl, shortOpts] = mockFetch.mock.calls[0];
    expect(shortUrl).toBe(CLIENTS.instagram.tokenUrl);
    expect(shortOpts.method).toBe('POST');
    expect(shortOpts.body).toBeInstanceOf(URLSearchParams);
    expect(shortOpts.body.get('client_secret')).toBe(SECRET);
    expect(shortOpts.body.get('grant_type')).toBe('authorization_code');
    expect(shortOpts.body.get('code')).toBe('auth-code');

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
});
