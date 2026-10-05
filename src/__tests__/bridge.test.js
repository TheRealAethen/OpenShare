const { buildProtocolUrl, FORWARDED_KEYS } = require('../../docs/assets/callback');

describe('buildProtocolUrl', () => {
  test('forwards code and state into the openshare protocol', () => {
    const url = buildProtocolUrl('?code=abc123&state=st-1');

    expect(url).toBe('openshare://callback?code=abc123&state=st-1');
  });

  test('drops any parameter the bridge does not forward', () => {
    const url = buildProtocolUrl('?code=abc&state=s&redirect=https://evil.example&extra=1');

    expect(url).not.toContain('evil');
    expect(url).not.toContain('extra');
    expect(new URL(url).searchParams.has('redirect')).toBe(false);
  });

  test('encodes values so they cannot inject parameters', () => {
    const url = buildProtocolUrl('?code=a%26state%3Dforged&state=s');

    expect(new URL(url).searchParams.get('code')).toBe('a&state=forged');
    expect(new URL(url).searchParams.getAll('state')).toEqual(['s']);
  });

  test('forwards provider errors', () => {
    const url = buildProtocolUrl('?error=access_denied&error_description=User+cancelled&state=s');

    expect(new URL(url).searchParams.get('error')).toBe('access_denied');
    expect(new URL(url).searchParams.get('error_description')).toBe('User cancelled');
  });

  test('returns null when neither a code nor an error is present', () => {
    expect(buildProtocolUrl('')).toBeNull();
    expect(buildProtocolUrl('?state=only')).toBeNull();
  });

  test('forwards only the documented keys', () => {
    expect(FORWARDED_KEYS).toEqual(['code', 'state', 'error', 'error_description']);
  });
});
