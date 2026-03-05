const NAME_RE = /^[A-Za-z0-9 _'\-.]{2,20}$/;
const ROOM_RE = /^[A-Z0-9]{2,10}$/;
const CATEGORY_MODE_ALIASES = Object.freeze({
  off: 'off',
  host_select: 'host_select',
  hostselect: 'host_select',
  smart_random: 'smart_random',
  smartrandom: 'smart_random',
  group_vote: 'group_vote',
  groupvote: 'group_vote'
});

function normalizeCategoryMode(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return CATEGORY_MODE_ALIASES[normalized] || '';
}

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
  const categoryModes = new Set(['off', 'host_select', 'smart_random', 'group_vote']);

  if (settings.difficulty && ['easy', 'normal', 'hard'].includes(settings.difficulty)) {
    cleaned.difficulty = settings.difficulty;
  }

  if (settings.scenarioTheme && typeof settings.scenarioTheme === 'string') {
    cleaned.scenarioTheme = settings.scenarioTheme.slice(0, 32).toLowerCase();
  }

  if (typeof settings.plotTwists === 'boolean') {
    cleaned.plotTwists = settings.plotTwists;
  }

  if (typeof settings.noFinalScenarioTwist === 'boolean') {
    cleaned.noFinalScenarioTwist = settings.noFinalScenarioTwist;
  }

  if (typeof settings.maxPlayers === 'number') {
    cleaned.maxPlayers = Math.min(6, Math.max(3, Math.floor(settings.maxPlayers)));
  }

  if (typeof settings.customScenario === 'string') {
    cleaned.customScenario = settings.customScenario.trim().slice(0, 120);
  }

  if (typeof settings.categoriesMode === 'string') {
    const mode = normalizeCategoryMode(settings.categoriesMode);
    if (categoryModes.has(mode)) {
      cleaned.categoriesMode = mode;
    }
  }

  if (typeof settings.categoryId === 'string') {
    const categoryId = settings.categoryId.trim().toLowerCase();
    if (!categoryId || /^[a-z0-9-]{2,80}$/.test(categoryId)) {
      cleaned.categoryId = categoryId || null;
    }
  }

  if (Array.isArray(settings.categoryVoteOptions)) {
    cleaned.categoryVoteOptions = Array.from(new Set(
      settings.categoryVoteOptions
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter((entry) => /^[a-z0-9-]{2,80}$/.test(entry))
    )).slice(0, 5);
  }

  if (typeof settings.categoryVersion === 'string') {
    cleaned.categoryVersion = settings.categoryVersion.trim().slice(0, 24) || 'v1';
  }

  if (typeof settings.contentPackId === 'string') {
    const packId = settings.contentPackId.trim().toLowerCase().slice(0, 48);
    if (/^[a-z0-9-]{3,48}$/.test(packId) || packId === 'default') {
      cleaned.contentPackId = packId;
    }
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
