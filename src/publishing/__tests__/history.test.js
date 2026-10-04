jest.mock('electron', () => ({ app: { getPath: () => '/unused' } }));
jest.mock('electron-store', () => class FakeStore {
  constructor() { this.map = new Map(); }
  get(key, fallback) { return this.map.has(key) ? this.map.get(key) : fallback; }
  set(key, value) { this.map.set(key, value); }
});

const { appendHistory, getHistory } = require('../storage');

const entry = (fileName, platform, status, extra = {}) => ({
  jobId: 'job-' + fileName,
  fileName,
  title: fileName,
  platform,
  status,
  timestamp: new Date(Date.UTC(2026, 9, 4, 12, 0, 0)).toISOString(),
  errorMessage: status === 'failed' ? 'boom' : null,
  platformPostId: status === 'uploaded' ? 'id-' + fileName : null,
  ...extra,
});

describe('upload history storage', () => {
  test('appending keeps existing entries', () => {
    appendHistory('pAppend', [entry('one.mp4', 'youtube', 'uploaded')]);
    appendHistory('pAppend', [entry('two.mp4', 'tiktok', 'failed')]);

    const { items, total } = getHistory('pAppend');

    expect(total).toBe(2);
    expect(items.map((e) => e.fileName)).toEqual(['two.mp4', 'one.mp4']);
  });

  test('querying profile A never returns profile B records', () => {
    appendHistory('pIsoA', [entry('a.mp4', 'youtube', 'uploaded')]);
    appendHistory('pIsoB', [entry('b.mp4', 'youtube', 'uploaded'), entry('b2.mp4', 'tiktok', 'failed')]);

    expect(getHistory('pIsoA').items.map((e) => e.fileName)).toEqual(['a.mp4']);
    expect(getHistory('pIsoB').total).toBe(2);
    expect(getHistory('pIsoC')).toEqual({ items: [], total: 0 });
  });

  test('filters by platform and status and paginates newest first', () => {
    appendHistory('pFilter', [
      entry('1.mp4', 'youtube', 'uploaded'),
      entry('2.mp4', 'youtube', 'failed'),
      entry('3.mp4', 'tiktok', 'uploaded'),
      entry('4.mp4', 'youtube', 'uploaded'),
    ]);

    const youtubeOk = getHistory('pFilter', { platform: 'youtube', status: 'uploaded' });
    expect(youtubeOk.total).toBe(2);
    expect(youtubeOk.items.map((e) => e.fileName)).toEqual(['4.mp4', '1.mp4']);

    const page = getHistory('pFilter', { limit: 2, offset: 2 });
    expect(page.total).toBe(4);
    expect(page.items.map((e) => e.fileName)).toEqual(['2.mp4', '1.mp4']);
  });
});
