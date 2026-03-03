const fs = require('fs');
const path = require('path');

const REGISTRY_FILE = path.join(__dirname, '..', 'content', 'categories', 'registry.v1.json');
const CATEGORY_MODES = new Set(['off', 'host_select', 'smart_random', 'group_vote']);
const DEFAULT_CATEGORY_SETTINGS = Object.freeze({
  categoriesMode: 'smart_random',
  categoryId: null,
  categoryVoteOptions: [],
  categoryVersion: 'v1'
});

let REGISTRY_CACHE = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function asSlug(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  return /^[a-z0-9-]{2,80}$/.test(normalized) ? normalized : '';
}

function loadRegistry() {
  if (REGISTRY_CACHE) return REGISTRY_CACHE;
  const raw = fs.readFileSync(REGISTRY_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  const categories = (Array.isArray(parsed && parsed.categories) ? parsed.categories : [])
    .map((entry) => ({
      id: asSlug(entry && entry.id),
      displayName: String(entry && entry.displayName || '').trim(),
      family: String(entry && entry.family || 'unknown').trim().toLowerCase(),
      aliases: Array.isArray(entry && entry.aliases) ? entry.aliases.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean) : [],
      descriptionShort: String(entry && entry.descriptionShort || '').trim(),
      inclusionRules: Array.isArray(entry && entry.inclusionRules) ? entry.inclusionRules.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean) : [],
      exclusionRules: Array.isArray(entry && entry.exclusionRules) ? entry.exclusionRules.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean) : [],
      exampleEntriesStrong: Array.isArray(entry && entry.exampleEntriesStrong) ? entry.exampleEntriesStrong.slice(0, 6) : [],
      exampleEntriesWeak: Array.isArray(entry && entry.exampleEntriesWeak) ? entry.exampleEntriesWeak.slice(0, 6) : [],
      riskLevel: String(entry && entry.riskLevel || 'med').trim().toLowerCase(),
      enabled: entry && entry.enabled !== false,
      weightProfileId: entry && entry.weightProfileId ? String(entry.weightProfileId) : null
    }))
    .filter((entry) => entry.id && entry.displayName);

  const byId = new Map();
  categories.forEach((category) => byId.set(category.id, category));

  REGISTRY_CACHE = {
    version: String(parsed && parsed.version || 'v1'),
    updatedAt: String(parsed && parsed.updatedAt || ''),
    categories,
    byId
  };
  return REGISTRY_CACHE;
}

function getEnabledCategories() {
  return loadRegistry().categories.filter((entry) => entry.enabled !== false);
}

function getCategoryById(id) {
  const key = asSlug(id);
  if (!key) return null;
  return loadRegistry().byId.get(key) || null;
}

function toCategorySummary(category) {
  if (!category) return null;
  return {
    id: category.id,
    displayName: category.displayName,
    family: category.family,
    riskLevel: category.riskLevel,
    version: loadRegistry().version,
    weightProfileId: category.weightProfileId || null
  };
}

function normalizeCategorySettings(settings = {}) {
  const safe = settings && typeof settings === 'object' ? settings : {};
  const modeRaw = String(safe.categoriesMode || DEFAULT_CATEGORY_SETTINGS.categoriesMode).trim().toLowerCase();
  const categoriesMode = CATEGORY_MODES.has(modeRaw) ? modeRaw : DEFAULT_CATEGORY_SETTINGS.categoriesMode;
  const categoryId = asSlug(safe.categoryId);
  const categoryVersion = String(safe.categoryVersion || loadRegistry().version || 'v1').trim().slice(0, 24) || 'v1';
  const categoryVoteOptions = Array.from(new Set(
    (Array.isArray(safe.categoryVoteOptions) ? safe.categoryVoteOptions : [])
      .map(asSlug)
      .filter(Boolean)
      .filter((id) => Boolean(getCategoryById(id)))
  )).slice(0, 5);

  return {
    categoriesMode,
    categoryId: categoryId || null,
    categoryVersion,
    categoryVoteOptions
  };
}

