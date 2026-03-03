const DEFAULT_SUBSCORES = Object.freeze({
  currentScenarioFit: 50,
  currentTwistFit: 50,
  baseAbility: 55,
  rarity: 50,
  creativity: 50,
  chemistry: 50,
  originalScenarioFit: 50,
  originalTwistFit: 50,
  categoryFit: 50
});

const DEFAULT_CONFIDENCE = Object.freeze({
  overall: 0,
  nameResolution: 0,
  contextFit: 0
});

const DEFAULT_EVAL_RESULT_SHAPE = Object.freeze({
  normalizedName: '',
  scores: DEFAULT_SUBSCORES,
  confidence: DEFAULT_CONFIDENCE,
  signals: {
    detectedDomain: 'unknown',
    matchedTraits: [],
    riskFlags: []
  }
});

module.exports = {
  DEFAULT_SUBSCORES,
  DEFAULT_CONFIDENCE,
  DEFAULT_EVAL_RESULT_SHAPE
};
