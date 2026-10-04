const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const mockState = { files: {}, profileRoot: null, quotaUsed: 0, history: {} };
const mockUploadToPlatform = jest.fn();

jest.mock('../storage', () => {
  const PLATFORMS = ['tiktok', 'youtube', 'instagram'];
  const profile = {
    id: 'p1',
    auth: {
      tiktok: { access_token: 't' },
      youtube: { access_token: 'y' },
      instagram: { access_token: 'i', user_id: 'u' },
    },
  };
  return {
    DAILY_LIMIT: 30,
    PLATFORMS,
    getProfiles: () => [profile],
    getProfile: () => profile,
    saveProfiles: () => {},
    getQuota: () => ({ date: '2026-10-04', used: mockState.quotaUsed }),
    incrementQuota: (_pid, count) => { mockState.quotaUsed += count; },
    listFiles: () => Object.entries(mockState.files).map(([name, f]) => ({
      name,
      path: '/videos/' + name,
      scheduledAt: null,
      privacy: 'private',
      madeForKids: false,
      title: null,
      desc: null,
      platforms: PLATFORMS,
      platformResults: null,
      lastError: null,
      uploadedAt: null,
      ...f,
    })),
    appendHistory: (pid, entries) => {
      mockState.history[pid] = (mockState.history[pid] || []).concat(entries);
    },
    setFileMeta: (_pid, name, patch) => {
      mockState.files[name] = { ...(mockState.files[name] || {}), ...patch };
    },
    profileDir: () => mockState.profileRoot,
  };
});

jest.mock('../../uploader', () => ({ uploadToPlatform: (...args) => mockUploadToPlatform(...args) }));
jest.mock('../../auth', () => ({ loadSecrets: () => ({}) }));

const engine = require('../publishingEngine');

const PLATFORMS = ['tiktok', 'youtube', 'instagram'];