function scoreCategoryForRandom(category, recentIds = [], familyUsage = {}) {
  const recencyPenalty = recentIds.includes(category.id) ? 0.25 : 1;
  const riskWeight = category.riskLevel === 'low'
    ? 1
    : category.riskLevel === 'med'
      ? 0.8
      : 0.55;
  const familyCount = Number(familyUsage[category.family]) || 0;
  const familyWeight = 1 / (1 + Math.max(0, familyCount));
  return recencyPenalty * riskWeight * familyWeight;
}

function weightedPick(rows) {
  const safe = Array.isArray(rows) ? rows : [];
  const total = safe.reduce((sum, row) => sum + Math.max(0, Number(row && row.weight) || 0), 0);
  if (total <= 0 || !safe.length) return null;
  const ticket = Math.random() * total;
  let cursor = 0;
  for (const row of safe) {
    cursor += Math.max(0, Number(row && row.weight) || 0);
    if (ticket <= cursor) return row.item;
  }
  return safe[safe.length - 1].item;
}

function buildFamilyUsageMap(recentCategoryIds = []) {
  const usage = {};
  (Array.isArray(recentCategoryIds) ? recentCategoryIds : []).forEach((id) => {
    const category = getCategoryById(id);
    if (!category) return;
    const family = String(category.family || 'unknown');
    usage[family] = (usage[family] || 0) + 1;
  });
  return usage;
}

function pickSmartRandomCategory({ recentCategoryIds = [], blockedIds = [] } = {}) {
  const recent = (Array.isArray(recentCategoryIds) ? recentCategoryIds : []).map(asSlug).filter(Boolean).slice(-8);
  const blocked = new Set((Array.isArray(blockedIds) ? blockedIds : []).map(asSlug).filter(Boolean));
  const familyUsage = buildFamilyUsageMap(recent);
  const pool = getEnabledCategories().filter((category) => !blocked.has(category.id));
  if (!pool.length) return null;

  const weightedRows = pool.map((category) => ({
    item: category,
    weight: scoreCategoryForRandom(category, recent, familyUsage)
  }));
  return weightedPick(weightedRows) || pool[0];
}

function buildVoteOptions({ count = 3, recentCategoryIds = [], blockedIds = [] } = {}) {
  const safeCount = clamp(Math.round(Number(count) || 3), 3, 5);
  const chosen = [];
  const blocked = new Set((Array.isArray(blockedIds) ? blockedIds : []).map(asSlug).filter(Boolean));
  while (chosen.length < safeCount) {
    const next = pickSmartRandomCategory({
      recentCategoryIds,
      blockedIds: [...blocked, ...chosen.map((entry) => entry.id)]
    });
    if (!next) break;
    chosen.push(next);
  }
  return chosen.map(toCategorySummary).filter(Boolean);
}

function lockCategoryForMatch(settings = {}, { recentCategoryIds = [] } = {}) {
  const normalized = normalizeCategorySettings(settings);
  if (normalized.categoriesMode === 'off') {
    return {
      normalizedSettings: normalized,
      lockedCategory: null,
      selectionSource: 'off'
    };
  }

  const hostSelected = normalized.categoryId ? getCategoryById(normalized.categoryId) : null;
  if (normalized.categoriesMode === 'host_select' && hostSelected) {
    return {
      normalizedSettings: normalized,
      lockedCategory: toCategorySummary(hostSelected),
      selectionSource: 'host_select'
    };
  }

  if (normalized.categoriesMode === 'group_vote') {
    let voteOptions = normalized.categoryVoteOptions.map(getCategoryById).filter(Boolean);
    if (voteOptions.length < 3) {
      voteOptions = buildVoteOptions({
        count: 3,
        recentCategoryIds,
        blockedIds: voteOptions.map((entry) => entry.id)
      }).map((option) => getCategoryById(option.id)).filter(Boolean);
    }
    const winner = voteOptions[0] || pickSmartRandomCategory({ recentCategoryIds });
    return {
      normalizedSettings: {
        ...normalized,
        categoryVoteOptions: voteOptions.map((entry) => entry.id)
      },
      lockedCategory: toCategorySummary(winner),
      selectionSource: 'group_vote_fallback'
    };
  }

  const randomCategory = pickSmartRandomCategory({ recentCategoryIds }) || hostSelected;
  return {
    normalizedSettings: normalized,
    lockedCategory: toCategorySummary(randomCategory),
    selectionSource: 'smart_random'
  };
}

