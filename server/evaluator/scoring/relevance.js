const {
  CAPABILITY_TRAIT_KEYWORDS,
  INTENT_KEYWORD_GROUPS,
  INTENT_TO_TRAITS,
  TWIST_EFFECT_RULES,
  TYPE_INTENT_AFFINITY,
  DOMAIN_RULES,
  TITLE_KEYWORDS,
  ROLE_KEYWORDS
} = require('../core/constants');
const {
  tokenize,
  countOverlap,
  normalizeKeywordToken,
  getMeaningfulTokens,
  expandKeywords,
  getCharacterAbilityHints
} = require('../core/textUtils');

function buildKeywordFitDetails(sourceText, targetText) {
  const source = getMeaningfulTokens(sourceText || '');
  const target = getMeaningfulTokens(targetText || '');
  const expandedSource = expandKeywords(source);
  const expandedTarget = new Set(expandKeywords(target));

  const direct = source.filter(token => target.includes(token));
  const expanded = expandedSource.filter(token => expandedTarget.has(token));
  const matchedKeywords = Array.from(new Set([...direct, ...expanded])).slice(0, 16);

  return {
    directCount: direct.length,
    expandedCount: expanded.length,
    totalCount: matchedKeywords.length,
    matchedKeywords
  };
}

function inferIntentGroups(text) {
  const tokens = new Set(getMeaningfulTokens(text || '', 200));
  return Object.entries(INTENT_KEYWORD_GROUPS)
    .filter(([, keywords]) => keywords.some((keyword) => {
      const phraseTokens = getMeaningfulTokens(keyword, 8);
      if (!phraseTokens.length) return false;
      return phraseTokens.every(token => tokens.has(normalizeKeywordToken(token)));
    }))
    .map(([intent]) => intent);
}

function buildInfoCorpus(info, character = '') {
  const hints = getCharacterAbilityHints(character, info);
  return [
    character,
    info && info.title,
    info && info.description,
    info && info.profession,
    info && info.wikidataDescription,
    info && Array.isArray(info.aliases) ? info.aliases.join(' ') : '',
    info && Array.isArray(info.categories) ? info.categories.join(' ') : '',
    hints.join(' ')
  ].filter(Boolean).join(' ');
}

function getDomainMatches(scenario, twist, description) {
  const targetTokens = tokenize(`${scenario || ''} ${twist || ''}`).join(' ');
  const sourceTokens = tokenize(description || '').join(' ');

  return DOMAIN_RULES.filter(rule =>
    rule.keywords.some(keyword => targetTokens.includes(keyword)) &&
    rule.keywords.some(keyword => sourceTokens.includes(keyword))
  ).map(rule => rule.label);
}

function detectCharacterType(character, info) {
  const corpus = buildInfoCorpus(info, character).toLowerCase();

  for (const [type, affinities] of Object.entries(TYPE_INTENT_AFFINITY)) {
    if (type === 'balanced') continue;
    const keywords = Object.entries(CAPABILITY_TRAIT_KEYWORDS)
      .filter(([trait]) => affinities.includes(trait) || trait === type)
      .flatMap(([, words]) => words || []);
    const hits = keywords.reduce((count, word) => count + (corpus.includes(String(word).toLowerCase()) ? 1 : 0), 0);
    if (hits >= 2) return type;
  }

  return 'balanced';
}

function buildCapabilityProfile(character, info) {
  const corpus = buildInfoCorpus(info, character).toLowerCase();
  const tokenSet = new Set(getMeaningfulTokens(corpus, 320));
  const traits = {};

  Object.entries(CAPABILITY_TRAIT_KEYWORDS).forEach(([trait, keywords]) => {
    const score = (keywords || []).reduce((count, keyword) => {
      const phraseTokens = getMeaningfulTokens(keyword, 8);
      if (!phraseTokens.length) return count;
      const matched = phraseTokens.every(token => tokenSet.has(normalizeKeywordToken(token)));
      return matched ? count + 1 : count;
    }, 0);
    traits[trait] = Math.min(3, score);
  });

  const rankedTraits = Object.entries(traits)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([trait]) => trait);

  return {
    traits,
    rankedTraits,
    type: detectCharacterType(character, info)
  };
}

