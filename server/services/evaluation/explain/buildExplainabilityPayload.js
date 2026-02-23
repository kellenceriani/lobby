function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function uniqueList(values = [], limit = 8) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(values) ? values : []) {
    const clean = String(raw || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

function labelStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'resolved') return { label: 'Resolved', tone: 'good', shortLabel: 'Resolved' };
  if (normalized === 'low_confidence_resolve') {
    return { label: 'Low-confidence resolve', tone: 'warn', shortLabel: 'Low-conf' };
  }
  if (normalized === 'unresolved') return { label: 'Fallback / unresolved', tone: 'risk', shortLabel: 'Fallback' };
  if (normalized === 'legacy_rules') return { label: 'Legacy rules', tone: 'neutral', shortLabel: 'Legacy' };
  return { label: status ? String(status) : 'Unknown', tone: 'neutral', shortLabel: status ? String(status) : 'Unknown' };
}

function getConfidenceBand(value) {
  const safe = clamp(Number(value) || 0, 0, 1);
  if (safe >= 0.88) return 'high';
  if (safe >= 0.7) return 'medium';
  if (safe >= 0.5) return 'low';
  return 'very_low';
}

function getTrustLabel(value) {
  const band = getConfidenceBand(value);
  if (band === 'high') return 'Trusted';
  if (band === 'medium') return 'Mostly trusted';
  if (band === 'low') return 'Uncertain';
  return 'High risk';
}

function scoreRiskSeverity(riskFlags = []) {
  const flags = (Array.isArray(riskFlags) ? riskFlags : []).map((f) => String(f || '').toLowerCase());
  if (!flags.length) return 'low';
  let score = 0;
  for (const flag of flags) {
    if (/invalid|timeout|fallback|unresolved/.test(flag)) score += 3;
    else if (/ambiguity|title_differs|synthetic/.test(flag)) score += 2;
    else score += 1;
  }
  if (score >= 8) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

function buildContextSummary(parsedContext) {
  const signals = parsedContext && parsedContext.signals && typeof parsedContext.signals === 'object'
    ? parsedContext.signals
    : {};
  const keywords = parsedContext && parsedContext.keywords && typeof parsedContext.keywords === 'object'
    ? parsedContext.keywords
    : {};

  return {
    complexityScore: Number(signals.complexityScore) || 0,
    constraintStackScore: Number(signals.constraintStackScore) || 0,
    constraints: uniqueList(signals.constraints || [], 6),
    pressureTags: uniqueList(signals.pressureTags || [], 6),
    environmentTags: uniqueList(signals.environmentTags || [], 6),
    teamDynamics: uniqueList(signals.teamDynamics || [], 6),
    scenarioKeywords: uniqueList(keywords.scenario || [], 6),
    twistKeywords: uniqueList(keywords.twist || [], 6)
  };
}

function buildExplainabilityPayload({
  status = 'legacy_rules',
  engine = 'rules-context-baseline',
  confidence = 0,
  confidenceBreakdown = null,
  matchedTraits = [],
  matchedIntents = [],
  domainMatches = [],
  riskFlags = [],
  parsedContext = null
} = {}) {
  const safeConfidence = clamp(Number(confidence) || 0, 0, 1);
  const resolverPct = Math.round(clamp(Number(confidenceBreakdown && confidenceBreakdown.nameResolution) || 0, 0, 1) * 100);
  const contextPct = Math.round(clamp(Number(confidenceBreakdown && confidenceBreakdown.contextFit) || 0, 0, 1) * 100);
  const trustPct = Math.round(safeConfidence * 100);
  const riskList = uniqueList(riskFlags, 10);
  const riskSeverity = scoreRiskSeverity(riskList);
  const statusMeta = labelStatus(status);
  const contextSummary = buildContextSummary(parsedContext);

  const badges = uniqueList([
    `${statusMeta.shortLabel}`,
    `Trust ${trustPct}%`,
    resolverPct ? `Resolve ${resolverPct}%` : null,
    contextPct ? `Context ${contextPct}%` : null,
    contextSummary.constraintStackScore >= 42 ? 'Heavy constraints' : null,
    contextSummary.complexityScore >= 62 ? 'High complexity' : null,
    riskSeverity === 'high' ? 'High risk flags' : riskSeverity === 'medium' ? 'Risk flags' : null
  ], 6);

  return {
    status,
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    shortStatusLabel: statusMeta.shortLabel,
    engine,
    confidence: safeConfidence,
    trustPct,
    trustLabel: getTrustLabel(safeConfidence),
    confidenceBand: getConfidenceBand(safeConfidence),
    resolverPct,
    contextPct,
    matchedTraits: uniqueList(matchedTraits, 8),
    matchedIntents: uniqueList(matchedIntents, 8),
    domainMatches: uniqueList(domainMatches, 6),
    riskFlags: riskList,
    riskSeverity,
    riskSummary: riskList.length ? `${riskList.length} risk flag${riskList.length === 1 ? '' : 's'}` : 'No major risk flags',
    traceLine: `${statusMeta.label} · Trust ${trustPct}% · Resolve ${resolverPct}% · Context ${contextPct}%`,
    badges,
    contextSummary
  };
}

module.exports = {
  buildExplainabilityPayload
};
