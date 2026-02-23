const { OFFENSIVE_WORDS } = require('./constants');

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsOffensiveToken(input) {
  const lower = String(input || '').toLowerCase();
  if (!lower) return false;

  return OFFENSIVE_WORDS.some((word) => {
    const token = String(word || '').toLowerCase().trim();
    if (!token) return false;
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(token)}($|[^a-z0-9])`, 'i');
    return re.test(lower);
  });
}

function validateInput(character) {
  const sanitized = String(character || '').trim();

  if (!sanitized || /^[0-9]+$/.test(sanitized)) {
    return { valid: false, tier: 'mad', reason: 'invalid' };
  }

  const alphaCount = sanitized.replace(/[^a-z0-9\s]/gi, '').length;
  if (alphaCount / sanitized.length < 0.5) {
    return { valid: false, tier: 'mad', reason: 'unreadable' };
  }

  const wordCount = sanitized.split(/\s+/).length;
  if (wordCount > 6) {
    return { valid: false, tier: 'mad', reason: 'too-long' };
  }

  if (containsOffensiveToken(sanitized)) {
    return { valid: false, tier: 'disappointed', reason: 'offensive' };
  }

  return { valid: true, wordCount };
}

module.exports = {
  validateInput
};
