function buildExplainabilityPayload({
  status = 'legacy_rules',
  engine = 'rules-context-baseline',
  confidence = 0,
  matchedTraits = [],
  riskFlags = []
} = {}) {
  return {
    status,
    engine,
    confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : 0,
    matchedTraits: (Array.isArray(matchedTraits) ? matchedTraits : []).slice(0, 8),
    riskFlags: (Array.isArray(riskFlags) ? riskFlags : []).slice(0, 8)
  };
}

module.exports = {
  buildExplainabilityPayload
};
