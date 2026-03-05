const { scoreCharacter, validateInput } = require('../../../evaluator');
const { canonicalizeName } = require('../../../evaluator/core/textUtils');
const { mapScoreToEmotion, buildNotes, buildBreakdown } = require('../../../evaluator/presentation/presentation');
const { calculateAdvancedOVR, getOVRTier, detectRarity } = require('../../../evaluator/scoring/ovr');
const {
  scoreRelevance,
  calculateDraftedFitBonus,
  scoreNameSignals,
  getDomainMatches,
  buildInfoCorpus
} = require('../../../evaluator/scoring/relevance');
const { parseRoundContext } = require('../context/parseRoundContext');
const { buildWeightProfile, computeWeightedOverall } = require('../scoring/weightingModel');
const { resolveEntryIdentity } = require('../resolver/resolveEntryIdentity');
const { buildExplainabilityPayload } = require('../explain/buildExplainabilityPayload');
const { DEFAULT_SUBSCORES } = require('../contracts/resultShape');
const { resolveCategoryFit } = require('../../categoryRegistryService');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values, fallback = 0) {
  const safe = (Array.isArray(values) ? values : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  if (!safe.length) return fallback;
  return safe.reduce((sum, v) => sum + v, 0) / safe.length;
}

function cloneJsonSafe(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return null;
  }
}

function hasUsableTwist(twist) {
  const normalized = String(twist || '').trim().toUpperCase();
  return normalized && normalized !== 'NO PLOT TWIST' && normalized !== 'NONE' && normalized !== 'N/A';
}

function textIncludesAny(text, patterns) {
  const raw = String(text || '').toLowerCase();
  return (Array.isArray(patterns) ? patterns : []).some((pattern) => {
    if (!pattern) return false;
    if (pattern instanceof RegExp) return pattern.test(raw);
    return raw.includes(String(pattern).toLowerCase());
  });
}

function countTraitMatches(traits, targetTraits) {
  const traitSet = new Set((Array.isArray(traits) ? traits : []).map((t) => String(t || '').toLowerCase()).filter(Boolean));
  return (Array.isArray(targetTraits) ? targetTraits : [])
    .map((t) => String(t || '').toLowerCase())
    .filter((t) => traitSet.has(t))
    .length;
}

