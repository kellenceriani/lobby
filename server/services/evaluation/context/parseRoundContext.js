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

function hasAnyPhrase(text, patterns = []) {
  const lower = String(text || '').toLowerCase();
  return (Array.isArray(patterns) ? patterns : []).some((pattern) => (
    pattern && lower.includes(String(pattern).toLowerCase())
  ));
}

function uniqueList(values = [], limit = 12) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(values) ? values : []) {
    const clean = String(raw || '').trim().toLowerCase();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

function extractKeywords(text, { stopwords = [] } = {}) {
  const blocked = new Set((Array.isArray(stopwords) ? stopwords : []).map((v) => String(v || '').toLowerCase()));
  const tokens = tokenize(text)
    .filter((token) => token.length >= 3)
    .filter((token) => !blocked.has(token));

  const weighted = [];
  const raw = String(text || '').toLowerCase();
  for (const token of tokens) {
    let score = 1;
    if (/(crash|failure|outage|spill|flood|hazmat|quantum|rookies|aftershocks|oversight|fuel|manual|privacy|lag)/.test(token)) score += 2;
    if (raw.includes(`${token} ${token}`)) score += 1;
    weighted.push({ token, score });
  }

  weighted.sort((a, b) => b.score - a.score || a.token.localeCompare(b.token));
  return uniqueList(weighted.map((row) => row.token), 12);
}

function buildContextSignals({ scenario, twist, intents, twistActive }) {
  const scenarioText = String(scenario || '').toLowerCase();
  const twistText = String(twist || '').toLowerCase();
  const combined = `${scenarioText} ${twistText}`.trim();
  const intentSet = new Set([
    ...(Array.isArray(intents && intents.scenario) ? intents.scenario : []),
    ...(Array.isArray(intents && intents.twist) ? intents.twist : [])
  ].map((value) => String(value || '').toLowerCase()).filter(Boolean));

  const constraints = [];
  if (twistActive && hasAnyPhrase(twistText, ['no electricity', 'no power', 'blackout', 'one shared power source', 'power source'])) constraints.push('power_constraint');
  if (twistActive && hasAnyPhrase(twistText, ['manual tools', 'manual only', 'analog', 'offline', 'paper'])) constraints.push('analog_constraint');
  if (twistActive && hasAnyPhrase(twistText, ['privacy', 'private', 'confidential', 'secret', 'anonymous'])) constraints.push('privacy_constraint');
  if (twistActive && hasAnyPhrase(twistText, ['fuel cap', 'fuel capped', 'limited fuel', 'fuel limit'])) constraints.push('resource_constraint');
  if (twistActive && hasAnyPhrase(twistText, ['split across zones', 'split team across zones', 'across zones'])) constraints.push('split_team_constraint');
  if (twistActive && hasAnyPhrase(twistText, ['aftershock', 'aftershocks', 'tremor'])) constraints.push('environmental_instability');
  if (twistActive && hasAnyPhrase(twistText, ['rookies', 'new recruits', 'inexperienced crew', 'half the crew'])) constraints.push('crew_experience_constraint');
  if (twistActive && hasAnyPhrase(twistText, ['comms lag', 'communication lag', 'signal delay', 'latency'])) constraints.push('communications_constraint');
  if (twistActive && hasAnyPhrase(twistText, ['rulebook', 'oversight', 'compliance audit'])) constraints.push('compliance_constraint');

  const pressureTags = [];
  if (hasAnyPhrase(combined, ['rush hour', 'peak hour', 'deadline', 'time limit', 'countdown', 'before dawn'])) pressureTags.push('time_pressure');
  if (hasAnyPhrase(combined, ['chaos', 'panic', 'crash', 'failure', 'outage', 'breakdown'])) pressureTags.push('stability_pressure');
  if (constraints.some((tag) => /power|resource|fuel/.test(tag))) pressureTags.push('resource_pressure');
  if (constraints.some((tag) => /split_team|communications/.test(tag))) pressureTags.push('coordination_pressure');
  if (constraints.includes('crew_experience_constraint')) pressureTags.push('training_pressure');
  if (constraints.includes('compliance_constraint')) pressureTags.push('compliance_pressure');

  const environmentTags = [];
  if (hasAnyPhrase(combined, ['night', 'blackout', 'dark'])) environmentTags.push('low_visibility');
  if (hasAnyPhrase(combined, ['flood', 'water', 'storm surge', 'deluge'])) environmentTags.push('water_hazard');
  if (hasAnyPhrase(combined, ['underground', 'subway', 'tunnel', 'sewer', 'cavern'])) environmentTags.push('underground');
  if (hasAnyPhrase(combined, ['chemical spill', 'hazmat', 'toxic leak', 'contamination'])) environmentTags.push('hazmat');
  if (hasAnyPhrase(combined, ['species escape', 'animal escape', 'containment breach', 'swarm'])) environmentTags.push('containment_chaos');
  if (hasAnyPhrase(combined, ['grid crash', 'cascade failure', 'system failure', 'service outage'])) environmentTags.push('infrastructure_failure');

  const teamDynamics = [];
  if (constraints.some((tag) => /split_team|communications/.test(tag)) || intentSet.has('communication')) teamDynamics.push('coordination_heavy');
  if (constraints.includes('crew_experience_constraint')) teamDynamics.push('mentorship_heavy');
  if (intentSet.has('leadership') || intentSet.has('logistics') || intentSet.has('control')) teamDynamics.push('ops_leadership');

  const constraintWeight = constraints.length;
  const pressureWeight = pressureTags.length;
  const environmentWeight = environmentTags.length;
  const intentWeight = intentSet.size;
  const complexityScore = Math.max(0, Math.min(100, Math.round(
    24
    + (constraintWeight * 12)
    + (pressureWeight * 10)
    + (environmentWeight * 8)
    + (intentWeight * 5)
    + (twistActive ? 8 : 0)
  )));

  return {
    constraints: uniqueList(constraints, 10),
    pressureTags: uniqueList(pressureTags, 8),
    environmentTags: uniqueList(environmentTags, 8),
    teamDynamics: uniqueList(teamDynamics, 6),
    complexityScore,
    constraintStackScore: Math.max(0, Math.min(100, Math.round((constraintWeight * 18) + (pressureWeight * 10) + (twistActive ? 8 : 0))))
  };
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
  const originalTwistActive = hasUsableTwistLocal(normalizedOriginalTwist);
  const intents = {
    scenario: detectIntents(normalizedScenario),
    twist: twistActive ? detectIntents(normalizedTwist) : []
  };
  const originalIntents = {
    scenario: detectIntents(normalizedOriginalScenario),
    twist: originalTwistActive ? detectIntents(normalizedOriginalTwist) : []
  };
  const stopwords = ['with', 'under', 'during', 'into', 'from', 'that', 'this', 'your', 'their', 'team', 'build'];
  const scenarioKeywords = extractKeywords(normalizedScenario, { stopwords });
  const twistKeywords = twistActive ? extractKeywords(normalizedTwist, { stopwords }) : [];
  const originalScenarioKeywords = extractKeywords(normalizedOriginalScenario, { stopwords });
  const originalTwistKeywords = originalTwistActive ? extractKeywords(normalizedOriginalTwist, { stopwords }) : [];
  const signals = buildContextSignals({
    scenario: normalizedScenario,
    twist: normalizedTwist,
    intents,
    twistActive
  });

  return {
    evaluationMode: evaluationMode === 'final' ? 'final' : 'round',
    scenario: normalizedScenario,
    twist: normalizedTwist,
    originalScenario: normalizedOriginalScenario,
    originalTwist: normalizedOriginalTwist,
    flags: {
      twistActive,
      originalTwistActive,
      highConstraintTwist: twistActive && signals.constraintStackScore >= 42,
      highComplexityContext: signals.complexityScore >= 62
    },
    intents,
    originalIntents,
    keywords: {
      scenario: scenarioKeywords,
      twist: twistKeywords,
      originalScenario: originalScenarioKeywords,
      originalTwist: originalTwistKeywords
    },
    signals
  };
}

module.exports = {
  parseRoundContext
};
