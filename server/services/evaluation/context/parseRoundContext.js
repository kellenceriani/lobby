const { INTENT_KEYWORD_GROUPS } = require('../../../evaluator/core/constants');

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function hasUsableTwistLocal(twist) {
  const normalized = String(twist || '').trim().toUpperCase();
  return Boolean(normalized && normalized !== 'NO PLOT TWIST' && normalized !== 'NONE' && normalized !== 'N/A');
}

function detectIntents(text) {
  const tokenSet = new Set(tokenize(text));
  return Object.entries(INTENT_KEYWORD_GROUPS)
    .filter(([, keywords]) => (Array.isArray(keywords) ? keywords : []).some((keyword) => {
      const phraseTokens = tokenize(keyword);
      if (!phraseTokens.length) return false;
      return phraseTokens.every((token) => tokenSet.has(token));
    }))
    .map(([intent]) => intent)
    .slice(0, 10);
}

function parseRoundContext({ scenario, twist, originalScenario, originalTwist, evaluationMode = 'round' } = {}) {
  const normalizedScenario = String(scenario || '').trim();
  const normalizedTwist = String(twist || '').trim();
  const normalizedOriginalScenario = String(originalScenario || normalizedScenario).trim();
  const normalizedOriginalTwist = String(originalTwist || normalizedTwist).trim();
  const twistActive = Boolean(
    String(normalizedTwist || '').trim()
    && String(normalizedTwist || '').trim().toUpperCase() !== 'NO PLOT TWIST'
  );

  return {
    evaluationMode: evaluationMode === 'final' ? 'final' : 'round',
    scenario: normalizedScenario,
    twist: normalizedTwist,
    originalScenario: normalizedOriginalScenario,
    originalTwist: normalizedOriginalTwist,
    flags: {
      twistActive
    },
    intents: {
      scenario: detectIntents(normalizedScenario),
      twist: twistActive ? detectIntents(normalizedTwist) : []
    },
    originalIntents: {
      scenario: detectIntents(normalizedOriginalScenario),
      twist: hasUsableTwistLocal(normalizedOriginalTwist) ? detectIntents(normalizedOriginalTwist) : []
    }
  };
}

module.exports = {
  parseRoundContext
};