function truncateText(value, maxLength = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function inferEntityKind(scoringInfo, character) {
  const description = String(scoringInfo && scoringInfo.description || '').toLowerCase();
  const title = String(scoringInfo && (scoringInfo.title || scoringInfo.name) || character || '').toLowerCase();
  const corpus = `${title} ${description}`;

  if (textIncludesAny(corpus, [
    'born ', ' is an american ', ' is a british ', ' is a canadian ', ' is an english ', ' is an australian ',
    'actor', 'actress', 'model', 'singer', 'musician', 'politician', 'businessman', 'businesswoman',
    'inventor', 'scientist', 'athlete', 'television personality', 'radio host'
  ])) {
    return 'person';
  }

  if (textIncludesAny(title, [
    'princess peach', 'nico robin', 'yuji itadori', 'baki hanma', 'baki the grappler',
    'kratos (god of war)', 'bugs bunny', 'kim possible', 'peter parker',
    'doctor octopus', 'stitch (disney)', 'ronald mcdonald'
  ])) {
    return 'fictional_character';
  }

  if (textIncludesAny(corpus, [
    'fictional character',
    'video game character',
    'anime character',
    'manga character',
    'comic book character',
    'cartoon character',
    'animated character',
    'anthropomorphic',
    'superhero'
  ])) {
    return 'fictional_character';
  }
  if (
    textIncludesAny(corpus, [
      'kung fu panda', 'one piece', 'dragon ball', 'gravity falls', 'how to train your dragon',
      'mario', 'jujutsu kaisen', 'god of war', 'berserk', 'marvel comics', 'dc comics', 'spider-man'
    ])
    && textIncludesAny(corpus, [
      'protagonist', 'character', 'hero', 'dragon', 'pirate', 'princess',
      'fighter', 'warrior', 'archaeologist', 'operative'
    ])
  ) {
    return 'fictional_character';
  }
  if (textIncludesAny(corpus, ['television series', 'tv series', 'film', 'movie', 'video game', 'album', 'novel'])) {
    return 'media_work';
  }
  if (textIncludesAny(corpus, ['company', 'corporation', 'business', 'organization', 'founded', 'startup'])) {
    return 'organization';
  }
  if (textIncludesAny(corpus, ['fruit', 'edible', 'food', 'sandwich', 'burger', 'plant', 'tree'])) {
    return 'food_bio';
  }
  if (textIncludesAny(corpus, ['animal', 'mammal', 'bird', 'species', 'fox', 'cow', 'shark', 'dog'])) {
    return 'animal';
  }
  if (textIncludesAny(corpus, ['ladder', 'tool', 'device', 'machine', 'equipment'])) {
    return 'object_tool';
  }
  return 'unknown';
}

function applyContextIntentHeuristics({
  subscores,
  parsedContext,
  relevance,
  scoringInfo,
  resolution,
  scenario,
  twist,
  character
}) {
  const safe = { ...subscores };
  const scenarioText = String(scenario || '').toLowerCase();
  const twistText = String(twist || '').toLowerCase();
  const intents = new Set([
    ...(Array.isArray(parsedContext && parsedContext.intents && parsedContext.intents.scenario) ? parsedContext.intents.scenario : []),
    ...(Array.isArray(parsedContext && parsedContext.intents && parsedContext.intents.twist) ? parsedContext.intents.twist : [])
  ].map((value) => String(value || '').toLowerCase()).filter(Boolean));
  const topTraits = Array.isArray(relevance && relevance.profile && relevance.profile.topTraits)
    ? relevance.profile.topTraits
    : [];
  const entityKind = inferEntityKind(scoringInfo, character);
  const desc = String(scoringInfo && scoringInfo.description || '').toLowerCase();
  const titleText = String(scoringInfo && (scoringInfo.title || scoringInfo.name) || '').toLowerCase();
  const inputText = String(resolution && resolution.input || character || '').toLowerCase();
  const identityText = `${inputText} ${titleText} ${desc}`;
  const confidenceScale = 0.65 + (clamp(Number(resolution && resolution.infoConfidence) || 0, 0, 1) * 0.35);

  const hasLogisticsContext = intents.has('logistics')
    || intents.has('infrastructure')
    || textIncludesAny(scenarioText, ['logistics', 'supply', 'distribution', 'transport', 'route', 'shipment', 'infrastructure']);
  const hasPrivacyContext = textIncludesAny(twistText, ['privacy', 'private', 'confidential', 'secret', 'anonym', 'discreet']);
  const hasAnalogContext = textIncludesAny(twistText, ['analog', 'manual', 'paper', 'offline', 'backup']);
  const hasTransitContext = intents.has('logistics')
    || textIncludesAny(scenarioText, ['transit', 'commute', 'rail', 'bus', 'station', 'route', 'dispatch']);
  const hasMorningRushContext = textIncludesAny(scenarioText, ['morning', 'rush hour', 'peak hour']);
  const hasCyberContext = intents.has('cyber')
    || textIncludesAny(scenarioText, ['cyber', 'hack', 'network', 'malware', 'encryption', 'firewall', 'data breach', 'code']);
  const hasQuantumTechContext = textIncludesAny(scenarioText, [
    'quantum', 'quantum net', 'quantum network', 'remediate a quantum net', 'lab', 'scientific net'
  ]);
  const hasChemicalSpillContext = textIncludesAny(scenarioText, [
    'chemical spill', 'hazmat spill', 'toxic spill', 'chemical leak', 'toxic leak', 'hazmat leak', 'contamination spill'
  ]);
  const hasManualToolsContext = textIncludesAny(twistText, ['manual tools only', 'manual tools', 'manual tool', 'tools only']);
  const hasServiceRecoveryContext = textIncludesAny(scenarioText, ['service breakdown', 'service outage', 'restore service', 'recover service', 'incident', 'outage', 'service failure']);
  const hasCommsLagContext = textIncludesAny(twistText, ['comms lag', 'communication lag', 'lag 90 seconds', '90 seconds', 'latency', 'signal delay', 'delayed comms']);
  const hasSpeciesEscapeContext = textIncludesAny(scenarioText, [
    'species escape', 'animal escape', 'creature escape', 'containment breach', 'zoo escape', 'wildlife breach', 'swarm takeover'
  ]);
  const hasFoodShortageContext = textIncludesAny(scenarioText, [
    'food shortage', 'food crisis', 'famine', 'ration shortage', 'supply hunger', 'hunger crisis', 'meal shortage', 'kitchen shortage'
  ]);
  const hasFloodContext = textIncludesAny(scenarioText, [
    'flood', 'flash flood', 'rising water', 'flooded', 'storm surge', 'deluge'
  ]);
  const hasUndergroundContext = textIncludesAny(scenarioText, [
    'underground', 'subway', 'tunnel', 'sewer', 'cavern', 'subterranean'
  ]);
  const hasNavigationContext = textIncludesAny(scenarioText, [
    'navigate', 'guide', 'route', 'path', 'evacuate', 'lead through'
  ]);
  const hasCascadeFailureContext = textIncludesAny(scenarioText, [
    'cascade failure', 'grid crash', 'grid failure', 'chain failure', 'system cascade', 'power cascade'
  ]);
  const hasRulebookOversightContext = textIncludesAny(twistText, [
    'rulebook oversight', 'league rulebook', 'rulebook', 'oversight', 'compliance audit', 'under oversight'
  ]);
  const hasFuelCapContext = textIncludesAny(twistText, [
    'fuel capped', 'fuel cap', 'fuel-capped', 'capped per phase', 'fuel limit', 'limited fuel'
  ]);
  const hasSplitZonesContext = textIncludesAny(twistText, [
    'split across zones', 'team split across zones', 'split team across zones', 'across zones', 'multiple zones'
  ]);
  const hasAftershocksContext = textIncludesAny(twistText, [
    'aftershock', 'aftershocks', 'constant aftershocks', 'under constant aftershocks', 'tremors', 'earth tremor'
  ]);
  const hasRookieCrewContext = textIncludesAny(twistText, [
    'half the crew rookies', 'half crew rookies', 'crew rookies', 'rookies', 'new recruits', 'inexperienced crew', 'half the crew are rookies'
  ]);

  let scenarioDelta = 0;
  let twistDelta = 0;

  const opsTraitHits = countTraitMatches(topTraits, [
    'logistics', 'engineering', 'leadership', 'control', 'intelligence', 'communication', 'adaptability'
  ]);
  const privacyTraitHits = countTraitMatches(topTraits, [
    'control', 'intelligence', 'communication', 'leadership', 'engineering'
  ]);
  const analogTraitHits = countTraitMatches(topTraits, [
    'engineering', 'logistics', 'adaptability', 'control'
  ]);
  const cyberTraitHits = countTraitMatches(topTraits, [
    'intelligence', 'cyber', 'engineering', 'control', 'communication', 'stealth'
  ]);
  const manualToolTraitHits = countTraitMatches(topTraits, [
    'engineering', 'adaptability', 'combat', 'stealth', 'intelligence', 'control'
  ]);
  const quantumOpsTraitHits = countTraitMatches(topTraits, [
    'engineering', 'intelligence', 'control', 'communication', 'leadership', 'adaptability'
  ]);
  const hazmatTechTraitHits = countTraitMatches(topTraits, [
    'engineering', 'intelligence', 'control', 'adaptability', 'precision'
  ]);
  const hazmatCoordTraitHits = countTraitMatches(topTraits, [
    'leadership', 'communication'
  ]);
  const seismicCoordTraitHits = countTraitMatches(topTraits, [
    'durability', 'adaptability', 'control', 'leadership', 'communication', 'mobility'
  ]);
  const serviceTraitHits = countTraitMatches(topTraits, [
    'engineering', 'leadership', 'control', 'communication', 'intelligence', 'logistics', 'adaptability'
  ]);
  const commsLagTraitHits = countTraitMatches(topTraits, [
    'communication', 'intelligence', 'leadership', 'control', 'adaptability', 'engineering'
  ]);
  const containmentTraitHits = countTraitMatches(topTraits, [
    'control', 'communication', 'leadership', 'logistics', 'adaptability', 'combat', 'stealth', 'intelligence'
  ]);
  const floodOpsTraitHits = countTraitMatches(topTraits, [
    'adaptability', 'control', 'communication', 'leadership', 'intelligence', 'durability', 'speed', 'engineering'
  ]);
  const complianceTraitHits = countTraitMatches(topTraits, [
    'control', 'leadership', 'communication', 'intelligence', 'adaptability'
  ]);
  const resourceConstraintTraitHits = countTraitMatches(topTraits, [
    'logistics', 'engineering', 'adaptability', 'control', 'intelligence', 'leadership'
  ]);
  const foodOpsTraitHits = countTraitMatches(topTraits, [
    'logistics', 'leadership', 'communication', 'adaptability', 'control', 'speed', 'time'
  ]);
  const rookieMentorTraitHits = countTraitMatches(topTraits, [
    'leadership', 'communication', 'intelligence', 'control', 'adaptability'
  ]);
  const combatOnlyPressure = countTraitMatches(topTraits, ['combat', 'speed', 'power']) >= 1
    && countTraitMatches(topTraits, ['engineering', 'logistics', 'control', 'communication', 'leadership']) === 0;
  const hulkLikePrecisionRisk = /(^| )hulk( |$)/i.test(String(scoringInfo && scoringInfo.title || ''))
    && !/banner/i.test(String(scoringInfo && scoringInfo.title || ''));
  const techSpecialistDescriptors = textIncludesAny(identityText, [
    'scientist', 'engineer', 'inventor', 'genius', 'physicist', 'chemist', 'technician',
    'research', 'laboratory', 'lab', 'quantum', 'forensic', 'detective', 'strategist'
  ]);
  const serviceOpsDescriptors = textIncludesAny(identityText, [
    'chef', 'restaurant', 'kitchen', 'host', 'manager', 'coordinator', 'planner',
    'operator', 'dispatcher', 'producer', 'teacher', 'mentor', 'coach'
  ]);
  const toonForceSignals = textIncludesAny(identityText, [
    'bugs bunny', 'looney tunes', 'toon force', 'cartoon physics'
  ]);
  const starkTechIdentity = textIncludesAny(identityText, ['tony stark', 'iron man']);
  const villainSignals = textIncludesAny(identityText, ['villain', 'supervillain', 'criminal']);

  if (hasLogisticsContext) {
    scenarioDelta += Math.min(14, opsTraitHits * 3);
    if (entityKind === 'person' || entityKind === 'organization' || entityKind === 'fictional_character' || entityKind === 'object_tool') {
      scenarioDelta += 4;
    }
    if ((entityKind === 'food_bio' || entityKind === 'animal' || entityKind === 'media_work') && opsTraitHits === 0) {
      scenarioDelta -= 14;
    } else if (entityKind === 'food_bio' || entityKind === 'animal') {
      scenarioDelta -= 8;
    }
  }

  if (hasTransitContext) {
    scenarioDelta += Math.min(14, serviceTraitHits * 2.2);
    if (entityKind === 'person' || entityKind === 'organization' || entityKind === 'fictional_character' || entityKind === 'object_tool') {
      scenarioDelta += 3;
    }
    if (entityKind === 'food_bio' || entityKind === 'animal' || entityKind === 'media_work') {
      scenarioDelta -= 8;
    }
    if (combatOnlyPressure && textIncludesAny(desc, ['superhero', 'superhuman', 'kryptonian'])) {
      scenarioDelta -= 10;
    }
  }

  if (hasMorningRushContext) {
    scenarioDelta += Math.min(8, countTraitMatches(topTraits, ['leadership', 'communication', 'control', 'adaptability']) * 2);
    if (entityKind === 'food_bio' || entityKind === 'animal' || entityKind === 'media_work') {
      scenarioDelta -= 4;
    }
  }

  if (hasPrivacyContext) {
    twistDelta += Math.min(10, privacyTraitHits * 2);
    if (entityKind === 'person' || entityKind === 'organization' || entityKind === 'fictional_character') {
      twistDelta += 2;
    }
    if (entityKind === 'food_bio' || entityKind === 'animal' || entityKind === 'media_work') {
      twistDelta -= 8;
    }
  }

  if (hasAnalogContext) {
    twistDelta += Math.min(8, analogTraitHits * 2);
    if (textIncludesAny(desc, ['software', 'cloud-only', 'digital platform'])) {
      twistDelta -= 4;
    }
    if (entityKind === 'object_tool') {
      twistDelta += 2;
    }
  }

  if (hasCyberContext) {
    scenarioDelta += Math.min(16, cyberTraitHits * 3);
    if (textIncludesAny(desc, ['detective', 'forensic', 'hacker', 'inventor', 'engineer', 'genius'])) {
      scenarioDelta += 5;
    }
    if (entityKind === 'media_work' || entityKind === 'food_bio' || entityKind === 'animal') {
      scenarioDelta -= 6;
    }
  }

  if (hasQuantumTechContext) {
    scenarioDelta += Math.min(18, quantumOpsTraitHits * 2.8);
    if (textIncludesAny(desc, ['scientist', 'engineer', 'inventor', 'genius', 'lab', 'research', 'quantum', 'physicist'])) {
      scenarioDelta += 8;
    }
    if (techSpecialistDescriptors && quantumOpsTraitHits <= 2) scenarioDelta += 6;
    if (starkTechIdentity) scenarioDelta += 10;
    if (combatOnlyPressure) scenarioDelta -= 10;
    if (hulkLikePrecisionRisk) scenarioDelta -= 12;
    if (entityKind === 'media_work' || entityKind === 'food_bio' || entityKind === 'animal') scenarioDelta -= 6;
  }

  if (hasChemicalSpillContext) {
    scenarioDelta += Math.min(18, hazmatTechTraitHits * 2.8);
    scenarioDelta += Math.min(5, hazmatCoordTraitHits * 1.2);
    if (textIncludesAny(desc, [
      'scientist', 'engineer', 'chemist', 'inventor', 'doctor', 'research', 'laboratory', 'lab', 'hazmat', 'containment'
    ])) {
      scenarioDelta += 9;
    }
    if (textIncludesAny(desc, ['leader', 'commander', 'captain', 'operative', 'rescue'])) {
      scenarioDelta += 4;
    }
    if (techSpecialistDescriptors && hazmatTechTraitHits <= 2) scenarioDelta += 5;
    if (starkTechIdentity) scenarioDelta += 8;
    if (combatOnlyPressure) scenarioDelta -= 10;
    if (hulkLikePrecisionRisk) scenarioDelta -= 14;
    if (hulkLikePrecisionRisk && hasAftershocksContext) {
      scenarioDelta -= 8;
      twistDelta -= 8;
    }
    if (textIncludesAny(desc, ['cosmic', 'planet eater', 'world eater', 'devourer'])) scenarioDelta -= 14;
    if (villainSignals && !textIncludesAny(desc, ['scientist', 'engineer', 'chemist'])) {
      scenarioDelta -= 8;
    }
    if (textIncludesAny(desc, ['messiah', 'religious', 'prophet', 'preacher']) && hazmatTechTraitHits <= 1) {
      scenarioDelta -= 10;
    }
    if (entityKind === 'media_work' || entityKind === 'food_bio' || entityKind === 'animal') scenarioDelta -= 8;
  }

  if (hasManualToolsContext) {
    twistDelta += Math.min(12, manualToolTraitHits * 2.5);
    if (textIncludesAny(desc, ['detective', 'gadget', 'inventor', 'engineer', 'tactical', 'tool'])) {
      twistDelta += 4;
    }
    if (textIncludesAny(desc, ['software', 'cloud', 'digital platform']) && !textIncludesAny(desc, ['hardware', 'device', 'tool'])) {
      twistDelta -= 5;
    }
  }

  if (hasServiceRecoveryContext) {
    scenarioDelta += Math.min(15, serviceTraitHits * 2.5);
    if (textIncludesAny(desc, ['businessman', 'entrepreneur', 'executive', 'ceo', 'founder', 'engineer', 'operator'])) {
      scenarioDelta += 6;
    }
    if (serviceOpsDescriptors) scenarioDelta += 10;
    if (starkTechIdentity) scenarioDelta += 10;
    if (entityKind === 'food_bio' || entityKind === 'animal') {
      scenarioDelta -= 8;
    }
    if (combatOnlyPressure && textIncludesAny(desc, ['superhero', 'superhuman', 'kryptonian'])) {
      scenarioDelta -= 14;
    }
  }

  if (hasSpeciesEscapeContext) {
    scenarioDelta += Math.min(15, containmentTraitHits * 2.3);
    if (textIncludesAny(desc, ['hunter', 'ranger', 'zookeeper', 'trainer', 'animal control', 'monster hunter', 'detective'])) {
      scenarioDelta += 6;
    }
    if (entityKind === 'fictional_character' || entityKind === 'person' || entityKind === 'object_tool') {
      scenarioDelta += 2;
    }
    if (entityKind === 'animal' || entityKind === 'food_bio' || entityKind === 'media_work') {
      scenarioDelta -= 10;
    }
    if (combatOnlyPressure && !textIncludesAny(desc, ['detective', 'tracker', 'hunter', 'commander'])) {
      scenarioDelta -= 6;
    }
  }

  if (hasFoodShortageContext) {
    scenarioDelta += Math.min(18, foodOpsTraitHits * 2.6);
    if (textIncludesAny(desc, [
      'food', 'restaurant', 'fast-food', 'fast food', 'chef', 'cook', 'culinary', 'kitchen',
      'franchise', 'hospitality', 'nutrition', 'grocery', 'meal', 'supply chain', 'service'
    ])) {
      scenarioDelta += 10;
    }
    if (textIncludesAny(desc, ['mascot', 'brand ambassador', 'clown']) && textIncludesAny(desc, ['mcdonald', 'restaurant', 'food'])) {
      scenarioDelta += 6;
    }
    if (entityKind === 'food_bio') {
      scenarioDelta += 4; // literal food can be directly relevant to a shortage
    }
    if (combatOnlyPressure && !textIncludesAny(desc, ['leader', 'captain', 'logistics', 'rescue', 'supply'])) {
      scenarioDelta -= 8;
    }
    if (villainSignals && !textIncludesAny(desc, ['food', 'restaurant', 'supply', 'rescue'])) {
      scenarioDelta -= 12;
    }
    if (entityKind === 'media_work') {
      scenarioDelta -= 6;
    }
  }

  if (hasFloodContext || (hasUndergroundContext && hasNavigationContext)) {
    scenarioDelta += Math.min(16, floodOpsTraitHits * 2.1);
    if (hasNavigationContext) {
      scenarioDelta += Math.min(6, countTraitMatches(topTraits, ['leadership', 'communication', 'control', 'intelligence']) * 1.4);
    }
    if (hasUndergroundContext) {
      scenarioDelta += Math.min(6, countTraitMatches(topTraits, ['stealth', 'adaptability', 'intelligence', 'control']) * 1.3);
    }
    if (textIncludesAny(desc, ['water', 'aquatic', 'ice', 'swim', 'flood', 'ocean', 'sea'])) {
      scenarioDelta += 8;
    }
    if (textIncludesAny(desc, ['detective', 'explorer', 'survival', 'tracker', 'adventurer', 'engineer'])) {
      scenarioDelta += 4;
    }
    if (entityKind === 'media_work' || entityKind === 'food_bio') {
      scenarioDelta -= 8;
    }
    if (entityKind === 'animal' && floodOpsTraitHits <= 2) {
      scenarioDelta -= 4;
    }
    if (combatOnlyPressure && !textIncludesAny(desc, ['tactical', 'rescue', 'leader', 'strategist', 'detective'])) {
      scenarioDelta -= 5;
    }
  }

  if (hasCommsLagContext) {
    twistDelta += Math.min(12, commsLagTraitHits * 2);
    if (textIncludesAny(desc, ['communications', 'engineer', 'pilot', 'commander', 'executive', 'operator'])) {
      twistDelta += 4;
    }
    if (serviceOpsDescriptors) twistDelta += 5;
    if (starkTechIdentity) twistDelta += 4;
    if (entityKind === 'media_work' || entityKind === 'food_bio' || entityKind === 'animal') {
      twistDelta -= 5;
    }
    if (combatOnlyPressure && textIncludesAny(desc, ['superhero', 'superhuman', 'kryptonian'])) {
      twistDelta -= 6;
    }
  }

  if (hasCascadeFailureContext) {
    scenarioDelta += Math.min(16, countTraitMatches(topTraits, ['engineering', 'intelligence', 'control', 'communication', 'leadership']) * 2.6);
    if (textIncludesAny(desc, ['engineer', 'scientist', 'inventor', 'operator', 'technician', 'detective'])) {
      scenarioDelta += 6;
    }
    if (combatOnlyPressure && !textIncludesAny(desc, ['tactical', 'strategist', 'detective'])) {
      scenarioDelta -= 8;
    }
    if (entityKind === 'media_work' || entityKind === 'food_bio') {
      scenarioDelta -= 6;
    }
  }

  if (hasRulebookOversightContext) {
    twistDelta += Math.min(14, complianceTraitHits * 2.3);
    if (textIncludesAny(desc, ['detective', 'judge', 'lawyer', 'commander', 'captain', 'executive', 'coach'])) {
      twistDelta += 5;
    }
    if (textIncludesAny(desc, ['chaotic', 'rogue', 'outlaw', 'vigilante'])
      && countTraitMatches(topTraits, ['control', 'leadership', 'intelligence']) === 0) {
      twistDelta -= 6;
    }
  }

  if (hasFuelCapContext) {
    twistDelta += Math.min(12, resourceConstraintTraitHits * 2.1);
    if (textIncludesAny(desc, ['efficient', 'engineering', 'conservation', 'logistics', 'operator'])) {
      twistDelta += 4;
    }
    if (textIncludesAny(desc, ['heavy artillery', 'brute force', 'overwhelming power', 'rampage'])) {
      twistDelta -= 7;
    }
  }

  if (hasSplitZonesContext) {
    twistDelta += Math.min(14, countTraitMatches(topTraits, ['communication', 'leadership', 'control', 'adaptability', 'speed']) * 2.1);
    if (textIncludesAny(desc, ['commander', 'captain', 'leader', 'teacher', 'mentor', 'coordinator', 'strategist'])) {
      twistDelta += 5;
    }
    if (combatOnlyPressure) twistDelta -= 6;
    if (hulkLikePrecisionRisk) twistDelta -= 10;
  }

  if (hasAftershocksContext) {
    twistDelta += Math.min(14, seismicCoordTraitHits * 2.2);
    if (textIncludesAny(desc, ['rescue', 'tactical', 'field', 'operative', 'survival'])) twistDelta += 4;
    if (textIncludesAny(desc, ['precision', 'delicate', 'fragile']) && !textIncludesAny(desc, ['adaptability', 'durability'])) twistDelta -= 4;
    if (combatOnlyPressure) twistDelta -= 5;
    if (hulkLikePrecisionRisk) twistDelta -= 8;
    if (combatOnlyPressure && hasChemicalSpillContext) twistDelta -= 4;
  }

  if (hasRookieCrewContext) {
    twistDelta += Math.min(16, rookieMentorTraitHits * 2.4);
    if (textIncludesAny(desc, [
      'coach', 'trainer', 'teacher', 'mentor', 'leader', 'captain', 'manager', 'instructor',
      'host', 'communicator', 'team', 'franchise'
    ])) {
      twistDelta += 6;
    }
    if (textIncludesAny(desc, ['chaotic', 'rogue', 'vigilante', 'lone wolf']) && rookieMentorTraitHits <= 1) {
      twistDelta -= 6;
    }
    if (villainSignals && rookieMentorTraitHits <= 2) {
      twistDelta -= 8;
    }
  }

  if (hasFoodShortageContext && hasRookieCrewContext
    && textIncludesAny(desc, ['food', 'restaurant', 'kitchen', 'franchise', 'chef', 'mascot'])) {
    scenarioDelta += 4;
    twistDelta += 5;
  }
  if (hasFoodShortageContext && hasRookieCrewContext && villainSignals
    && !textIncludesAny(desc, ['food', 'restaurant', 'kitchen', 'supply', 'rescue'])
    && rookieMentorTraitHits <= 2) {
    scenarioDelta -= 8;
    twistDelta -= 6;
  }
  if (hasFoodShortageContext && hasRookieCrewContext && toonForceSignals && !textIncludesAny(desc, ['food', 'restaurant'])) {
    twistDelta += 2; // chaos resilience with rookies without pretending food expertise
  }

  if (textIncludesAny(desc, ['businessman', 'co-founder', 'founder', 'inventor', 'engineer', 'executive', 'entrepreneur'])) {
    if (hasLogisticsContext) scenarioDelta += 8;
    if (hasPrivacyContext || hasAnalogContext) twistDelta += 4;
  }

  if (textIncludesAny(desc, ['fruit', 'edible fruit', 'sandwich', 'burger', 'animal', 'species', 'mammal'])) {
    if (hasLogisticsContext) scenarioDelta -= 10;
    if (hasPrivacyContext) twistDelta -= 6;
  }

  scenarioDelta = Math.round(scenarioDelta * confidenceScale);
  twistDelta = Math.round(twistDelta * confidenceScale);

  safe.currentScenarioFit = clamp((Number(safe.currentScenarioFit) || 0) + scenarioDelta, 0, 100);
  safe.currentTwistFit = clamp((Number(safe.currentTwistFit) || 0) + twistDelta, 0, 100);
  if (entityKind === 'food_bio' && hasLogisticsContext) {
    safe.currentScenarioFit = Math.min(safe.currentScenarioFit, 42);
  } else if (entityKind === 'animal' && hasLogisticsContext && opsTraitHits <= 3) {
    safe.currentScenarioFit = Math.min(safe.currentScenarioFit, 50);
  }
  if ((entityKind === 'food_bio' || entityKind === 'animal' || entityKind === 'media_work') && hasPrivacyContext) {
    safe.currentTwistFit = Math.min(safe.currentTwistFit, 45);
  }
  safe._contextHeuristic = {
    entityKind,
    scenarioDelta,
    twistDelta,
    flags: [
      hasLogisticsContext ? 'logistics_context' : null,
      hasPrivacyContext ? 'privacy_context' : null,
      hasAnalogContext ? 'analog_context' : null,
      hasTransitContext ? 'transit_context' : null,
      hasMorningRushContext ? 'morning_ops_context' : null,
      hasCyberContext ? 'cyber_context' : null,
      hasQuantumTechContext ? 'quantum_tech_context' : null,
      hasChemicalSpillContext ? 'chemical_spill_context' : null,
      hasManualToolsContext ? 'manual_tools_context' : null,
      hasServiceRecoveryContext ? 'service_recovery_context' : null,
      hasCommsLagContext ? 'comms_lag_context' : null,
      hasSpeciesEscapeContext ? 'species_escape_context' : null,
      hasFoodShortageContext ? 'food_shortage_context' : null,
      hasFloodContext ? 'flood_context' : null,
      hasUndergroundContext ? 'underground_context' : null,
      hasNavigationContext ? 'navigation_context' : null,
      hasCascadeFailureContext ? 'cascade_failure_context' : null,
      hasRulebookOversightContext ? 'rulebook_oversight_context' : null,
      hasFuelCapContext ? 'fuel_cap_context' : null,
      hasSplitZonesContext ? 'split_zones_context' : null,
      hasAftershocksContext ? 'aftershocks_context' : null,
      hasRookieCrewContext ? 'rookie_crew_context' : null
    ].filter(Boolean)
  };
  return safe;
}

function mapRarityBonusToScore(rarityBonus) {
  const bonus = clamp(Number(rarityBonus) || 0, -6, 12);
  return clamp(Math.round(((bonus + 6) / 18) * 100), 0, 100);
}

function computeScenarioFitScore(relevance, resolution) {
  if (!relevance || !relevance.scenario) {
    return resolution && resolution.trustedInfo ? 48 : 40;
  }
  const s = relevance.scenario;
  let raw = 28;
  raw += (Number(s.feasibilityScore) || 0) * 4.8; // 0..48
  raw += (Number(s.capabilityScore) || 0) * 2.2; // 0..15
  raw += Math.min(14, (Number(s.matchCount) || 0) * 1.8);
  raw += Array.isArray(s.matchedTraits) ? Math.min(12, s.matchedTraits.length * 2.5) : 0;
  if (s.thrive) raw += 8;
  else if (s.canDo) raw += 3;
  else raw -= 8;
  if (resolution && resolution.trustedInfo) raw += 3;
  return clamp(Math.round(raw), 0, 100);
}

function computeTwistFitScore(relevance, twist, resolution) {
  if (!hasUsableTwist(twist)) return 50;
  if (!relevance || !relevance.twist) return resolution && resolution.trustedInfo ? 50 : 45;
  const t = relevance.twist;
  let raw = 50;
  raw += (Number(t.impactScore) || 0) * 6;
  raw += (Number(t.capabilityScore) || 0) * 1.8;
  raw += Math.min(12, (Number(t.matchCount) || 0) * 1.5);
  if (t.helps) raw += 6;
  if (t.hurts) raw -= 6;
  if (resolution && !resolution.trustedInfo) raw -= 4;
  return clamp(Math.round(raw), 0, 100);
}

function computeBaseAbilityScore(relevance, resolution, scoringInfo) {
  const topTraits = Array.isArray(relevance && relevance.profile && relevance.profile.topTraits)
    ? relevance.profile.topTraits.map((t) => String(t || '').toLowerCase()).filter(Boolean)
    : [];
  const topTraitCount = Array.isArray(relevance && relevance.profile && relevance.profile.topTraits)
    ? relevance.profile.topTraits.length
    : 0;
  const confidence = Number(resolution && resolution.infoConfidence) || 0;
  const source = String(scoringInfo && scoringInfo.source || '').toLowerCase();
  const imageSynthetic = Boolean(scoringInfo && scoringInfo.imageSynthetic);
  const titleText = String(
    (scoringInfo && (scoringInfo.title || scoringInfo.name))
    || (resolution && resolution.normalizedName)
    || ''
  ).toLowerCase();
  const titleWordCount = String(
    (scoringInfo && (scoringInfo.title || scoringInfo.name))
    || (resolution && resolution.normalizedName)
    || ''
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
  const sourceBonus = source === 'wikipedia' || source === 'wikidata+wiki' ? 2 : source ? 1 : 0;
  const entityKind = inferEntityKind(scoringInfo, (resolution && resolution.normalizedName) || '');
  const description = String(scoringInfo && scoringInfo.description || '').toLowerCase();
  const profileType = String(relevance && relevance.profile && relevance.profile.type || 'balanced').toLowerCase();
  const trustedLocalFiction = source === 'local-index' && confidence >= 0.75 && entityKind === 'fictional_character';
  const isBruceBannerIdentity = /bruce banner/.test(titleText);
  const riskFlags = new Set(
    Array.isArray(resolution && resolution.riskFlags)
      ? resolution.riskFlags.map((f) => String(f || '').toLowerCase()).filter(Boolean)
      : []
  );
  const inputCompact = canonicalizeName(resolution && resolution.input ? resolution.input : '');
  const titleCompact = canonicalizeName((scoringInfo && (scoringInfo.title || scoringInfo.name)) || '');

  let raw = 50;
  if (entityKind === 'media_work') raw = 28;
  else if (entityKind === 'food_bio') raw = 26;
  else if (entityKind === 'animal') raw = 34;
  else if (entityKind === 'object_tool') raw = 38;
  else if (entityKind === 'organization') raw = 44;
  else if (entityKind === 'person') raw = 52;
  else if (entityKind === 'fictional_character') raw = 58;

  if (!isBruceBannerIdentity && textIncludesAny(description, ['god', 'deity', 'demigod', 'cosmic', 'omnipotent'])) raw += 18;
  else if (!isBruceBannerIdentity && textIncludesAny(description, ['superhuman', 'kryptonian', 'mutant', 'meta-human', 'wizard', 'sorcerer', 'superhero'])) raw += 12;
  else if (textIncludesAny(description, ['inventor', 'engineer', 'scientist', 'detective', 'strategist', 'commander'])) raw += 6;
  if (textIncludesAny(description, ['bugs bunny', 'looney tunes', 'toon force', 'cartoon character'])) raw += 8;
  if (entityKind === 'fictional_character' && textIncludesAny(description, [
    'alien', 'dragon', 'assassin', 'warrior', 'monster', 'experiment', 'enhanced', 'augmented'
  ])) raw += 5;
  if (entityKind === 'fictional_character'
    && topTraits.filter((t) => ['combat', 'speed', 'adaptability', 'intelligence', 'control', 'mobility'].includes(t)).length >= 2) {
    raw += 4;
  }
  if (textIncludesAny(description, ['athlete', 'quarterback', 'running back', 'boxer', 'fighter', 'olympic', 'champion'])) raw += 5;
  if (textIncludesAny(description, ['genius', 'brilliant', 'master detective', 'billionaire'])) raw += 4;
  if (textIncludesAny(description, ['child', 'schoolboy', 'student']) && !textIncludesAny(description, ['superhuman', 'wizard', 'genius'])) raw -= 3;

  raw += Math.min(12, topTraitCount * 2.2);
  if (profileType !== 'balanced') raw += 3;
  raw += Math.round((confidence - 0.6) * 12); // small evidence adjustment only
  raw += sourceBonus;
  if (isBruceBannerIdentity) raw -= 10; // Bruce Banner should not inherit full Hulk-level neutral base
  if (source.includes('fast-fallback')) raw -= 24;
  if (source === 'local-index' && titleWordCount <= 1) raw -= trustedLocalFiction ? 3 : 8;
  if (imageSynthetic && source.includes('fast-fallback')) raw -= 8;
  else if (imageSynthetic && source === 'local-index' && !trustedLocalFiction) raw -= 6;
  if (riskFlags.has('high_candidate_ambiguity')) raw -= 6;
  if (riskFlags.has('title_differs_from_input') && titleCompact && inputCompact && titleCompact !== inputCompact) raw -= 5;
  if (riskFlags.has('dangerous_title_diff_suspected')) raw -= 14;
  if (riskFlags.has('dangerous_title_diff_suspected') && source.includes('wikipedia-search')) raw -= 4;
  if (riskFlags.has('dangerous_title_diff_suspected') && imageSynthetic) raw -= 4;
  if (source.includes('search') && confidence < 0.62) raw -= 4;
  if (source === 'wikidata' && imageSynthetic) raw -= 5;
  if (entityKind === 'unknown' && confidence < 0.5) raw -= 8;
  if (!scoringInfo) raw -= 10;
  return clamp(Math.round(raw), 0, 100);
}

function computeCreativityScore({
  character,
  validation,
  resolution,
  rarityScore,
  roundPool,
  teamPool,
  nameSignals
}) {
  const targetCompact = canonicalizeName(character);
  const allPool = [...(Array.isArray(roundPool) ? roundPool : []), ...(Array.isArray(teamPool) ? teamPool : [])];
  const duplicateCount = allPool.reduce((count, entry) => (
    canonicalizeName(entry) === targetCompact ? count + 1 : count
  ), 0);
  const duplicatePenalty = duplicateCount > 1 ? Math.min(40, (duplicateCount - 1) * 18) : 0;
  const confidence = Number(resolution && resolution.infoConfidence) || 0;

  let raw = 44;
  raw += Math.round((rarityScore - 50) * 0.25);
  raw += validation && validation.wordCount === 1 ? 4 : 0;
  raw += validation && validation.wordCount >= 3 ? 3 : 0;
  raw += Math.max(-6, Math.min(6, Number(nameSignals && nameSignals.points) || 0));
  raw += !resolution || !resolution.scoringInfo ? 6 : 0;
  raw += confidence < 0.35 && resolution && resolution.scoringInfo ? 5 : 0;
  raw -= duplicatePenalty;
  return clamp(Math.round(raw), 0, 100);
}

function computeChemistryScore({
  character,
  evaluationMode,
  teamPool,
  relevance,
  parsedContext
}) {
  if (evaluationMode !== 'final') return 50;
  const roster = Array.isArray(teamPool) ? teamPool.filter(Boolean) : [];
  if (!roster.length) return 50;

  const targetCompact = canonicalizeName(character);
  const duplicateCount = roster.reduce((count, entry) => (
    canonicalizeName(entry) === targetCompact ? count + 1 : count
  ), 0);

  const uniqueRoster = new Set(roster.map((entry) => canonicalizeName(entry)).filter(Boolean)).size;
  const diversityRatio = roster.length ? uniqueRoster / roster.length : 1;
  const roleType = String(relevance && relevance.profile && relevance.profile.type || 'balanced').toLowerCase();
  const roleBonus = roleType !== 'balanced' ? 6 : 2;
  const intentOverlap = average([
    Array.isArray(parsedContext && parsedContext.intents && parsedContext.intents.scenario)
      ? parsedContext.intents.scenario.length * 6
      : 0,
    Array.isArray(relevance && relevance.profile && relevance.profile.topTraits)
      ? relevance.profile.topTraits.length * 3
      : 0
  ], 0);

  let raw = 42;
  raw += Math.round(diversityRatio * 24);
  raw += roleBonus;
  raw += Math.min(14, Math.round(intentOverlap));
  if (duplicateCount > 1) raw -= 18;
  return clamp(Math.round(raw), 0, 100);
}

function computeOriginalFitScores({
  character,
  scoringInfo,
  originalScenario,
  originalTwist,
  fallbackScenarioFit,
  fallbackTwistFit
}) {
  const sameAsNeutral = !originalScenario && !originalTwist;
  if (sameAsNeutral) {
    return {
      originalScenarioFit: fallbackScenarioFit,
      originalTwistFit: fallbackTwistFit
    };
  }

  const relevance = scoreRelevance(character, scoringInfo, originalScenario || '', originalTwist || '');
  return {
    originalScenarioFit: computeScenarioFitScore(relevance, { trustedInfo: Boolean(scoringInfo), infoConfidence: scoringInfo && scoringInfo.confidence ? scoringInfo.confidence : 0 }),
    originalTwistFit: hasUsableTwist(originalTwist)
      ? computeTwistFitScore(relevance, originalTwist, { trustedInfo: Boolean(scoringInfo), infoConfidence: scoringInfo && scoringInfo.confidence ? scoringInfo.confidence : 0 })
      : 50,
    originalRelevance: relevance
  };
}

function extractVariantSpecificity({ character, scoringInfo, scenario, twist }) {
  const rawCharacter = String(character || '').trim();
  if (!rawCharacter) return null;
  const parenMatches = Array.from(rawCharacter.matchAll(/\(([^)]+)\)/g))
    .map((m) => String(m && m[1] || '').trim())
    .filter(Boolean);
  const qualifierText = parenMatches.join(' ').trim();
  if (!qualifierText) return null;

  const qualifierLower = qualifierText.toLowerCase();
  const variantKey = canonicalizeName(qualifierText);
  const scenarioText = String(scenario || '').toLowerCase();
  const twistText = String(twist || '').toLowerCase();
  const desc = String(scoringInfo && scoringInfo.description || '').toLowerCase();

  const powerVariant = textIncludesAny(qualifierLower, [
    'gear', 'form', 'mode', 'awaken', 'awakening', 'super saiyan', 'ssj', 'kaioken', 'ultimate', 'berserk'
  ]);
  const versionVariant = textIncludesAny(qualifierLower, [
    'movie', 'anime', 'comic', 'manga', 'tv', 'show', 'live action', 'classic', 'young', 'old', 'prime'
  ]);
  const contextCueMatch = textIncludesAny(`${scenarioText} ${twistText}`, qualifierLower.split(/\s+/).filter(Boolean));
  const descCueMatch = variantKey && textIncludesAny(desc, qualifierLower.split(/\s+/).filter(Boolean));

  let baseAbilityDelta = 0;
  let creativityDelta = 0;
  let scenarioDelta = 0;
  let twistDelta = 0;

  creativityDelta += 2; // reward specificity effort by default
  if (versionVariant) creativityDelta += 1;
  if (powerVariant) {
    baseAbilityDelta += 5;
    creativityDelta += 2;
    scenarioDelta += 1;
    twistDelta += 1;
  }
  if (contextCueMatch) {
    scenarioDelta += 2;
    twistDelta += 1;
  }
  if (descCueMatch) {
    baseAbilityDelta += 1;
  }

  const type = powerVariant ? 'power_form' : versionVariant ? 'version_variant' : 'specific_variant';
  const summaryLine = powerVariant
    ? `Variant cue detected: "${qualifierText}" treated as a powered form (specificity rewarded).`
    : versionVariant
      ? `Variant cue detected: "${qualifierText}" treated as a version-specific pick (specificity rewarded).`
      : `Variant cue detected: "${qualifierText}" (specificity rewarded).`;

  return {
    type,
    qualifier: qualifierText,
    baseAbilityDelta,
    creativityDelta,
    scenarioDelta,
    twistDelta,
    summaryLine
  };
}

function buildContextSubscores({
  character,
  validation,
  scoringInfo,
  resolution,
  relevance,
  parsedContext,
  options,
  scenario,
  twist,
  nameSignals
}) {
  const resolvedIdentityName = (resolution && resolution.normalizedName) || character;
  const rarityBonus = detectRarity(character, scoringInfo);
  const rarityScore = mapRarityBonusToScore(rarityBonus);
  const roundPool = Array.isArray(options && options.roundPool) ? options.roundPool : [];
  const teamPool = Array.isArray(options && options.teamPool) ? options.teamPool : [];
  const scenarioFit = computeScenarioFitScore(relevance, resolution);
  const twistFit = computeTwistFitScore(relevance, twist, resolution);
  const baseAbility = computeBaseAbilityScore(relevance, resolution, scoringInfo);
  const creativity = computeCreativityScore({
    character,
    validation,
    resolution,
    rarityScore,
    roundPool,
    teamPool,
    nameSignals
  });
  const chemistry = computeChemistryScore({
    character,
    evaluationMode: options && options.evaluationMode === 'final' ? 'final' : 'round',
    teamPool,
    relevance,
    parsedContext
  });

  const original = computeOriginalFitScores({
    character,
    scoringInfo,
    originalScenario: options && options.originalScenario ? options.originalScenario : scenario,
    originalTwist: options && options.originalTwist ? options.originalTwist : twist,
    fallbackScenarioFit: scenarioFit,
    fallbackTwistFit: twistFit
  });
  const originalScenarioText = options && options.originalScenario ? options.originalScenario : scenario;
  const originalTwistText = options && options.originalTwist ? options.originalTwist : twist;
  const originalParsedContext = parseRoundContext({
    scenario: originalScenarioText,
    twist: originalTwistText,
    originalScenario: originalScenarioText,
    originalTwist: originalTwistText,
    evaluationMode: options && options.evaluationMode === 'final' ? 'final' : 'round'
  });
  const originalHeuristicSeed = {
    currentScenarioFit: original.originalScenarioFit,
    currentTwistFit: original.originalTwistFit,
    baseAbility,
    rarity: rarityScore,
    creativity,
    chemistry,
    originalScenarioFit: original.originalScenarioFit,
    originalTwistFit: original.originalTwistFit
  };
  const originalHeuristicApplied = applyContextIntentHeuristics({
    subscores: originalHeuristicSeed,
    parsedContext: originalParsedContext,
    relevance: original.originalRelevance || relevance,
    scoringInfo,
    resolution,
    scenario: originalScenarioText,
    twist: originalTwistText,
    character: resolvedIdentityName
  });
  const originalVariantSpecificity = extractVariantSpecificity({
    character,
    scoringInfo,
    scenario: originalScenarioText,
    twist: originalTwistText
  });
  let originalScenarioFit = clamp(Number(originalHeuristicApplied && originalHeuristicApplied.currentScenarioFit) || original.originalScenarioFit, 0, 100);
  let originalTwistFit = clamp(Number(originalHeuristicApplied && originalHeuristicApplied.currentTwistFit) || original.originalTwistFit, 0, 100);
  if (originalVariantSpecificity) {
    originalScenarioFit = clamp(originalScenarioFit + (Number(originalVariantSpecificity.scenarioDelta) || 0), 0, 100);
    originalTwistFit = clamp(originalTwistFit + (Number(originalVariantSpecificity.twistDelta) || 0), 0, 100);
  }

  const subscores = {
    currentScenarioFit: scenarioFit,
    currentTwistFit: twistFit,
    baseAbility,
    rarity: rarityScore,
    creativity,
    chemistry,
    originalScenarioFit,
    originalTwistFit,
    categoryFit: 50,
    _rarityBonus: rarityBonus,
    _originalRelevance: original.originalRelevance || null,
    _originalRawFits: {
      scenario: Number(original.originalScenarioFit) || 0,
      twist: Number(original.originalTwistFit) || 0
    },
    _originalContextHeuristic: originalHeuristicApplied && originalHeuristicApplied._contextHeuristic
      ? { ...originalHeuristicApplied._contextHeuristic }
      : null,
    _originalVariantSpecificity: originalVariantSpecificity ? { ...originalVariantSpecificity } : null
  };

  const heurApplied = applyContextIntentHeuristics({
    subscores,
    parsedContext,
    relevance,
    scoringInfo,
    resolution,
    scenario,
    twist,
    character: resolvedIdentityName
  });
  const variantSpecificity = extractVariantSpecificity({ character, scoringInfo, scenario, twist });
  if (variantSpecificity) {
    heurApplied.currentScenarioFit = clamp((Number(heurApplied.currentScenarioFit) || 0) + (Number(variantSpecificity.scenarioDelta) || 0), 0, 100);
    heurApplied.currentTwistFit = clamp((Number(heurApplied.currentTwistFit) || 0) + (Number(variantSpecificity.twistDelta) || 0), 0, 100);
    heurApplied.baseAbility = clamp((Number(heurApplied.baseAbility) || 0) + (Number(variantSpecificity.baseAbilityDelta) || 0), 0, 100);
    heurApplied.creativity = clamp((Number(heurApplied.creativity) || 0) + (Number(variantSpecificity.creativityDelta) || 0), 0, 100);
    heurApplied._variantSpecificity = variantSpecificity;
  }

  return heurApplied;
}

function buildContextRiskFlags({
  resolution,
  relevance,
  parsedContext,
  options,
  subscores
}) {
  const flags = new Set(Array.isArray(resolution && resolution.riskFlags) ? resolution.riskFlags : []);

  const scenarioMatchCount = Number(relevance && relevance.scenario && relevance.scenario.matchCount) || 0;
  if (scenarioMatchCount === 0) flags.add('no_scenario_keyword_overlap');
  if (hasUsableTwist(parsedContext && parsedContext.twist)) {
    const twistMatchCount = Number(relevance && relevance.twist && relevance.twist.matchCount) || 0;
    if (twistMatchCount === 0) flags.add('no_twist_keyword_overlap');
  }

  const roundPool = Array.isArray(options && options.roundPool) ? options.roundPool : [];
  const target = canonicalizeName(resolution && resolution.normalizedName ? resolution.normalizedName : '');
  if (target) {
    const duplicateCount = roundPool.reduce((count, value) => count + (canonicalizeName(value) === target ? 1 : 0), 0);
    if (duplicateCount > 1) flags.add('duplicate_in_round_pool');
  }

  const heuristic = subscores && subscores._contextHeuristic && typeof subscores._contextHeuristic === 'object'
    ? subscores._contextHeuristic
    : null;
  if (heuristic) {
    if ((Number(heuristic.scenarioDelta) || 0) >= 8) flags.delete('no_scenario_keyword_overlap');
    if ((Number(heuristic.twistDelta) || 0) >= 6) flags.delete('no_twist_keyword_overlap');
  }

  return Array.from(flags);
}

function buildConfidencePacket({ resolution, relevance }) {
  const nameResolution = clamp(Number(resolution && resolution.infoConfidence) || 0, 0, 1);
  const scenarioFeasibility = Number(relevance && relevance.scenario && relevance.scenario.feasibilityScore) || 0;
  const scenarioKeywordCount = Number(relevance && relevance.scenario && relevance.scenario.matchCount) || 0;
  const twistImpactScore = Number(relevance && relevance.twist && relevance.twist.impactScore) || 0;
  const twistKeywordCount = Number(relevance && relevance.twist && relevance.twist.matchCount) || 0;
  const traitCount = Array.isArray(relevance && relevance.profile && relevance.profile.topTraits)
    ? relevance.profile.topTraits.length
    : 0;
  const riskFlags = new Set(
    Array.isArray(resolution && resolution.riskFlags)
      ? resolution.riskFlags.map((f) => String(f || '').toLowerCase()).filter(Boolean)
      : []
  );

  let contextFit = 0.25;
  contextFit += Math.min(0.35, scenarioFeasibility / 20);
  contextFit += Math.min(0.2, scenarioKeywordCount / 30);
  contextFit += Math.min(0.1, twistKeywordCount / 40);
  contextFit += Math.min(0.08, Math.max(0, twistImpactScore) / 10);
  contextFit += Math.min(0.15, traitCount / 20);
  if (resolution && resolution.trustedInfo) contextFit += 0.1;
  if (riskFlags.has('synthetic_image')) contextFit -= 0.04;
  if (riskFlags.has('fast_round_timeout_fallback')) contextFit -= 0.1;
  if (riskFlags.has('high_candidate_ambiguity')) contextFit -= 0.05;
  if (riskFlags.has('title_differs_from_input')) contextFit -= 0.04;
  if (riskFlags.has('dangerous_title_diff_suspected')) contextFit -= 0.12;
  if (riskFlags.has('dangerous_title_diff_suspected') && riskFlags.has('synthetic_image')) contextFit -= 0.03;
  contextFit = clamp(Number(contextFit.toFixed(3)), 0, 1);

  let adjustedNameResolution = nameResolution;
  if (riskFlags.has('synthetic_image')) adjustedNameResolution -= 0.05;
  if (riskFlags.has('fast_round_timeout_fallback')) adjustedNameResolution -= 0.18;
  if (riskFlags.has('high_candidate_ambiguity')) adjustedNameResolution -= 0.08;
  if (riskFlags.has('dangerous_title_diff_suspected')) adjustedNameResolution -= 0.18;
  adjustedNameResolution = clamp(Number(adjustedNameResolution.toFixed(3)), 0, 1);

  const overall = clamp(Number(((adjustedNameResolution * 0.58) + (contextFit * 0.42)).toFixed(3)), 0, 1);
  return { overall, nameResolution: adjustedNameResolution, contextFit };
}

function buildWeightedScoreBreakdown(weighted, parsedContext, confidence, engineTrace) {
  const c = weighted.contributions || {};
  const w = weighted.profile || {};
  const steps = [];
  const fmtWeightPct = (value) => {
    const pct = (Number(value) || 0) * 100;
    return Math.abs(pct - Math.round(pct)) < 0.05 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
  };

  steps.push({
    step: 'Context Engine Trace',
    points: 0,
    description: [
      `status=${engineTrace.status}`,
      `resolve=${Math.round((confidence.nameResolution || 0) * 100)}%`,
      `context=${Math.round((confidence.contextFit || 0) * 100)}%`,
      `engine=rules-context-v1`
    ].join(' | ')
  });

  if ((w.carryoverScenario || 0) > 0) {
    steps.push({
      step: 'Original Scenario Carryover',
      points: Math.round(((c.carryoverScenario || 0) / 100) * 30),
      description: `Weighted ${fmtWeightPct(w.carryoverScenario)} from original scenario fit.`
    });
  }
  if ((w.carryoverTwist || 0) > 0) {
    steps.push({
      step: 'Original Twist Carryover',
      points: Math.round(((c.carryoverTwist || 0) / 100) * 30),
      description: `Weighted ${fmtWeightPct(w.carryoverTwist)} from original twist fit.`
    });
  }

  steps.push({
    step: 'Current Scenario Fit',
    points: Math.round(((c.currentScenario || 0) / 100) * 30),
    description: `Weighted ${fmtWeightPct(w.currentScenario)} from context scenario fit.`
  });

  if (hasUsableTwist(parsedContext && parsedContext.twist) && (w.currentTwist || 0) > 0) {
    steps.push({
      step: 'Current Twist Fit',
      points: Math.round(((c.currentTwist || 0) / 100) * 30),
      description: `Weighted ${fmtWeightPct(w.currentTwist)} from context twist fit.`
    });
  }

  steps.push({
    step: 'Base Ability',
    points: Math.round(((c.baseAbility || 0) / 100) * 30),
    description: `Weighted ${fmtWeightPct(w.baseAbility)} from resolved capability profile.`
  });

  steps.push({
    step: parsedContext && parsedContext.evaluationMode === 'final' ? 'Restraints + Chemistry' : 'Restraints',
    points: Math.round(((c.restraints || 0) / 100) * 30),
    description: `Weighted ${fmtWeightPct(w.restraints)} from rarity/creativity${parsedContext && parsedContext.evaluationMode === 'final' ? '/chemistry' : ''}.`
  });

  steps.push({
    step: 'Final Weighted Score',
    points: weighted.score30,
    description: `Deterministic weighted total (${weighted.overallPct}%).`
  });
  return steps;
}

function buildCharacterSummaryLine({ engineTrace, scoringInfo, subscores }) {
  const summaryParts = [
    `Context Engine v1 (${engineTrace.status})`,
    `Resolve ${Math.round((engineTrace.confidence.nameResolution || 0) * 100)}%`,
    `Context ${Math.round((engineTrace.confidence.contextFit || 0) * 100)}%`
  ];
  if (engineTrace.matchedTraits.length) summaryParts.push(`Traits: ${engineTrace.matchedTraits.slice(0, 3).join(', ')}`);
  if (engineTrace.riskFlags.length) summaryParts.push(`Flags: ${engineTrace.riskFlags.slice(0, 2).join(', ')}`);
  const variantSpecificity = subscores && subscores._variantSpecificity && typeof subscores._variantSpecificity === 'object'
    ? subscores._variantSpecificity
    : null;
  if (variantSpecificity && variantSpecificity.qualifier) {
    summaryParts.push(`Variant: ${variantSpecificity.qualifier}`);
  }

  const source = String(scoringInfo && scoringInfo.source || '').trim();
  const title = String(scoringInfo && scoringInfo.title || scoringInfo && scoringInfo.name || '').trim();
  const blurb = truncateText(scoringInfo && scoringInfo.description, 88);
  const sourceLine = source && title
    ? `Resolved via ${source} as "${title}".`
    : title
      ? `Resolved as "${title}".`
      : 'Resolver fallback used.';
  return `${summaryParts.join(' | ')}. ${sourceLine}${blurb ? ` ${blurb}` : ''}`.trim();
}

function buildScenarioNarrative({ relevance, subscores }) {
  const scenario = relevance && relevance.scenario ? relevance.scenario : null;
  const fitScore = Number(subscores && subscores.currentScenarioFit) || 0;
  const feasibility = Number(scenario && scenario.feasibilityScore) || 0;
  const matchedTraits = Array.isArray(scenario && scenario.matchedTraits) ? scenario.matchedTraits.slice(0, 4) : [];
  const heuristic = subscores && subscores._contextHeuristic ? subscores._contextHeuristic : null;
  const heuristicDelta = Number(heuristic && heuristic.scenarioDelta) || 0;

  let headline = 'Low scenario fit';
  if (fitScore >= 80) headline = 'Excellent scenario fit';
  else if (fitScore >= 66) headline = 'Strong scenario fit';
  else if (fitScore >= 52) headline = 'Workable scenario fit';
  else if (fitScore >= 40) headline = 'Weak scenario fit';

  const lines = [`${headline} (${Math.max(0, Math.min(10, Math.round(feasibility)))}/10 feasibility).`];
  if (matchedTraits.length) lines.push(`Matched traits: ${matchedTraits.join(', ')}.`);
  if (heuristicDelta !== 0) lines.push(`Context heuristic adjustment ${heuristicDelta > 0 ? '+' : ''}${heuristicDelta}.`);
  return lines.join(' ');
}

function buildTwistNarrative({ relevance, twist, subscores }) {
  if (!hasUsableTwist(twist)) return 'No active twist.';
  const twistRel = relevance && relevance.twist ? relevance.twist : null;
  const fitScore = Number(subscores && subscores.currentTwistFit) || 0;
  const impact = Number(twistRel && twistRel.impactScore) || 0;
  const heuristic = subscores && subscores._contextHeuristic ? subscores._contextHeuristic : null;
  const heuristicDelta = Number(heuristic && heuristic.twistDelta) || 0;
  const helpTraits = Array.isArray(twistRel && twistRel.helpTraits) ? twistRel.helpTraits.slice(0, 3) : [];
  const hurtTraits = Array.isArray(twistRel && twistRel.hurtTraits) ? twistRel.hurtTraits.slice(0, 3) : [];

  let headline = 'Twist effect is mostly neutral';
  if (fitScore >= 68 || impact >= 2) headline = 'Twist likely helps execution';
  else if (fitScore <= 42 || impact <= -2) headline = 'Twist likely hurts execution';

  const lines = [`${headline} (${fitScore}/100 twist fit).`];
  if (helpTraits.length) lines.push(`Helps with: ${helpTraits.join(', ')}.`);
  if (hurtTraits.length) lines.push(`Hurts: ${hurtTraits.join(', ')}.`);
  if (heuristicDelta !== 0) lines.push(`Context heuristic adjustment ${heuristicDelta > 0 ? '+' : ''}${heuristicDelta}.`);
  return lines.join(' ');
}

function buildScenarioPersonalityLine({ parsedContext, subscores, relevance }) {
  const scenarioText = String(parsedContext && parsedContext.scenario || '').trim();
  if (!scenarioText) return '';
  const fitScore = Number(subscores && subscores.currentScenarioFit) || 0;
  const traits = Array.isArray(relevance && relevance.profile && relevance.profile.topTraits) ? relevance.profile.topTraits : [];
  const traitSet = new Set(traits.map((t) => String(t || '').toLowerCase()));
  const upper = scenarioText.toUpperCase();

  if (/CYBER/.test(upper)) {
    if (traitSet.has('intelligence') || traitSet.has('cyber') || traitSet.has('engineering')) {
      return fitScore >= 70
        ? 'Good cyber-panic fit: this profile can read patterns fast and make decisions under signal chaos.'
        : 'Some cyber-panic utility is present, but it is not a specialist-grade fit.';
    }
    return fitScore >= 60
      ? 'Can contribute to a cyber panic through adjacent strengths, but this is not a natural domain match.'
      : 'Cyber panic is outside this entry’s strongest problem-solving lane.';
  }

  if (/QUANTUM/.test(upper) && /NET|NETWORK|GRID|SYSTEM/.test(upper)) {
    if (traitSet.has('engineering') || traitSet.has('intelligence') || traitSet.has('control')) {
      return fitScore >= 72
        ? 'Strong quantum-net remediation fit: this profile can diagnose precision failures and restore control under technical pressure.'
        : fitScore >= 56
          ? 'There is a workable technical remediation lane here, but precision execution matters a lot.'
          : 'There is some technical utility here, but the profile lacks the precision/control ceiling for clean quantum-net remediation.';
    }
    return fitScore >= 58
      ? 'This can contribute around the edges of a quantum-net failure, but it is not a natural precision-tech fit.'
      : 'Quantum-net remediation is a precision science/engineering problem this profile does not naturally solve.';
  }

  if (/CHEMICAL SPILL|TOXIC SPILL|HAZMAT SPILL|CHEMICAL LEAK|TOXIC LEAK/.test(upper)) {
    if (traitSet.has('engineering') || traitSet.has('intelligence') || traitSet.has('control')) {
      return fitScore >= 72
        ? 'Strong chemical-spill response fit: this profile can diagnose the hazard, control spread, and coordinate safe remediation.'
        : fitScore >= 56
          ? 'There is a workable hazmat-remediation lane here, but execution needs precision and discipline.'
          : 'There is some utility here, but chemical-spill response is a precision-control problem first.';
    }
    return fitScore >= 58
      ? 'This can help around a chemical spill, but not as a primary remediation specialist.'
      : 'Chemical-spill remediation needs hazard control and precision this profile does not naturally project.';
  }

  if (/SERVICE BREAKDOWN|SERVICE OUTAGE|SERVICE FAILURE|RECOVER A SERVICE/.test(upper)) {
    if (traitSet.has('engineering') || traitSet.has('leadership') || traitSet.has('control') || traitSet.has('communication')) {
      return fitScore >= 70
        ? 'Strong service-recovery fit: this profile can stabilize chaos and restore operation flow quickly.'
        : 'There is a real service-recovery angle here, but execution quality depends on support/context.';
    }
    return 'Service recovery is possible, but the entry does not naturally profile as an operator/fixer.';
  }

  if (/TRANSIT|COMMUTE|STATION|DISPATCH/.test(upper)) {
    return fitScore >= 70
      ? 'Strong transit-recovery fit: this profile can restore flow, triage bottlenecks, and keep movement organized.'
      : fitScore >= 52
        ? 'There is a workable transit-ops angle here, but the fit depends on support and coordination.'
        : 'Transit restoration asks for operational control this entry does not clearly project.';
  }

  if (/SPECIES ESCAPE|ANIMAL ESCAPE|CONTAINMENT BREACH|SWARM TAKEOVER/.test(upper)) {
    if (traitSet.has('control') || traitSet.has('leadership') || traitSet.has('communication') || traitSet.has('adaptability')) {
      return fitScore >= 70
        ? 'Good containment-ops fit: this profile can coordinate movement, triage chaos, and restore control.'
        : 'There is a workable containment angle, but execution depends on support and discipline.';
    }
    return fitScore >= 55
      ? 'This can contribute to a species-escape response, but mostly through raw pressure rather than coordination.'
      : 'Species-escape containment needs control and coordination this entry does not clearly project.';
  }

  if (/FOOD SHORTAGE|FAMINE|HUNGER CRISIS|MEAL SHORTAGE/.test(upper)) {
    if (traitSet.has('leadership') || traitSet.has('communication') || traitSet.has('logistics') || traitSet.has('adaptability')) {
      return fitScore >= 72
        ? 'Strong food-shortage response fit: this profile can coordinate supply flow, calm chaos, and keep people moving.'
        : fitScore >= 56
          ? 'There is a workable shortage-response lane here, but performance depends on support and execution discipline.'
          : 'This entry can help around a shortage, but it does not strongly project supply-control leadership.';
    }
    return fitScore >= 58
      ? 'There is a niche contribution here, but food-shortage recovery usually rewards organization and crew control.'
      : 'Food-shortage recovery is mostly an ops/leadership problem this profile does not naturally solve.';
  }

  if (/UNDERGROUND/.test(upper) && /FLOOD|FLOODED|WATER/.test(upper)) {
    return fitScore >= 72
      ? 'Excellent flood-navigation fit: this profile can keep moving, route decisions, and control panic under dangerous terrain.'
      : fitScore >= 56
        ? 'There is a workable flood-navigation lane here, but execution gets shaky once the terrain and pressure stack up.'
        : 'Underground flood navigation demands control, adaptability, and route judgment this profile does not clearly project.';
  }

  if (/FLOOD|FLOODED|DELUGE/.test(upper)) {
    return fitScore >= 72
      ? 'Strong flood-response fit: this profile can operate through movement disruption and rising-pressure conditions.'
      : fitScore >= 56
        ? 'There is some flood-response utility here, but the fit depends on support and coordination.'
        : 'Flood response asks for control and adaptation this profile does not clearly show.';
  }

  if (/CASCADE FAILURE|GRID CRASH|GRID FAILURE/.test(upper)) {
    return fitScore >= 72
      ? 'Cascade-failure recovery rewards fast diagnosis and controlled sequencing, which this profile can actually provide.'
      : fitScore >= 56
        ? 'There is a workable cascade-recovery lane here, but the profile may struggle if the failures start chaining.'
        : 'Cascade failures punish slow diagnosis and weak control; this profile looks underbuilt for chain-reaction recovery.';
  }

  if (/DECODE|EVACUAT|ARCHIVE|LOGISTIC/.test(upper)) {
    return fitScore >= 70
      ? 'This scenario maps cleanly onto the entry’s toolkit and decision profile.'
      : fitScore >= 52
        ? 'There is a workable line here, but the fit is conditional.'
        : 'This scenario asks for capabilities the entry does not clearly show.';
  }

  return '';
}

function buildTwistPersonalityLine({ parsedContext, subscores, relevance, scoringInfo }) {
  const twistText = String(parsedContext && parsedContext.twist || '').trim();
  if (!twistText || !hasUsableTwist(twistText)) return '';
  const fitScore = Number(subscores && subscores.currentTwistFit) || 0;
  const traits = Array.isArray(relevance && relevance.profile && relevance.profile.topTraits) ? relevance.profile.topTraits : [];
  const traitSet = new Set(traits.map((t) => String(t || '').toLowerCase()));
  const description = String(scoringInfo && scoringInfo.description || '').toLowerCase();
  const upper = twistText.toUpperCase();

  if (/MANUAL TOOLS ONLY/.test(upper) || (/MANUAL/.test(upper) && /TOOLS/.test(upper))) {
    const fieldcraft = traitSet.has('combat') || traitSet.has('stealth') || traitSet.has('engineering') || traitSet.has('adaptability') || traitSet.has('intelligence');
    if (fieldcraft) {
      return fitScore >= 65
        ? 'Manual-tools-only still leaves a strong path here: fieldcraft and practical gear matter.'
        : 'Manual-tools-only lowers the ceiling, but this entry still has some practical utility.';
    }
    return 'Manual-tools-only removes the systems this entry would usually rely on.';
  }

  if (/COMMS LAG|LATENCY|90 SECONDS/.test(upper)) {
    if (traitSet.has('communication') || traitSet.has('leadership') || traitSet.has('intelligence') || traitSet.has('control')) {
      return fitScore >= 60
        ? 'Comms lag is manageable: this profile can make decisions with delayed feedback and imperfect coordination.'
        : 'Comms lag creates friction, but this entry still has enough judgment to function.';
    }
    return 'Heavy comms delay breaks the entry’s preferred rhythm and coordination patterns.';
  }

  if (/RULEBOOK|OVERSIGHT|COMPLIANCE/.test(upper)) {
    if (traitSet.has('control') || traitSet.has('leadership') || traitSet.has('intelligence') || traitSet.has('communication')) {
      return fitScore >= 62
        ? 'Rulebook oversight fits better than it sounds here: controlled execution and disciplined choices matter.'
        : 'Oversight adds friction, but this entry can still function if it stays disciplined.';
    }
    return 'Rulebook oversight narrows options and punishes the improvisation this profile usually leans on.';
  }

  if (/ROOKIE|ROOKIES|NEW RECRUITS|INEXPERIENCED CREW/.test(upper)) {
    if (traitSet.has('leadership') || traitSet.has('communication') || traitSet.has('intelligence') || traitSet.has('control')) {
      return fitScore >= 62
        ? 'Rookie-heavy crew is actually manageable here: teaching, callouts, and disciplined pacing matter.'
        : 'Rookies add friction, but this profile still has enough leadership/communication to keep the group functional.';
    }
    return 'A rookie-heavy crew raises the coordination burden beyond this profile’s strongest lane.';
  }

  if (/FUEL CAPPED|FUEL CAP|CAPPED PER PHASE|LIMITED FUEL/.test(upper)) {
    if (traitSet.has('logistics') || traitSet.has('engineering') || traitSet.has('control') || traitSet.has('adaptability')) {
      return fitScore >= 62
        ? 'Fuel caps reward efficient sequencing and pacing, which this profile can manage.'
        : 'Fuel caps lower the ceiling, but there is still an efficiency angle here.';
    }
    return 'Fuel caps punish wasteful plans and brute-force pacing more than this profile can comfortably absorb.';
  }

  if (/SPLIT ACROSS ZONES|ACROSS ZONES|MULTIPLE ZONES/.test(upper)) {
    if (traitSet.has('communication') || traitSet.has('leadership') || traitSet.has('control') || traitSet.has('adaptability')) {
      return fitScore >= 62
        ? 'Split-zone operations are manageable here: coordination, delegation, and clean callouts matter.'
        : 'Split-zone pressure adds friction, but this profile still has some coordination tools.';
    }
    return 'Split-zone execution raises the coordination burden beyond this profile’s strongest lane.';
  }

  if (/AFTERSHOCK|AFTERSHOCKS|TREMORS/.test(upper)) {
    if (traitSet.has('adaptability') || traitSet.has('durability') || traitSet.has('control') || traitSet.has('leadership')) {
      return fitScore >= 62
        ? 'Constant aftershocks are manageable here: stability, adaptation, and calm execution matter.'
        : 'Aftershocks add chaos, but this profile has some resilience and control to stay functional.';
    }
    return 'Constant aftershocks punish unstable execution and precision-heavy plans for this profile.';
  }

  if (/NON-LETHAL/.test(upper)) {
    if (traitSet.has('control') || traitSet.has('communication') || traitSet.has('intelligence') || /detective|hero/.test(description)) {
      return fitScore >= 60
        ? 'Non-lethal protocol is manageable here; the profile can operate with restraint.'
        : 'Non-lethal protocol forces a narrower plan than this entry prefers.';
    }
  }

  return '';
}

function computeContextOvrModel({
  character,
  scoringInfo,
  resolution,
  relevance,
  parsedContext,
  subscores,
  confidence,
  weighted
}) {
  const baseAbility = clamp(Number(subscores && subscores.baseAbility) || 55, 0, 100);
  const rarity = clamp(Number(subscores && subscores.rarity) || 50, 0, 100);
  const creativity = clamp(Number(subscores && subscores.creativity) || 50, 0, 100);
  const chemistry = clamp(Number(subscores && subscores.chemistry) || 50, 0, 100);
  const currentScenarioFit = clamp(Number(subscores && subscores.currentScenarioFit) || 50, 0, 100);
  const currentTwistFit = clamp(Number(subscores && subscores.currentTwistFit) || 50, 0, 100);
  const originalScenarioFit = clamp(Number(subscores && subscores.originalScenarioFit) || 50, 0, 100);
  const originalTwistFit = clamp(Number(subscores && subscores.originalTwistFit) || 50, 0, 100);
  const categoryContext = subscores && subscores._categoryContext && typeof subscores._categoryContext === 'object'
    ? subscores._categoryContext
    : null;
  const categoryActive = Boolean(categoryContext && categoryContext.active !== false);
  const categoryFit = clamp(
    Number(categoryContext && categoryContext.categoryFit) || Number(subscores && subscores.categoryFit) || 50,
    0,
    100
  );
  const categoryMembership = clamp(Number(categoryContext && categoryContext.membershipConfidence) || 50, 0, 100);
  const categoryImpact = Number(categoryContext && categoryContext.netImpact) || 0;
  const categoryStatus = String(categoryContext && categoryContext.categoryStatus || '').trim().toLowerCase();

  const traits = Array.isArray(relevance && relevance.profile && relevance.profile.topTraits)
    ? relevance.profile.topTraits.map((t) => String(t || '').toLowerCase()).filter(Boolean)
    : [];
  const traitSet = new Set(traits);
  const heuristicEntityKind = subscores && subscores._contextHeuristic && subscores._contextHeuristic.entityKind
    ? String(subscores._contextHeuristic.entityKind)
    : '';
  const inferredEntityKind = inferEntityKind(scoringInfo, character);
  const entityKind = heuristicEntityKind && heuristicEntityKind !== 'unknown'
    ? heuristicEntityKind
    : inferredEntityKind;
  const desc = String(scoringInfo && scoringInfo.description || '').toLowerCase();
  const infoSource = String(scoringInfo && scoringInfo.source || '').toLowerCase();
  const titleText = String(scoringInfo && (scoringInfo.title || scoringInfo.name) || character || '').toLowerCase();
  const isBruceBannerIdentity = /bruce banner/.test(titleText);
  const confidenceOverall = clamp(Number(confidence && confidence.overall) || 0, 0, 1);
  const confidenceName = clamp(Number(confidence && confidence.nameResolution) || 0, 0, 1);
  const resolutionRiskFlags = new Set(
    Array.isArray(resolution && resolution.riskFlags)
      ? resolution.riskFlags.map((f) => String(f || '').toLowerCase()).filter(Boolean)
      : []
  );
  const heuristicFlags = new Set(
    Array.isArray(subscores && subscores._contextHeuristic && subscores._contextHeuristic.flags)
      ? subscores._contextHeuristic.flags.map((f) => String(f || '').toLowerCase()).filter(Boolean)
      : []
  );

  function inferNeutralPowerBand() {
    const hasMythic = textIncludesAny(desc, ['god', 'deity', 'demigod', 'omnipotent', 'cosmic entity', 'primordial']);
    const hasHeroLabel = textIncludesAny(desc, ['superhero']);
    const hasPortrayalBioSignals = textIncludesAny(desc, [
      'actor', 'actress', 'portrayed', 'role in', 'film', 'television', 'known for playing'
    ]);
    const hasLiteralPowerSignals = textIncludesAny(desc, [
      'superhuman', 'kryptonian', 'mutant', 'meta-human', 'supernatural', 'wizard', 'sorcerer', 'magic'
    ]);
    const hasFranchiseSuperSignals = textIncludesAny(desc, ['superhero', 'comic book']);
    const hasSuper = hasLiteralPowerSignals || (hasFranchiseSuperSignals && !hasPortrayalBioSignals);
    const hasAthleteSignals = textIncludesAny(desc, [
      'athlete', 'olympian', 'olympic', 'quarterback', 'running back', 'boxer', 'fighter', 'champion'
    ]);
    const hasGeniusSignals = textIncludesAny(desc, [
      'genius', 'inventor', 'scientist', 'engineer', 'detective', 'strategist'
    ]);
    const hasEliteHumanSignals = textIncludesAny(desc, [
      'founder', 'co-founder', 'entrepreneur', 'inventor', 'engineer', 'scientist', 'executive', 'ceo', 'commander', 'general'
    ]);
    const hasEntertainmentSignals = textIncludesAny(desc, [
      'actor', 'actress', 'model', 'musician', 'singer', 'performer', 'comedian', 'television personality'
    ]);
    const isOperatorProfile = traitSet.has('engineering')
      || traitSet.has('intelligence')
      || traitSet.has('leadership')
      || traitSet.has('control')
      || traitSet.has('combat')
      || traitSet.has('stealth');

    if (isBruceBannerIdentity && textIncludesAny(desc, ['scientist', 'gamma', 'research', 'engineer', 'inventor'])) {
      return { ceilingClass: 'elite_operator_human', baseFloor: 22, baseCeiling: 74, neutralCap: 84, attributeCap: 10 };
    }

    if (entityKind === 'person' && hasAthleteSignals) {
      return { ceilingClass: 'elite_athlete_human', baseFloor: 24, baseCeiling: 74, neutralCap: 82, attributeCap: 10 };
    }
    if (entityKind === 'person' && hasEntertainmentSignals && !hasSuper && !hasMythic) {
      return { ceilingClass: 'entertainment_human', baseFloor: 18, baseCeiling: 62, neutralCap: 72, attributeCap: 8 };
    }
    if (entityKind === 'person' && hasGeniusSignals && isOperatorProfile) {
      return { ceilingClass: 'elite_operator_human', baseFloor: 24, baseCeiling: 76, neutralCap: 84, attributeCap: 11 };
    }
    if (entityKind === 'person' && (hasEliteHumanSignals || isOperatorProfile)) {
      return { ceilingClass: 'elite_human', baseFloor: 22, baseCeiling: 72, neutralCap: 80, attributeCap: 10 };
    }
    if (entityKind === 'person') {
      return { ceilingClass: 'human', baseFloor: 18, baseCeiling: 66, neutralCap: 74, attributeCap: 8 };
    }

    if (hasMythic) {
      return { ceilingClass: 'mythic', baseFloor: 42, baseCeiling: 94, neutralCap: 97, attributeCap: 16 };
    }
    if (hasSuper && textIncludesAny(desc, ['cosmic', 'deity', 'planet', 'galaxy'])) {
      return { ceilingClass: 'apex_superhuman', baseFloor: 38, baseCeiling: 91, neutralCap: 96, attributeCap: 16 };
    }
    if (hasSuper) {
      return { ceilingClass: 'superhuman', baseFloor: 34, baseCeiling: 88, neutralCap: 94, attributeCap: 14 };
    }
    if (entityKind === 'fictional_character' && (isOperatorProfile || hasHeroLabel)) {
      if (hasHeroLabel && (traitSet.has('combat') || traitSet.has('stealth'))) {
        return { ceilingClass: 'heroic_fiction', baseFloor: 30, baseCeiling: 84, neutralCap: 91, attributeCap: 12 };
      }
      return { ceilingClass: 'heroic_fiction', baseFloor: 28, baseCeiling: 80, neutralCap: 87, attributeCap: 12 };
    }
    if (entityKind === 'fictional_character') {
      return { ceilingClass: 'heroic_fiction', baseFloor: 20, baseCeiling: 70, neutralCap: 80, attributeCap: 10 };
    }
    if (entityKind === 'organization') {
      return { ceilingClass: 'organization', baseFloor: 16, baseCeiling: 68, neutralCap: 78, attributeCap: 8 };
    }
    if (entityKind === 'object_tool') {
      return { ceilingClass: 'object_tool', baseFloor: 12, baseCeiling: 62, neutralCap: 72, attributeCap: 7 };
    }
    if (entityKind === 'animal') {
      return { ceilingClass: 'animal', baseFloor: 10, baseCeiling: 58, neutralCap: 68, attributeCap: 7 };
    }
    if (entityKind === 'food_bio') {
      return { ceilingClass: 'food_bio', baseFloor: 8, baseCeiling: 50, neutralCap: 60, attributeCap: 6 };
    }
    if (entityKind === 'media_work') {
      return { ceilingClass: 'media_work', baseFloor: 6, baseCeiling: 44, neutralCap: 52, attributeCap: 5 };
    }
    return { ceilingClass: 'unknown', baseFloor: 16, baseCeiling: 66, neutralCap: 76, attributeCap: 8 };
  }

  const powerBand = inferNeutralPowerBand();

  const capabilityBase = clamp(
    Math.round(powerBand.baseFloor + Math.pow(baseAbility / 100, 1.16) * (powerBand.baseCeiling - powerBand.baseFloor)),
    powerBand.baseFloor,
    powerBand.baseCeiling
  );
  const rarityBonus = clamp(Math.round(((rarity - 50) / 50) * 4), -5, 6);

  let attributeBonus = 0;
  attributeBonus += Math.min(6, Math.round(traits.length * 1.3));
  if (traitSet.has('engineering') || traitSet.has('intelligence')) attributeBonus += 2;
  if (traitSet.has('leadership') || traitSet.has('control') || traitSet.has('communication')) attributeBonus += 1;
  if (traitSet.has('combat') || traitSet.has('stealth')) attributeBonus += 1;

  if (
    !isBruceBannerIdentity
    && textIncludesAny(desc, ['superhero', 'superhuman', 'kryptonian', 'deity', 'god', 'demigod', 'magic', 'wizard', 'sorcerer'])
    && !(entityKind === 'person' && textIncludesAny(desc, ['actor', 'actress', 'portrayed', 'role in', 'film', 'television']))
  ) {
    attributeBonus += 8;
  } else if (textIncludesAny(desc, ['alien', 'mutant', 'meta-human', 'supernatural'])) {
    attributeBonus += 5;
  } else if (textIncludesAny(desc, ['businessman', 'entrepreneur', 'inventor', 'engineer', 'executive', 'founder'])) {
    attributeBonus += 3;
  }
  if (isBruceBannerIdentity) attributeBonus += 2;

  if (entityKind === 'food_bio' || entityKind === 'animal') attributeBonus -= 2;
  if (entityKind === 'media_work') attributeBonus -= 3;
  attributeBonus = clamp(attributeBonus, -4, Number(powerBand.attributeCap) || 10);

  const confidenceBonus = clamp(Math.round(confidenceOverall * 2), 0, 2);
  const neutralBaseOVR = clamp(
    capabilityBase + rarityBonus + attributeBonus + confidenceBonus,
    Math.max(5, powerBand.baseFloor - 4),
    powerBand.neutralCap
  );

  const profile = weighted && weighted.profile ? weighted.profile : {};
  const contributions = weighted && weighted.contributions ? weighted.contributions : {};
  const fitWeightTotal =
    (Number(profile.carryoverScenario) || 0) +
    (Number(profile.carryoverTwist) || 0) +
    (Number(profile.currentScenario) || 0) +
    (Number(profile.currentTwist) || 0);
  const fitContribution =
    (Number(contributions.carryoverScenario) || 0) +
    (Number(contributions.carryoverTwist) || 0) +
    (Number(contributions.currentScenario) || 0) +
    (Number(contributions.currentTwist) || 0);
  const neutralFitContribution = 50 * fitWeightTotal;

  let fitDelta = 0;
  const jaccardOverlap = (aValues, bValues) => {
    const a = new Set((Array.isArray(aValues) ? aValues : []).map((v) => String(v || '').toLowerCase()).filter(Boolean));
    const b = new Set((Array.isArray(bValues) ? bValues : []).map((v) => String(v || '').toLowerCase()).filter(Boolean));
    if (!a.size && !b.size) return 0;
    let intersection = 0;
    for (const v of a) {
      if (b.has(v)) intersection += 1;
    }
    const union = new Set([...a, ...b]).size || 1;
    return intersection / union;
  };
  const currentScenarioText = String(parsedContext && parsedContext.scenario || '').trim().toLowerCase();
  const currentTwistText = String(parsedContext && parsedContext.twist || '').trim().toLowerCase();
  const originalScenarioText = String(parsedContext && parsedContext.originalScenario || '').trim().toLowerCase();
  const originalTwistText = String(parsedContext && parsedContext.originalTwist || '').trim().toLowerCase();
  const scenarioIntentOverlap = jaccardOverlap(
    parsedContext && parsedContext.intents && parsedContext.intents.scenario,
    parsedContext && parsedContext.originalIntents && parsedContext.originalIntents.scenario
  );
  const twistIntentOverlap = jaccardOverlap(
    parsedContext && parsedContext.intents && parsedContext.intents.twist,
    parsedContext && parsedContext.originalIntents && parsedContext.originalIntents.twist
  );
  const scenarioTextSame = Boolean(currentScenarioText && originalScenarioText && currentScenarioText === originalScenarioText);
  const twistTextSame = Boolean(currentTwistText && originalTwistText && currentTwistText === originalTwistText);
  const carryoverScenarioAssistDampen = (parsedContext && parsedContext.evaluationMode === 'final')
    ? clamp(1 - ((scenarioTextSame ? 0.3 : 0) + (scenarioIntentOverlap * 0.2)), 0.55, 1)
    : 1;
  const carryoverTwistAssistDampen = (parsedContext && parsedContext.evaluationMode === 'final')
    ? clamp(1 - ((twistTextSame ? 0.28 : 0) + (twistIntentOverlap * 0.18)), 0.6, 1)
    : 1;
  const carryoverScenarioAssistCoef = ((Number(profile.carryoverScenario) || 0) * 0.20) * carryoverScenarioAssistDampen;
  const carryoverTwistAssistCoef = ((Number(profile.carryoverTwist) || 0) * 0.10) * carryoverTwistAssistDampen;
  const currentScenarioAssistCoef = (Number(profile.currentScenario) || 0) * 0.25;
  const currentTwistAssistCoef = (Number(profile.currentTwist) || 0) * (7 / 30); // matches prior 0.07 at 30% twist weight
  fitDelta += Math.round((fitContribution - neutralFitContribution) * 0.78);
  fitDelta += Math.round(
    ((currentScenarioFit - 50) * currentScenarioAssistCoef) +
    ((currentTwistFit - 50) * currentTwistAssistCoef)
  );
  fitDelta += Math.round(
    ((originalScenarioFit - 50) * (
      parsedContext && parsedContext.evaluationMode === 'final'
        ? carryoverScenarioAssistCoef
        : 0.03
    )) +
    ((originalTwistFit - 50) * (
      parsedContext && parsedContext.evaluationMode === 'final'
        ? carryoverTwistAssistCoef
        : 0.02
    ))
  );

  const opsContextActive = [
    'logistics_context',
    'transit_context',
    'morning_ops_context',
    'service_recovery_context',
    'comms_lag_context',
    'species_escape_context',
    'food_shortage_context',
    'quantum_tech_context',
    'chemical_spill_context',
    'cascade_failure_context',
    'rulebook_oversight_context',
    'fuel_cap_context',
    'split_zones_context',
    'aftershocks_context',
    'rookie_crew_context'
  ].some((flag) => heuristicFlags.has(flag));
  const opsTraitCount = countTraitMatches(traits, [
    'engineering', 'leadership', 'control', 'communication', 'intelligence', 'logistics', 'adaptability'
  ]);
  const powerTraitCount = countTraitMatches(traits, ['power', 'combat', 'speed']);
  const superPowerSignals = textIncludesAny(desc, [
    'superhuman', 'kryptonian', 'deity', 'god', 'demigod', 'cosmic', 'omnipotent', 'mutant', 'meta-human'
  ]) || (
    textIncludesAny(desc, ['superhero'])
    && !(
      entityKind === 'person'
      && textIncludesAny(desc, ['actor', 'actress', 'portrayed', 'role in', 'film', 'television'])
    )
  );
  const techSpecialistSignals = textIncludesAny(desc, [
    'scientist', 'engineer', 'inventor', 'genius', 'physicist', 'chemist', 'technician', 'research', 'laboratory', 'lab'
  ]);
  const serviceOpsSignals = textIncludesAny(desc, [
    'chef', 'restaurant', 'kitchen', 'host', 'manager', 'coordinator', 'planner', 'operator', 'dispatcher', 'coach', 'mentor', 'teacher'
  ]);
  const toonForceSignals = textIncludesAny(desc, ['bugs bunny', 'looney tunes', 'toon force', 'cartoon']);
  const hulkLikePrecisionRisk = /(^| )hulk( |$)/i.test(titleText) && !isBruceBannerIdentity;
  const starkLikeTechIdentity = textIncludesAny(`${titleText} ${desc}`, ['tony stark', 'iron man']);
  const heroicPowerClass = ['mythic', 'apex_superhuman', 'superhuman', 'heroic_fiction'].includes(powerBand.ceilingClass);
  const heavyPowerClass = ['mythic', 'apex_superhuman', 'superhuman'].includes(powerBand.ceilingClass);
  const leadershipMentorTraitCount = countTraitMatches(traits, ['leadership', 'communication', 'control', 'intelligence']);
  const precisionOpsTraitCount = countTraitMatches(traits, ['engineering', 'intelligence', 'control', 'adaptability', 'communication']);
  const fitMean = average(
    hasUsableTwist(parsedContext && parsedContext.twist)
      ? [currentScenarioFit, currentTwistFit]
      : [currentScenarioFit],
    currentScenarioFit
  );
  const strongScenario = currentScenarioFit >= 72;
  const strongTwist = currentTwistFit >= 62;
  const weakScenario = currentScenarioFit <= 42;
  const weakTwist = hasUsableTwist(parsedContext && parsedContext.twist) && currentTwistFit <= 42;
  if (strongScenario) fitDelta += Math.min(8, Math.round((currentScenarioFit - 68) / 4));
  if (strongScenario && strongTwist) fitDelta += 4;
  if (weakScenario) fitDelta -= Math.min(10, Math.round((46 - currentScenarioFit) / 2));
  if (weakScenario && weakTwist) fitDelta -= 4;
  if (opsContextActive) {
    if (opsTraitCount >= 3 && (entityKind === 'person' || entityKind === 'fictional_character' || entityKind === 'organization')) {
      fitDelta += Math.min(10, 3 + (opsTraitCount * 2));
    }
    if ((heuristicFlags.has('cascade_failure_context') || heuristicFlags.has('rulebook_oversight_context'))
      && opsTraitCount >= 3
      && (entityKind === 'person' || entityKind === 'fictional_character' || entityKind === 'organization')) {
      fitDelta += 4;
    }
    if (superPowerSignals && powerTraitCount >= 2 && opsTraitCount <= 1) {
      fitDelta -= fitMean < 60 ? 16 : fitMean < 70 ? 10 : 5;
    }
    if (heuristicFlags.has('cascade_failure_context') && heuristicFlags.has('rulebook_oversight_context')
      && superPowerSignals && powerTraitCount >= 2 && opsTraitCount <= 1) {
      fitDelta -= fitMean < 70 ? 8 : 4;
    }
    if ((entityKind === 'food_bio' || entityKind === 'animal' || entityKind === 'media_work') && fitMean < 65) {
      fitDelta -= 4;
    }
    if (heuristicFlags.has('rulebook_oversight_context') && powerTraitCount >= 2 && opsTraitCount <= 2) {
      fitDelta -= fitMean < 60 ? 8 : 4;
    }
    if (heuristicFlags.has('fuel_cap_context') && powerTraitCount >= 2 && opsTraitCount <= 2) {
      fitDelta -= fitMean < 60 ? 7 : 3;
    }
    if (heuristicFlags.has('food_shortage_context')
      && heroicPowerClass
      && opsTraitCount <= 1
      && !textIncludesAny(desc, ['food', 'restaurant', 'chef', 'kitchen', 'supply', 'logistics'])) {
      fitDelta -= fitMean < 60 ? 14 : fitMean < 70 ? 9 : 4;
    }
    if (heuristicFlags.has('rookie_crew_context')) {
      if (leadershipMentorTraitCount >= 3) fitDelta += 4;
      else if (leadershipMentorTraitCount <= 1) fitDelta -= fitMean < 60 ? 8 : 4;
    }
    if (heuristicFlags.has('food_shortage_context')
      && textIncludesAny(desc, ['food', 'restaurant', 'fast-food', 'fast food', 'chef', 'kitchen', 'franchise'])) {
      fitDelta += 6;
    }
    if (heuristicFlags.has('food_shortage_context')
      && textIncludesAny(desc, ['villain', 'supervillain', 'criminal'])
      && !textIncludesAny(desc, ['food', 'restaurant', 'supply', 'rescue'])
      && leadershipMentorTraitCount <= 2) {
      fitDelta -= 14;
    }
    if (heuristicFlags.has('food_shortage_context') && heuristicFlags.has('rookie_crew_context')
      && textIncludesAny(desc, ['villain', 'supervillain', 'criminal'])
      && leadershipMentorTraitCount <= 2) {
      fitDelta -= 10;
    }
    if ((heuristicFlags.has('chemical_spill_context') || heuristicFlags.has('quantum_tech_context'))
      && (heavyPowerClass || (heroicPowerClass && powerTraitCount >= 2 && opsTraitCount <= 1))
      && precisionOpsTraitCount <= 2) {
      fitDelta -= fitMean < 52 ? 18 : fitMean < 62 ? 12 : 7;
    }
    if ((heuristicFlags.has('chemical_spill_context') || heuristicFlags.has('quantum_tech_context'))
      && textIncludesAny(desc, ['cosmic', 'planet eater', 'world eater', 'devourer'])) {
      fitDelta -= fitMean < 70 ? 14 : 8;
    }
    if (heuristicFlags.has('aftershocks_context') && (heavyPowerClass || (heroicPowerClass && powerTraitCount >= 2 && opsTraitCount <= 1)) && precisionOpsTraitCount <= 2) {
      fitDelta -= fitMean < 55 ? 8 : 4;
    }
    if ((heuristicFlags.has('chemical_spill_context') || heuristicFlags.has('quantum_tech_context'))
      && precisionOpsTraitCount >= 4
      && textIncludesAny(desc, ['scientist', 'engineer', 'inventor', 'chemist', 'doctor', 'research'])) {
      fitDelta += 8;
    }
    if ((heuristicFlags.has('chemical_spill_context') || heuristicFlags.has('quantum_tech_context') || heuristicFlags.has('cascade_failure_context'))
      && techSpecialistSignals && fitMean < 62) {
      fitDelta += precisionOpsTraitCount >= 3 ? 5 : 9;
    }
    if ((heuristicFlags.has('chemical_spill_context') || heuristicFlags.has('quantum_tech_context') || heuristicFlags.has('cascade_failure_context'))
      && starkLikeTechIdentity && fitMean < 65) {
      fitDelta += 8;
    }
    if ((heuristicFlags.has('service_recovery_context') || heuristicFlags.has('comms_lag_context') || heuristicFlags.has('cascade_failure_context'))
      && (serviceOpsSignals || techSpecialistSignals) && fitMean < 62) {
      fitDelta += 5;
    }
    if ((heuristicFlags.has('service_recovery_context') || heuristicFlags.has('comms_lag_context'))
      && starkLikeTechIdentity && fitMean < 68) {
      fitDelta += 8;
    }
    if ((heavyPowerClass || (heroicPowerClass && powerTraitCount >= 2)) && opsTraitCount <= 1 && fitMean < 70) {
      fitDelta -= fitMean < 52 ? 18 : fitMean < 62 ? 12 : 7;
    }
    if (toonForceSignals && fitMean < 55) {
      fitDelta += 4; // toon-force resilience softens hard context collapse without pretending specialist fit
    }
    if (heuristicFlags.has('food_shortage_context') && heuristicFlags.has('rookie_crew_context') && serviceOpsSignals) {
      fitDelta += 4;
    }
    if (heuristicFlags.has('food_shortage_context') && heuristicFlags.has('rookie_crew_context')
      && textIncludesAny(desc, ['villain', 'supervillain', 'criminal'])
      && !textIncludesAny(desc, ['food', 'restaurant', 'supply', 'rescue'])
      && leadershipMentorTraitCount <= 2) {
      fitDelta -= 10;
    }
  }

  const technicalPrecisionContext =
    heuristicFlags.has('chemical_spill_context')
    || heuristicFlags.has('quantum_tech_context')
    || heuristicFlags.has('split_zones_context')
    || heuristicFlags.has('aftershocks_context');
  if (technicalPrecisionContext) {
    const minFitDeltaByClass = {
      mythic: -48,
      apex_superhuman: -44,
      superhuman: -40,
      heroic_fiction: -34
    };
    const dynamicMin = minFitDeltaByClass[powerBand.ceilingClass];
    if (Number.isFinite(dynamicMin)) {
      const relaxedMin = fitMean < 40 ? dynamicMin - 8 : fitMean < 50 ? dynamicMin - 4 : dynamicMin;
      fitDelta = Math.max(relaxedMin, fitDelta);
    }
    if (hulkLikePrecisionRisk && (heuristicFlags.has('chemical_spill_context') || heuristicFlags.has('quantum_tech_context') || heuristicFlags.has('aftershocks_context'))) {
      fitDelta -= fitMean < 60 ? 14 : 8;
    }
    if (hulkLikePrecisionRisk && heuristicFlags.has('chemical_spill_context') && heuristicFlags.has('aftershocks_context')) {
      fitDelta -= fitMean < 55 ? 12 : 7;
    }
    if (toonForceSignals && precisionOpsTraitCount <= 2 && !techSpecialistSignals) {
      fitDelta -= fitMean < 55 ? 6 : 3; // keep resilience but curb technical overperformance
    }
  }

  const restraintComposite = average([
    rarity,
    creativity,
    parsedContext && parsedContext.evaluationMode === 'final' ? chemistry : 50
  ], 50);
  const restraintDelta = Math.round((restraintComposite - 50) * 0.05);
  const severeRiskFlags = [
    'dangerous_title_diff_suspected',
    'fast_round_timeout_fallback',
    'high_candidate_ambiguity',
    'synthetic_image'
  ];
  const moderateRiskFlags = [
    'title_differs_from_input',
    'no_scenario_keyword_overlap',
    'no_twist_keyword_overlap'
  ];
  const severeRiskCount = severeRiskFlags.reduce((count, flag) => count + (resolutionRiskFlags.has(flag) ? 1 : 0), 0);
  const moderateRiskCount = moderateRiskFlags.reduce((count, flag) => count + (resolutionRiskFlags.has(flag) ? 1 : 0), 0);
  const riskySearchMismatch =
    infoSource.includes('wikipedia-search')
    && resolutionRiskFlags.has('title_differs_from_input')
    && (resolutionRiskFlags.has('synthetic_image') || confidenceName < 0.72);
  const lowTrustRiskStack =
    confidenceName < 0.72
    && (severeRiskCount >= 2 || (severeRiskCount >= 1 && moderateRiskCount >= 2));
  if (confidenceOverall < 0.45) fitDelta -= 3;
  if (confidenceOverall < 0.3) fitDelta -= 4;
  if (confidenceName < 0.72 && resolutionRiskFlags.has('title_differs_from_input')) fitDelta -= 5;
  if (confidenceName < 0.6 && resolutionRiskFlags.has('high_candidate_ambiguity')) fitDelta -= 6;
  if (resolutionRiskFlags.has('dangerous_title_diff_suspected')) fitDelta -= 12;
  if (confidenceName < 0.75 && resolutionRiskFlags.has('dangerous_title_diff_suspected')) fitDelta -= 8;
  if (resolutionRiskFlags.has('dangerous_title_diff_suspected') && resolutionRiskFlags.has('synthetic_image')) fitDelta -= 4;
  if (severeRiskCount >= 2 && moderateRiskCount >= 1) fitDelta -= 6;
  if (lowTrustRiskStack) fitDelta -= 7;
  if (riskySearchMismatch) fitDelta -= 6;
  if (riskySearchMismatch && moderateRiskCount >= 2) fitDelta -= 4;
  if (categoryActive) {
    let categoryPenalty = 0;
    if (categoryStatus === 'not_in_category') categoryPenalty -= 14;
    if (categoryFit < 30 || categoryMembership < 20) categoryPenalty -= 14;
    else if (categoryFit < 40 || categoryMembership < 30) categoryPenalty -= 10;
    else if (categoryFit < 50 || categoryMembership < 40) categoryPenalty -= 4;
    if (categoryImpact <= -20) categoryPenalty -= 4;
    else if (categoryImpact <= -12) categoryPenalty -= 2;
    fitDelta += categoryPenalty;
  }

  let finalOVR = neutralBaseOVR + fitDelta + restraintDelta;
  const weightedTarget = clamp(Number(weighted && weighted.ovr99) || finalOVR, 0, 99);
  const weightedNudge = clamp(weightedTarget - finalOVR, -8, 8);
  finalOVR = Math.round(finalOVR + (weightedNudge * 0.2));
  const contextHeadroomByClass = {
    mythic: 8,
    apex_superhuman: 7,
    superhuman: 7,
    heroic_fiction: 6,
    elite_operator_human: 8,
    elite_athlete_human: 7,
    elite_human: 7,
    entertainment_human: 6,
    human: 8,
    organization: 9,
    object_tool: 10,
    animal: 9,
    food_bio: 8,
    media_work: 6,
    unknown: 8
  };
  const finalCap = clamp(
    (Number(powerBand.neutralCap) || 70) + (contextHeadroomByClass[powerBand.ceilingClass] ?? 8),
    0,
    99
  );
  let confidenceCappedFinalCap = finalCap;
  if (confidenceName < 0.8) confidenceCappedFinalCap -= Math.round((0.8 - confidenceName) * 10);
  if (powerBand.ceilingClass === 'entertainment_human') {
    confidenceCappedFinalCap = Math.min(confidenceCappedFinalCap, 82);
  }
  if (
    entityKind === 'person'
    && !superPowerSignals
    && textIncludesAny(desc, ['actor', 'actress', 'model', 'musician', 'singer', 'performer', 'comedian'])
  ) {
    confidenceCappedFinalCap = Math.min(confidenceCappedFinalCap, 84);
    if (opsTraitCount <= 2) {
      confidenceCappedFinalCap = Math.min(confidenceCappedFinalCap, 80);
    }
  }
  if (confidenceName < 0.65 && resolutionRiskFlags.has('title_differs_from_input')) confidenceCappedFinalCap -= 6;
  if (resolutionRiskFlags.has('fast_round_timeout_fallback')) confidenceCappedFinalCap -= 10;
  if (resolutionRiskFlags.has('high_candidate_ambiguity') && confidenceName < 0.75) confidenceCappedFinalCap -= 5;
  if (resolutionRiskFlags.has('dangerous_title_diff_suspected')) confidenceCappedFinalCap -= 18;
  if (resolutionRiskFlags.has('dangerous_title_diff_suspected') && resolutionRiskFlags.has('synthetic_image')) confidenceCappedFinalCap -= 6;
  if (severeRiskCount >= 2 && moderateRiskCount >= 1) confidenceCappedFinalCap -= 6;
  if (lowTrustRiskStack) confidenceCappedFinalCap -= 6;
  if (riskySearchMismatch) confidenceCappedFinalCap -= 6;
  if (categoryActive) {
    if (categoryStatus === 'not_in_category' || categoryFit < 30 || categoryMembership < 20) {
      confidenceCappedFinalCap = Math.min(confidenceCappedFinalCap, 68);
    } else if (categoryFit < 40 || categoryMembership < 30) {
      confidenceCappedFinalCap = Math.min(confidenceCappedFinalCap, 74);
    } else if (categoryFit < 50 || categoryMembership < 40) {
      confidenceCappedFinalCap = Math.min(confidenceCappedFinalCap, 80);
    } else if (categoryStatus === 'borderline' || categoryFit < 60) {
      confidenceCappedFinalCap = Math.min(confidenceCappedFinalCap, 88);
    }
  }
  confidenceCappedFinalCap = clamp(confidenceCappedFinalCap, 0, 99);
  const finalFloorByClass = {
    mythic: 34,
    apex_superhuman: 30,
    superhuman: 24,
    heroic_fiction: 18,
    elite_operator_human: 12,
    elite_athlete_human: 12,
    elite_human: 10,
    entertainment_human: 8,
    human: 8,
    organization: 6,
    object_tool: 4,
    animal: 4,
    food_bio: 0,
    media_work: 0,
    unknown: 4
  };
  const contextualFloor = Math.min(
    confidenceCappedFinalCap,
    Math.max(
      finalFloorByClass[powerBand.ceilingClass] ?? 4,
      Math.round(neutralBaseOVR * (
        powerBand.ceilingClass === 'mythic' || powerBand.ceilingClass === 'apex_superhuman' || powerBand.ceilingClass === 'superhuman'
          ? 0.38
          : powerBand.ceilingClass === 'heroic_fiction'
            ? 0.3
            : 0.18
      ))
    )
  );
  finalOVR = clamp(finalOVR, contextualFloor, confidenceCappedFinalCap);

  const finalScenarioDelta = finalOVR - neutralBaseOVR;
  const scenarioMultiplier = neutralBaseOVR > 0 ? Number((finalOVR / neutralBaseOVR).toFixed(2)) : 1;
  const scenarioEffectPct = neutralBaseOVR > 0
    ? Math.round(((finalOVR - neutralBaseOVR) / neutralBaseOVR) * 100)
    : 0;

  return {
    finalOVR,
    neutralBaseOVR,
    capabilityBase,
    rarityBonus,
    attributeBonus,
    confidenceBonus,
    fitDelta: finalScenarioDelta,
    scenarioMultiplier,
    scenarioEffectPct,
    restraintDelta,
    weightedTarget,
    calibration: {
      ...(weighted && weighted.ovrCalibration ? weighted.ovrCalibration : {}),
      fitWeightTotal: Number(fitWeightTotal.toFixed(2)),
      fitContribution: Number(fitContribution.toFixed(2)),
      neutralFitContribution: Number(neutralFitContribution.toFixed(2)),
      contextFitDelta: fitDelta,
      restraintDelta,
      weightedNudge,
      ceilingClass: powerBand.ceilingClass,
      neutralBandFloor: powerBand.baseFloor,
      neutralBandCeiling: powerBand.baseCeiling,
      neutralCap: powerBand.neutralCap,
      finalCap: confidenceCappedFinalCap,
      uncappedFinalCap: finalCap,
      confidenceName,
      categoryFit,
      categoryMembership,
      categoryImpact,
      categoryStatus: categoryStatus || null,
      severeRiskCount,
      moderateRiskCount,
      riskySearchMismatch: riskySearchMismatch ? 1 : 0
      ,
      carryoverAssistDampenScenario: Number(carryoverScenarioAssistDampen.toFixed(2)),
      carryoverAssistDampenTwist: Number(carryoverTwistAssistDampen.toFixed(2)),
      originalScenarioIntentOverlap: Number(scenarioIntentOverlap.toFixed(2)),
      originalTwistIntentOverlap: Number(twistIntentOverlap.toFixed(2))
    }
  };
}

function buildEngineTrace({
  resolution,
  parsedContext,
  relevance,
  confidence,
  riskFlags
}) {
  const topTraits = Array.isArray(relevance && relevance.profile && relevance.profile.topTraits)
    ? relevance.profile.topTraits.slice(0, 6)
    : [];
  const matchedIntents = [
    ...(Array.isArray(parsedContext && parsedContext.intents && parsedContext.intents.scenario) ? parsedContext.intents.scenario : []),
    ...(Array.isArray(parsedContext && parsedContext.intents && parsedContext.intents.twist) ? parsedContext.intents.twist : [])
  ].filter(Boolean);

  const domainMatches = getDomainMatches(
    parsedContext && parsedContext.scenario,
    parsedContext && parsedContext.twist,
    buildInfoCorpus(resolution && resolution.scoringInfo, resolution && resolution.normalizedName)
  );

  const status = resolution && resolution.resolutionStatus === 'trusted'
    ? 'resolved'
    : resolution && resolution.resolutionStatus === 'low_confidence'
      ? 'low_confidence_resolve'
      : 'unresolved';

  return {
    status,
    confidence,
    matchedTraits: topTraits,
    matchedIntents: Array.from(new Set(matchedIntents)).slice(0, 8),
    domainMatches: Array.from(new Set(domainMatches)).slice(0, 6),
    riskFlags: Array.from(new Set(riskFlags || []))
  };
}

function augmentBreakdownForContextEngine(breakdown, {
  engineTrace,
  weighted,
  parsedContext,
  relevance,
  subscores,
  scoringInfo
}) {
  if (!breakdown || typeof breakdown !== 'object') return breakdown;
  const heuristic = subscores && subscores._contextHeuristic && typeof subscores._contextHeuristic === 'object'
    ? subscores._contextHeuristic
    : null;
  const variantSpecificity = subscores && subscores._variantSpecificity && typeof subscores._variantSpecificity === 'object'
    ? subscores._variantSpecificity
    : null;
  breakdown.characterSummary = buildCharacterSummaryLine({ engineTrace, scoringInfo, subscores });
  breakdown.engineTrace = {
    engine: 'rules-context-v1',
    ...engineTrace
  };

  if (relevance && relevance.scenario && Array.isArray(relevance.scenario.matchedTraits) && relevance.scenario.matchedTraits.length) {
    breakdown.scenarioRelevance = `${breakdown.scenarioRelevance || ''} Matched traits: ${relevance.scenario.matchedTraits.slice(0, 4).join(', ')}.`;
  }
  if (relevance && relevance.twist && Array.isArray(relevance.twist.helpTraits) && relevance.twist.helpTraits.length) {
    breakdown.twistRelevance = `${breakdown.twistRelevance || ''} Twist help traits: ${relevance.twist.helpTraits.slice(0, 3).join(', ')}.`;
  }

  const dedupeKeywords = (values = []) => {
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(values) ? values : []) {
      const clean = String(raw || '').trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    }
    return out.slice(0, 8);
  };

  const existingScenarioKeywords = Array.isArray(breakdown && breakdown.keywordMatches && breakdown.keywordMatches.scenario)
    ? breakdown.keywordMatches.scenario
    : [];
  const existingTwistKeywords = Array.isArray(breakdown && breakdown.keywordMatches && breakdown.keywordMatches.twist)
    ? breakdown.keywordMatches.twist
    : [];

  const scenarioFallbackKeywords = dedupeKeywords([
    ...(Array.isArray(parsedContext && parsedContext.intents && parsedContext.intents.scenario) ? parsedContext.intents.scenario : []),
    ...(Array.isArray(relevance && relevance.scenario && relevance.scenario.matchedTraits) ? relevance.scenario.matchedTraits : []),
    ...(Array.isArray(engineTrace && engineTrace.domainMatches) ? engineTrace.domainMatches : []),
    ...(Array.isArray(heuristic && heuristic.flags) && heuristic.flags.includes('flood_context') ? ['flood', 'water'] : []),
    ...(Array.isArray(heuristic && heuristic.flags) && heuristic.flags.includes('underground_context') ? ['underground'] : []),
    ...(Array.isArray(heuristic && heuristic.flags) && heuristic.flags.includes('navigation_context') ? ['navigate', 'route'] : []),
    ...(Array.isArray(heuristic && heuristic.flags) && heuristic.flags.includes('food_shortage_context') ? ['food', 'supply', 'shortage'] : []),
    ...(Array.isArray(heuristic && heuristic.flags) && heuristic.flags.includes('quantum_tech_context') ? ['quantum', 'science', 'network'] : []),
    ...(Array.isArray(heuristic && heuristic.flags) && heuristic.flags.includes('chemical_spill_context') ? ['chemical', 'spill', 'hazmat'] : [])
  ]);
  const twistFallbackKeywords = dedupeKeywords([
    ...(Array.isArray(parsedContext && parsedContext.intents && parsedContext.intents.twist) ? parsedContext.intents.twist : []),
    ...(Array.isArray(relevance && relevance.twist && relevance.twist.helpTraits) ? relevance.twist.helpTraits : []),
    ...(Array.isArray(relevance && relevance.twist && relevance.twist.hurtTraits) ? relevance.twist.hurtTraits : []),
    ...(Array.isArray(heuristic && heuristic.flags) && heuristic.flags.includes('rulebook_oversight_context') ? ['rulebook', 'oversight'] : []),
    ...(Array.isArray(heuristic && heuristic.flags) && heuristic.flags.includes('fuel_cap_context') ? ['fuel', 'efficiency'] : []),
    ...(Array.isArray(heuristic && heuristic.flags) && heuristic.flags.includes('split_zones_context') ? ['zones', 'split-team', 'coordination'] : []),
    ...(Array.isArray(heuristic && heuristic.flags) && heuristic.flags.includes('aftershocks_context') ? ['aftershocks', 'stability'] : []),
    ...(Array.isArray(heuristic && heuristic.flags) && heuristic.flags.includes('rookie_crew_context') ? ['rookies', 'training', 'crew'] : [])
  ]);

  breakdown.keywordMatches = breakdown.keywordMatches && typeof breakdown.keywordMatches === 'object'
    ? breakdown.keywordMatches
    : { scenario: [], twist: [] };

  breakdown.keywordMatches.scenario = existingScenarioKeywords.length
    ? dedupeKeywords(existingScenarioKeywords)
    : scenarioFallbackKeywords;
  breakdown.keywordMatches.twist = existingTwistKeywords.length
    ? dedupeKeywords(existingTwistKeywords)
    : twistFallbackKeywords;

  const scenarioNarrative = buildScenarioNarrative({ relevance, subscores });
  const scenarioPersonality = buildScenarioPersonalityLine({ parsedContext, subscores, relevance });
  const twistNarrative = buildTwistNarrative({ relevance, twist: parsedContext && parsedContext.twist, subscores });
  const twistPersonality = buildTwistPersonalityLine({ parsedContext, subscores, relevance, scoringInfo });
  breakdown.scenarioRelevance = [scenarioNarrative, scenarioPersonality].filter(Boolean).join(' ');
  breakdown.twistRelevance = [twistNarrative, twistPersonality].filter(Boolean).join(' ');
  breakdown.contextPrompts = {
    scenario: parsedContext && parsedContext.scenario ? String(parsedContext.scenario) : '',
    twist: parsedContext && parsedContext.twist ? String(parsedContext.twist) : ''
  };
  breakdown.contextFlavor = {
    scenario: scenarioPersonality || '',
    twist: twistPersonality || ''
  };

  breakdown.scoreBreakdown = buildWeightedScoreBreakdown(weighted, parsedContext, engineTrace.confidence, engineTrace);
  if (heuristic && ((Number(heuristic.scenarioDelta) || 0) !== 0 || (Number(heuristic.twistDelta) || 0) !== 0)) {
    breakdown.scoreBreakdown.splice(1, 0, {
      step: 'Context Intent Heuristics',
      points: 0,
      description: [
        `entity=${heuristic.entityKind || 'unknown'}`,
        `scenarioDelta=${Number(heuristic.scenarioDelta) >= 0 ? '+' : ''}${Number(heuristic.scenarioDelta) || 0}`,
        `twistDelta=${Number(heuristic.twistDelta) >= 0 ? '+' : ''}${Number(heuristic.twistDelta) || 0}`,
        ...(Array.isArray(heuristic.flags) && heuristic.flags.length ? [`flags=${heuristic.flags.join(',')}`] : [])
      ].join(' | ')
    });
  }
  if (variantSpecificity) {
    breakdown.scoreBreakdown.splice(1, 0, {
      step: 'Specific Variant Read',
      points: 0,
      description: [
        `variant=${variantSpecificity.qualifier}`,
        `type=${variantSpecificity.type}`,
        `base=${variantSpecificity.baseAbilityDelta >= 0 ? '+' : ''}${variantSpecificity.baseAbilityDelta || 0}`,
        `creativity=${variantSpecificity.creativityDelta >= 0 ? '+' : ''}${variantSpecificity.creativityDelta || 0}`,
        `scenario=${variantSpecificity.scenarioDelta >= 0 ? '+' : ''}${variantSpecificity.scenarioDelta || 0}`,
        `twist=${variantSpecificity.twistDelta >= 0 ? '+' : ''}${variantSpecificity.twistDelta || 0}`
      ].join(' | ')
    });
  }
  return breakdown;
}

