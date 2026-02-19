const NAME_RE = /^[A-Za-z0-9 _'\-.]{2,20}$/;
const ROOM_RE = /^[A-Z0-9]{2,10}$/;

function sanitizeName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!NAME_RE.test(name)) return null;
  return name;
}

function sanitizeRoomCode(raw) {
  const room = String(raw || '').trim().toUpperCase();
  if (!ROOM_RE.test(room)) return null;
  return room;
}

function sanitizeMessage(raw, maxLen = 240) {
  const message = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!message || message.length > maxLen) return null;
  return message;
}

function sanitizeReaction(raw) {
  const reaction = String(raw || '').trim();
  if (!reaction || reaction.length > 16) return null;
  return reaction;
}

function sanitizeDraftCharacter(raw) {
  const character = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!character || character.length > 40) return null;
  if (/[\p{C}]/u.test(character)) return null;
  return character;
}

function sanitizeSettings(input) {
  const settings = input && typeof input === 'object' ? input : {};
  const cleaned = {};

  if (settings.difficulty && ['easy', 'normal', 'hard'].includes(settings.difficulty)) {
    cleaned.difficulty = settings.difficulty;
  }

  if (settings.scenarioTheme && typeof settings.scenarioTheme === 'string') {
    cleaned.scenarioTheme = settings.scenarioTheme.slice(0, 32).toLowerCase();
  }

  if (typeof settings.plotTwists === 'boolean') {
    cleaned.plotTwists = settings.plotTwists;
  }

  if (typeof settings.maxPlayers === 'number') {
    cleaned.maxPlayers = Math.min(6, Math.max(3, Math.floor(settings.maxPlayers)));
  }

  if (typeof settings.customScenario === 'string') {
    cleaned.customScenario = settings.customScenario.trim().slice(0, 120);
  }

  return cleaned;
}

function createRateLimiter() {
  const buckets = new Map();

  return function allow(key, windowMs, maxRequests) {
    const now = Date.now();
    const current = buckets.get(key);

    if (!current || now > current.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (current.count >= maxRequests) {
      return false;
    }

    current.count += 1;
    return true;
  };
}

module.exports = {
  sanitizeName,
  sanitizeRoomCode,
  sanitizeMessage,
  sanitizeReaction,
  sanitizeDraftCharacter,
  sanitizeSettings,
  createRateLimiter
};