beforeEach(() => {
  mockState.files = { 'clip.mp4': { status: 'pending' } };
  mockState.quotaUsed = 0;
  mockState.history = {};
  mockUploadToPlatform.mockReset();
  mockUploadToPlatform.mockImplementation(async (platform) => ({ id: platform + '-id' }));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('idempotent upload status', () => {
  test('re-running a profile never re-uploads an already-uploaded file', async () => {
    mockState.files = {
      'clip.mp4': {
        status: 'uploaded',
        platformResults: Object.fromEntries(PLATFORMS.map((p) => [p, { ok: true, id: p }])),
      },
    };

    await engine.runDailyForProfile('p1');
    await engine.runDailyForProfile('p1');

    expect(mockUploadToPlatform).not.toHaveBeenCalled();
  });

  test('a file uploaded by the first run is not uploaded again by a second run', async () => {
    await engine.runDailyForProfile('p1');
    await engine.runDailyForProfile('p1');

    expect(mockUploadToPlatform).toHaveBeenCalledTimes(PLATFORMS.length);
    expect(mockState.files['clip.mp4'].status).toBe('uploaded');
  });

  test('overlapping runs for the same profile upload each platform once', async () => {
    mockUploadToPlatform.mockImplementation(
      (platform) => new Promise((resolve) => setTimeout(() => resolve({ id: platform }), 10))
    );

    await Promise.all([
      engine.runDailyForProfile('p1'),
      engine.runDailyForProfile('p1'),
      engine.runDailyForProfile('p1'),
    ]);

    expect(mockUploadToPlatform).toHaveBeenCalledTimes(PLATFORMS.length);
  });

  test('a retry only re-uploads platforms that have not succeeded', async () => {
    let youtubeFails = true;
    mockUploadToPlatform.mockImplementation(async (platform) => {
      if (platform === 'youtube' && youtubeFails) throw new Error('network down');
      return { id: platform + '-id' };
    });

    await engine.runDailyForProfile('p1');
    expect(mockState.files['clip.mp4'].status).toBe('failed');
    expect(mockState.files['clip.mp4'].platformResults.tiktok.ok).toBe(true);

    youtubeFails = false;
    mockUploadToPlatform.mockClear();
    await engine.runDailyForProfile('p1');

    expect(mockUploadToPlatform.mock.calls.map((c) => c[0])).toEqual(['youtube']);
    expect(mockState.files['clip.mp4'].status).toBe('uploaded');
  });

  test('startup reset keeps per-platform results so a retry skips finished platforms', () => {
    mockState.profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openshare-test-'));
    const platformResults = { tiktok: { ok: true, id: 'tt' }, youtube: { ok: false, error: 'x' } };
    fs.writeFileSync(
      path.join(mockState.profileRoot, 'meta.json'),
      JSON.stringify({
        'clip.mp4': { status: 'uploading', platformResults },
        'failed.mp4': { status: 'failed', platformResults, failureReason: 'youtube: x' },
      })
    );

    engine.resetStaleUploadingStates();

    const meta = JSON.parse(fs.readFileSync(path.join(mockState.profileRoot, 'meta.json'), 'utf8'));
    expect(meta['clip.mp4'].status).toBe('pending');
    expect(meta['clip.mp4'].platformResults).toEqual(platformResults);
    expect(meta['failed.mp4'].status).toBe('failed');
    fs.rmSync(mockState.profileRoot, { recursive: true, force: true });
  });

  test('completed and failed platform attempts append to history without overwriting earlier entries', async () => {
    mockState.history = { p1: [{ jobId: 'old', fileName: 'old.mp4', platform: 'youtube', status: 'uploaded' }] };
    mockUploadToPlatform.mockImplementation(async (platform) => {
      if (platform === 'tiktok') throw new Error('rate limited');
      return { id: platform + '-post' };
    });

    await engine.runDailyForProfile('p1');

    const history = mockState.history.p1;
    expect(history[0]).toEqual({ jobId: 'old', fileName: 'old.mp4', platform: 'youtube', status: 'uploaded' });
    expect(history.slice(1).map((e) => [e.platform, e.status])).toEqual([
      ['tiktok', 'failed'],
      ['youtube', 'uploaded'],
      ['instagram', 'uploaded'],
    ]);
    expect(history[1]).toEqual(expect.objectContaining({ fileName: 'clip.mp4', errorMessage: 'rate limited', platformPostId: null }));
    expect(history[2]).toEqual(expect.objectContaining({ platformPostId: 'youtube-post', errorMessage: null }));
    expect(new Set(history.slice(1).map((e) => e.jobId)).size).toBe(1);
  });

  test('a past-due scheduled file is uploaded', async () => {
    mockState.files = { 'clip.mp4': { status: 'pending', scheduledAt: new Date(Date.now() - 60000).toISOString() } };

    await engine.runDailyForProfile('p1');

    expect(mockUploadToPlatform).toHaveBeenCalledTimes(PLATFORMS.length);
  });

  test('a future scheduled file is not uploaded', async () => {
    mockState.files = { 'clip.mp4': { status: 'pending', scheduledAt: new Date(Date.now() + 3600000).toISOString() } };

    const result = await engine.runDailyForProfile('p1');

    expect(mockUploadToPlatform).not.toHaveBeenCalled();
    expect(result.uploaded).toBe(0);
    expect(mockState.files['clip.mp4'].status).toBe('pending');
  });

  test('uploads stop at the daily quota and the rest stay pending', async () => {
    mockState.quotaUsed = 29;
    mockState.files = {
      'a.mp4': { status: 'pending' },
      'b.mp4': { status: 'pending' },
    };

    await engine.runDailyForProfile('p1');

    expect(mockUploadToPlatform).toHaveBeenCalledTimes(PLATFORMS.length);
    expect(mockState.files['a.mp4'].status).toBe('uploaded');
    expect(mockState.files['b.mp4'].status).toBe('pending');
    expect(mockState.quotaUsed).toBe(30);
  });
});