function buildContextPublicResult({
  character,
  scenario,
  twist,
  options,
  validation,
  resolution,
  parsedContext,
  relevance,
  nameSignals,
  draftedFitBonus,
  categoryFitResolution,
  weighted,
  confidence,
  subscores
}) {
  const scoringInfo = resolution.scoringInfo || null;
  const score = weighted.score30;
  const contextOvrModel = computeContextOvrModel({
    character: (resolution && resolution.normalizedName) || character,
    scoringInfo,
    resolution,
    relevance,
    parsedContext,
    subscores,
    confidence,
    weighted
  });
  const baseOvrData = calculateAdvancedOVR(score, character, scoringInfo, scenario, twist);
  const ovr = clamp(Math.round(contextOvrModel.finalOVR), 0, 99);
  const ovrData = {
    ...baseOvrData,
    ovr,
    tier: getOVRTier(ovr)
  };

  const riskFlags = buildContextRiskFlags({
    resolution,
    relevance,
    parsedContext,
    options,
    subscores
  });
  const engineTrace = buildEngineTrace({
    resolution,
    parsedContext,
    relevance,
    confidence,
    riskFlags
  });

  const scoreMeta = {
    relevancePoints: Number(relevance && relevance.points) || 0,
    draftedFitTotal: (Number(draftedFitBonus && draftedFitBonus.scenario) || 0) + (Number(draftedFitBonus && draftedFitBonus.twist) || 0),
    draftedScenarioBonus: Number(draftedFitBonus && draftedFitBonus.scenario) || 0,
    draftedTwistBonus: Number(draftedFitBonus && draftedFitBonus.twist) || 0,
    infoConfidence: confidence.overall,
    trustedInfo: Boolean(resolution.trustedInfo),
    fetchDurationMs: Number(resolution.fetchDurationMs) || 0,
    resolvedTitle: scoringInfo && (scoringInfo.title || scoringInfo.name) ? String(scoringInfo.title || scoringInfo.name) : null,
    resolvedSource: scoringInfo && scoringInfo.source ? String(scoringInfo.source) : null,
    aliases: Array.isArray(scoringInfo && scoringInfo.aliases) ? scoringInfo.aliases.slice(0, 16) : [],
    resolvedDescriptionSnippet: scoringInfo && scoringInfo.description
      ? String(scoringInfo.description).replace(/\s+/g, ' ').trim().slice(0, 420)
      : null,
    imageSynthetic: Boolean(scoringInfo && scoringInfo.imageSynthetic),
    imageBackfilled: Boolean(scoringInfo && scoringInfo.imageBackfilled),
    evaluationEngine: 'rules-context-v1',
    evaluationEngineMode: 'context',
    resolverConfidence: confidence.nameResolution,
    contextFitConfidence: confidence.contextFit,
    contextOverallPct: weighted.overallPct,
    contextOvrCalibration: contextOvrModel && contextOvrModel.calibration ? { ...contextOvrModel.calibration } : null,
    resolverResolutionSource: resolution && resolution.resolutionSource ? resolution.resolutionSource : 'fetch',
    contextSubscores: {
      ...weighted.scores
    },
    contextRawSubscores: {
      currentScenarioFit: Number(subscores && subscores.currentScenarioFit) || 0,
      currentTwistFit: Number(subscores && subscores.currentTwistFit) || 0,
      originalScenarioFit: Number(subscores && subscores.originalScenarioFit) || 0,
      originalTwistFit: Number(subscores && subscores.originalTwistFit) || 0,
      baseAbility: Number(subscores && subscores.baseAbility) || 0,
      rarity: Number(subscores && subscores.rarity) || 0,
      creativity: Number(subscores && subscores.creativity) || 0,
      chemistry: Number(subscores && subscores.chemistry) || 0,
      categoryFit: Number(subscores && subscores.categoryFit) || 0
    },
    categoryContext: categoryFitResolution && categoryFitResolution.active
      ? {
        categoryId: categoryFitResolution.categoryId,
        categoryName: categoryFitResolution.categoryName,
        categoryFamily: categoryFitResolution.categoryFamily,
        categoryFit: Number(categoryFitResolution.categoryFit) || 0,
        membershipConfidence: Number(categoryFitResolution.membershipConfidence) || 0,
        withinCategoryPowerRank: Number(categoryFitResolution.withinCategoryPowerRank) || 0,
        ambiguityHandling: Number(categoryFitResolution.ambiguityHandling) || 0,
        eligibilityPenalty: Number(categoryFitResolution.eligibilityPenalty) || 0,
        inCategoryBonus: Number(categoryFitResolution.inCategoryBonus) || 0,
        netImpact: Number(categoryFitResolution.netImpact) || 0,
        categoryStatus: categoryFitResolution.categoryStatus || 'not_in_category',
        categoryStatusLabel: categoryFitResolution.categoryStatusLabel || 'NOT IN CATEGORY',
        categoryStatusTone: categoryFitResolution.categoryStatusTone || 'negative',
        categoryStatusIcon: categoryFitResolution.categoryStatusIcon || 'thumbs_down',
        strictCoreHits: Number(categoryFitResolution.strictCoreHits) || 0,
        coreSignalHits: Number(categoryFitResolution.coreSignalHits) || 0,
        relatedSignalHits: Number(categoryFitResolution.relatedSignalHits) || 0,
        negativeSignalHits: Number(categoryFitResolution.negativeSignalHits) || 0,
        supportSignalHits: Number(categoryFitResolution.supportSignalHits) || 0,
        primaryNameHits: Number(categoryFitResolution.primaryNameHits) || 0,
        supportNameHits: Number(categoryFitResolution.supportNameHits) || 0,
        anchorInclusionHits: Number(categoryFitResolution.anchorInclusionHits) || 0,
        anchorAliasHits: Number(categoryFitResolution.anchorAliasHits) || 0,
        explain: categoryFitResolution.explain || ''
      }
      : null,
    contextSignals: {
      matchedTraits: engineTrace.matchedTraits,
      matchedIntents: engineTrace.matchedIntents,
      domainMatches: engineTrace.domainMatches,
      riskFlags: engineTrace.riskFlags
    },
    contextExplainability: buildExplainabilityPayload({
      status: engineTrace.status,
      engine: 'rules-context-v1',
      confidence: confidence.overall,
      confidenceBreakdown: confidence,
      matchedTraits: engineTrace.matchedTraits,
      matchedIntents: engineTrace.matchedIntents,
      domainMatches: engineTrace.domainMatches,
      riskFlags: engineTrace.riskFlags,
      parsedContext
    }),
    contextHeuristic: subscores && subscores._contextHeuristic ? { ...subscores._contextHeuristic } : null,
    contextOriginalHeuristic: subscores && subscores._originalContextHeuristic ? { ...subscores._originalContextHeuristic } : null,
    contextOriginalRawFits: subscores && subscores._originalRawFits ? { ...subscores._originalRawFits } : null,
    contextVariantSpecificity: subscores && subscores._variantSpecificity ? { ...subscores._variantSpecificity } : null,
    contextOriginalVariantSpecificity: subscores && subscores._originalVariantSpecificity ? { ...subscores._originalVariantSpecificity } : null,
    contextResolverSeed: parsedContext && parsedContext.evaluationMode === 'round'
      ? {
        normalizedName: resolution && resolution.normalizedName ? resolution.normalizedName : character,
        compactName: resolution && resolution.compactName ? resolution.compactName : canonicalizeName(character),
        infoConfidence: Number(resolution && resolution.infoConfidence) || 0,
        resolutionStatus: resolution && resolution.resolutionStatus ? resolution.resolutionStatus : 'unknown',
        source: resolution && resolution.source ? resolution.source : null,
        riskFlags: Array.isArray(resolution && resolution.riskFlags) ? resolution.riskFlags.slice(0, 12) : [],
        confidenceBand: resolution && resolution.confidenceBand ? resolution.confidenceBand : null,
        lookupMeta: cloneJsonSafe(resolution && resolution.lookupMeta ? resolution.lookupMeta : null),
        scoringInfo: cloneJsonSafe(scoringInfo),
        trustedInfo: Boolean(resolution && resolution.trustedInfo)
      }
      : undefined
  };

  let notes = buildNotes({
    validation,
    info: scoringInfo,
    scenario,
    twist,
    scoreMeta: {
      relevanceNote: relevance && relevance.note ? relevance.note : '',
      infoConfidence: scoreMeta.infoConfidence
    }
  });

  notes = [
    `Context Engine v1 (${engineTrace.status})`,
    `Resolver ${Math.round(confidence.nameResolution * 100)}% | Context ${Math.round(confidence.contextFit * 100)}%`,
    ...notes
  ];
  if (engineTrace.matchedTraits.length) {
    notes.push(`Matched traits: ${engineTrace.matchedTraits.slice(0, 6).join(', ')}.`);
  }
  if (engineTrace.matchedIntents.length) {
    notes.push(`Context intents: ${engineTrace.matchedIntents.slice(0, 6).join(', ')}.`);
  }
  if (engineTrace.riskFlags.length) {
    notes.push(`Risk flags: ${engineTrace.riskFlags.slice(0, 6).join(', ')}.`);
  }
  if (categoryFitResolution && categoryFitResolution.active && categoryFitResolution.explain) {
    notes.push(categoryFitResolution.explain);
  }

  const breakdown = buildBreakdown({
    character,
    validation,
    info: scoringInfo,
    scenario,
    twist,
    score,
    nameSignals,
    relevance,
    draftedFitBonus: {
      scenario: scoreMeta.draftedScenarioBonus,
      twist: scoreMeta.draftedTwistBonus
    },
    ovrData,
    scoreBreakdownSteps: []
  });

  augmentBreakdownForContextEngine(breakdown, {
    engineTrace,
    weighted,
    parsedContext,
    relevance,
    subscores,
    scoringInfo
  });
  if (
    categoryFitResolution
    && categoryFitResolution.active
    && breakdown
    && Array.isArray(breakdown.scoreBreakdown)
  ) {
    const statusLabel = String(categoryFitResolution.categoryStatusLabel || 'NOT IN CATEGORY');
    breakdown.categoryRelevance = `${categoryFitResolution.categoryName}: ${statusLabel} | fit ${categoryFitResolution.categoryFit}/100 | membership ${categoryFitResolution.membershipConfidence} | net impact ${categoryFitResolution.netImpact >= 0 ? '+' : ''}${categoryFitResolution.netImpact}`;
    breakdown.scoreBreakdown = [
      {
        step: 'Category Fit',
        points: Number(categoryFitResolution.netImpact) || 0,
        description: `${categoryFitResolution.categoryName}: ${statusLabel} | fit ${categoryFitResolution.categoryFit}/100 (membership ${categoryFitResolution.membershipConfidence}, rank ${categoryFitResolution.withinCategoryPowerRank}, impact ${categoryFitResolution.netImpact >= 0 ? '+' : ''}${categoryFitResolution.netImpact})`
      },
      ...breakdown.scoreBreakdown
    ];
  }

  if (breakdown && breakdown.ovrBreakdown && typeof breakdown.ovrBreakdown === 'object') {
    const ovrBreakdown = breakdown.ovrBreakdown;
    const preFit = Number(contextOvrModel && contextOvrModel.neutralBaseOVR) || (
      (Number(ovrBreakdown.baseFromScore) || 0)
      + (Number(ovrBreakdown.rarityBonus) || 0)
      + (Number(ovrBreakdown.attributeBonus) || 0)
      + (Number(ovrBreakdown.confidenceBonus) || 0)
    );
    if (preFit > 0) {
      const contextFinal = clamp(Math.round(ovr), 0, 99);
      const scenarioDeltaRaw = Number(contextOvrModel && contextOvrModel.fitDelta);
      const scenarioDelta = Number.isFinite(scenarioDeltaRaw)
        ? scenarioDeltaRaw
        : (contextFinal - Math.round(preFit));
      const scenarioMultiplier = Number(contextOvrModel && contextOvrModel.scenarioMultiplier) || (preFit > 0 ? Number((contextFinal / preFit).toFixed(2)) : 1);
      const capabilityBase = Number(contextOvrModel && contextOvrModel.capabilityBase);
      const rarityBonus = Number(contextOvrModel && contextOvrModel.rarityBonus);
      const attributeBonus = Number(contextOvrModel && contextOvrModel.attributeBonus);
      const confidenceBonus = Number(contextOvrModel && contextOvrModel.confidenceBonus);
      if (Number.isFinite(capabilityBase)) ovrBreakdown.baseFromScore = capabilityBase;
      if (Number.isFinite(rarityBonus)) ovrBreakdown.rarityBonus = rarityBonus;
      if (Number.isFinite(attributeBonus)) ovrBreakdown.attributeBonus = attributeBonus;
      if (Number.isFinite(confidenceBonus)) ovrBreakdown.confidenceBonus = confidenceBonus;
      ovrBreakdown.finalOVR = contextFinal;
      ovrBreakdown.fitDelta = scenarioDelta;
      ovrBreakdown.scenarioDelta = scenarioDelta;
      ovrBreakdown.fitMultiplier = scenarioMultiplier;
      ovrBreakdown.scenarioMultiplier = scenarioMultiplier;
      ovrBreakdown.calibration = contextOvrModel && contextOvrModel.calibration ? { ...contextOvrModel.calibration } : null;
      if (ovrBreakdown.explanations && typeof ovrBreakdown.explanations === 'object') {
        ovrBreakdown.explanations.base = `Neutral capability base from Context Engine (baseAbility ${Number(subscores && subscores.baseAbility) || 0}/100 → ${ovrBreakdown.baseFromScore}).`;
      }
      if (ovrBreakdown.percentages && typeof ovrBreakdown.percentages === 'object') {
        ovrBreakdown.percentages.scoreContribution = Math.round((Number(ovrBreakdown.baseFromScore) || 0) / Math.max(1, contextFinal) * 100);
        ovrBreakdown.percentages.rarityContribution = Math.round((Number(ovrBreakdown.rarityBonus) || 0) / Math.max(1, contextFinal) * 100);
        ovrBreakdown.percentages.attributeContribution = Math.round((Number(ovrBreakdown.attributeBonus) || 0) / Math.max(1, contextFinal) * 100);
        ovrBreakdown.percentages.confidenceContribution = Math.round((Number(ovrBreakdown.confidenceBonus) || 0) / Math.max(1, contextFinal) * 100);
        ovrBreakdown.percentages.scenarioEffect = Number(contextOvrModel && Number.isFinite(contextOvrModel.scenarioEffectPct))
          ? Number(contextOvrModel.scenarioEffectPct)
          : Math.round(((contextFinal - preFit) / Math.max(1, preFit)) * 100);
      }
      ovrBreakdown.scenarioDeltaNarrative = scenarioDelta >= 0
        ? `${character} gains ${scenarioDelta} OVR from strong contextual fit (${Math.round(preFit)} → ${contextFinal}).`
        : `${character} loses ${Math.abs(scenarioDelta)} OVR from contextual mismatch (${Math.round(preFit)} → ${contextFinal}).`;
      if (ovrBreakdown.explanations && typeof ovrBreakdown.explanations === 'object') {
        ovrBreakdown.explanations.scenario = `Context fit multiplier ×${scenarioMultiplier.toFixed(2)} (${scenarioDelta >= 0 ? '+' : ''}${scenarioDelta} OVR) after scenario + twist weighting.`;
      }
    }
  }

  const categoryActiveResult = Boolean(categoryFitResolution && categoryFitResolution.active);
  return {
    character,
    emotion: mapScoreToEmotion(score),
    score,
    ovr,
    imageUrl: scoringInfo && scoringInfo.imageUrl ? scoringInfo.imageUrl : null,
    infoSource: scoringInfo && scoringInfo.source ? scoringInfo.source : null,
    ovrTier: ovrData.tier,
    attributes: ovrData.attributes,
    rarity: ovrData.rarity,
    characterType: (relevance && relevance.profile && relevance.profile.type) || ovrData.type || 'balanced',
    reason: engineTrace.status === 'resolved'
      ? 'Context Engine evaluation'
      : engineTrace.status === 'low_confidence_resolve'
        ? 'Context Engine evaluation (low-confidence resolver)'
        : 'Context Engine fallback heuristics',
    categoryFit: Number(categoryFitResolution && categoryFitResolution.categoryFit) || 0,
    categoryMembershipConfidence: Number(categoryFitResolution && categoryFitResolution.membershipConfidence) || 0,
    categoryNetImpact: Number(categoryFitResolution && categoryFitResolution.netImpact) || 0,
    categoryStatus: categoryActiveResult && categoryFitResolution && categoryFitResolution.categoryStatus
      ? String(categoryFitResolution.categoryStatus)
      : 'category_inactive',
    categoryStatusLabel: categoryActiveResult && categoryFitResolution && categoryFitResolution.categoryStatusLabel
      ? String(categoryFitResolution.categoryStatusLabel)
      : 'CATEGORY INACTIVE',
    categoryStatusTone: categoryActiveResult && categoryFitResolution && categoryFitResolution.categoryStatusTone
      ? String(categoryFitResolution.categoryStatusTone)
      : 'neutral',
    categoryStatusIcon: categoryActiveResult && categoryFitResolution && categoryFitResolution.categoryStatusIcon
      ? String(categoryFitResolution.categoryStatusIcon)
      : 'meh',
    notes,
    breakdown,
    scoreMeta
  };
}

