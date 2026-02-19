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
  if (count >= 9) return 8;
  if (count >= 6) return 6;
  if (count >= 4) return 5;
  if (count >= 3) return 4;
  if (count >= 2) return 3;
  if (count >= 1) return 2;
  return 0;
}

function mapFitCountToDraftBonus(count) {
  if (count >= 7) return 3;
  if (count >= 3) return 2;
  if (count >= 1) return 1;
  return 0;
}

const SPECIALIZATION_RULES = [
  {
    label: 'ice specialist',
    context: /\b(ice|frozen|arctic|glacier|snow|blizzard|slippery)\b/,
    strongSignals: [/\bfrozone\b/, /\biceman\b/, /\bsub[-\s]?zero\b/, /cryokinesis|ice magic|ice power/, /\bice manipulat/],
    weakSignals: [/\bice\b/, /\bfrost\b/, /\bglacier\b/],
    minEvidence: 2,
    points: 4,
    confidenceFloor: 0.45
  },
  {
    label: 'fire specialist',
    context: /\b(fire|flame|inferno|burn|lava|volcanic|heatwave)\b/,
    strongSignals: [/pyrokinesis|fire manipulat|flame control/, /\bhuman torch\b|\bazula\b|\bnatsu\b/, /\bfirebender\b/],
    weakSignals: [/\bfire\b/, /\bflame\b/, /\blava\b/],
    minEvidence: 2,
    points: 4,
    confidenceFloor: 0.45
  },
  {
    label: 'lightning specialist',
    context: /\b(lightning|thunder|electric|voltage|storm surge|electrical)\b/,
    strongSignals: [/electrokinesis|lightning manipulat|thunder control/, /\bthor\b|\benel\b|\bstorm\b/, /\belectric hero\b/],
    weakSignals: [/\blightning\b/, /\bthunder\b/, /\belectric\b/],
    minEvidence: 2,
    points: 4,
    confidenceFloor: 0.45
  },
  {
    label: 'wind/air specialist',
    context: /\b(wind|air|gust|hurricane|cyclone|tornado)\b/,
    strongSignals: [/aerokinesis|wind manipulat|airbender/, /\baang\b|\btempest\b/],
    weakSignals: [/\bwind\b/, /\bair\b/, /\bgust\b/],
    minEvidence: 2,
    points: 3,
    confidenceFloor: 0.45
  },
  {
    label: 'earth specialist',
    context: /\b(earth|rock|stone|seismic|quake|mountain|terrain)\b/,
    strongSignals: [/geokinesis|earth manipulat|stone armor/, /\btoph\b|\bgolem\b|\bterra\b/],
    weakSignals: [/\bearth\b/, /\brock\b/, /\bstone\b/],
    minEvidence: 2,
    points: 3,
    confidenceFloor: 0.45
  },
  {
    label: 'animal affinity specialist',
    context: /\b(dog|canine|animal|beast|wildlife|pet|pack|zoo)\b/,
    strongSignals: [/\bbrian griffin\b|\bscooby\b|\bace the bat-hound\b/, /animal control|beast master|animal speak/, /\bcanine\b|\bwolf\b/],
    weakSignals: [/\banimal\b/, /\bpet\b/, /\bbeast\b/],
    minEvidence: 2,
    points: 3,
    confidenceFloor: 0.42
  },
  {
    label: 'mystery/investigation specialist',
    context: /\b(mystery|detective|investigate|clue|case|suspect|evidence)\b/,
    strongSignals: [/\bsherlock\b|\bshaggy\b|\bpoirot\b/, /detective|investigator|sleuth|forensic/, /deduction|profiling|interrogation/],
    weakSignals: [/\bmystery\b/, /\bclue\b/, /\bdetective\b/],
    minEvidence: 2,
    points: 3,
    confidenceFloor: 0.4
  },
  {
    label: 'iconic style specialist',
    context: /\b(iconic clothes|iconic style|signature outfit|fashion|wardrobe|costume)\b/,
    strongSignals: [/signature outfit|iconic costume|known for .*outfit|fashion icon|distinctive wardrobe/, /\bcruella\b|\bedna mode\b|\blady gaga\b|\bshaggy\b/],
    weakSignals: [/\bfashion\b/, /\bstyle\b/, /\bcostume\b/],
    minEvidence: 3,
    points: 2,
    confidenceFloor: 0.55,
    requireExplicitContext: true
  },
  {
    label: 'aquatic specialist',
    context: /\b(underwater|ocean|sea|flooded|aquatic|deep sea)\b/,
    strongSignals: [/\baquaman\b|\bnamor\b|\btriton\b/, /aquatic|water breathing|oceanic|hydrokinesis/, /submarine|deep-sea explorer/],
    weakSignals: [/\bwater\b/, /\bocean\b/, /\bunderwater\b/],
    minEvidence: 2,
    points: 3,
    confidenceFloor: 0.45
  }
];