function inferScenarioRequirements(scenario = '') {
  const intents = inferIntentGroups(scenario);
  const required = new Set();

  intents.forEach(intent => {
    (INTENT_TO_TRAITS[intent] || []).forEach(trait => required.add(trait));
  });

  if (!required.size) {
    required.add('adaptability');
    required.add('control');
  }

  return {
    intents,
    requiredTraits: Array.from(required)
  };
}

function evaluateScenarioFeasibility(profile, requirements) {
  const matchedTraits = (requirements.requiredTraits || []).filter(trait => (profile.traits[trait] || 0) > 0);
  const missingTraits = (requirements.requiredTraits || []).filter(trait => !matchedTraits.includes(trait));

  const matchRatio = requirements.requiredTraits.length
    ? matchedTraits.length / requirements.requiredTraits.length
    : 0.5;

  const topTraitBonus = Math.min(2, profile.rankedTraits.length >= 5 ? 2 : profile.rankedTraits.length >= 3 ? 1 : 0);
  const breadthBonus = profile.rankedTraits.length >= 6 ? 1 : 0;
  const baseline = profile.rankedTraits.length > 0 ? 3 : 2;
  const score = Math.max(0, Math.min(10, Math.round(baseline + (matchRatio * 5) + topTraitBonus + breadthBonus)));

  return {
    score,
    canDo: score >= 4,
    thrive: score >= 8,
    matchedTraits,
    missingTraits
  };
}

function evaluateTwistImpact(profile, twist = '') {
  const lower = String(twist || '').toLowerCase();
  if (!lower.trim()) {
    return {
      affects: false,
      helps: false,
      hurts: false,
      impactScore: 0,
      helpTraits: [],
      hurtTraits: [],
      reasons: []
    };
  }

  let impactScore = 0;
  const helpTraits = [];
  const hurtTraits = [];
  const reasons = [];

  TWIST_EFFECT_RULES.forEach(rule => {
    if (!rule.keywords.some(keyword => lower.includes(String(keyword).toLowerCase()))) return;

    const helps = (rule.helps || []).filter(trait => (profile.traits[trait] || 0) > 0);
    const hurts = (rule.hurts || []).filter(trait => (profile.traits[trait] || 0) === 0);

    if (helps.length) {
      impactScore += Math.min(3, helps.length + Math.max(0, (rule.severity || 1) - 1));
      helpTraits.push(...helps);
      reasons.push(`${rule.label} favors ${helps.join(', ')}`);
    }

    if (hurts.length) {
      impactScore -= Math.min(3, hurts.length + Math.max(0, (rule.severity || 1) - 1));
      hurtTraits.push(...hurts);
      reasons.push(`${rule.label} penalizes ${hurts.join(', ')}`);
    }
  });

  const boundedImpact = Math.max(-6, Math.min(6, impactScore));
  return {
    affects: boundedImpact !== 0,
    helps: boundedImpact > 0,
    hurts: boundedImpact < 0,
    impactScore: boundedImpact,
    helpTraits: Array.from(new Set(helpTraits)),
    hurtTraits: Array.from(new Set(hurtTraits)),
    reasons
  };
}

function calculateCapabilityFit(character, info, scenario, twist) {
  if (!info) return { scenario: { points: 0, reasons: [] }, twist: { points: 0, reasons: [] }, totalPoints: 0 };

  const profile = buildCapabilityProfile(character, info);
  const scenarioReq = inferScenarioRequirements(scenario);
  const twistReq = inferScenarioRequirements(twist);

  const scenarioMatchCount = scenarioReq.requiredTraits.filter(trait => (profile.traits[trait] || 0) > 0).length;
  const twistMatchCount = twistReq.requiredTraits.filter(trait => (profile.traits[trait] || 0) > 0).length;

  const scenarioPoints = Math.min(7, scenarioMatchCount * 2 + (profile.rankedTraits.length >= 3 ? 1 : 0));
  const twistPoints = Math.min(7, twistMatchCount * 2 + (profile.rankedTraits.length >= 5 ? 1 : 0));

  return {
    scenario: { points: scenarioPoints, reasons: [`matched ${scenarioMatchCount} scenario traits`] },
    twist: { points: twistPoints, reasons: [`matched ${twistMatchCount} twist traits`] },
    totalPoints: Math.min(14, scenarioPoints + twistPoints)
  };
}

