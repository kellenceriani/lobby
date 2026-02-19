const { OFFENSIVE_WORDS } = require('./constants');

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

  const lower = sanitized.toLowerCase();
  if (OFFENSIVE_WORDS.some(word => lower.includes(word))) {
    return { valid: false, tier: 'disappointed', reason: 'offensive' };
  }

  return { valid: true, wordCount };
}

module.exports = {
  validateInput
};
