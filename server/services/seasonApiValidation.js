const { sanitizeUserId } = require('./metaApiValidation');

function sanitizeText(value, maxLen = 160) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  return text.slice(0, Math.max(1, Number(maxLen) || 160));
}

function sanitizeSeasonId(value = '') {
  const seasonId = sanitizeText(value, 80).toLowerCase();
  if (!seasonId) return '';
  if (!/^[a-z0-9_:\-./]{3,80}$/.test(seasonId)) return '';
  return seasonId;
}

function sanitizeTrackId(value = '') {
  const trackId = sanitizeText(value, 24).toLowerCase();
  if (!trackId || !['solo', 'party'].includes(trackId)) return '';
  return trackId;
}

function sanitizeEventId(value = '') {
  const eventId = sanitizeText(value, 160).toLowerCase();
  if (!eventId) return '';
  if (!/^[a-z0-9_:\-./]{4,160}$/.test(eventId)) return '';
  return eventId;
}

function sanitizeMilestoneId(value = '') {
  const milestoneId = sanitizeText(value, 80).toLowerCase();
  if (!milestoneId) return '';
  if (!/^[a-z0-9_:\-./]{3,80}$/.test(milestoneId)) return '';
  return milestoneId;
}

function sanitizeMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

function sanitizeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function validateSeasonLeaderboardQuery(query = {}) {
  const safe = query && typeof query === 'object' ? query : {};
  const trackId = sanitizeTrackId(safe.trackId || safe.track || '');
  if (!trackId) return { ok: false, code: 'invalid_track_id' };
  const seasonId = sanitizeSeasonId(safe.seasonId || '');
  const userId = sanitizeUserId(safe.userId || '');
  const limit = Number(safe.limit);
  return {
    ok: true,
    value: {
      seasonId,
      trackId,
      userId,
      limit: Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.round(limit))) : 50
    }
  };
}

function validateSeasonProfileQuery({ params = {}, query = {} } = {}) {
  const userId = sanitizeUserId(params && params.userId || '');
  if (!userId) return { ok: false, code: 'invalid_user_id' };
  const seasonId = sanitizeSeasonId(query && query.seasonId || '');
  const includeHistory = sanitizeBool(query && query.includeHistory, true);
  const historyLimit = Number(query && query.historyLimit);
  return {
    ok: true,
    value: {
      userId,
      seasonId,
      includeHistory,
      historyLimit: Number.isFinite(historyLimit) ? Math.max(1, Math.min(20, Math.round(historyLimit))) : 5
    }
  };
}

function validatePartyParticipant(row = {}) {
  const safe = row && typeof row === 'object' ? row : {};
  const userId = sanitizeUserId(safe.userId || '');
  if (!userId) return null;
  return {
    userId,
    placement: Math.max(1, Math.min(20, Math.round(Number(safe.placement) || 1))),
    teamworkScore: Math.max(0, Math.min(10, Math.round(Number(safe.teamworkScore) || 0))),
    sportsmanshipScore: Math.max(0, Math.min(5, Math.round(Number(safe.sportsmanshipScore) || 0))),
    won: safe.won === true
  };
}

function validateSeasonPartyResult(body = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  const seasonId = sanitizeSeasonId(payload.seasonId || '');
  const eventId = sanitizeEventId(payload.eventId || '');
  const matchId = sanitizeText(payload.matchId || '', 120);
  const participants = Array.isArray(payload.participants)
    ? payload.participants.map((row) => validatePartyParticipant(row)).filter(Boolean)
    : [];
  if (!eventId || !participants.length) return { ok: false, code: 'invalid_party_result_payload' };
  return {
    ok: true,
    value: {
      seasonId,
      eventId,
      matchId,
      participants,
      nowMs: sanitizeMs(payload.nowMs) || Date.now()
    }
  };
}

function validateSeasonMilestoneClaim(body = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  const userId = sanitizeUserId(payload.userId || '');
  const milestoneId = sanitizeMilestoneId(payload.milestoneId || '');
  const idempotencyKey = sanitizeEventId(payload.idempotencyKey || '');
  const seasonId = sanitizeSeasonId(payload.seasonId || '');
  if (!userId || !milestoneId || !idempotencyKey) {
    return { ok: false, code: 'invalid_milestone_claim_payload' };
  }
  return {
    ok: true,
    value: {
      userId,
      milestoneId,
      idempotencyKey,
      seasonId,
      nowMs: sanitizeMs(payload.nowMs) || Date.now()
    }
  };
}

function validateSeasonAdminOpen(body = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  return {
    ok: true,
    value: {
      seasonId: sanitizeSeasonId(payload.seasonId || ''),
      name: sanitizeText(payload.name || '', 120),
      startsAtMs: sanitizeMs(payload.startsAtMs),
      endsAtMs: sanitizeMs(payload.endsAtMs),
      dryRun: sanitizeBool(payload.dryRun, false),
      nowMs: sanitizeMs(payload.nowMs) || Date.now()
    }
  };
}

function validateSeasonAdminClose(body = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  return {
    ok: true,
    value: {
      seasonId: sanitizeSeasonId(payload.seasonId || ''),
      dryRun: sanitizeBool(payload.dryRun, false),
      nowMs: sanitizeMs(payload.nowMs) || Date.now()
    }
  };
}

module.exports = {
  validateSeasonLeaderboardQuery,
  validateSeasonProfileQuery,
  validateSeasonPartyResult,
  validateSeasonMilestoneClaim,
  validateSeasonAdminOpen,
  validateSeasonAdminClose
};
