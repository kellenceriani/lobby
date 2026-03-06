const fs = require('fs');
const path = require('path');

const TELEMETRY_SCHEMA_VERSION = 1;
const RECONNECT_WINDOW_MS = Math.max(1000, Number(process.env.PARTY_TELEMETRY_RECONNECT_WINDOW_MS) || 120000);
const TELEMETRY_ENABLED = !['0', 'false', 'no', 'off'].includes(
  String(process.env.PARTY_TELEMETRY_ENABLED || 'true').trim().toLowerCase()
);
const DEFAULT_LOG_PATH = path.join(process.cwd(), '.runtime', 'telemetry', 'party-events.ndjson');

const recentDisconnects = new Map();
let telemetryStream = null;
let streamInitFailed = false;

function getPartyTelemetryLogPath() {
  const configured = String(process.env.PARTY_TELEMETRY_LOG_PATH || '').trim();
  if (!configured) return DEFAULT_LOG_PATH;
  if (path.isAbsolute(configured)) return configured;
  return path.join(process.cwd(), configured);
}

function ensureLogStream() {
  if (!TELEMETRY_ENABLED) return null;
  if (streamInitFailed) return null;
  if (telemetryStream) return telemetryStream;
  try {
    const targetPath = getPartyTelemetryLogPath();
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    telemetryStream = fs.createWriteStream(targetPath, { flags: 'a' });
    telemetryStream.on('error', (error) => {
      streamInitFailed = true;
      console.warn(`[Party telemetry] Stream error: ${String(error && error.message || 'unknown')}`);
    });
    return telemetryStream;
  } catch (error) {
    streamInitFailed = true;
    console.warn(`[Party telemetry] Failed to initialize log stream: ${String(error && error.message || 'unknown')}`);
    return null;
  }
}

function coerceText(value, { maxLen = 120, allowEmpty = false } = {}) {
  const text = String(value == null ? '' : value).trim();
  if (!text && !allowEmpty) return null;
  return text.slice(0, Math.max(1, maxLen));
}

