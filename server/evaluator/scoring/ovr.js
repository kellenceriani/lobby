const {
  SCORE_MAX,
  OVR_TIERS,
  RARITY_KEYWORDS,
  FRANCHISE_DATABASE,
  POWER_LEVELS,
  CHARACTER_TYPES
} = require('../core/constants');
const { canonicalizeName } = require('../core/textUtils');
const { buildInfoCorpus, calculateScenarioFit } = require('./relevance');

function getOVRTier(ovr) {
  for (const [tier, data] of Object.entries(OVR_TIERS)) {
    if (ovr >= data.min && ovr <= data.max) return { tier, color: data.color, label: data.label };
  }
  return { tier: 'bronze', color: '#cd7f32', label: 'Bronze' };
}

function mapScoreToOVR(score) {
  const normalized = Math.max(0, Math.min(1, (score || 0) / SCORE_MAX));
  const curved = Math.pow(normalized, 1.08);
  return Math.round(curved * 96);
}

function detectRarity(character, info) {
  const lower = String(character || '').toLowerCase();
  const confidence = info && typeof info.confidence === 'number' ? info.confidence : 0;

  if (RARITY_KEYWORDS.icon.some(name => lower.includes(name))) return -5;
  if (RARITY_KEYWORDS.legendary.some(name => lower.includes(name))) return -4;
  if (RARITY_KEYWORDS.epic.some(name => lower.includes(name))) return -3;
  if (RARITY_KEYWORDS.rare.some(name => lower.includes(name))) return -2;

  for (const [, franchiseData] of Object.entries(FRANCHISE_DATABASE)) {
    const members = Array.isArray(franchiseData) ? franchiseData : franchiseData.members;
    const prestige = franchiseData.prestige || 'major';

    if (members.some(member => lower.includes(member))) {
      if (prestige === 'iconic') return -3;
      if (prestige === 'legendary') return -2;
      return -1;
    }
  }

  const obscuritySignal = calculateObscuritySignal(character, info);

  if (!info) return -1;
  if (confidence < 0.35) return 0;

  let bonus = 1;
  if (info.source === 'wikipedia' || info.source === 'wikidata+wiki') bonus += 1;

  if (obscuritySignal >= 7) bonus += 8;
  else if (obscuritySignal >= 5) bonus += 6;
  else if (obscuritySignal >= 3) bonus += 4;
  else if (obscuritySignal >= 2) bonus += 2;

  if (confidence >= 0.8) bonus += 2;
  else if (confidence >= 0.65) bonus += 1;
  else if (confidence < 0.45) bonus -= 1;

  return Math.max(-6, Math.min(12, bonus));
}

function calculateObscuritySignal(character, info) {
  if (!info) return 0;

  const lower = String(character || '').toLowerCase();
  const compact = canonicalizeName(character);
  const isKnownTopTier = Object.values(RARITY_KEYWORDS).flat().some(name => lower.includes(name));
  if (isKnownTopTier) return 0;

  const inKnownFranchise = Object.values(FRANCHISE_DATABASE).some(franchiseData => {
    const members = Array.isArray(franchiseData) ? franchiseData : franchiseData.members;
    return members.some(member => lower.includes(member) || compact.includes(canonicalizeName(member)));
  });

  const inPowerLists = Object.values(POWER_LEVELS).some(names =>
    names.some(name => lower.includes(name) || compact.includes(canonicalizeName(name)))
  );

  let signal = 0;
  if (!inKnownFranchise) signal += 1;
  if (!inPowerLists) signal += 1;
  if (Array.isArray(info.categories) && info.categories.length >= 3) signal += 1;
  if (Array.isArray(info.aliases) && info.aliases.length >= 3) signal += 1;

  const titleWordCount = String(info.title || character || '').trim().split(/\s+/).filter(Boolean).length;
  if (titleWordCount >= 2) signal += 1;
  if (titleWordCount === 1) signal += 1;

  const description = String(info.description || info.wikidataDescription || '').toLowerCase();
  if (/anime|manga|visual novel|webtoon|light novel|vtuber|mythology|folklore|indie|cult|obscure|niche/.test(description)) {
    signal += 1;
  }

  const candidateCount = info.lookupMeta && typeof info.lookupMeta.candidateCount === 'number'
    ? info.lookupMeta.candidateCount
    : 0;
  if (candidateCount >= 10) signal += 2;
  else if (candidateCount >= 6) signal += 1;

  return Math.min(9, signal);
}

