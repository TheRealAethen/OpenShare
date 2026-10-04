const { toPublicProfile, toSecretStatus, mergeSecret } = require('../profileView');

const SECRET_KEYS = ['access_token', 'refresh_token', 'user_id', 'clientSecret'];

function leaksAny(value, keys) {
  return JSON.stringify(value, (_k, v) => v).split(/[^A-Za-z_]+/).some((w) => keys.includes(w));
}

const connectedProfile = {
  id: 'p1',
  name: 'Brand',
  defaultDesc: 'Hi',
  auth: {
    youtube: {
      access_token: 'ya-SECRET',
      refresh_token: 'yr-SECRET',
      channel: { name: 'Brand TV', avatar: 'https://img/a.png' },
    },
    tiktok: { access_token: 'ta-SECRET', refresh_token: 'tr-SECRET' },
  },
};

describe('toPublicProfile', () => {
  test('returns metadata and per-platform booleans only', () => {
    const view = toPublicProfile(connectedProfile);

    expect(view).toEqual({
      id: 'p1',
      name: 'Brand',
      defaultDesc: 'Hi',
      isConnected: { tiktok: true, youtube: true, instagram: false },
      channels: { youtube: { name: 'Brand TV', avatar: 'https://img/a.png' } },
    });
  });

  test('never contains token strings', () => {
    const view = toPublicProfile(connectedProfile);

    expect(JSON.stringify(view)).not.toMatch(/SECRET/);
    expect(leaksAny(view, SECRET_KEYS)).toBe(false);
  });

  test('never exposes instagram user id', () => {
    const view = toPublicProfile({ id: 'p2', name: 'IG', auth: { instagram: { access_token: 'x', user_id: '12345' } } });

    expect(view.isConnected.instagram).toBe(true);
    expect(JSON.stringify(view)).not.toContain('12345');
  });

  test('a profile without auth is fully disconnected', () => {
    const view = toPublicProfile({ id: 'p3', name: 'New', auth: {} });

    expect(view.isConnected).toEqual({ tiktok: false, youtube: false, instagram: false });
    expect(view.channels).toEqual({});
    expect(view.defaultDesc).toBe('');
  });
});

describe('toSecretStatus', () => {
  test('reports presence booleans without values', () => {
    const status = toSecretStatus({ youtube: { clientId: 'cid', clientSecret: 'csec-SECRET' } });

    expect(status).toEqual({
      tiktok: { hasClientId: false, hasClientSecret: false },
      youtube: { hasClientId: true, hasClientSecret: true },
      instagram: { hasClientId: false, hasClientSecret: false },
    });
    expect(JSON.stringify(status)).not.toMatch(/SECRET|cid/);
  });

  test('handles a missing secrets file', () => {
    expect(toSecretStatus({}).youtube).toEqual({ hasClientId: false, hasClientSecret: false });
  });
});

describe('mergeSecret', () => {
  test('writes a new platform entry and keeps the others', () => {
    const merged = mergeSecret({ tiktok: { clientId: 't', clientSecret: 'ts' } }, 'youtube', {
      clientId: 'y', clientSecret: 'ys',
    });

    expect(merged).toEqual({
      tiktok: { clientId: 't', clientSecret: 'ts' },
      youtube: { clientId: 'y', clientSecret: 'ys' },
    });
  });

  test('blank fields keep the saved value', () => {
    const merged = mergeSecret({ youtube: { clientId: 'y', clientSecret: 'ys' } }, 'youtube', {
      clientId: '', clientSecret: '  ',
    });

    expect(merged.youtube).toEqual({ clientId: 'y', clientSecret: 'ys' });
  });

  test('rejects a new platform entry without both fields', () => {
    expect(() => mergeSecret({}, 'youtube', { clientId: 'y', clientSecret: '' })).toThrow(/required/);
    expect(() => mergeSecret({}, 'youtube', { clientId: '', clientSecret: 's' })).toThrow(/required/);
  });

  test('rejects unknown platforms', () => {
    expect(() => mergeSecret({}, 'myspace', { clientId: 'a', clientSecret: 'b' })).toThrow(/Unknown platform/);
  });
});
