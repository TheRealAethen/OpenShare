const SkipReason = Object.freeze({
  ALREADY_UPLOADED: 'SKIPPED_ALREADY_UPLOADED',
  NOT_ELIGIBLE_STATUS: 'SKIPPED_NOT_ELIGIBLE_STATUS',
  NOT_DUE: 'SKIPPED_NOT_DUE',
  QUOTA_REACHED: 'SKIPPED_QUOTA_REACHED',
  IN_FLIGHT: 'SKIPPED_IN_FLIGHT',
});

const SkipMessage = Object.freeze({
  [SkipReason.ALREADY_UPLOADED]: 'already uploaded',
  [SkipReason.NOT_ELIGIBLE_STATUS]: 'status is not eligible for upload',
  [SkipReason.NOT_DUE]: 'scheduled for a later date',
  [SkipReason.QUOTA_REACHED]: 'daily upload quota reached',
  [SkipReason.IN_FLIGHT]: 'already being uploaded in this run',
});

const ELIGIBLE_STATUSES = Object.freeze(['pending', 'failed']);

function evaluateFile(file, now) {
  if (file.status === 'uploaded') return SkipReason.ALREADY_UPLOADED;
  if (!ELIGIBLE_STATUSES.includes(file.status)) return SkipReason.NOT_ELIGIBLE_STATUS;
  if (file.scheduledAt && new Date(file.scheduledAt).getTime() > now) return SkipReason.NOT_DUE;
  return null;
}

function selectEligibleFiles(files, { now, remainingQuota }) {
  const selected = [];
  const skipped = [];
  for (const file of files) {
    const reason = evaluateFile(file, now);
    if (reason) skipped.push({ file, reason });
    else if (selected.length < remainingQuota) selected.push(file);
    else skipped.push({ file, reason: SkipReason.QUOTA_REACHED });
  }
  return { selected, skipped };
}

module.exports = { SkipReason, SkipMessage, evaluateFile, selectEligibleFiles };
