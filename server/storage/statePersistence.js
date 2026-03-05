const fs = require('fs');
const path = require('path');

const SNAPSHOT_DIR = path.join(__dirname, '..', '.runtime');
const SNAPSHOT_FILE = path.join(SNAPSHOT_DIR, 'rooms.snapshot.json');

const SNAPSHOT_DEBOUNCE_MS = Math.max(400, Number(process.env.ROOM_SNAPSHOT_DEBOUNCE_MS) || 1200);
const SNAPSHOT_RETRY_MS = Math.max(1500, Number(process.env.ROOM_SNAPSHOT_RETRY_MS) || 3500);

let pendingWriteTimer = null;
let writeInFlight = false;
let dirty = false;
let latestRoomsRef = null;
let lastSavedAtMs = 0;

function sanitizeForSnapshot(value) {
  if (!value) return value;

  const seen = new WeakSet();
  const transientKeys = new Set([
    'draftTimeout',
    'voteTimeout',
    'roundTimeout',
    'phaseTimeout',
    'timer',
    'timeout'
  ]);

  try {
    return JSON.parse(JSON.stringify(value, (key, current) => {
      if (transientKeys.has(key)) return undefined;
      if (typeof current === 'function') return undefined;

      if (current && typeof current === 'object') {
        if (seen.has(current)) return undefined;
        seen.add(current);

        const ctorName = current.constructor && current.constructor.name;
        if (ctorName === 'Timeout' || ctorName === 'Immediate') {
          return undefined;
        }
      }

      return current;
    }));
  } catch (err) {
    return null;
  }
}

function ensureDir() {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
}

function serializeRooms(rooms) {
  const out = {};
  Object.entries(rooms || {}).forEach(([code, room]) => {
    if (!room) return;
    out[code] = {
      roomCode: room.roomCode,
      isGameActive: !!room.isGameActive,
      host: room.host || null,
      categoryHistory: Array.isArray(room.categoryHistory) ? room.categoryHistory.slice(-16) : [],
      settings: room.settings || {},
      messages: Array.isArray(room.messages) ? room.messages.slice(-10) : [],
      gameState: sanitizeForSnapshot(room.gameState)
    };
  });
  return out;
}

function hydrateRooms(serialized) {
  const hydrated = {};
  Object.entries(serialized || {}).forEach(([code, room]) => {
    hydrated[code] = {
      roomCode: room.roomCode || code,
      players: [],
      gameState: null,
      isGameActive: false,
      host: room.host || null,
      categoryHistory: Array.isArray(room.categoryHistory) ? room.categoryHistory.slice(-16) : [],
      settings: room.settings || {
        difficulty: 'normal',
        scenarioTheme: 'all',
        plotTwists: true,
        maxPlayers: 6,
        customScenario: '',
        categoriesMode: 'smart_random',
        categoryId: null,
        categoryVoteOptions: [],
        categoryVersion: 'v1',
        contentPackId: 'default'
      },
      messages: Array.isArray(room.messages) ? room.messages.slice(-10) : [],
      reactions: {}
    };
  });
  return hydrated;
}

function loadRoomsSnapshot() {
  try {
    if (!fs.existsSync(SNAPSHOT_FILE)) return {};
    const raw = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return hydrateRooms(parsed.rooms || {});
  } catch (err) {
    console.warn('⚠️ Failed to load rooms snapshot:', err.message);
    return {};
  }
}

function scheduleFlush(delayMs = SNAPSHOT_DEBOUNCE_MS) {
  if (pendingWriteTimer) return;
  pendingWriteTimer = setTimeout(() => {
    pendingWriteTimer = null;
    void flushQueuedSnapshot();
  }, Math.max(100, Number(delayMs) || SNAPSHOT_DEBOUNCE_MS));
  if (pendingWriteTimer && typeof pendingWriteTimer.unref === 'function') {
    pendingWriteTimer.unref();
  }
}

async function persistSnapshot(rooms) {
  ensureDir();
  const payload = {
    savedAt: Date.now(),
    rooms: serializeRooms(rooms)
  };
  const serialized = JSON.stringify(payload);
  const tempFile = `${SNAPSHOT_FILE}.${process.pid}.tmp`;

  await fs.promises.writeFile(tempFile, serialized, 'utf8');
  try {
    await fs.promises.rename(tempFile, SNAPSHOT_FILE);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      await fs.promises.writeFile(SNAPSHOT_FILE, serialized, 'utf8');
      await fs.promises.unlink(tempFile).catch(() => {});
      return;
    }
    throw err;
  }
}

async function flushQueuedSnapshot() {
  if (writeInFlight) return;
  if (!dirty || !latestRoomsRef) return;

  writeInFlight = true;
  dirty = false;
  try {
    await persistSnapshot(latestRoomsRef);
    lastSavedAtMs = Date.now();
  } catch (err) {
    const code = String(err && err.code || '');
    if (code === 'EBUSY' || code === 'EPERM') {
      // Common with cloud-synced folders (e.g., OneDrive); retry later.
      dirty = true;
      scheduleFlush(SNAPSHOT_RETRY_MS);
    } else {
      console.warn('⚠️ Failed to persist room snapshot:', err && err.message ? err.message : String(err || 'unknown'));
    }
  } finally {
    writeInFlight = false;
    if (dirty) scheduleFlush();
  }
}

function queueRoomsSnapshot(rooms) {
  latestRoomsRef = rooms || {};
  dirty = true;

  const sinceLastSave = Date.now() - (Number(lastSavedAtMs) || 0);
  const delay = sinceLastSave >= SNAPSHOT_DEBOUNCE_MS
    ? 120
    : Math.max(120, SNAPSHOT_DEBOUNCE_MS - sinceLastSave);
  scheduleFlush(delay);
}

module.exports = {
  loadRoomsSnapshot,
  queueRoomsSnapshot
};