async function evaluateEntryContext(entry) {
  const payload = entry && typeof entry === 'object' ? entry : {};
  const character = String(payload.character || '').trim();
  const scenario = String(payload.scenario || '').trim();
  const twist = String(payload.twist || '').trim();
  const options = payload.options && typeof payload.options === 'object' ? payload.options : {};

  const validation = validateInput(character);
  if (!validation.valid) {
    const legacyInvalid = await scoreCharacter(character, scenario, twist, options);
    return {
      ok: true,
      engine: {
        status: 'invalid_input',
        normalizedName: character,
        scores: { ...DEFAULT_SUBSCORES },
        confidence: { overall: 0, nameResolution: 0, contextFit: 0 },
        signals: { matchedTraits: [], matchedIntents: [], riskFlags: ['invalid_input'] }
      },
      publicResult: legacyInvalid
    };
  }

  const resolution = await resolveEntryIdentity({
    character,
    scenario,
    twist,
    options
  });

  const scoringInfo = resolution && resolution.scoringInfo ? resolution.scoringInfo : null;
  const parsedContext = parseRoundContext({
    scenario,
    twist,
    originalScenario: options.originalScenario || scenario,
    originalTwist: options.originalTwist || twist,
    evaluationMode: options.evaluationMode === 'final' ? 'final' : 'round'
  });

  const relevance = scoreRelevance(character, scoringInfo, scenario, twist);
  const nameSignals = scoreNameSignals(character, validation, scenario, twist);
  const draftedFitBonus = calculateDraftedFitBonus(
    scoringInfo,
    options.originalScenario || scenario,
    options.originalTwist || twist,
    character
  );

  const subscores = buildContextSubscores({
    character,
    validation,
    scoringInfo,
    resolution,
    relevance,
    parsedContext,
    options,
    scenario,
    twist,
    nameSignals
  });

  const categoryContext = options && options.categoryContext && typeof options.categoryContext === 'object'
    ? options.categoryContext
    : null;
  const categoryFitResolution = resolveCategoryFit({
    categoryContext,
    rawEntryName: character,
    scoringInfo,
    subscores,
    confidenceOverall: Number(resolution && resolution.infoConfidence) || 0,
    confidenceName: Number(resolution && resolution.infoConfidence) || 0,
    riskFlags: Array.isArray(resolution && resolution.riskFlags) ? resolution.riskFlags : []
  });
  subscores.categoryFit = Number(categoryFitResolution && categoryFitResolution.categoryFit) || 50;
  subscores._categoryContext = categoryFitResolution && categoryFitResolution.active
    ? { ...categoryFitResolution }
    : null;

  const weightProfile = buildWeightProfile({
    evaluationMode: parsedContext.evaluationMode,
    currentScenario: parsedContext.scenario,
    currentTwist: parsedContext.twist,
    originalTwist: parsedContext.originalTwist
  });

  const weighted = computeWeightedOverall(subscores, weightProfile, {
    confidenceName: Number(resolution && resolution.infoConfidence) || 0,
    confidenceOverall: Number(resolution && resolution.infoConfidence) || 0,
    riskFlags: Array.isArray(resolution && resolution.riskFlags) ? resolution.riskFlags : [],
    categoryActive: Boolean(categoryFitResolution && categoryFitResolution.active),
    categoryStatus: categoryFitResolution && categoryFitResolution.active
      ? String(categoryFitResolution.categoryStatus || '')
      : ''
  });
  const confidence = buildConfidencePacket({ resolution, relevance });
  const publicResult = buildContextPublicResult({
    character,
    scenario,
    twist,
    options,
    validation,
    resolution,
    parsedContext,
    relevance,
    nameSignals,
    draftedFitBonus,
    categoryFitResolution,
    weighted,
    confidence,
    subscores
  });

  return {
    ok: true,
    engine: {
      status: resolution.resolutionStatus,
      normalizedName: resolution.normalizedName || character,
      scores: {
        ...weighted.scores
      },
      confidence,
      signals: {
        matchedTraits: publicResult.scoreMeta.contextSignals.matchedTraits,
        matchedIntents: publicResult.scoreMeta.contextSignals.matchedIntents,
        riskFlags: publicResult.scoreMeta.contextSignals.riskFlags
      },
      weights: weightProfile,
      overallPct: weighted.overallPct
    },
    publicResult
  };
}

module.exports = {
  evaluateEntryContext
};