function countRegexHits(source, patterns) {
  return (Array.isArray(patterns) ? patterns : []).reduce((count, pattern) => {
    if (!(pattern instanceof RegExp)) return count;
    return pattern.test(source) ? count + 1 : count;
  }, 0);
}

function calculateSpecializationBonus(character, info, scenario, twist, profile) {
  if (!info) {
    return {
      points: 0,
      reasons: []
    };
  }

  const context = `${scenario || ''} ${twist || ''}`.toLowerCase();
  const corpus = buildInfoCorpus(info, character).toLowerCase();
  const confidence = Number(info && info.confidence) || 0;

  let points = 0;
  const reasons = [];

  SPECIALIZATION_RULES.forEach((rule) => {
    if (!rule.context.test(context)) return;
    if (rule.requireExplicitContext && !/iconic|signature|distinctive|fashion|costume/.test(context)) return;

    const strongHits = countRegexHits(corpus, rule.strongSignals);
    const weakHits = countRegexHits(corpus, rule.weakSignals);
    const evidenceScore = (strongHits * 2) + weakHits;
    const minEvidence = Number(rule.minEvidence) || 2;
    const floor = Number(rule.confidenceFloor) || 0;

    if (evidenceScore < minEvidence) return;
    if (confidence < floor && strongHits < 2) return;

    const bonus = rule.points + (strongHits >= 2 && rule.points >= 3 ? 1 : 0);
    points += bonus;
    reasons.push(`${rule.label} (${strongHits} strong/${weakHits} weak)`);
  });

  const inferredIntents = inferIntentGroups(context);
  const requiredTraits = new Set();
  inferredIntents.forEach((intent) => {
    (INTENT_TO_TRAITS[intent] || []).forEach((trait) => requiredTraits.add(trait));
  });

  const strongTraitHits = Array.from(requiredTraits).filter((trait) => (profile.traits[trait] || 0) >= 2).length;
  if (strongTraitHits >= 3) {
    points += 2;
    reasons.push('high-trait specialization match');
  } else if (strongTraitHits >= 1) {
    points += 1;
    reasons.push('targeted trait match');
  } else if (requiredTraits.size >= 3) {
    points -= 1;
    reasons.push('specialization mismatch');
  }

  const confidenceCap = confidence < 0.4
    ? 1
    : confidence < 0.55
      ? 3
      : 8;

  return {
    points: Math.max(-3, Math.min(confidenceCap, points)),
    reasons
  };
}

