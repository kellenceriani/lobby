const fs = require('fs');
const path = require('path');

const SNAPSHOT_DIR = path.join(__dirname, '..', '.runtime');
const SNAPSHOT_FILE = path.join(SNAPSHOT_DIR, 'rooms.snapshot.json');

let pendingWrite = null;

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
      settings: room.settings || {},
      messages: Array.isArray(room.messages) ? room.messages.slice(-50) : [],
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
      settings: room.settings || {
        difficulty: 'normal',
        scenarioTheme: 'all',
        plotTwists: true,
        maxPlayers: 6,
        customScenario: ''
      },
      messages: Array.isArray(room.messages) ? room.messages.slice(-50) : [],
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

function queueRoomsSnapshot(rooms) {
  if (pendingWrite) {
    return;
  }

  pendingWrite = setTimeout(() => {
    try {
      ensureDir();
      const payload = {
        savedAt: Date.now(),
        rooms: serializeRooms(rooms)
      };
      fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(payload));
    } catch (err) {
      console.warn('⚠️ Failed to persist room snapshot:', err.message);
    } finally {
      pendingWrite = null;
    }
  }, 250);
}

module.exports = {
  loadRoomsSnapshot,
  queueRoomsSnapshot
};
