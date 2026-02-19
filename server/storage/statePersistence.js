const fs = require('fs');
const path = require('path');

const SNAPSHOT_DIR = path.join(__dirname, '..', '.runtime');
const SNAPSHOT_FILE = path.join(SNAPSHOT_DIR, 'rooms.snapshot.json');

let pendingWrite = null;

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
      gameState: room.gameState || null
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
      gameState: room.gameState || null,
      isGameActive: !!room.isGameActive,
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