function getRarityTier(bonus) {
  if (bonus >= 10) return 'Icon';
  if (bonus >= 7) return 'Legendary';
  if (bonus >= 4) return 'Epic';
  if (bonus >= 2) return 'Rare';
  if (bonus >= 0) return 'Gold';
  if (bonus >= -2) return 'Silver';
  return 'Bronze';
}

function calculateArchetypePowerBonus(character, info) {
  const lower = `${character || ''} ${info && info.title ? info.title : ''} ${info && info.description ? info.description : ''} ${info && info.profession ? info.profession : ''}`.toLowerCase();
  const compact = canonicalizeName(character || '');

  if (POWER_LEVELS.cosmic.some(name => lower.includes(name) || compact.includes(canonicalizeName(name)))) return 12;
  if (POWER_LEVELS.godlike.some(name => lower.includes(name) || compact.includes(canonicalizeName(name)))) return 9;
  if (POWER_LEVELS.superhuman.some(name => lower.includes(name) || compact.includes(canonicalizeName(name)))) return 6;
  if (POWER_LEVELS.enhanced.some(name => lower.includes(name) || compact.includes(canonicalizeName(name)))) return 3;

  if (/\b(superhero|metahuman|demigod|cosmic|alien warrior|superhuman)\b/.test(lower)) return 5;
  if (/\b(athlete|soldier|detective|martial|engineer|scientist|wizard|sorcerer)\b/.test(lower)) return 2;
  if (/\b(ordinary|civilian|student|citizen|shopkeeper|office worker)\b/.test(lower)) return -1;

  return 0;
}

function determineEliteCap({ normalizedScore, scenarioFit, rarityBonus, archetypeBonus, confidence }) {
  if (
    normalizedScore >= 0.965
    && scenarioFit >= 1.24
    && rarityBonus >= 4
    && archetypeBonus >= 7
    && confidence >= 0.72
  ) {
    return 99;
  }

  if (
    normalizedScore >= 0.92
    && scenarioFit >= 1.14
    && (rarityBonus >= 2 || archetypeBonus >= 6)
    && confidence >= 0.6
  ) {
    return 98;
  }

  if (normalizedScore >= 0.86 && scenarioFit >= 1.05) {
    return 96;
  }

  return 94;
}

function detectCharacterType(character, info) {
  const lower = `${character} ${info ? info.description || '' : ''}`.toLowerCase();
  const profession = info && info.profession ? info.profession.toLowerCase() : '';

  if (profession) {
    if (profession.includes('warrior') || profession.includes('fighter') || profession.includes('soldier') || profession.includes('martial')) {
      return { type: 'combat', statBonus: CHARACTER_TYPES.combat.statBonus };
    }
    if (profession.includes('scientist') || profession.includes('professor') || profession.includes('inventor') || profession.includes('genius') || profession.includes('engineer')) {
      return { type: 'intelligence', statBonus: CHARACTER_TYPES.intelligence.statBonus };
    }
    if (profession.includes('speedster') || profession.includes('fast') || profession.includes('speed')) {
      return { type: 'speed', statBonus: CHARACTER_TYPES.speed.statBonus };
    }
    if (profession.includes('tank') || profession.includes('defender') || profession.includes('guardian') || profession.includes('protector')) {
      return { type: 'tank', statBonus: CHARACTER_TYPES.tank.statBonus };
    }
    if (profession.includes('healer') || profession.includes('medic') || profession.includes('support')) {
      return { type: 'support', statBonus: CHARACTER_TYPES.support.statBonus };
    }
  }

  for (const [type, data] of Object.entries(CHARACTER_TYPES)) {
    if (data.keywords.some(kw => lower.includes(kw))) return { type, statBonus: data.statBonus };
  }

  return { type: 'balanced', statBonus: {} };
}