function resolveCategoryFit({
  categoryContext,
  rawEntryName,
  scoringInfo,
  subscores,
  confidenceOverall,
  confidenceName,
  riskFlags
} = {}) {
  const active = categoryContext && categoryContext.enabled === true && categoryContext.id;
  if (!active) {
    return {
      active: false,
      categoryFit: 50,
      membershipConfidence: 50,
      withinCategoryPowerRank: 50,
      ambiguityHandling: 50,
      eligibilityPenalty: 0,
      inCategoryBonus: 0,
      netImpact: 0,
      explain: 'Categories mode inactive for this evaluation.'
    };
  }

  const category = getCategoryById(categoryContext.id);
  if (!category) {
    return {
      active: false,
      categoryFit: 50,
      membershipConfidence: 50,
      withinCategoryPowerRank: 50,
      ambiguityHandling: 40,
      eligibilityPenalty: -6,
      inCategoryBonus: 0,
      netImpact: -6,
      explain: 'Category context missing from registry; applied conservative fallback.'
    };
  }

  const rawName = String(rawEntryName || '').toLowerCase();
  const title = String(scoringInfo && (scoringInfo.title || scoringInfo.name) || '').toLowerCase();
  const description = String(scoringInfo && scoringInfo.description || '').toLowerCase();
  const categories = Array.isArray(scoringInfo && scoringInfo.categories)
    ? scoringInfo.categories.map((entry) => String(entry || '').toLowerCase()).join(' ')
    : '';
  const aliases = Array.isArray(scoringInfo && scoringInfo.aliases)
    ? scoringInfo.aliases.map((entry) => String(entry || '').toLowerCase()).join(' ')
    : '';
  const corpus = `${rawName} ${title} ${description} ${categories} ${aliases}`.trim();

  const inclusionHits = category.inclusionRules.reduce((count, token) => count + (corpus.includes(token) ? 1 : 0), 0);
  const exclusionHits = category.exclusionRules.reduce((count, token) => count + (corpus.includes(token) ? 1 : 0), 0);
  const aliasHits = category.aliases.reduce((count, token) => count + (corpus.includes(token) ? 1 : 0), 0);
  const lowEvidence = corpus.length < 120;
  const safeConfidenceName = clamp(Number(confidenceName) || 0, 0, 1);
  const safeConfidenceOverall = clamp(Number(confidenceOverall) || 0, 0, 1);
  const riskSet = new Set((Array.isArray(riskFlags) ? riskFlags : []).map((entry) => String(entry || '').toLowerCase()));

  const sportSignals = [
    'athlete', 'football', 'soccer', 'basketball', 'baseball', 'golf', 'tennis', 'nfl', 'nba', 'mlb', 'olympic', 'quarterback', 'striker'
  ];
  const vehicleSignals = [
    'car', 'vehicle', 'automobile', 'supercar', 'sports car', 'driver', 'racing', 'motorsport', 'formula', 'nascar', 'ferrari', 'lamborghini', 'maserati', 'van', 'truck', 'suv', 'sedan', 'coupe'
  ];
  const sportHits = sportSignals.reduce((count, token) => count + (corpus.includes(token) ? 1 : 0), 0);
  const vehicleHits = vehicleSignals.reduce((count, token) => count + (corpus.includes(token) ? 1 : 0), 0);
  const normalizedCategoryId = String(category.id || '').toLowerCase();

  let membershipConfidence = 35 + (inclusionHits * 12) + (aliasHits * 7) - (exclusionHits * 18);
  if (category.family === 'sports/competition' || normalizedCategoryId.includes('sport') || normalizedCategoryId.includes('athlete')) {
    membershipConfidence += Math.min(28, sportHits * 10);
  }
  if (normalizedCategoryId.includes('car') || normalizedCategoryId.includes('vehicle') || normalizedCategoryId.includes('supercar')) {
    membershipConfidence += Math.min(30, vehicleHits * 10);
  }
  if (lowEvidence) membershipConfidence -= 8;
  if (safeConfidenceName < 0.72) membershipConfidence -= 8;
  if (riskSet.has('high_candidate_ambiguity')) membershipConfidence -= 8;
  if (riskSet.has('dangerous_title_diff_suspected')) membershipConfidence -= 14;
  membershipConfidence = clamp(Math.round(membershipConfidence), 0, 100);

  const baseAbility = clamp(Number(subscores && subscores.baseAbility) || 55, 0, 100);
  const rarity = clamp(Number(subscores && subscores.rarity) || 50, 0, 100);
  const scenarioFit = clamp(Number(subscores && subscores.currentScenarioFit) || 50, 0, 100);
  const withinCategoryPowerRank = clamp(Math.round((baseAbility * 0.58) + (rarity * 0.16) + (scenarioFit * 0.26)), 0, 100);

  let ambiguityHandling = 100;
  if (category.riskLevel === 'med') ambiguityHandling -= 8;
  if (category.riskLevel === 'high') ambiguityHandling -= 16;
  ambiguityHandling -= Math.max(0, exclusionHits * 6);
  ambiguityHandling -= Math.max(0, Math.round((1 - safeConfidenceOverall) * 18));
  if (riskSet.has('high_candidate_ambiguity')) ambiguityHandling -= 12;
  ambiguityHandling = clamp(Math.round(ambiguityHandling), 0, 100);

  const rawCategoryFit = clamp(
    Math.round((membershipConfidence * 0.5) + (withinCategoryPowerRank * 0.35) + (ambiguityHandling * 0.15)),
    0,
    100
  );

  let eligibilityPenalty = 0;
  if (membershipConfidence < 20) eligibilityPenalty = -22;
  else if (membershipConfidence < 35) eligibilityPenalty = -12;
  else if (membershipConfidence < 50) eligibilityPenalty = -5;

  let inCategoryBonus = 0;
  if (membershipConfidence >= 70 && withinCategoryPowerRank >= 60) inCategoryBonus = 14;
  else if (membershipConfidence >= 60 && withinCategoryPowerRank >= 54) inCategoryBonus = 8;
  else if (membershipConfidence >= 50 && withinCategoryPowerRank >= 50) inCategoryBonus = 4;

  const netImpact = clamp(inCategoryBonus + eligibilityPenalty, -24, 20);
  const categoryFit = clamp(rawCategoryFit + netImpact, 0, 100);

  return {
    active: true,
    categoryId: category.id,
    categoryName: category.displayName,
    categoryFamily: category.family,
    categoryFit,
    membershipConfidence,
    withinCategoryPowerRank,
    ambiguityHandling,
    eligibilityPenalty,
    inCategoryBonus,
    netImpact,
    explain: `Category ${category.displayName}: fit ${categoryFit}/100, membership ${membershipConfidence}, rank ${withinCategoryPowerRank}, ambiguity ${ambiguityHandling}, impact ${netImpact >= 0 ? '+' : ''}${netImpact} (hits: inc ${inclusionHits}, alias ${aliasHits}, sport ${sportHits}, vehicle ${vehicleHits}, exc ${exclusionHits}).`
  };
}

function getCategoryRegistrySnapshot() {
  const registry = loadRegistry();
  return {
    version: registry.version,
    updatedAt: registry.updatedAt,
    categories: registry.categories.map(toCategorySummary)
  };
}

module.exports = {
  DEFAULT_CATEGORY_SETTINGS,
  loadRegistry,
  getEnabledCategories,
  getCategoryById,
  getCategoryRegistrySnapshot,
  normalizeCategorySettings,
  buildVoteOptions,
  lockCategoryForMatch,
  resolveCategoryFit,
  toCategorySummary
};