function assessScenarioAndTwist(character, info, scenario, twist) {
  const profile = buildCapabilityProfile(character, info);
  const requirements = inferScenarioRequirements(scenario);
  const scenarioFeasibility = evaluateScenarioFeasibility(profile, requirements);
  const twistImpact = evaluateTwistImpact(profile, twist);

  return {
    profile,
    requirements,
    scenarioFeasibility,
    twistImpact
  };
}

function mapFitCountToPoints(count) {
  if (count >= 10) return 8;
  if (count >= 7) return 6;
  if (count >= 4) return 4;
  if (count >= 2) return 2;
  if (count >= 1) return 1;
  return 0;
}

function mapFitCountToDraftBonus(count) {
  if (count >= 7) return 3;
  if (count >= 3) return 2;
  if (count >= 1) return 1;
  return 0;
}

function scoreRelevance(character, info, scenario, twist) {
  if (!info) return { points: 0, note: 'Limited direct overlap with scenario/twist.' };

  const source = buildInfoCorpus(info, character).toLowerCase();
  const scenarioFit = buildKeywordFitDetails(source, scenario || '');
  const twistFit = buildKeywordFitDetails(source, twist || '');
  const domains = getDomainMatches(scenario, twist, source);

  const capability = calculateCapabilityFit(character, info, scenario, twist);
  const assessment = assessScenarioAndTwist(character, info, scenario, twist);

  const semanticPoints = mapFitCountToPoints(scenarioFit.totalCount) + mapFitCountToPoints(twistFit.totalCount);
  const domainPoints = Math.min(4, domains.length * 2);
  const capabilityPoints = Math.min(8, capability.totalPoints);
  const feasibilityPoints = assessment.scenarioFeasibility.score >= 8 ? 4 : assessment.scenarioFeasibility.score >= 5 ? 2 : assessment.scenarioFeasibility.score >= 3 ? 1 : 0;
  const twistPoints = assessment.twistImpact.helps ? Math.min(4, assessment.twistImpact.impactScore) : assessment.twistImpact.hurts ? -Math.min(4, Math.abs(assessment.twistImpact.impactScore)) : 0;

  const total = Math.max(-6, Math.min(24, semanticPoints + domainPoints + capabilityPoints + feasibilityPoints + twistPoints));

  const note = [
    `Keyword fit: S${scenarioFit.totalCount}/T${twistFit.totalCount}`,
    `Scenario feasibility: ${assessment.scenarioFeasibility.canDo ? 'can do' : 'struggles'} (${assessment.scenarioFeasibility.score}/10)`,
    `Twist impact: ${assessment.twistImpact.helps ? 'helps' : assessment.twistImpact.hurts ? 'hurts' : 'neutral'} (${assessment.twistImpact.impactScore})`
  ].join(' | ');

  return {
    points: total,
    note,
    scenario: {
      matchCount: scenarioFit.totalCount,
      matchedKeywords: scenarioFit.matchedKeywords,
      capabilityScore: capability.scenario.points,
      capabilityReasons: capability.scenario.reasons,
      feasibilityScore: assessment.scenarioFeasibility.score,
      canDo: assessment.scenarioFeasibility.canDo,
      thrive: assessment.scenarioFeasibility.thrive,
      requiredTraits: assessment.requirements.requiredTraits,
      matchedTraits: assessment.scenarioFeasibility.matchedTraits,
      missingTraits: assessment.scenarioFeasibility.missingTraits
    },
    twist: {
      matchCount: twistFit.totalCount,
      matchedKeywords: twistFit.matchedKeywords,
      capabilityScore: capability.twist.points,
      capabilityReasons: capability.twist.reasons,
      impactScore: assessment.twistImpact.impactScore,
      affects: assessment.twistImpact.affects,
      helps: assessment.twistImpact.helps,
      hurts: assessment.twistImpact.hurts,
      helpTraits: assessment.twistImpact.helpTraits,
      hurtTraits: assessment.twistImpact.hurtTraits,
      impactReasons: assessment.twistImpact.reasons
    },
    profile: {
      topTraits: assessment.profile.rankedTraits,
      type: assessment.profile.type,
      powerClass: 'balanced'
    }
  };
}

