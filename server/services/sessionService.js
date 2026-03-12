const crypto = require('crypto');
const { sanitizeText } = require('../storage/metaStoreAdapter');

const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_MIN_INTERVAL_MS = 5 * 60 * 1000;
const MAX_SESSIONS_PER_USER = Math.max(2, Number(process.env.MAX_SESSIONS_PER_USER) || 8);

function normalizeAuthMode(value = '') {
  const safe = String(value || '').trim().toLowerCase();
  if (safe === 'local' || safe === 'google') return safe;
  return 'guest';
}

function normalizeSessionToken(value = '') {
  const safe = sanitizeText(value, 1024);
  if (!safe) return '';
  if (!/^[A-Za-z0-9._\-~]+$/.test(safe)) return '';
  if (safe.length < 24) return '';
  return safe;
}

function tokenHash(token = '') {
  const safe = normalizeSessionToken(token);
  if (!safe) return '';
  return crypto.createHash('sha256').update(safe).digest('hex');
}

function makeSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function makeSessionId() {
  return `sess_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
}

function readSessionTtlMs() {
  const configured = Number(process.env.SESSION_TTL_MS);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_SESSION_TTL_MS;
  return Math.max(60 * 60 * 1000, Math.floor(configured));
}

function sessionView(row = {}) {
  return {
    sessionId: String(row.sessionId || '').trim(),
    userId: String(row.userId || '').trim(),
    authMode: normalizeAuthMode(row.authMode || ''),
    createdAtMs: Math.max(0, Number(row.createdAtMs) || 0),
    lastSeenAtMs: Math.max(0, Number(row.lastSeenAtMs) || 0),
    expiresAtMs: Math.max(0, Number(row.expiresAtMs) || 0)
  };
}

function pruneExpiredInPlace(state, nowMs = Date.now()) {
  const sessions = state.authSessionsByTokenHash && typeof state.authSessionsByTokenHash === 'object'
    ? state.authSessionsByTokenHash
    : {};
  state.authSessionsByTokenHash = sessions;
  let removed = 0;
  Object.keys(sessions).forEach((hashKey) => {
    const row = sessions[hashKey];
    if (!row || typeof row !== 'object') {
      delete sessions[hashKey];
      removed += 1;
      return;
    }
    const expiresAtMs = Math.max(0, Number(row.expiresAtMs) || 0);
    const revokedAtMs = Math.max(0, Number(row.revokedAtMs) || 0);
    const userId = sanitizeText(row.userId || '', 120);
    if (!userId || revokedAtMs > 0 || expiresAtMs <= nowMs) {
      delete sessions[hashKey];
      removed += 1;
    }
  });
  return removed;
}

function pruneUserSessionOverflowInPlace(state, userId = '', nowMs = Date.now()) {
  const sessions = state.authSessionsByTokenHash && typeof state.authSessionsByTokenHash === 'object'
    ? state.authSessionsByTokenHash
    : {};
  const safeUserId = sanitizeText(userId, 120);
  if (!safeUserId) return 0;

  const rows = Object.entries(sessions)
    .filter((entry) => {
      const row = entry && entry[1] && typeof entry[1] === 'object' ? entry[1] : null;
      if (!row) return false;
      if (sanitizeText(row.userId || '', 120) !== safeUserId) return false;
      const revokedAtMs = Math.max(0, Number(row.revokedAtMs) || 0);
      const expiresAtMs = Math.max(0, Number(row.expiresAtMs) || 0);
      if (revokedAtMs > 0 || expiresAtMs <= nowMs) return false;
      return true;
    })
    .sort((a, b) => {
      const rowA = a[1] || {};
      const rowB = b[1] || {};
      return (Number(rowA.lastSeenAtMs) || 0) - (Number(rowB.lastSeenAtMs) || 0);
    });
  if (rows.length <= MAX_SESSIONS_PER_USER) return 0;
  const overflow = rows.length - MAX_SESSIONS_PER_USER;
  for (let i = 0; i < overflow; i += 1) {
    const key = rows[i][0];
    delete sessions[key];
  }
  return overflow;
}

function buildSessionService({ adapter }) {
  if (!adapter) throw new Error('session_service_adapter_required');

  function createSession({
    userId = '',
    authMode = 'guest',
    nowMs = Date.now()
  } = {}) {
    const safeUserId = sanitizeText(userId, 120);
    if (!safeUserId) return { ok: false, code: 'invalid_user_id' };
    const safeAuthMode = normalizeAuthMode(authMode);
    const ttlMs = readSessionTtlMs();

    let issued = null;
    adapter.writeState((state) => {
      if (!state.users || !state.users[safeUserId]) {
        issued = { ok: false, code: 'user_not_found' };
        return;
      }
      pruneExpiredInPlace(state, nowMs);

      let token = '';
      let hash = '';
      // Guard against an extremely unlikely token hash collision.
      for (let attempt = 0; attempt < 8; attempt += 1) {
        token = makeSessionToken();
        hash = tokenHash(token);
        if (!hash) continue;
        if (!state.authSessionsByTokenHash[hash]) break;
      }
      if (!token || !hash || state.authSessionsByTokenHash[hash]) {
        issued = { ok: false, code: 'session_issue_failed' };
        return;
      }

      const sessionId = makeSessionId();
      const row = {
        sessionId,
        userId: safeUserId,
        authMode: safeAuthMode,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
        lastSeenAtMs: nowMs,
        expiresAtMs: nowMs + ttlMs,
        revokedAtMs: 0
      };
      state.authSessionsByTokenHash[hash] = row;
      pruneUserSessionOverflowInPlace(state, safeUserId, nowMs);
      issued = {
        ok: true,
        sessionToken: token,
        session: sessionView(row)
      };
    });
    return issued || { ok: false, code: 'session_issue_failed' };
  }

  function resolveSession(sessionToken = '', { touch = true, nowMs = Date.now() } = {}) {
    const safeToken = normalizeSessionToken(sessionToken);
    if (!safeToken) return { ok: false, code: 'missing_session_token' };
    const hash = tokenHash(safeToken);
    if (!hash) return { ok: false, code: 'invalid_session_token' };
    const state = adapter.readState();
    const sessions = state.authSessionsByTokenHash && typeof state.authSessionsByTokenHash === 'object'
      ? state.authSessionsByTokenHash
      : {};
    const row = sessions[hash];
    if (!row || typeof row !== 'object') {
      return { ok: false, code: 'session_not_found' };
    }

    const userId = sanitizeText(row.userId || '', 120);
    const expiresAtMs = Math.max(0, Number(row.expiresAtMs) || 0);
    const revokedAtMs = Math.max(0, Number(row.revokedAtMs) || 0);
    if (!userId || revokedAtMs > 0 || expiresAtMs <= nowMs || !state.users || !state.users[userId]) {
      adapter.writeState((draft) => {
        if (draft.authSessionsByTokenHash && draft.authSessionsByTokenHash[hash]) {
          delete draft.authSessionsByTokenHash[hash];
        }
      });
      return { ok: false, code: 'session_not_found' };
    }

    const lastSeenAtMs = Math.max(0, Number(row.lastSeenAtMs) || 0);
    if (touch === true && ((nowMs - lastSeenAtMs) >= SESSION_TOUCH_MIN_INTERVAL_MS)) {
      adapter.writeState((draft) => {
        const sessionRow = draft.authSessionsByTokenHash && draft.authSessionsByTokenHash[hash];
        if (!sessionRow || typeof sessionRow !== 'object') return;
        sessionRow.lastSeenAtMs = nowMs;
        sessionRow.updatedAtMs = nowMs;
      });
      return {
        ok: true,
        session: sessionView({
          ...row,
          lastSeenAtMs: nowMs,
          updatedAtMs: nowMs
        })
      };
    }

    return {
      ok: true,
      session: sessionView(row)
    };
  }

  function revokeSession(sessionToken = '', { nowMs = Date.now() } = {}) {
    const safeToken = normalizeSessionToken(sessionToken);
    if (!safeToken) return { ok: false, code: 'missing_session_token' };
    const hash = tokenHash(safeToken);
    if (!hash) return { ok: false, code: 'invalid_session_token' };

    let result = null;
    adapter.writeState((state) => {
      pruneExpiredInPlace(state, nowMs);
      if (!state.authSessionsByTokenHash[hash]) {
        result = { ok: true, idempotent: true };
        return;
      }
      delete state.authSessionsByTokenHash[hash];
      result = { ok: true, idempotent: false };
    });
    return result || { ok: true, idempotent: true };
  }

  function pruneExpiredSessions({ nowMs = Date.now() } = {}) {
    let removed = 0;
    adapter.writeState((state) => {
      removed = pruneExpiredInPlace(state, nowMs);
    });
    return { ok: true, removed };
  }

  return {
    createSession,
    resolveSession,
    revokeSession,
    pruneExpiredSessions
  };
}

module.exports = {
  buildSessionService
};
