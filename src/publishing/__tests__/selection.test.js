const { SkipReason, selectEligibleFiles } = require('../selection');

const NOW = Date.parse('2026-10-04T12:00:00.000Z');
const PAST = new Date(NOW - 60000).toISOString();
const FUTURE = new Date(NOW + 60000).toISOString();

const file = (name, fields = {}) => ({ name, status: 'pending', scheduledAt: null, ...fields });

describe('selectEligibleFiles', () => {
  test('selects pending files with no schedule', () => {
    const { selected, skipped } = selectEligibleFiles([file('a.mp4')], { now: NOW, remainingQuota: 30 });
    expect(selected.map((f) => f.name)).toEqual(['a.mp4']);
    expect(skipped).toEqual([]);
  });

  test('selects past-due pending files', () => {
    const { selected } = selectEligibleFiles([file('a.mp4', { scheduledAt: PAST })], { now: NOW, remainingQuota: 30 });
    expect(selected.map((f) => f.name)).toEqual(['a.mp4']);
  });

  test('skips future scheduled files with SKIPPED_NOT_DUE', () => {
    const { selected, skipped } = selectEligibleFiles(
      [file('later.mp4', { scheduledAt: FUTURE })],
      { now: NOW, remainingQuota: 30 }
    );
    expect(selected).toEqual([]);
    expect(skipped).toEqual([{ file: expect.objectContaining({ name: 'later.mp4' }), reason: SkipReason.NOT_DUE }]);
  });

  test('skips uploaded files with SKIPPED_ALREADY_UPLOADED', () => {
    const { selected, skipped } = selectEligibleFiles([file('done.mp4', { status: 'uploaded' })], { now: NOW, remainingQuota: 30 });
    expect(selected).toEqual([]);
    expect(skipped[0].reason).toBe(SkipReason.ALREADY_UPLOADED);
  });

  test('skips files in an unknown or in-progress status', () => {
    const { skipped } = selectEligibleFiles([file('x.mp4', { status: 'uploading' })], { now: NOW, remainingQuota: 30 });
    expect(skipped[0].reason).toBe(SkipReason.NOT_ELIGIBLE_STATUS);
  });

  test('selects failed files for retry', () => {
    const { selected } = selectEligibleFiles([file('retry.mp4', { status: 'failed' })], { now: NOW, remainingQuota: 30 });
    expect(selected.map((f) => f.name)).toEqual(['retry.mp4']);
  });

  test('skips eligible files beyond the remaining quota with SKIPPED_QUOTA_REACHED', () => {
    const files = [file('a.mp4'), file('b.mp4'), file('c.mp4')];
    const { selected, skipped } = selectEligibleFiles(files, { now: NOW, remainingQuota: 2 });
    expect(selected.map((f) => f.name)).toEqual(['a.mp4', 'b.mp4']);
    expect(skipped.map((s) => [s.file.name, s.reason])).toEqual([['c.mp4', SkipReason.QUOTA_REACHED]]);
  });

  test('zero remaining quota skips every eligible file', () => {
    const { selected, skipped } = selectEligibleFiles([file('a.mp4')], { now: NOW, remainingQuota: 0 });
    expect(selected).toEqual([]);
    expect(skipped[0].reason).toBe(SkipReason.QUOTA_REACHED);
  });

  test('quota is spent only on eligible files', () => {
    const files = [file('done.mp4', { status: 'uploaded' }), file('later.mp4', { scheduledAt: FUTURE }), file('a.mp4')];
    const { selected } = selectEligibleFiles(files, { now: NOW, remainingQuota: 1 });
    expect(selected.map((f) => f.name)).toEqual(['a.mp4']);
  });

  test('does not mutate the input files', () => {
    const files = [file('retry.mp4', { status: 'failed' })];
    selectEligibleFiles(files, { now: NOW, remainingQuota: 30 });
    expect(files[0].status).toBe('failed');
  });
});