function calculateAttributes(character, info, scenario, twist, typeData) {
  const base = 50;
  const attributes = {
    power: base,
    speed: base,
    intelligence: base,
    durability: base,
    control: base,
    versatility: base
  };

  Object.entries(typeData.statBonus).forEach(([stat, bonus]) => {
    if (attributes[stat] !== undefined) attributes[stat] = Math.max(0, Math.min(99, attributes[stat] + bonus));
  });

  const lower = String(character || '').toLowerCase();
  if (POWER_LEVELS.cosmic.some(name => lower.includes(name))) {
    attributes.power = Math.min(99, attributes.power + 30);
    attributes.durability = Math.min(99, attributes.durability + 25);
  } else if (POWER_LEVELS.godlike.some(name => lower.includes(name))) {
    attributes.power = Math.min(99, attributes.power + 20);
    attributes.durability = Math.min(99, attributes.durability + 15);
  } else if (POWER_LEVELS.superhuman.some(name => lower.includes(name))) {
    attributes.power = Math.min(99, attributes.power + 10);
    attributes.speed = Math.min(99, attributes.speed + 10);
  }

  if (info) {
    attributes.intelligence = Math.min(99, attributes.intelligence + 10);
    attributes.versatility = Math.min(99, attributes.versatility + 5);
  }

  const scenarioTokens = `${scenario || ''} ${twist || ''}`.toLowerCase();
  if (/strategy|mystery|investigate|solve|plan/.test(scenarioTokens)) {
    attributes.intelligence = Math.min(99, attributes.intelligence + 4);
    attributes.control = Math.min(99, attributes.control + 2);
  }
  if (/battle|fight|war|survive|invasion/.test(scenarioTokens)) {
    attributes.power = Math.min(99, attributes.power + 3);
    attributes.durability = Math.min(99, attributes.durability + 3);
  }
  if (/timed|clock|seconds|speed|race/.test(scenarioTokens)) {
    attributes.speed = Math.min(99, attributes.speed + 4);
  }

  return attributes;
}

function calculateAdvancedOVR(score, character, info, scenario, twist) {
  const normalized = Math.max(0, Math.min(1, (score || 0) / SCORE_MAX));
  const baseOVR = Math.round(30 + (Math.pow(normalized, 1.28) * 47));
  const rarityBonus = detectRarity(character, info);
  const archetypeBonus = calculateArchetypePowerBonus(character, info);
  const typeData = detectCharacterType(character, info);
  const attributes = calculateAttributes(character, info, scenario, twist, typeData);

  const topStats = Object.values(attributes).sort((a, b) => b - a).slice(0, 4);
  const topStatsAverage = topStats.reduce((sum, val) => sum + val, 0) / Math.max(1, topStats.length);
  const attributeBonus = Math.round((topStatsAverage - 50) * 0.16);
  const scenarioFit = calculateScenarioFit(character, info, scenario, twist);
  const confidenceValue = info && typeof info.confidence === 'number' ? info.confidence : 0;
  const confidenceBonus = info && typeof info.confidence === 'number'
    ? Math.round((info.confidence - 0.45) * 10)
    : 0;

  const fitAdjustment = Math.round((scenarioFit - 1) * 24);
  const eliteCap = determineEliteCap({
    normalizedScore: normalized,
    scenarioFit,
    rarityBonus,
    archetypeBonus,
    confidence: confidenceValue
  });

  let finalOVR = Math.round(baseOVR + rarityBonus + archetypeBonus + attributeBonus + confidenceBonus + fitAdjustment);
  finalOVR = Math.min(eliteCap, finalOVR);
  finalOVR = Math.max(0, Math.min(99, finalOVR));

  return {
    ovr: finalOVR,
    attributes,
    rarity: getRarityTier(rarityBonus),
    type: typeData.type,
    tier: getOVRTier(finalOVR)
  };
}

module.exports = {
  getOVRTier,
  mapScoreToOVR,
  detectRarity,
  getRarityTier,
  calculateAdvancedOVR
};
