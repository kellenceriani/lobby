const { sanitizeUserId } = require('./metaApiValidation');

function sanitizeText(value, maxLen = 160) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  return text.slice(0, Math.max(1, Number(maxLen) || 160));
}

function sanitizeModeId(value) {
  const modeId = sanitizeText(value, 64).toLowerCase();
  if (!modeId) return '';
  if (!/^[a-z0-9_:-]{3,64}$/.test(modeId)) return '';
  return modeId;
}

function sanitizeRunId(value) {
  const runId = sanitizeText(value, 160);
  if (!runId) return '';
  if (!/^[A-Za-z0-9:_-]{6,160}$/.test(runId)) return '';
  return runId;
}

function sanitizeIdempotencyKey(value) {
  const key = sanitizeText(value, 120);
  if (!key) return '';
  if (!/^[A-Za-z0-9:_\-/.]{6,120}$/.test(key)) return '';
  return key;
}

function sanitizeEntryValue(value) {
  const entry = sanitizeText(value, 80).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!entry || entry.length < 2) return '';
  return entry;
}

function sanitizeMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

function sanitizeBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return false;
}

function sanitizeEntries(entries) {
  const safe = entries && typeof entries === 'object' ? entries : null;
  if (!safe) return null;
  const normalized = {};
  const slots = ['lead', 'anchor', 'wildcard', 'closer'];
  for (let i = 0; i < slots.length; i += 1) {
    const slotId = slots[i];
    const entry = sanitizeEntryValue(safe[slotId]);
    if (!entry) return null;
    normalized[slotId] = entry;
  }
  return normalized;
}

function validateSoloRunStart(body = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  const userId = sanitizeUserId(payload.userId || '');
  if (!userId) return { ok: false, code: 'invalid_user_id' };
  const modeId = sanitizeModeId(payload.modeId || '') || 'daily_cipher_clash';
  return {
    ok: true,
    value: {
      userId,
      modeId,
      practice: sanitizeBoolean(payload.practice),
      clientStartedAtMs: sanitizeMs(payload.clientStartedAtMs)
    }
  };
}

function validateSoloSubmitAttempt(body = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  const userId = sanitizeUserId(payload.userId || '');
  const runId = sanitizeRunId(payload.runId || '');
  const idempotencyKey = sanitizeIdempotencyKey(payload.idempotencyKey || '');
  const entriesBySlot = sanitizeEntries(
    payload.entriesBySlot
    || payload.entries
    || payload.picks
    || payload.picksBySlot
  );
  if (!userId || !runId || !idempotencyKey || !entriesBySlot) {
    return { ok: false, code: 'invalid_submit_payload' };
  }
  return {
    ok: true,
    value: {
      userId,
      runId,
      idempotencyKey,
      entriesBySlot,
      clientSubmittedAtMs: sanitizeMs(payload.clientSubmittedAtMs)
    }
  };
}

function validateSoloHintRequest(body = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  const userId = sanitizeUserId(payload.userId || '');
  const runId = sanitizeRunId(payload.runId || '');
  const idempotencyKey = sanitizeIdempotencyKey(payload.idempotencyKey || '');
  if (!userId || !runId || !idempotencyKey) {
    return { ok: false, code: 'invalid_hint_payload' };
  }
  return {
    ok: true,
    value: {
      userId,
      runId,
      idempotencyKey,
      clientRequestedAtMs: sanitizeMs(payload.clientRequestedAtMs)
    }
  };
}

function validateSoloFinalize(body = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  const userId = sanitizeUserId(payload.userId || '');
  const runId = sanitizeRunId(payload.runId || '');
  const idempotencyKey = sanitizeIdempotencyKey(payload.idempotencyKey || '');
  if (!userId || !runId || !idempotencyKey) {
    return { ok: false, code: 'invalid_finalize_payload' };
  }
  return {
    ok: true,
    value: {
      userId,
      runId,
      idempotencyKey,
      clientFinalizedAtMs: sanitizeMs(payload.clientFinalizedAtMs)
    }
  };
}

function validateSoloLeaderboardQuery(query = {}) {
  const safe = query && typeof query === 'object' ? query : {};
  const modeId = sanitizeModeId(safe.modeId || '') || 'daily_cipher_clash';
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(safe.dateKey || ''))
    ? String(safe.dateKey)
    : '';
  const limit = Number(safe.limit);
  const userId = sanitizeUserId(safe.userId || '');
  return {
    ok: true,
    value: {
      modeId,
      dateKey,
      limit: Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.round(limit))) : 50,
      userId
    }
  };
}

module.exports = {
  validateSoloRunStart,
  validateSoloSubmitAttempt,
  validateSoloHintRequest,
  validateSoloFinalize,
  validateSoloLeaderboardQuery
};