function calculateDraftedFitBonus(info, scenario, twist, character) {
  const source = buildInfoCorpus(info, character);
  const scenarioFit = buildKeywordFitDetails(source, scenario || '');
  const twistFit = buildKeywordFitDetails(source, twist || '');

  return {
    scenario: mapFitCountToDraftBonus(scenarioFit.totalCount),
    twist: mapFitCountToDraftBonus(twistFit.totalCount)
  };
}

function scoreNameSignals(character, validation, scenario, twist) {
  const lower = String(character || '').toLowerCase();
  const trimmed = String(character || '').trim();
  const wordCount = validation.wordCount || 0;

  let points = 0;
  const signals = [];

  if (wordCount >= 4) { points -= 1; signals.push('long name'); }
  if (wordCount === 1) { points += 1; signals.push('clean short name'); }
  if (TITLE_KEYWORDS.some(token => lower.includes(`${token} `) || lower.endsWith(` ${token}`))) { points += 2; signals.push('title/honorific'); }
  if (ROLE_KEYWORDS.some(token => lower.includes(token))) { points += 2; signals.push('role keyword'); }
  if (/\d/.test(lower)) { points -= 2; signals.push('numeric token'); }
  if (trimmed.length <= 2) { points -= 2; signals.push('very short input'); }

  const overlap = countOverlap(tokenize(trimmed), tokenize(`${scenario || ''} ${twist || ''}`));
  if (overlap > 0) { points += Math.min(3, overlap + 1); signals.push('name matches scenario/twist'); }

  return {
    points: Math.max(-4, Math.min(6, points)),
    note: signals.length ? `Name signals: ${signals.join(', ')}.` : 'Name signals: minimal.'
  };
}

function calculateScenarioFit(character, info, scenario, twist) {
  return calculateScenarioFitValue(character, info, scenario, twist);
}

function calculateScenarioFitValue(character, info, scenario, twist) {
  if (!info) return 0.9;

  const source = buildInfoCorpus(info, character).toLowerCase();
  const fit = buildKeywordFitDetails(source, `${scenario || ''} ${twist || ''}`);
  const assessment = assessScenarioAndTwist(character, info, scenario, twist);

  let multiplier = 0.96;
  if (fit.totalCount >= 12) multiplier = 1.22;
  else if (fit.totalCount >= 8) multiplier = 1.15;
  else if (fit.totalCount >= 4) multiplier = 1.08;
  else if (fit.totalCount >= 2) multiplier = 1.03;

  if (assessment.scenarioFeasibility.thrive) multiplier = Math.max(multiplier, 1.2);
  else if (!assessment.scenarioFeasibility.canDo) multiplier = Math.min(multiplier, 0.96);

  if (assessment.twistImpact.helps) multiplier += 0.04;
  if (assessment.twistImpact.hurts) multiplier -= 0.05;

  return Math.max(0.85, Math.min(1.3, multiplier));
}

function getScenarioFitExplanation(multiplier) {
  if (multiplier >= 1.2) return 'Perfect scenario fit: 20% bonus multiplier';
  if (multiplier >= 1.1) return 'Excellent scenario fit: 10% bonus multiplier';
  if (multiplier >= 1.05) return 'Good scenario fit: 5% bonus multiplier';
  if (multiplier >= 1.0) return 'Neutral scenario fit: no penalty or bonus';
  if (multiplier >= 0.95) return 'Slight scenario mismatch: 5% penalty';
  return `Poor scenario fit: ${Math.round((1 - multiplier) * 100)}% penalty`;
}

module.exports = {
  buildKeywordFitDetails,
  inferIntentGroups,
  buildInfoCorpus,
  getDomainMatches,
  calculateCapabilityFit,
  assessScenarioAndTwist,
  scoreRelevance,
  calculateDraftedFitBonus,
  scoreNameSignals,
  calculateScenarioFit,
  calculateScenarioFitValue,
  getScenarioFitExplanation
};