function scoreRelevance(character, info, scenario, twist) {
  if (!info) return { points: 0, note: 'Limited direct overlap with scenario/twist.' };

  const source = buildInfoCorpus(info, character).toLowerCase();
  const scenarioFit = buildKeywordFitDetails(source, scenario || '');
  const twistFit = buildKeywordFitDetails(source, twist || '');
  const domains = getDomainMatches(scenario, twist, source);

  const capability = calculateCapabilityFit(character, info, scenario, twist);
  const assessment = assessScenarioAndTwist(character, info, scenario, twist);
  const specialization = calculateSpecializationBonus(character, info, scenario, twist, assessment.profile);
  const infoConfidence = Number(info.confidence) || 0;
  const traitBreadthPoints = assessment.profile.rankedTraits.length >= 6
    ? 2
    : assessment.profile.rankedTraits.length >= 3
      ? 1
      : 0;
  const evidenceLift = infoConfidence >= 0.75
    ? 2
    : infoConfidence >= 0.5
      ? 1
      : 0;

  const semanticPoints = mapFitCountToPoints(scenarioFit.totalCount) + mapFitCountToPoints(twistFit.totalCount);
  const domainPoints = Math.min(4, domains.length * 2);
  const capabilityPoints = Math.min(10, Math.round(capability.totalPoints * 0.8));
  const feasibilityPoints = assessment.scenarioFeasibility.score >= 8 ? 5 : assessment.scenarioFeasibility.score >= 6 ? 3 : assessment.scenarioFeasibility.score >= 4 ? 2 : assessment.scenarioFeasibility.score >= 3 ? 1 : 0;
  const twistPoints = assessment.twistImpact.helps ? Math.min(4, assessment.twistImpact.impactScore) : assessment.twistImpact.hurts ? -Math.min(4, Math.abs(assessment.twistImpact.impactScore)) : 0;

  const preTotal = semanticPoints + domainPoints + capabilityPoints + feasibilityPoints + twistPoints + traitBreadthPoints + evidenceLift + specialization.points;
  const feasibilityFloor = assessment.scenarioFeasibility.thrive
    ? 4
    : assessment.scenarioFeasibility.canDo
      ? 3
      : 0;

  let total = preTotal;
  if (feasibilityFloor > 0 && total < feasibilityFloor) {
    total = feasibilityFloor;
  }

  if (scenarioFit.totalCount === 0 && twistFit.totalCount === 0 && !assessment.scenarioFeasibility.canDo) {
    total = Math.min(total, 0);
  }

  total = Math.max(-8, Math.min(28, total));

  const note = [
    `Keyword fit: S${scenarioFit.totalCount}/T${twistFit.totalCount}`,
    `Scenario feasibility: ${assessment.scenarioFeasibility.canDo ? 'can do' : 'struggles'} (${assessment.scenarioFeasibility.score}/10)`,
    `Twist impact: ${assessment.twistImpact.helps ? 'helps' : assessment.twistImpact.hurts ? 'hurts' : 'neutral'} (${assessment.twistImpact.impactScore})`,
    `Specialization: ${specialization.points >= 0 ? '+' : ''}${specialization.points}`
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
    },
    specialization: {
      points: specialization.points,
      reasons: specialization.reasons
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
  const specialization = calculateSpecializationBonus(character, info, scenario, twist, assessment.profile);

  let multiplier = 0.9;
  if (fit.totalCount >= 14) multiplier = 1.2;
  else if (fit.totalCount >= 9) multiplier = 1.13;
  else if (fit.totalCount >= 5) multiplier = 1.06;
  else if (fit.totalCount >= 2) multiplier = 1.0;
  else multiplier = 0.88;

  if (assessment.scenarioFeasibility.thrive) multiplier += 0.1;
  else if (assessment.scenarioFeasibility.canDo) multiplier += 0.03;
  else multiplier -= 0.1;

  if (assessment.twistImpact.helps) multiplier += 0.05;
  if (assessment.twistImpact.hurts) multiplier -= 0.08;

  if (specialization.points >= 5) multiplier += 0.1;
  else if (specialization.points >= 2) multiplier += 0.05;
  else if (specialization.points <= -2) multiplier -= 0.07;

  if (fit.totalCount <= 1 && !assessment.scenarioFeasibility.canDo && specialization.points <= 0) {
    multiplier = Math.min(multiplier, 0.82);
  }

  return Math.max(0.72, Math.min(1.35, multiplier));
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
