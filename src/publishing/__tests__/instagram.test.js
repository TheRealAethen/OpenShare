const mockFetch = jest.fn();
jest.mock('node-fetch', () => (...args) => mockFetch(...args));

const {
  GRAPH_HOST,
  GRAPH_API_VERSION,
  CONTAINER_STATUS,
  createContainer,
  getContainerStatus,
  waitForContainerReady,
  publishContainer,
  publishReel,
} = require('../instagram');

function fakeResponse(body, ok = true, status = ok ? 200 : 400) {
  const text = JSON.stringify(body);
  return Promise.resolve({ ok, status, text: async () => text });
}

const ACCESS_TOKEN = 'ig-access-token';
const IG_USER_ID = '1789';
const VIDEO_URL = 'https://videos.example.com/clip.mp4';

beforeEach(() => mockFetch.mockReset());

describe('createContainer', () => {
  test('posts to graph.instagram.com with the token only in the header', async () => {
    mockFetch.mockResolvedValue(await fakeResponse({ id: 'container-1' }));

    const id = await createContainer({ accessToken: ACCESS_TOKEN, igUserId: IG_USER_ID, videoUrl: VIDEO_URL, caption: 'hi' });

    expect(id).toBe('container-1');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(`${GRAPH_HOST}/${GRAPH_API_VERSION}/${IG_USER_ID}/media`);
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(url).not.toContain(ACCESS_TOKEN);
    expect(options.body.get('access_token')).toBeNull();
    expect(options.body.get('media_type')).toBe('REELS');
    expect(options.body.get('video_url')).toBe(VIDEO_URL);
    expect(options.body.get('caption')).toBe('hi');
  });

  test('rejects a non-public video URL before calling the network', async () => {
    await expect(
      createContainer({ accessToken: ACCESS_TOKEN, igUserId: IG_USER_ID, videoUrl: '/local/path/clip.mp4' })
    ).rejects.toThrow(/https:\/\//);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('surfaces the Graph API error message', async () => {
    mockFetch.mockResolvedValue(await fakeResponse({ error: { message: 'Invalid video format', code: 2207026 } }, false));

    await expect(
      createContainer({ accessToken: ACCESS_TOKEN, igUserId: IG_USER_ID, videoUrl: VIDEO_URL })
    ).rejects.toThrow('Invalid video format');
  });

  test('fails clearly if Instagram returns no container id', async () => {
    mockFetch.mockResolvedValue(await fakeResponse({}));

    await expect(
      createContainer({ accessToken: ACCESS_TOKEN, igUserId: IG_USER_ID, videoUrl: VIDEO_URL })
    ).rejects.toThrow('did not return a media container id');
  });
});

describe('getContainerStatus', () => {
  test('requests status_code with the token in the header, not the query string', async () => {
    mockFetch.mockResolvedValue(await fakeResponse({ status_code: CONTAINER_STATUS.IN_PROGRESS }));

    const status = await getContainerStatus({ accessToken: ACCESS_TOKEN, containerId: 'container-1' });

    expect(status).toBe('IN_PROGRESS');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(`${GRAPH_HOST}/${GRAPH_API_VERSION}/container-1?fields=status_code`);
    expect(options.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
  });
});

describe('waitForContainerReady', () => {
  function fakeClock() {
    let elapsed = 0;
    return { now: () => elapsed, sleep: async (ms) => { elapsed += ms; } };
  }

  test('polls through IN_PROGRESS and resolves once FINISHED', async () => {
    mockFetch
      .mockResolvedValueOnce(await fakeResponse({ status_code: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(await fakeResponse({ status_code: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(await fakeResponse({ status_code: 'FINISHED' }));
    const { now, sleep } = fakeClock();

    const status = await waitForContainerReady({ accessToken: ACCESS_TOKEN, containerId: 'c1', sleep, now, pollIntervalMs: 1000 });

    expect(status).toBe('FINISHED');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test('throws immediately on ERROR without retrying', async () => {
    mockFetch.mockResolvedValue(await fakeResponse({ status_code: 'ERROR' }));
    const { now, sleep } = fakeClock();

    await expect(
      waitForContainerReady({ accessToken: ACCESS_TOKEN, containerId: 'c1', sleep, now })
    ).rejects.toThrow('failed with status ERROR');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('throws on EXPIRED', async () => {
    mockFetch.mockResolvedValue(await fakeResponse({ status_code: 'EXPIRED' }));
    const { now, sleep } = fakeClock();

    await expect(
      waitForContainerReady({ accessToken: ACCESS_TOKEN, containerId: 'c1', sleep, now })
    ).rejects.toThrow('failed with status EXPIRED');
  });

  test('gives up after the timeout without a real delay', async () => {
    mockFetch.mockResolvedValue(await fakeResponse({ status_code: 'IN_PROGRESS' }));
    const { now, sleep } = fakeClock();

    await expect(
      waitForContainerReady({ accessToken: ACCESS_TOKEN, containerId: 'c1', sleep, now, pollIntervalMs: 1000, timeoutMs: 3000 })
    ).rejects.toThrow(/did not finish processing/);
  });
});

describe('publishContainer', () => {
  test('posts creation_id with the token only in the header', async () => {
    mockFetch.mockResolvedValue(await fakeResponse({ id: 'media-1' }));

    const id = await publishContainer({ accessToken: ACCESS_TOKEN, igUserId: IG_USER_ID, containerId: 'c1' });

    expect(id).toBe('media-1');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(`${GRAPH_HOST}/${GRAPH_API_VERSION}/${IG_USER_ID}/media_publish`);
    expect(options.body.get('creation_id')).toBe('c1');
    expect(options.body.get('access_token')).toBeNull();
  });

  test('surfaces the Graph API error message', async () => {
    mockFetch.mockResolvedValue(await fakeResponse({ error: { message: 'Media is not ready' } }, false));

    await expect(
      publishContainer({ accessToken: ACCESS_TOKEN, igUserId: IG_USER_ID, containerId: 'c1' })
    ).rejects.toThrow('Media is not ready');
  });
});

describe('publishReel', () => {
  test('runs create, poll, and publish in order and returns the published id', async () => {
    mockFetch
      .mockResolvedValueOnce(await fakeResponse({ id: 'container-1' }))
      .mockResolvedValueOnce(await fakeResponse({ status_code: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(await fakeResponse({ status_code: 'FINISHED' }))
      .mockResolvedValueOnce(await fakeResponse({ id: 'media-1' }));
    const sleep = jest.fn().mockResolvedValue(undefined);

    const result = await publishReel({
      accessToken: ACCESS_TOKEN,
      igUserId: IG_USER_ID,
      videoUrl: VIDEO_URL,
      caption: 'hello',
      pollIntervalMs: 10,
      sleep,
    });

    expect(result).toEqual({ id: 'media-1' });
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch.mock.calls[0][0]).toContain('/media');
    expect(mockFetch.mock.calls[3][0]).toContain('/media_publish');
  });
});