function coerceInteger(value, { min = 0, max = Number.MAX_SAFE_INTEGER, allowNull = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return allowNull ? null : null;
  const rounded = Math.round(parsed);
  if (rounded < min || rounded > max) return allowNull ? null : null;
  return rounded;
}

function coerceBoolean(value) {
  return value === true;
}

function validateRequiredRoomCode(payload) {
  return coerceText(payload && payload.roomCode, { maxLen: 32 });
}

function validateEventPayload(eventType, payload = {}) {
  const roomCode = validateRequiredRoomCode(payload);
  if (!roomCode) return { ok: false, reason: 'roomCode_required' };

  if (eventType === 'room_created') {
    const maxPlayers = coerceInteger(payload.maxPlayers, { min: 1, max: 12 });
    if (!maxPlayers) return { ok: false, reason: 'maxPlayers_required' };
    return {
      ok: true,
      value: {
        roomCode,
        maxPlayers,
        categoriesMode: coerceText(payload.categoriesMode, { maxLen: 40, allowEmpty: true }) || null
      }
    };
  }

  if (eventType === 'player_joined') {
    const playerName = coerceText(payload.playerName, { maxLen: 80 });
    const playerCount = coerceInteger(payload.playerCount, { min: 0, max: 32 });
    if (!playerName || playerCount == null) return { ok: false, reason: 'player_joined_required_fields' };
    return {
      ok: true,
      value: {
        roomCode,
        playerName,
        playerCount,
        hostName: coerceText(payload.hostName, { maxLen: 80, allowEmpty: true }) || null,
        joinAsHost: coerceBoolean(payload.joinAsHost),
        isReconnect: coerceBoolean(payload.isReconnect)
      }
    };
  }

  if (eventType === 'player_left') {
    const playerName = coerceText(payload.playerName, { maxLen: 80 });
    const playerCount = coerceInteger(payload.playerCount, { min: 0, max: 32 });
    if (!playerName || playerCount == null) return { ok: false, reason: 'player_left_required_fields' };
    return {
      ok: true,
      value: {
        roomCode,
        playerName,
        playerCount,
        disconnectReason: coerceText(payload.disconnectReason, { maxLen: 80, allowEmpty: true }) || null,
        wasHost: coerceBoolean(payload.wasHost)
      }
    };
  }

  if (eventType === 'player_reconnected') {
    const playerName = coerceText(payload.playerName, { maxLen: 80 });
    const playerCount = coerceInteger(payload.playerCount, { min: 0, max: 32 });
    const reconnectWindowMs = coerceInteger(payload.reconnectWindowMs, { min: 0, max: 600000 });
    if (!playerName || playerCount == null || reconnectWindowMs == null) {
      return { ok: false, reason: 'player_reconnected_required_fields' };
    }
    return {
      ok: true,
      value: {
        roomCode,
        playerName,
        playerCount,
        reconnectWindowMs
      }
    };
  }

  if (eventType === 'phase_transition') {
    const fromPhase = coerceText(payload.fromPhase, { maxLen: 60 });
    const toPhase = coerceText(payload.toPhase, { maxLen: 60 });
    const roundNumber = coerceInteger(payload.roundNumber, { min: 0, max: 10 });
    const totalRounds = coerceInteger(payload.totalRounds, { min: 0, max: 10 });
    const playerCount = coerceInteger(payload.playerCount, { min: 0, max: 32 });
    const phaseDurationMs = coerceInteger(payload.phaseDurationMs, { min: 0, max: 3600000, allowNull: true });
    if (!fromPhase || !toPhase || roundNumber == null || totalRounds == null || playerCount == null) {
      return { ok: false, reason: 'phase_transition_required_fields' };
    }
    return {
      ok: true,
      value: {
        roomCode,
        gameId: coerceText(payload.gameId, { maxLen: 80, allowEmpty: true }) || null,
        fromPhase,
        toPhase,
        roundNumber,
        totalRounds,
        playerCount,
        phaseDurationMs
      }
    };
  }

  if (eventType === 'round_completed') {
    const roundNumber = coerceInteger(payload.roundNumber, { min: 1, max: 10 });
    const playerCount = coerceInteger(payload.playerCount, { min: 0, max: 32 });
    const isTie = coerceBoolean(payload.isTie);
    const winner = coerceText(payload.winner, { maxLen: 80, allowEmpty: true }) || null;
    const roundDurationMs = coerceInteger(payload.roundDurationMs, { min: 0, max: 3600000, allowNull: true });
    if (roundNumber == null || playerCount == null) {
      return { ok: false, reason: 'round_completed_required_fields' };
    }
    return {
      ok: true,
      value: {
        roomCode,
        gameId: coerceText(payload.gameId, { maxLen: 80, allowEmpty: true }) || null,
        roundNumber,
        playerCount,
        winner,
        isTie,
        tiedCount: coerceInteger(payload.tiedCount, { min: 0, max: 12, allowNull: true }),
        roundDurationMs
      }
    };
  }

  if (eventType === 'final_completed') {
    const playerCount = coerceInteger(payload.playerCount, { min: 0, max: 32 });
    const winner = coerceText(payload.winner, { maxLen: 80, allowEmpty: true }) || null;
    const isTie = coerceBoolean(payload.isTie);
    const matchDurationMs = coerceInteger(payload.matchDurationMs, { min: 0, max: 86400000, allowNull: true });
    const roundsCompleted = coerceInteger(payload.roundsCompleted, { min: 0, max: 10, allowNull: true });
    if (playerCount == null) return { ok: false, reason: 'final_completed_required_fields' };
    return {
      ok: true,
      value: {
        roomCode,
        gameId: coerceText(payload.gameId, { maxLen: 80, allowEmpty: true }) || null,
        playerCount,
        winner,
        isTie,
        roundsCompleted,
        matchDurationMs
      }
    };
  }

  return { ok: false, reason: `unsupported_event_type:${eventType}` };
}

function emitPartyTelemetryEvent(eventType, payload = {}) {
  if (!TELEMETRY_ENABLED) return null;

  const safeType = coerceText(eventType, { maxLen: 64 });
  if (!safeType) return null;

  const validated = validateEventPayload(safeType, payload);
  if (!validated.ok) {
    console.warn(`[Party telemetry] Dropped invalid event "${safeType}" reason=${validated.reason}`);
    return null;
  }

  const event = {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    eventType: safeType,
    timestampMs: Date.now(),
    timestampIso: new Date().toISOString(),
    ...validated.value
  };
  const stream = ensureLogStream();
  if (!stream) return event;
  stream.write(`${JSON.stringify(event)}\n`);
  return event;
}

function buildDisconnectKey(roomCode = '', playerName = '') {
  return `${String(roomCode || '').trim().toUpperCase()}::${String(playerName || '').trim().toLowerCase()}`;
}

function pruneRecentDisconnects(nowMs = Date.now()) {
  for (const [key, value] of recentDisconnects.entries()) {
    const disconnectedAtMs = Number(value && value.disconnectedAtMs) || 0;
    if (!disconnectedAtMs || (nowMs - disconnectedAtMs) > RECONNECT_WINDOW_MS) {
      recentDisconnects.delete(key);
    }
  }
}

function markPlayerDisconnected(roomCode, playerName, disconnectedAtMs = Date.now()) {
  const room = coerceText(roomCode, { maxLen: 32 });
  const player = coerceText(playerName, { maxLen: 80 });
  if (!room || !player) return;
  pruneRecentDisconnects(disconnectedAtMs);
  recentDisconnects.set(buildDisconnectKey(room, player), {
    disconnectedAtMs: Number(disconnectedAtMs) || Date.now()
  });
}

function consumeReconnectSignal(roomCode, playerName, nowMs = Date.now()) {
  const room = coerceText(roomCode, { maxLen: 32 });
  const player = coerceText(playerName, { maxLen: 80 });
  if (!room || !player) return { isReconnect: false, reconnectWindowMs: null };
  pruneRecentDisconnects(nowMs);

  const key = buildDisconnectKey(room, player);
  const record = recentDisconnects.get(key);
  if (!record) return { isReconnect: false, reconnectWindowMs: null };

  recentDisconnects.delete(key);
  const disconnectedAtMs = Number(record.disconnectedAtMs) || 0;
  const reconnectWindowMs = disconnectedAtMs > 0 ? Math.max(0, nowMs - disconnectedAtMs) : null;
  if (reconnectWindowMs == null || reconnectWindowMs > RECONNECT_WINDOW_MS) {
    return { isReconnect: false, reconnectWindowMs: null };
  }
  return { isReconnect: true, reconnectWindowMs };
}

function clearPartyTelemetryLog() {
  const targetPath = getPartyTelemetryLogPath();
  if (telemetryStream) {
    try {
      telemetryStream.end();
    } catch (_error) {}
    telemetryStream = null;
  }
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }
  streamInitFailed = false;
}

function flushPartyTelemetry({ timeoutMs = 2000 } = {}) {
  if (!telemetryStream) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = setTimeout(finish, Math.max(100, Number(timeoutMs) || 2000));
    telemetryStream.write('', () => {
      clearTimeout(timer);
      finish();
    });
  });
}

module.exports = {
  TELEMETRY_SCHEMA_VERSION,
  RECONNECT_WINDOW_MS,
  getPartyTelemetryLogPath,
  emitPartyTelemetryEvent,
  consumeReconnectSignal,
  markPlayerDisconnected,
  clearPartyTelemetryLog,
  flushPartyTelemetry
};
