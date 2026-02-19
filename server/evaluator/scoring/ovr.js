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
  return Math.round((score / SCORE_MAX) * 99);
}

function detectRarity(character, info) {
  const lower = String(character || '').toLowerCase();

  if (RARITY_KEYWORDS.icon.some(name => lower.includes(name))) return 15;
  if (RARITY_KEYWORDS.legendary.some(name => lower.includes(name))) return 12;
  if (RARITY_KEYWORDS.epic.some(name => lower.includes(name))) return 9;
  if (RARITY_KEYWORDS.rare.some(name => lower.includes(name))) return 6;

  for (const [, franchiseData] of Object.entries(FRANCHISE_DATABASE)) {
    const members = Array.isArray(franchiseData) ? franchiseData : franchiseData.members;
    const prestige = franchiseData.prestige || 'major';

    if (members.some(member => lower.includes(member))) {
      if (prestige === 'iconic') return 5;
      if (prestige === 'legendary') return 4;
      return 3;
    }
  }

  const nicheSignal = calculateNicheSignal(character, info);
  if (nicheSignal >= 3) return 6;
  if (nicheSignal >= 2) return 4;
  if (info && info.source === 'wikipedia') return 4;
  if (info) return 2;

  return 0;
}

function calculateNicheSignal(character, info) {
  if (!info) return 0;

  const lower = String(character || '').toLowerCase();
  const compact = canonicalizeName(character);
  const isKnownTopTier = Object.values(RARITY_KEYWORDS).flat().some(name => lower.includes(name));
  if (isKnownTopTier) return 0;

  const inKnownFranchise = Object.values(FRANCHISE_DATABASE).some(franchiseData => {
    const members = Array.isArray(franchiseData) ? franchiseData : franchiseData.members;
    return members.some(member => lower.includes(member) || compact.includes(canonicalizeName(member)));
  });

  let signal = 0;
  if (!inKnownFranchise) signal += 1;
  if (Array.isArray(info.categories) && info.categories.length >= 3) signal += 1;
  if (Array.isArray(info.aliases) && info.aliases.length >= 2) signal += 1;

  const titleWordCount = String(info.title || character || '').trim().split(/\s+/).filter(Boolean).length;
  if (titleWordCount >= 2) signal += 1;

  return Math.min(4, signal);
}

function getRarityTier(bonus) {
  if (bonus >= 15) return 'Icon';
  if (bonus >= 12) return 'Legendary';
  if (bonus >= 9) return 'Epic';
  if (bonus >= 6) return 'Rare';
  if (bonus >= 2) return 'Common';
  return 'Bronze';
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
  const baseOVR = Math.round((score / SCORE_MAX) * 70);
  const rarityBonus = detectRarity(character, info);
  const typeData = detectCharacterType(character, info);
  const attributes = calculateAttributes(character, info, scenario, twist, typeData);

  const topStats = Object.values(attributes).sort((a, b) => b - a).slice(0, 3);
  const attributeBonus = Math.round(topStats.reduce((sum, val) => sum + val, 0) / 3 * 0.15);
  const scenarioFit = calculateScenarioFit(character, info, scenario, twist);

  let finalOVR = Math.round((baseOVR + rarityBonus + attributeBonus) * scenarioFit);
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
