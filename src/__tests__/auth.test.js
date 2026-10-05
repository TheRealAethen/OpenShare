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

const { authenticate, buildAuthorizeUrl, CLIENTS } = require('../auth');

const cfg = { clientId: 'ig-client-id', clientSecret: SECRET };

describe('buildAuthorizeUrl', () => {
  test('instagram URL never contains the client secret', () => {
    const url = buildAuthorizeUrl('instagram', cfg, 'state-1');
    const parsed = new URL(url);

    expect(parsed.searchParams.has('client_secret')).toBe(false);
    expect(url).not.toContain(SECRET);
    expect(parsed.searchParams.get('client_id')).toBe('ig-client-id');
    expect(parsed.searchParams.get('state')).toBe('state-1');
  });

  test('building the URL does not log anything', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    buildAuthorizeUrl('instagram', cfg, 'state-2');

    expect(log).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});

describe('authenticate (instagram)', () => {
  afterEach(() => {
    mockOpenExternal.mockReset();
    mockFetch.mockReset();
  });

  test('secret is absent from the browser URL and present only in the token POST body', async () => {
    let openedUrl = null;
    mockOpenExternal.mockImplementation((url) => {
      openedUrl = url;
      const state = new URL(url).searchParams.get('state');
      setTimeout(() => {
        http.get(`http://localhost:18923/callback?code=auth-code&state=${state}`, (res) => res.resume());
      }, 100);
    });
    mockFetch.mockResolvedValue({ json: async () => ({ access_token: 'at', user_id: '42' }) });

    const tokens = await authenticate('instagram');

    expect(openedUrl).not.toContain(SECRET);
    expect(new URL(openedUrl).searchParams.has('client_secret')).toBe(false);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [tokenUrl, options] = mockFetch.mock.calls[0];
    expect(tokenUrl).toBe(CLIENTS.instagram.tokenUrl);
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body).client_secret).toBe(SECRET);

    expect(tokens.access_token).toBe('at');
  });
});
