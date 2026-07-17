const crypto = require('crypto');
const { sanitizeText } = require('../storage/metaStoreAdapter');
const { getEnabledCategories } = require('./categoryRegistryService');
const { evaluateCharactersBatch } = require('./entryEvaluationService');
const { generateScenario, generateTwists } = require('../core/gameEngine');

const DEFAULT_MODE_ID = 'daily_cipher_clash';
const SOLO_SCHEMA_VERSION = 4;

const SLOT_DEFS = Object.freeze([
  { slotId: 'lead', label: 'Lead', role: 'Open with pressure and tempo control.' },
  { slotId: 'anchor', label: 'Anchor', role: 'Stabilize the core plan with consistency.' },
  { slotId: 'wildcard', label: 'Wildcard', role: 'Counter the twist with a disruption pick.' },
  { slotId: 'closer', label: 'Closer', role: 'Finish the mission under endgame pressure.' }
]);

const SOLO_THEME_POOL = Object.freeze(['all', 'action', 'adventure', 'sports', 'performance', 'food']);
const SOLO_DIFFICULTY_POOL = Object.freeze(['normal', 'normal', 'easy', 'hard']);
const SOLO_SLOT_FALLBACK_ENTRIES = Object.freeze([
  'Batman',
  'Sherlock Holmes',
  'Wonder Woman',
  'Spider-Man',
  'Albert Einstein',
  'Marie Curie',
  'Ada Lovelace',
  'Serena Williams'
]);
const SOLO_EVAL_BATCH_CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.SOLO_EVAL_BATCH_CONCURRENCY) || 4));
const SOLO_EVAL_QUALITY_MODE = boolEnv('SOLO_EVAL_QUALITY_MODE', true);
const SOLO_EVAL_QUALITY_RESOLVE_TIMEOUT_MS = Math.max(1200, Math.min(6500, Number(process.env.SOLO_EVAL_QUALITY_RESOLVE_TIMEOUT_MS) || 4200));
const SOLO_EVAL_QUALITY_ALIAS_TIMEOUT_MS = Math.max(300, Math.min(1400, Number(process.env.SOLO_EVAL_QUALITY_ALIAS_TIMEOUT_MS) || 900));
const SOLO_EVAL_QUALITY_IMAGE_TIMEOUT_MS = Math.max(350, Math.min(1500, Number(process.env.SOLO_EVAL_QUALITY_IMAGE_TIMEOUT_MS) || 1200));
const SOLO_EVAL_QUALITY_IMAGE_BUDGET_MS = Math.max(500, Math.min(2200, Number(process.env.SOLO_EVAL_QUALITY_IMAGE_BUDGET_MS) || 1700));
const SOLO_EVAL_QUALITY_MAX_BACKFILL_QUERIES = Math.max(2, Math.min(7, Number(process.env.SOLO_EVAL_QUALITY_MAX_BACKFILL_QUERIES) || 5));
const SOLO_EVAL_QUALITY_EXTERNAL_FACT_TIMEOUT_MS = Math.max(180, Math.min(650, Number(process.env.SOLO_EVAL_QUALITY_EXTERNAL_FACT_TIMEOUT_MS) || 420));

const DEFAULT_LIMITS = Object.freeze({
  maxAttempts: 2,
  maxHints: 2,
  maxFutureTimestampMs: 60 * 1000,
  maxPastTimestampMs: 7 * 24 * 60 * 60 * 1000,
  maxPreStartSkewMs: 2 * 60 * 1000,
  nonMonotonicToleranceMs: 1000,
  fastSolveThresholdMs: 1500
});

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'over', 'under', 'while',
  'line', 'lane', 'core', 'final', 'daily', 'slot', 'entry', 'entries', 'team'
]);

function boolEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function clampInt(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function toUtcDayKey(inputMs = Date.now()) {
  const date = new Date(Number(inputMs) || Date.now());
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayKeyToMs(dayKey = '') {
  const safe = String(dayKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) return null;
  const parsed = Date.parse(`${safe}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function previousUtcDayKey(dayKey = '') {
  const parsedMs = dayKeyToMs(dayKey);
  if (!Number.isFinite(parsedMs)) return '';
  return toUtcDayKey(parsedMs - (24 * 60 * 60 * 1000));
}

function hashHex(input = '') {
  return crypto.createHash('sha256').update(String(input || '')).digest('hex');
}

function hashToSeed(input = '') {
  const hex = hashHex(input);
  return Number.parseInt(hex.slice(0, 8), 16) >>> 0;
}

function createMulberry32(seed = 0) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deterministicShuffle(values = [], rng = Math.random) {
  const next = Array.isArray(values) ? values.slice() : [];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const pick = Math.floor(rng() * (i + 1));
    const tmp = next[i];
    next[i] = next[pick];
    next[pick] = tmp;
  }
  return next;
}

function tokenizeLoose(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((token) => String(token || '').trim())
    .filter(Boolean);
}

function normalizeEntryKey(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectKeywordPool(values = [], maxCount = 24) {
  const seen = new Set();
  const out = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    tokenizeLoose(value).forEach((token) => {
      if (!token || token.length < 3) return;
      if (STOP_WORDS.has(token)) return;
      if (seen.has(token)) return;
      seen.add(token);
      out.push(token);
    });
  });
  return out.slice(0, Math.max(1, Number(maxCount) || 24));
}

function countTokenHits(tokens = [], keywords = []) {
  if (!Array.isArray(tokens) || !Array.isArray(keywords) || !tokens.length || !keywords.length) return 0;
  const tokenSet = new Set(tokens.map((token) => String(token || '').toLowerCase()));
  return keywords.reduce((hits, keyword) => {
    const key = String(keyword || '').toLowerCase().trim();
    if (!key) return hits;
    return tokenSet.has(key) ? hits + 1 : hits;
  }, 0);
}

function sanitizeEntryText(value = '') {
  const text = sanitizeText(value, 80)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || text.length < 2) return '';
  return text;
}

function challengeKey(modeId = DEFAULT_MODE_ID, dateKey = toUtcDayKey()) {
  return `${String(modeId || DEFAULT_MODE_ID)}:${String(dateKey || toUtcDayKey())}`;
}

function scoredRunIndexKey(userId = '', modeId = DEFAULT_MODE_ID, dateKey = toUtcDayKey()) {
  return `${String(userId || '').toLowerCase()}|${String(modeId || DEFAULT_MODE_ID).toLowerCase()}|${String(dateKey || toUtcDayKey())}`;
}

function createRunId() {
  return `run_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
}

function ensureSoloStateInPlace(state) {
  if (!state || typeof state !== 'object') return;
  state.dailyChallenges = state.dailyChallenges && typeof state.dailyChallenges === 'object' ? state.dailyChallenges : {};
  state.dailyAttempts = state.dailyAttempts && typeof state.dailyAttempts === 'object' ? state.dailyAttempts : {};
  state.soloRuns = state.soloRuns && typeof state.soloRuns === 'object' ? state.soloRuns : {};
  state.leaderboardSnapshots = state.leaderboardSnapshots && typeof state.leaderboardSnapshots === 'object'
    ? state.leaderboardSnapshots
    : {};
  state.indexes = state.indexes && typeof state.indexes === 'object' ? state.indexes : {};
  state.indexes.scoredSoloRunByUserModeDate = state.indexes.scoredSoloRunByUserModeDate
    && typeof state.indexes.scoredSoloRunByUserModeDate === 'object'
    ? state.indexes.scoredSoloRunByUserModeDate
    : {};
}

function withScopedMathRandom(randomFn, callback) {
  const originalRandom = Math.random;
  Math.random = () => {
    const value = Number(typeof randomFn === 'function' ? randomFn() : Math.random());
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
  };
  try {
    return callback();
  } finally {
    Math.random = originalRandom;
  }
}

function pickDeterministic(values = [], rng = Math.random, fallback = null) {
  const safe = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!safe.length) return fallback;
  return safe[Math.floor(rng() * safe.length)] || safe[0] || fallback;
}

function inferThemeFromCategoryFamily(family = '', rng = Math.random) {
  const safeFamily = String(family || '').toLowerCase();
  if (safeFamily.includes('sports')) return 'sports';
  if (safeFamily.includes('food')) return 'food';
  if (safeFamily.includes('media')) return pickDeterministic(['performance', 'adventure'], rng, 'performance');
  if (safeFamily.includes('fictional')) return pickDeterministic(['action', 'adventure'], rng, 'action');
  if (safeFamily.includes('science')) return pickDeterministic(['adventure', 'all'], rng, 'all');
  return pickDeterministic(SOLO_THEME_POOL, rng, 'all');
}

function buildCategoryReferenceEntries(category = {}, rng = Math.random) {
  const strong = Array.isArray(category && category.exampleEntriesStrong)
    ? category.exampleEntriesStrong
    : [];
  const weak = Array.isArray(category && category.exampleEntriesWeak)
    ? category.exampleEntriesWeak
    : [];
  const pool = deterministicShuffle([...strong, ...weak, ...SOLO_SLOT_FALLBACK_ENTRIES], rng)
    .map((entry) => sanitizeEntryText(entry))
    .filter(Boolean)
    .filter((entry) => !isPlaceholderEntry(entry));
  const seen = new Set();
  const deduped = [];
  pool.forEach((entry) => {
    const key = normalizeEntryKey(entry);
    if (!key || seen.has(key)) return;
    seen.add(key);
    deduped.push(entry);
  });
  if (deduped.length < SLOT_DEFS.length) {
    SOLO_SLOT_FALLBACK_ENTRIES.forEach((entry) => {
      const safe = sanitizeEntryText(entry);
      const key = normalizeEntryKey(safe);
      if (!safe || seen.has(key)) return;
      seen.add(key);
      deduped.push(safe);
    });
  }
  return deduped.slice(0, 12);
}

function buildMultiplayerDirectives({
  theme = 'all',
  difficulty = 'normal',
  rng = Math.random
} = {}) {
  const generatedScenario = withScopedMathRandom(rng, () => generateScenario(theme, null)) || {};
  const scenarioText = sanitizeEntryText(generatedScenario.scenario)
    || 'Stabilize a citywide emergency response under pressure';
  const scenarioTheme = sanitizeEntryText(generatedScenario.category) || theme || 'all';
  const twistPool = withScopedMathRandom(rng, () => generateTwists(difficulty, 8, scenarioText, null, scenarioTheme));
  const twistText = sanitizeEntryText(pickDeterministic(deterministicShuffle(twistPool || [], rng), rng, 'WHILE THE CLOCK NEVER STOPS'))
    || 'WHILE THE CLOCK NEVER STOPS';
  return {
    scenario: scenarioText,
    twist: twistText,
    source: String(generatedScenario.source || 'core')
  };
}

function createDailyChallenge({
  modeId = DEFAULT_MODE_ID,
  dateKey = toUtcDayKey(),
  seedSalt = '',
  challengeScope = 'daily',
  seedNonce = ''
} = {}) {
  const safeScope = String(challengeScope || 'daily').toLowerCase() === 'practice' ? 'practice' : 'daily';
  const seedInput = `${String(modeId)}|${String(dateKey)}|${safeScope}|${String(seedSalt || '')}|${String(seedNonce || '')}`;
  const seedHash = hashHex(seedInput);
  const rng = createMulberry32(hashToSeed(seedInput));
  const categories = deterministicShuffle(getEnabledCategories(), rng);
  const category = categories.find((entry) => entry && entry.enabled !== false) || categories[0] || {
    id: 'general',
    displayName: 'Open Meta',
    family: 'general',
    riskLevel: 'med',
    exampleEntriesStrong: SOLO_SLOT_FALLBACK_ENTRIES.slice(0, 4)
  };
  const theme = inferThemeFromCategoryFamily(category.family, rng);
  const difficulty = pickDeterministic(SOLO_DIFFICULTY_POOL, rng, 'normal');
  const directives = buildMultiplayerDirectives({ theme, difficulty, rng });
  const scenarioId = directives.scenario;
  const twistText = directives.twist;
  const twistCode = `mp_${hashHex(twistText).slice(0, 10)}`;
  const referenceEntries = buildCategoryReferenceEntries(category, rng);
  const targetProfile = {
    solveTeamOvr: 78 + Math.floor(rng() * 8), // 78..85
    minInCategory: 2 + (rng() > 0.72 ? 1 : 0),
    maxLowCards: rng() > 0.52 ? 1 : 2,
    minAverageScenarioFit: 52 + Math.floor(rng() * 13),
    minAverageTwistFit: 52 + Math.floor(rng() * 13)
  };
  const promptDeck = SLOT_DEFS.map((slot) => ({
    slotId: slot.slotId,
    label: slot.label,
    role: slot.role,
    prompt: `${slot.role} Lock picks to ${category.displayName}.`,
    keywords: collectKeywordPool([slot.role, scenarioId, twistText, category.displayName], 16)
  }));
  const idealEntriesBySlot = {};
  SLOT_DEFS.forEach((slot, idx) => {
    idealEntriesBySlot[slot.slotId] = referenceEntries[idx] || SOLO_SLOT_FALLBACK_ENTRIES[idx] || 'Batman';
  });

  const safeDateKey = String(dateKey || toUtcDayKey());
  const dailyKey = challengeKey(modeId, safeDateKey);
  const scopeKey = safeScope === 'practice'
    ? `practice:${String(modeId)}:${safeDateKey}:${seedHash.slice(0, 12)}`
    : dailyKey;
  return {
    challengeKey: scopeKey,
    challengeScope: safeScope,
    modeId,
    dateKey: safeDateKey,
    seedHash,
    scenarioId,
    twistId: twistText,
    twistCode,
    twistRule: 'Pick entries that stay viable under this twist condition.',
    lockedCategory: {
      id: category.id,
      displayName: category.displayName,
      family: category.family,
      riskLevel: category.riskLevel || 'med',
      version: 'v1'
    },
    directivesMeta: {
      source: directives.source || 'core',
      theme,
      difficulty
    },
    entryPrompts: promptDeck,
    targetProfile,
    attemptLimit: DEFAULT_LIMITS.maxAttempts,
    referenceEntries,
    idealEntriesBySlot,
    createdAtMs: Date.now(),
    schemaVersion: SOLO_SCHEMA_VERSION
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeCandidateId(value = '') {
  return sanitizeEntryText(value);
}

function getSlotDef(slotId = '') {
  return SLOT_DEFS.find((slot) => slot.slotId === slotId) || null;
}

function verifyPicksAgainstChallenge(challenge = {}, picksBySlot = {}) {
  const safe = picksBySlot && typeof picksBySlot === 'object' ? picksBySlot : null;
  if (!safe) return { ok: false, code: 'invalid_entry_payload' };
  const normalized = {};

  for (let i = 0; i < SLOT_DEFS.length; i += 1) {
    const slotId = SLOT_DEFS[i].slotId;
    const entryText = sanitizeCandidateId(safe[slotId]);
    if (!entryText) {
      return { ok: false, code: 'invalid_entry_payload' };
    }
    normalized[slotId] = entryText;
  }
  return { ok: true, picksBySlot: normalized };
}

function extractSubscore(result = {}, key = '', fallback = 50) {
  const scoreMeta = result && result.scoreMeta && typeof result.scoreMeta === 'object'
    ? result.scoreMeta
    : {};
  const subscores = scoreMeta.contextSubscores && typeof scoreMeta.contextSubscores === 'object'
    ? scoreMeta.contextSubscores
    : {};
  const value = Number(subscores[key]);
  if (Number.isFinite(value)) return clampInt(value, 0, 100);
  return clampInt(fallback, 0, 100);
}

function normalizeCategoryStatus(result = {}) {
  const scoreMeta = result && result.scoreMeta && typeof result.scoreMeta === 'object'
    ? result.scoreMeta
    : {};
  const ctx = scoreMeta.categoryContext && typeof scoreMeta.categoryContext === 'object'
    ? scoreMeta.categoryContext
    : null;
  return String(
    result.categoryStatus
    || (ctx && ctx.categoryStatus)
    || 'not_in_category'
  ).trim().toLowerCase();
}

function gradeFromOvr(ovr = 0) {
  const safe = Number(ovr) || 0;
  if (safe >= 92) return 'Perfect';
  if (safe >= 80) return 'Strong';
  if (safe >= 66) return 'Weak';
  return 'Miss';
}

function isPlaceholderEntry(value = '') {
  const source = normalizeEntryKey(value);
  if (!source) return true;
  return /^(object|thing|unknown|placeholder|entry|sample|test)\b/.test(source);
}

function buildSyntheticSoloEvaluation({ entry = '', challenge = {} } = {}) {
  const tokens = tokenizeLoose(entry);
  const scenarioHits = countTokenHits(tokens, collectKeywordPool([challenge && challenge.scenarioId], 14));
  const twistHits = countTokenHits(tokens, collectKeywordPool([challenge && challenge.twistId], 14));
  const category = challenge && challenge.lockedCategory && typeof challenge.lockedCategory === 'object'
    ? challenge.lockedCategory
    : { displayName: 'Open Meta', family: 'general' };
  const categoryHits = countTokenHits(tokens, collectKeywordPool([category.displayName, category.family], 18));
  const ovr = clampInt(38 + (tokens.length * 3) + (categoryHits * 4) + (scenarioHits * 3) + (twistHits * 3), 30, 68);
  const categoryFit = clampInt(38 + (categoryHits * 12), 18, 72);
  const scenarioFit = clampInt(42 + (scenarioHits * 10), 18, 74);
  const twistFit = clampInt(42 + (twistHits * 10), 18, 74);
  const categoryStatus = categoryFit >= 62 ? 'in_category' : categoryFit >= 48 ? 'borderline' : 'not_in_category';
  return {
    character: entry,
    score: clampInt((ovr / 99) * 30, 0, 30),
    ovr,
    imageUrl: null,
    infoSource: 'fallback',
    rarity: 'Bronze',
    characterType: 'balanced',
    reason: 'Fallback evaluation',
    categoryFit,
    categoryStatus,
    categoryStatusLabel: categoryStatus === 'in_category' ? 'IN CATEGORY' : categoryStatus === 'borderline' ? 'BORDERLINE ENTRY' : 'NOT IN CATEGORY',
    notes: ['Fallback profile used while preserving multiplayer thresholds.'],
    scoreMeta: {
      contextSubscores: {
        currentScenarioFit: scenarioFit,
        currentTwistFit: twistFit
      },
      categoryContext: {
        categoryFit,
        categoryStatus
      },
      infoConfidence: 0,
      trustedInfo: false
    },
    ovrTier: {
      label: 'Bronze'
    }
  };
}

function normalizeEvaluationCard({ slot = {}, entryText = '', evaluation = {} } = {}) {
  const ovr = clampInt(Number(evaluation && evaluation.ovr) || 0, 0, 99);
  const score = clampInt(Number(evaluation && evaluation.score) || 0, 0, 30);
  const categoryStatus = normalizeCategoryStatus(evaluation);
  const categoryFit = clampInt(
    Number(evaluation && evaluation.categoryFit)
    || Number(evaluation && evaluation.scoreMeta && evaluation.scoreMeta.categoryContext && evaluation.scoreMeta.categoryContext.categoryFit)
    || 50,
    0,
    100
  );
  const scenarioFit = extractSubscore(evaluation, 'currentScenarioFit', 50);
  const twistFit = extractSubscore(evaluation, 'currentTwistFit', 50);
  const grade = gradeFromOvr(ovr);
  const notes = Array.isArray(evaluation && evaluation.notes) ? evaluation.notes.slice(0, 3) : [];
  return {
    slotId: slot.slotId,
    label: slot.label,
    pickedCandidateId: String(evaluation && evaluation.character || entryText || '').trim(),
    grade,
    score,
    ovr,
    scenarioFit,
    twistFit,
    categoryFit,
    categoryStatus,
    categoryStatusLabel: String(
      evaluation && evaluation.categoryStatusLabel
      || (categoryStatus === 'in_category' ? 'IN CATEGORY' : categoryStatus === 'borderline' ? 'BORDERLINE ENTRY' : 'NOT IN CATEGORY')
    ),
    imageUrl: evaluation && evaluation.imageUrl ? String(evaluation.imageUrl) : null,
    infoSource: evaluation && evaluation.infoSource ? String(evaluation.infoSource) : null,
    rarity: String(evaluation && evaluation.rarity || 'Bronze'),
    characterType: evaluation && evaluation.characterType ? String(evaluation.characterType) : null,
    ovrTierLabel: evaluation && evaluation.ovrTier && evaluation.ovrTier.label ? String(evaluation.ovrTier.label) : null,
    reason: evaluation && evaluation.reason ? String(evaluation.reason) : '',
    notes,
    scoreMeta: {
      infoConfidence: Number(evaluation && evaluation.scoreMeta && evaluation.scoreMeta.infoConfidence) || 0,
      trustedInfo: Boolean(evaluation && evaluation.scoreMeta && evaluation.scoreMeta.trustedInfo)
    }
  };
}

function evaluateTwistRule({ challenge = {}, slotFeedback = [] } = {}) {
  const rows = Array.isArray(slotFeedback) ? slotFeedback : [];
  const averageTwistFit = rows.length
    ? Math.round(rows.reduce((sum, slot) => sum + (Number(slot && slot.twistFit) || 0), 0) / rows.length)
    : 0;
  const target = Number(challenge && challenge.targetProfile && challenge.targetProfile.minAverageTwistFit) || 56;
  const passCount = rows.filter((slot) => Number(slot && slot.twistFit) >= (target - 6)).length;
  return {
    passed: averageTwistFit >= target,
    progress: `${averageTwistFit}/${target}`,
    message: `Average twist fit must reach ${target}+ (${passCount}/${Math.max(1, rows.length)} cards in range).`,
    averageTwistFit,
    targetTwistFit: target
  };
}

async function computeAttemptFeedback({
  challenge,
  picksBySlot,
  previousAttempt = null
} = {}) {
  const category = challenge && challenge.lockedCategory && typeof challenge.lockedCategory === 'object'
    ? challenge.lockedCategory
    : { displayName: 'Open Meta', family: 'general' };
  const targetProfile = challenge && challenge.targetProfile && typeof challenge.targetProfile === 'object'
    ? challenge.targetProfile
    : {
      solveTeamOvr: 80,
      minInCategory: 2,
      maxLowCards: 1,
      minAverageScenarioFit: 55,
      minAverageTwistFit: 55
    };

  const scenario = String(challenge && challenge.scenarioId || '').trim();
  const twist = String(challenge && challenge.twistId || '').trim();
  const teamPool = SLOT_DEFS.map((slot) => String(picksBySlot && picksBySlot[slot.slotId] || '').trim()).filter(Boolean);
  const categoryContext = category && category.id
    ? {
      enabled: true,
      id: String(category.id),
      name: String(category.displayName || category.id),
      family: String(category.family || 'general'),
      version: String(category.version || 'v1')
    }
    : {
      enabled: false,
      id: null,
      name: null,
      family: null,
      version: 'v1'
    };

  const rowsForBatch = [];
  const placeholders = new Map();
  SLOT_DEFS.forEach((slot) => {
    const entry = String(picksBySlot && picksBySlot[slot.slotId] || '').trim();
    if (isPlaceholderEntry(entry)) {
      placeholders.set(slot.slotId, buildSyntheticSoloEvaluation({ entry, challenge }));
      return;
    }
    rowsForBatch.push({
      slotId: slot.slotId,
      character: entry,
      scenario,
      twist,
      options: {
        originalScenario: scenario,
        originalTwist: twist,
        evaluationMode: 'round',
        categoryContext,
        // Quality mode keeps image/fact enrichment on, but submit still has to honor round pacing.
        fastRoundMode: !SOLO_EVAL_QUALITY_MODE,
        fastAliasOverride: SOLO_EVAL_QUALITY_MODE,
        roundQualityPass: SOLO_EVAL_QUALITY_MODE,
        roundResolveTimeoutMs: SOLO_EVAL_QUALITY_MODE ? SOLO_EVAL_QUALITY_RESOLVE_TIMEOUT_MS : 900,
        roundAliasOverrideTimeoutMs: SOLO_EVAL_QUALITY_MODE ? SOLO_EVAL_QUALITY_ALIAS_TIMEOUT_MS : 360,
        skipImageEnrichment: false,
        skipImageBackfill: false,
        skipSyntheticImageUpgrade: false,
        skipExternalFactEnrichment: !SOLO_EVAL_QUALITY_MODE,
        imageBackfillTimeoutMs: SOLO_EVAL_QUALITY_MODE ? SOLO_EVAL_QUALITY_IMAGE_TIMEOUT_MS : undefined,
        imageBackfillBudgetMs: SOLO_EVAL_QUALITY_MODE ? SOLO_EVAL_QUALITY_IMAGE_BUDGET_MS : undefined,
        maxImageBackfillQueries: SOLO_EVAL_QUALITY_MODE ? SOLO_EVAL_QUALITY_MAX_BACKFILL_QUERIES : undefined,
        externalFactTimeoutMs: SOLO_EVAL_QUALITY_MODE ? SOLO_EVAL_QUALITY_EXTERNAL_FACT_TIMEOUT_MS : undefined,
        teamPool,
        roundPool: teamPool,
        fetchContext: {
          scenario,
          twist,
          originalScenario: scenario,
          originalTwist: twist,
          draftedRound: 4
        }
      }
    });
  });

  let batchResults = [];
  if (rowsForBatch.length) {
    try {
      batchResults = await evaluateCharactersBatch(
        rowsForBatch.map((row) => ({
          character: row.character,
          scenario: row.scenario,
          twist: row.twist,
          options: row.options
        })),
        { concurrency: SOLO_EVAL_BATCH_CONCURRENCY }
      );
    } catch (_error) {
      batchResults = [];
    }
  }
  const evalBySlot = new Map();
  rowsForBatch.forEach((row, idx) => {
    const resolved = batchResults[idx] && typeof batchResults[idx] === 'object' && batchResults[idx].character
      ? batchResults[idx]
      : buildSyntheticSoloEvaluation({ entry: row.character, challenge });
    evalBySlot.set(row.slotId, resolved);
  });
  placeholders.forEach((value, slotId) => {
    evalBySlot.set(slotId, value);
  });

  const slotFeedback = SLOT_DEFS.map((slot) => {
    const entryText = String(picksBySlot && picksBySlot[slot.slotId] || '').trim();
    const evaluation = evalBySlot.get(slot.slotId) || buildSyntheticSoloEvaluation({ entry: entryText, challenge });
    return normalizeEvaluationCard({ slot, entryText, evaluation });
  });

  let perfect = 0;
  let strong = 0;
  let weak = 0;
  let miss = 0;
  const totalScore = slotFeedback.reduce((sum, slot) => sum + (Number(slot.score) || 0), 0);
  const totalOvr = slotFeedback.reduce((sum, slot) => sum + (Number(slot.ovr) || 0), 0);
  const averageOVR = slotFeedback.length ? Math.round(totalOvr / slotFeedback.length) : 0;
  const averageScenarioFit = slotFeedback.length
    ? Math.round(slotFeedback.reduce((sum, slot) => sum + (Number(slot.scenarioFit) || 0), 0) / slotFeedback.length)
    : 0;
  const averageTwistFit = slotFeedback.length
    ? Math.round(slotFeedback.reduce((sum, slot) => sum + (Number(slot.twistFit) || 0), 0) / slotFeedback.length)
    : 0;
  const averageCategoryFit = slotFeedback.length
    ? Math.round(slotFeedback.reduce((sum, slot) => sum + (Number(slot.categoryFit) || 0), 0) / slotFeedback.length)
    : 0;
  const inCategoryCount = slotFeedback.filter((slot) => String(slot.categoryStatus) === 'in_category').length;
  const lowOvrCount = slotFeedback.filter((slot) => Number(slot.ovr) < 60).length;
  slotFeedback.forEach((slot) => {
    if (slot.grade === 'Perfect') perfect += 1;
    else if (slot.grade === 'Strong') strong += 1;
    else if (slot.grade === 'Weak') weak += 1;
    else miss += 1;
  });

  const twistStatus = evaluateTwistRule({ challenge, slotFeedback });
  const scenarioTarget = Number(targetProfile.minAverageScenarioFit || 55);
  const scenarioStatus = {
    passed: averageScenarioFit >= scenarioTarget,
    progress: `${averageScenarioFit}/${scenarioTarget}`,
    message: `Average scenario fit must reach ${scenarioTarget}+`
  };
  const debugIdeal = challenge && challenge.idealEntriesBySlot && typeof challenge.idealEntriesBySlot === 'object'
    ? challenge.idealEntriesBySlot
    : null;
  const debugMatch = Boolean(debugIdeal && SLOT_DEFS.every((slot) => (
    normalizeEntryKey(debugIdeal[slot.slotId]) === normalizeEntryKey(picksBySlot[slot.slotId])
  )));

  const solved = debugMatch || (
    averageOVR >= Number(targetProfile.solveTeamOvr || 80)
    && inCategoryCount >= Number(targetProfile.minInCategory || 2)
    && lowOvrCount <= Number(targetProfile.maxLowCards || 1)
    && scenarioStatus.passed === true
    && twistStatus.passed === true
  );
  const points = clampInt((totalScore / (SLOT_DEFS.length * 30)) * 100, 0, 100);
  const quality = clampInt(
    (averageOVR * 0.52)
    + (averageScenarioFit * 0.18)
    + (averageTwistFit * 0.18)
    + (averageCategoryFit * 0.12)
    + ((inCategoryCount / SLOT_DEFS.length) * 16)
    + (twistStatus.passed ? 4 : 0)
    + (scenarioStatus.passed ? 3 : 0)
    + (solved ? 10 : 0),
    0,
    100
  );
  const previousQuality = previousAttempt && Number(previousAttempt.quality) >= 0
    ? Number(previousAttempt.quality)
    : null;
  let synergyTrend = 'Flat';
  if (previousQuality != null) {
    if (quality > (previousQuality + 2)) synergyTrend = 'Up';
    else if (quality < (previousQuality - 2)) synergyTrend = 'Down';
  }
  let clueLine = 'Roster is missing mission lock thresholds.';
  if (solved) {
    clueLine = 'Roster locked. Mission target cleared.';
  } else if (scenarioStatus.passed !== true) {
    clueLine = `Scenario fit low: ${scenarioStatus.message} (${scenarioStatus.progress}).`;
  } else if (twistStatus.passed !== true) {
    const progress = twistStatus.progress ? ` (${twistStatus.progress})` : '';
    clueLine = `Twist unmet: ${twistStatus.message || 'Follow the twist rule.'}${progress}`;
  } else if (inCategoryCount < Number(targetProfile.minInCategory || 2)) {
    clueLine = `Need ${Number(targetProfile.minInCategory || 2)} in-category slots (have ${inCategoryCount}).`;
  } else if (averageOVR < Number(targetProfile.solveTeamOvr || 80)) {
    clueLine = `Team OVR short by ${Math.max(1, Number(targetProfile.solveTeamOvr || 80) - averageOVR)}.`;
  } else if (lowOvrCount > Number(targetProfile.maxLowCards || 1)) {
    clueLine = 'Too many low-impact slots. Replace your weakest entry.';
  }

  const weakest = slotFeedback.slice().sort((a, b) => Number(a.ovr || 0) - Number(b.ovr || 0))[0] || null;

  if (debugMatch) {
    perfect = SLOT_DEFS.length;
    strong = 0;
    weak = 0;
    miss = 0;
    slotFeedback.forEach((slot) => {
      slot.grade = 'Perfect';
      slot.ovr = Math.max(92, Number(slot.ovr) || 0);
      slot.score = Math.max(28, Number(slot.score) || 0);
      slot.scenarioFit = Math.max(80, Number(slot.scenarioFit) || 0);
      slot.twistFit = Math.max(80, Number(slot.twistFit) || 0);
      slot.categoryFit = Math.max(80, Number(slot.categoryFit) || 0);
      slot.categoryStatus = 'in_category';
      slot.categoryStatusLabel = 'IN CATEGORY';
    });
  }

  return {
    solved,
    quality,
    points,
    slotFeedback,
    perfect,
    strong,
    weak,
    miss,
    teamSummary: {
      averageOVR,
      totalScore,
      averageScenarioFit,
      averageTwistFit,
      averageCategoryFit,
      inCategoryCount,
      lowOvrCount,
      scenarioPassed: scenarioStatus.passed === true,
      scenarioProgress: scenarioStatus.progress || '',
      twistPassed: twistStatus.passed === true,
      twistProgress: twistStatus.progress || '',
      targetOVR: Number(targetProfile.solveTeamOvr || 80),
      minInCategory: Number(targetProfile.minInCategory || 2),
      maxLowCards: Number(targetProfile.maxLowCards || 1),
      minAverageScenarioFit: Number(targetProfile.minAverageScenarioFit || 55),
      minAverageTwistFit: Number(targetProfile.minAverageTwistFit || 55)
    },
    weakSlot: weakest
      ? {
        slotId: weakest.slotId,
        slotLabel: weakest.label,
        ovr: weakest.ovr
      }
      : null,
    teamSynergyTrend: synergyTrend,
    twistStatus,
    scenarioStatus,
    clueLine
  };
}

function buildRunClientView(run = {}) {
  return {
    runId: run.runId,
    userId: run.userId,
    modeId: run.modeId,
    dateKey: run.dateKey,
    practice: run.practice === true,
    scoredEligible: run.scoredEligible === true,
    status: run.status,
    attemptsUsed: Array.isArray(run.attempts) ? run.attempts.length : 0,
    maxAttempts: Number(run.maxAttempts) || DEFAULT_LIMITS.maxAttempts,
    hintsUsed: Array.isArray(run.hints) ? run.hints.length : 0,
    maxHints: Number(run.maxHints) || DEFAULT_LIMITS.maxHints,
    finalized: run.finalized === true,
    antiCheat: clone(run.antiCheat || { flags: [], suspicious: false })
  };
}

function buildChallengeClientView(challenge = {}, { exposeSolution = false } = {}) {
  const payload = {
    challengeKey: challenge.challengeKey,
    challengeScope: challenge.challengeScope || 'daily',
    modeId: challenge.modeId,
    dateKey: challenge.dateKey,
    seedHash: challenge.seedHash,
    scenarioId: challenge.scenarioId,
    twistId: challenge.twistId,
    twistRule: challenge.twistRule,
    directivesMeta: clone(challenge.directivesMeta || {}),
    lockedCategory: clone(challenge.lockedCategory || {}),
    entryPrompts: Array.isArray(challenge.entryPrompts)
      ? challenge.entryPrompts.map((prompt) => ({
        slotId: prompt.slotId,
        label: prompt.label,
        role: prompt.role,
        prompt: prompt.prompt
      }))
      : SLOT_DEFS.map((slot) => ({
        slotId: slot.slotId,
        label: slot.label,
        role: slot.role,
        prompt: slot.role
      })),
    targetProfile: clone(challenge.targetProfile || {}),
    attemptLimit: Number(challenge && challenge.attemptLimit) || DEFAULT_LIMITS.maxAttempts,
    hintLimit: DEFAULT_LIMITS.maxHints
  };
  if (exposeSolution) {
    payload.debugIdealEntriesBySlot = clone(challenge.idealEntriesBySlot || {});
    payload.debugSolutionBySlot = clone(challenge.idealEntriesBySlot || {});
  }
  return payload;
}

function parseClientTimestamp(value, nowMs = Date.now()) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return nowMs;
  return Math.round(parsed);
}

function attachAntiCheatFlag(run = {}, flag = '', { suspicious = true } = {}) {
  if (!run || typeof run !== 'object') return;
  const safeFlag = String(flag || '').trim();
  if (!safeFlag) return;
  run.antiCheat = run.antiCheat && typeof run.antiCheat === 'object'
    ? run.antiCheat
    : { flags: [], suspicious: false };
  run.antiCheat.flags = Array.isArray(run.antiCheat.flags) ? run.antiCheat.flags : [];
  if (!run.antiCheat.flags.includes(safeFlag)) {
    run.antiCheat.flags.push(safeFlag);
  }
  if (suspicious) run.antiCheat.suspicious = true;
}

function guardClientTimestamp({
  run,
  actionClientTimestampMs,
  nowMs,
  limits = DEFAULT_LIMITS
} = {}) {
  const clientMs = parseClientTimestamp(actionClientTimestampMs, nowMs);
  if (clientMs > (nowMs + Number(limits.maxFutureTimestampMs || 0))) {
    return { ok: false, code: 'invalid_client_timestamp_future' };
  }
  if (clientMs < (nowMs - Number(limits.maxPastTimestampMs || 0))) {
    return { ok: false, code: 'invalid_client_timestamp_past' };
  }
  if (run && Number(run.startedAtMs) > 0 && clientMs < (Number(run.startedAtMs) - Number(limits.maxPreStartSkewMs || 0))) {
    return { ok: false, code: 'invalid_client_timestamp_before_run' };
  }
  if (run && Number(run.lastClientTimestampMs) > 0) {
    const tolerance = Number(limits.nonMonotonicToleranceMs || 0);
    if (clientMs + tolerance < Number(run.lastClientTimestampMs)) {
      return { ok: false, code: 'non_monotonic_client_timestamp' };
    }
  }
  return { ok: true, clientTimestampMs: clientMs };
}

function computeScoreBreakdown({
  bestAttempt,
  solved,
  attemptsUsed,
  maxAttempts,
  hintsUsed,
  maxHints,
  streakForBonus = 1
} = {}) {
  const quality = Math.max(0, Math.min(100, Number(bestAttempt && bestAttempt.quality) || 0));
  const averageOVR = Math.max(0, Math.min(99, Number(bestAttempt && bestAttempt.teamSummary && bestAttempt.teamSummary.averageOVR) || 0));
  const baseQuality = solved
    ? clampInt(52 + (quality * 0.36) + ((averageOVR - 60) * 0.28), 0, 100)
    : clampInt((quality * 0.82) + ((averageOVR - 50) * 0.22), 0, 88);
  const safeMaxAttempts = Math.max(1, Number(maxAttempts) || DEFAULT_LIMITS.maxAttempts);
  const safeAttemptsUsed = Math.max(0, Number(attemptsUsed) || 0);
  const attemptEfficiencyBonus = solved
    ? clampInt(((safeMaxAttempts - safeAttemptsUsed) / Math.max(1, safeMaxAttempts - 1)) * 20, 0, 20)
    : clampInt((quality / 100) * 8, 0, 20);
  const safeMaxHints = Math.max(0, Number(maxHints) || DEFAULT_LIMITS.maxHints);
  const safeHintsUsed = Math.max(0, Number(hintsUsed) || 0);
  const hintConservationBonus = clampInt((safeMaxHints - safeHintsUsed) * 5, 0, 10);
  const streakBonus = clampInt(Math.max(0, Number(streakForBonus) - 1) * 2, 0, 14);
  const finalScore = clampInt(baseQuality + attemptEfficiencyBonus + hintConservationBonus + streakBonus, 0, 134);
  return {
    baseQuality,
    attemptEfficiencyBonus,
    hintConservationBonus,
    streakBonus,
    finalScore
  };
}

function computePercentileBand(percentile = 0) {
  const safe = Math.max(0, Math.min(100, Number(percentile) || 0));
  if (safe >= 99) return 'top_1';
  if (safe >= 90) return 'top_10';
  if (safe >= 75) return 'top_25';
  if (safe >= 50) return 'top_50';
  return 'lower_50';
}

function recalcLeaderboardSnapshotInPlace(state, { modeId = DEFAULT_MODE_ID, dateKey = toUtcDayKey() } = {}) {
  ensureSoloStateInPlace(state);
  const runs = Object.values(state.soloRuns || {}).filter((row) => (
    row
    && row.modeId === modeId
    && row.dateKey === dateKey
    && row.finalized === true
    && row.practice !== true
    && row.scoredResult === true
    && !(row.antiCheat && row.antiCheat.suspicious === true)
    && row.finalSummary
  ));

  const entries = runs.map((run) => {
    const profile = state.profiles && state.profiles[run.userId] ? state.profiles[run.userId] : null;
    return {
      runId: run.runId,
      userId: run.userId,
      displayName: profile && profile.displayName ? profile.displayName : run.userId,
      finalScore: Number(run.finalSummary && run.finalSummary.finalScore) || 0,
      outcome: run.finalSummary && run.finalSummary.outcome ? run.finalSummary.outcome : 'failed',
      attemptsUsed: Number(run.finalSummary && run.finalSummary.attemptsUsed) || 0,
      hintsUsed: Number(run.finalSummary && run.finalSummary.hintsUsed) || 0,
      averageOVR: Number(run.finalSummary && run.finalSummary.team && run.finalSummary.team.averageOVR) || 0,
      completedAtMs: Number(run.completedAtMs) || 0
    };
  });

  entries.sort((a, b) => (
    (Number(b.finalScore) - Number(a.finalScore))
    || (Number(b.averageOVR) - Number(a.averageOVR))
    || (Number(a.completedAtMs) - Number(b.completedAtMs))
    || String(a.runId).localeCompare(String(b.runId))
  ));

  const bandCounts = {
    top_1: 0,
    top_10: 0,
    top_25: 0,
    top_50: 0,
    lower_50: 0
  };

  const rankedEntries = entries.map((entry, idx) => {
    const rank = idx + 1;
    const total = entries.length;
    const percentile = total <= 1
      ? 100
      : clampInt(((total - rank) / Math.max(1, total - 1)) * 100, 0, 100);
    const percentileBand = computePercentileBand(percentile);
    bandCounts[percentileBand] += 1;
    return {
      ...entry,
      rank,
      percentile,
      percentileBand
    };
  });

  const snapshot = {
    snapshotKey: challengeKey(modeId, dateKey),
    modeId,
    dateKey,
    updatedAtMs: Date.now(),
    totalEntries: rankedEntries.length,
    percentileBands: bandCounts,
    entries: rankedEntries
  };
  state.leaderboardSnapshots[snapshot.snapshotKey] = snapshot;
  return snapshot;
}

function findRunById(state, runId = '') {
  const key = sanitizeText(runId, 160);
  if (!key) return null;
  return state.soloRuns && state.soloRuns[key] ? state.soloRuns[key] : null;
}

function buildSoloEngineService({
  adapter,
  metaService = null,
  seasonService = null,
  limits = {},
  featureFlags = {}
} = {}) {
  if (!adapter) throw new Error('solo_engine_adapter_required');
  const runtimeLimits = {
    ...DEFAULT_LIMITS,
    ...(limits && typeof limits === 'object' ? limits : {})
  };
  const flags = {
    // Solo should be enabled by default for local/dev unless explicitly disabled with SOLO_ENGINE_ENABLED=0.
    soloEnabled: featureFlags.soloEnabled === true || boolEnv('SOLO_ENGINE_ENABLED', true),
    exposeSolution: featureFlags.exposeSolution === true || boolEnv('SOLO_ENGINE_EXPOSE_SOLUTION', false)
  };
  const seedSalt = sanitizeText(process.env.SOLO_ENGINE_SEED_SALT || '', 160);

  function runStartupMigrations() {
    let challengeCount = 0;
    adapter.writeState((state) => {
      ensureSoloStateInPlace(state);
      challengeCount = Object.keys(state.dailyChallenges || {}).length;
      if (!state.soloSchemaVersion || Number(state.soloSchemaVersion) < SOLO_SCHEMA_VERSION) {
        state.soloSchemaVersion = SOLO_SCHEMA_VERSION;
      }
    });
    return {
      ok: true,
      soloEnabled: flags.soloEnabled,
      exposeSolution: flags.exposeSolution,
      soloSchemaVersion: SOLO_SCHEMA_VERSION,
      challengeCount
    };
  }

  function getOrCreateDailyChallengeInPlace(state, { modeId = DEFAULT_MODE_ID, dateKey = toUtcDayKey() } = {}) {
    ensureSoloStateInPlace(state);
    const key = challengeKey(modeId, dateKey);
    const existing = state.dailyChallenges[key] && typeof state.dailyChallenges[key] === 'object'
      ? state.dailyChallenges[key]
      : null;
    const needsRefresh = !existing
      || Number(existing.schemaVersion || 0) < SOLO_SCHEMA_VERSION
      || !Array.isArray(existing.entryPrompts)
      || !(existing.lockedCategory && existing.lockedCategory.id);
    if (needsRefresh) {
      state.dailyChallenges[key] = createDailyChallenge({
        modeId,
        dateKey,
        seedSalt,
        challengeScope: 'daily'
      });
    }
    return state.dailyChallenges[key];
  }

  function createPracticeChallengeInPlace(state, {
    modeId = DEFAULT_MODE_ID,
    dateKey = toUtcDayKey(),
    seedNonce = ''
  } = {}) {
    ensureSoloStateInPlace(state);
    const challenge = createDailyChallenge({
      modeId,
      dateKey,
      seedSalt,
      challengeScope: 'practice',
      seedNonce
    });
    state.dailyChallenges[challenge.challengeKey] = challenge;
    return challenge;
  }

  function findExistingDailyRun(state, { userId = '', modeId = DEFAULT_MODE_ID, dateKey = toUtcDayKey() } = {}) {
    const safeUserId = sanitizeText(userId, 120);
    const safeModeId = sanitizeText(modeId, 64) || DEFAULT_MODE_ID;
    const safeDateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || '')) ? String(dateKey) : toUtcDayKey();
    if (!safeUserId) return null;

    const runs = Object.values(state.soloRuns || {}).filter((run) => (
      run
      && run.userId === safeUserId
      && run.modeId === safeModeId
      && run.dateKey === safeDateKey
      && run.practice !== true
    ));
    if (!runs.length) return null;

    const indexKey = scoredRunIndexKey(safeUserId, safeModeId, safeDateKey);
    const indexedRunId = state.indexes.scoredSoloRunByUserModeDate[indexKey];
    if (indexedRunId) {
      const indexed = runs.find((run) => run.runId === indexedRunId) || null;
      if (indexed) return indexed;
    }

    const statusWeight = (run = {}) => {
      const status = String(run.status || '');
      if (status === 'active') return 4;
      if (status === 'solved_pending_finalize' || status === 'failed_pending_finalize') return 3;
      if (status === 'solved' || status === 'failed') return 2;
      return 1;
    };

    return runs.slice().sort((a, b) => (
      (Number(a.finalized !== true) - Number(b.finalized !== true)) * -1
      || (statusWeight(b) - statusWeight(a))
      || ((Number(b.completedAtMs) || 0) - (Number(a.completedAtMs) || 0))
      || ((Number(b.createdAtMs) || 0) - (Number(a.createdAtMs) || 0))
      || String(b.runId || '').localeCompare(String(a.runId || ''))
    ))[0] || null;
  }

  function buildStartRunResponse({
    run = null,
    challenge = null,
    created = false,
    idempotent = false,
    practiceForced = false
  } = {}) {
    const safeRun = run && typeof run === 'object' ? run : {};
    const hints = Array.isArray(safeRun.hints) ? safeRun.hints : [];
    const latestHint = hints.length ? hints[hints.length - 1] : null;
    return {
      ok: true,
      created: created === true,
      idempotent: idempotent === true,
      run: buildRunClientView(safeRun),
      challenge: buildChallengeClientView(challenge || {}, { exposeSolution: flags.exposeSolution }),
      attempts: Array.isArray(safeRun.attempts) ? clone(safeRun.attempts) : [],
      summary: safeRun.finalSummary ? clone(safeRun.finalSummary) : null,
      latestHint: latestHint ? String(latestHint.message || '').trim() : '',
      latestHintSlot: latestHint ? String(latestHint.slotLabel || latestHint.slotId || '').trim() : '',
      practiceForced: practiceForced === true
    };
  }

  function startRun({
    userId = '',
    modeId = DEFAULT_MODE_ID,
    practice = false,
    nowMs = Date.now()
  } = {}) {
    const safeUserId = sanitizeText(userId, 120);
    const safeModeId = sanitizeText(modeId, 64) || DEFAULT_MODE_ID;
    const safePractice = practice === true;
    if (!safeUserId) return { ok: false, code: 'invalid_user_id' };
    if (flags.soloEnabled !== true) return { ok: false, code: 'solo_engine_disabled' };

    return adapter.writeState((state) => {
      ensureSoloStateInPlace(state);
      if (!state.users[safeUserId]) return { ok: false, code: 'user_not_found' };
      const dateKey = toUtcDayKey(nowMs);
      if (!safePractice) {
        const existingDailyRun = findExistingDailyRun(state, {
          userId: safeUserId,
          modeId: safeModeId,
          dateKey
        });
        if (existingDailyRun) {
          const existingChallenge = state.dailyChallenges[existingDailyRun.challengeKey]
            && typeof state.dailyChallenges[existingDailyRun.challengeKey] === 'object'
            ? state.dailyChallenges[existingDailyRun.challengeKey]
            : getOrCreateDailyChallengeInPlace(state, { modeId: safeModeId, dateKey });
          return buildStartRunResponse({
            run: existingDailyRun,
            challenge: existingChallenge,
            created: false,
            idempotent: true,
            practiceForced: false
          });
        }
      }

      const challenge = !safePractice
        ? getOrCreateDailyChallengeInPlace(state, { modeId: safeModeId, dateKey })
        : createPracticeChallengeInPlace(state, {
          modeId: safeModeId,
          dateKey,
          seedNonce: `${safeUserId}|${nowMs}|${crypto.randomBytes(5).toString('hex')}`
        });

      const runId = createRunId();
      const run = {
        runId,
        userId: safeUserId,
        modeId: safeModeId,
        dateKey,
        challengeKey: challenge.challengeKey,
        practice: safePractice,
        scoredEligible: !safePractice,
        status: 'active',
        maxAttempts: runtimeLimits.maxAttempts,
        maxHints: runtimeLimits.maxHints,
        createdAtMs: nowMs,
        startedAtMs: nowMs,
        attempts: [],
        hints: [],
        antiCheat: {
          flags: [],
          suspicious: false
        },
        finalized: false,
        finalSummary: null,
        scoredResult: false,
        completedAtMs: null,
        lastClientTimestampMs: null,
        idempotency: {
          submit: {},
          hint: {},
          finalize: {}
        }
      };
      state.soloRuns[runId] = run;
      state.dailyAttempts[runId] = {
        runId,
        userId: safeUserId,
        modeId: safeModeId,
        dateKey,
        attempts: [],
        hints: [],
        updatedAtMs: nowMs
      };
      return buildStartRunResponse({
        run,
        challenge,
        created: true,
        idempotent: false,
        practiceForced: false
      });
    });
  }

  async function submitAttempt({
    userId = '',
    runId = '',
    picksBySlot = {},
    idempotencyKey = '',
    clientSubmittedAtMs = Date.now(),
    nowMs = Date.now()
  } = {}) {
    const safeUserId = sanitizeText(userId, 120);
    const safeRunId = sanitizeText(runId, 160);
    const safeIdempotencyKey = sanitizeText(idempotencyKey, 120);
    if (!safeUserId || !safeRunId || !safeIdempotencyKey) {
      return { ok: false, code: 'invalid_submit_payload' };
    }
    if (flags.soloEnabled !== true) return { ok: false, code: 'solo_engine_disabled' };

    const snapshot = adapter.readState();
    ensureSoloStateInPlace(snapshot);
    const preRun = findRunById(snapshot, safeRunId);
    if (!preRun) return { ok: false, code: 'run_not_found' };
    if (preRun.userId !== safeUserId) return { ok: false, code: 'run_user_mismatch' };
    if (preRun.idempotency && preRun.idempotency.submit && preRun.idempotency.submit[safeIdempotencyKey]) {
      const attemptId = preRun.idempotency.submit[safeIdempotencyKey];
      const existingAttempt = (preRun.attempts || []).find((row) => row.attemptId === attemptId) || null;
      if (!existingAttempt) return { ok: false, code: 'idempotency_reference_missing' };
      return {
        ok: true,
        idempotent: true,
        attempt: clone(existingAttempt),
        run: buildRunClientView(preRun)
      };
    }
    if (preRun.finalized === true || !['active', 'solved_pending_finalize', 'failed_pending_finalize'].includes(String(preRun.status || ''))) {
      return { ok: false, code: 'run_not_active' };
    }
    if (preRun.status !== 'active') {
      return { ok: false, code: 'run_ready_to_finalize' };
    }
    const initialTsGuard = guardClientTimestamp({
      run: preRun,
      actionClientTimestampMs: clientSubmittedAtMs,
      nowMs,
      limits: runtimeLimits
    });
    if (!initialTsGuard.ok) {
      return { ok: false, code: initialTsGuard.code };
    }
    const challenge = snapshot.dailyChallenges[preRun.challengeKey];
    if (!challenge) return { ok: false, code: 'challenge_missing' };
    const pickValidation = verifyPicksAgainstChallenge(challenge, picksBySlot);
    if (!pickValidation.ok) return { ok: false, code: pickValidation.code };
    const previousAttempt = preRun.attempts.length ? preRun.attempts[preRun.attempts.length - 1] : null;
    const feedback = await computeAttemptFeedback({
      challenge,
      picksBySlot: pickValidation.picksBySlot,
      previousAttempt
    });

    return adapter.writeState((state) => {
      ensureSoloStateInPlace(state);
      const run = findRunById(state, safeRunId);
      if (!run) return { ok: false, code: 'run_not_found' };
      if (run.userId !== safeUserId) return { ok: false, code: 'run_user_mismatch' };

      if (run.idempotency.submit[safeIdempotencyKey]) {
        const attemptId = run.idempotency.submit[safeIdempotencyKey];
        const existingAttempt = (run.attempts || []).find((row) => row.attemptId === attemptId) || null;
        if (!existingAttempt) return { ok: false, code: 'idempotency_reference_missing' };
        return {
          ok: true,
          idempotent: true,
          attempt: clone(existingAttempt),
          run: buildRunClientView(run)
        };
      }
      if (run.finalized === true || !['active', 'solved_pending_finalize', 'failed_pending_finalize'].includes(String(run.status || ''))) {
        return { ok: false, code: 'run_not_active' };
      }
      if (run.status !== 'active') return { ok: false, code: 'run_ready_to_finalize' };

      const tsGuard = guardClientTimestamp({
        run,
        actionClientTimestampMs: clientSubmittedAtMs,
        nowMs,
        limits: runtimeLimits
      });
      if (!tsGuard.ok) {
        if (tsGuard.code === 'non_monotonic_client_timestamp') {
          attachAntiCheatFlag(run, tsGuard.code, { suspicious: true });
        }
        return { ok: false, code: tsGuard.code };
      }

      const attemptNumber = run.attempts.length + 1;
      const attemptId = `att_${run.runId}_${attemptNumber}`;
      const attempt = {
        attemptId,
        attemptNumber,
        picksBySlot: pickValidation.picksBySlot,
        slotFeedback: feedback.slotFeedback,
        cards: feedback.slotFeedback,
        teamSummary: feedback.teamSummary,
        weakSlot: feedback.weakSlot,
        teamSynergyTrend: feedback.teamSynergyTrend,
        clueLine: feedback.clueLine,
        solved: feedback.solved,
        quality: feedback.quality,
        points: feedback.points,
        perfect: feedback.perfect,
        strong: feedback.strong,
        weak: feedback.weak,
        miss: feedback.miss,
        clientSubmittedAtMs: tsGuard.clientTimestampMs,
        serverSubmittedAtMs: nowMs
      };

      if (attemptNumber === 1 && feedback.solved && (nowMs - Number(run.startedAtMs || 0)) < runtimeLimits.fastSolveThresholdMs) {
        attachAntiCheatFlag(run, 'impossibly_fast_first_submit', { suspicious: true });
      }
      if (run.attempts.length >= 2) {
        const prevA = run.attempts[run.attempts.length - 1];
        const prevB = run.attempts[run.attempts.length - 2];
        const nextFingerprint = JSON.stringify(attempt.picksBySlot);
        if (JSON.stringify(prevA.picksBySlot) === nextFingerprint && JSON.stringify(prevB.picksBySlot) === nextFingerprint) {
          attachAntiCheatFlag(run, 'repeated_attempt_pattern', { suspicious: true });
        }
      }

      run.attempts.push(attempt);
      run.lastClientTimestampMs = tsGuard.clientTimestampMs;
      run.idempotency.submit[safeIdempotencyKey] = attemptId;
      state.dailyAttempts[run.runId] = state.dailyAttempts[run.runId] || {
        runId: run.runId,
        userId: run.userId,
        modeId: run.modeId,
        dateKey: run.dateKey,
        attempts: [],
        hints: [],
        updatedAtMs: nowMs
      };
      state.dailyAttempts[run.runId].attempts.push(clone(attempt));
      state.dailyAttempts[run.runId].updatedAtMs = nowMs;

      if (feedback.solved) {
        run.status = 'solved_pending_finalize';
      } else if (run.attempts.length >= Number(run.maxAttempts || runtimeLimits.maxAttempts)) {
        run.status = 'failed_pending_finalize';
      } else {
        run.status = 'active';
      }

      return {
        ok: true,
        idempotent: false,
        attempt: {
          ...clone(attempt),
          attemptsRemaining: Math.max(0, Number(run.maxAttempts || runtimeLimits.maxAttempts) - run.attempts.length)
        },
        run: buildRunClientView(run)
      };
    });
  }

  function requestHint({
    userId = '',
    runId = '',
    idempotencyKey = '',
    clientRequestedAtMs = Date.now(),
    nowMs = Date.now()
  } = {}) {
    const safeUserId = sanitizeText(userId, 120);
    const safeRunId = sanitizeText(runId, 160);
    const safeIdempotencyKey = sanitizeText(idempotencyKey, 120);
    if (!safeUserId || !safeRunId || !safeIdempotencyKey) {
      return { ok: false, code: 'invalid_hint_payload' };
    }
    if (flags.soloEnabled !== true) return { ok: false, code: 'solo_engine_disabled' };

    return adapter.writeState((state) => {
      ensureSoloStateInPlace(state);
      const run = findRunById(state, safeRunId);
      if (!run) return { ok: false, code: 'run_not_found' };
      if (run.userId !== safeUserId) return { ok: false, code: 'run_user_mismatch' };
      if (run.idempotency.hint[safeIdempotencyKey]) {
        const hintId = run.idempotency.hint[safeIdempotencyKey];
        const existingHint = (run.hints || []).find((row) => row.hintId === hintId) || null;
        if (!existingHint) return { ok: false, code: 'idempotency_reference_missing' };
        return {
          ok: true,
          idempotent: true,
          hint: clone(existingHint),
          run: buildRunClientView(run)
        };
      }
      if (run.status !== 'active') return { ok: false, code: 'run_not_active' };
      if (run.finalized === true) return { ok: false, code: 'run_finalized' };
      if ((run.hints || []).length >= Number(run.maxHints || runtimeLimits.maxHints)) {
        return { ok: false, code: 'hint_limit_reached' };
      }

      const tsGuard = guardClientTimestamp({
        run,
        actionClientTimestampMs: clientRequestedAtMs,
        nowMs,
        limits: runtimeLimits
      });
      if (!tsGuard.ok) {
        if (tsGuard.code === 'non_monotonic_client_timestamp') {
          attachAntiCheatFlag(run, tsGuard.code, { suspicious: true });
        }
        return { ok: false, code: tsGuard.code };
      }

      const challenge = state.dailyChallenges[run.challengeKey];
      if (!challenge) return { ok: false, code: 'challenge_missing' };
      const latestAttempt = run.attempts.length ? run.attempts[run.attempts.length - 1] : null;
      const nextSlot = latestAttempt && latestAttempt.weakSlot && latestAttempt.weakSlot.slotId
        ? (getSlotDef(latestAttempt.weakSlot.slotId) || SLOT_DEFS[0])
        : SLOT_DEFS[(run.hints.length % SLOT_DEFS.length)];
      const suggestions = Array.isArray(challenge.referenceEntries) ? challenge.referenceEntries : [];
      const nextSuggestion = suggestions[run.hints.length % Math.max(1, suggestions.length)] || '';
      const teamTarget = Number(challenge && challenge.targetProfile && challenge.targetProfile.solveTeamOvr) || 80;
      const teamCurrent = Number(latestAttempt && latestAttempt.teamSummary && latestAttempt.teamSummary.averageOVR) || 0;
      const teamDelta = Math.max(1, teamTarget - teamCurrent);
      const twistRule = String(challenge && challenge.twistRule || '').trim();
      const hintNumber = run.hints.length + 1;
      const hintId = `hnt_${run.runId}_${hintNumber}`;
      const hint = {
        hintId,
        hintNumber,
        slotId: nextSlot.slotId,
        slotLabel: nextSlot.label,
        message: nextSuggestion
          ? `${nextSlot.label}: stay in ${String(challenge.lockedCategory && challenge.lockedCategory.displayName || 'category')}, push +${teamDelta} OVR, twist "${twistRule || 'active'}". Try "${nextSuggestion}".`
          : `${nextSlot.label}: stay in ${String(challenge.lockedCategory && challenge.lockedCategory.displayName || 'category')}, push +${teamDelta} OVR, twist "${twistRule || 'active'}".`,
        clientRequestedAtMs: tsGuard.clientTimestampMs,
        serverRequestedAtMs: nowMs
      };
      run.hints.push(hint);
      run.lastClientTimestampMs = tsGuard.clientTimestampMs;
      run.idempotency.hint[safeIdempotencyKey] = hintId;

      state.dailyAttempts[run.runId] = state.dailyAttempts[run.runId] || {
        runId: run.runId,
        userId: run.userId,
        modeId: run.modeId,
        dateKey: run.dateKey,
        attempts: [],
        hints: [],
        updatedAtMs: nowMs
      };
      state.dailyAttempts[run.runId].hints.push(clone(hint));
      state.dailyAttempts[run.runId].updatedAtMs = nowMs;

      return {
        ok: true,
        idempotent: false,
        hint: {
          ...clone(hint),
          hintsRemaining: Math.max(0, Number(run.maxHints || runtimeLimits.maxHints) - run.hints.length)
        },
        run: buildRunClientView(run)
      };
    });
  }

  function finalizeRun({
    userId = '',
    runId = '',
    idempotencyKey = '',
    clientFinalizedAtMs = Date.now(),
    nowMs = Date.now()
  } = {}) {
    const safeUserId = sanitizeText(userId, 120);
    const safeRunId = sanitizeText(runId, 160);
    const safeIdempotencyKey = sanitizeText(idempotencyKey, 120);
    if (!safeUserId || !safeRunId || !safeIdempotencyKey) {
      return { ok: false, code: 'invalid_finalize_payload' };
    }
    if (flags.soloEnabled !== true) return { ok: false, code: 'solo_engine_disabled' };

    const finalized = adapter.writeState((state) => {
      ensureSoloStateInPlace(state);
      const run = findRunById(state, safeRunId);
      if (!run) return { ok: false, code: 'run_not_found' };
      if (run.userId !== safeUserId) return { ok: false, code: 'run_user_mismatch' };

      if (run.finalized === true) {
        run.idempotency.finalize[safeIdempotencyKey] = Number(run.completedAtMs) || nowMs;
        return {
          ok: true,
          idempotent: true,
          summary: clone(run.finalSummary || {}),
          run: buildRunClientView(run)
        };
      }

      const tsGuard = guardClientTimestamp({
        run,
        actionClientTimestampMs: clientFinalizedAtMs,
        nowMs,
        limits: runtimeLimits
      });
      if (!tsGuard.ok) {
        if (tsGuard.code === 'non_monotonic_client_timestamp') {
          attachAntiCheatFlag(run, tsGuard.code, { suspicious: true });
        }
        return { ok: false, code: tsGuard.code };
      }
      if (!['solved_pending_finalize', 'failed_pending_finalize'].includes(String(run.status || ''))) {
        return { ok: false, code: 'run_not_complete' };
      }

      const attempts = Array.isArray(run.attempts) ? run.attempts : [];
      const bestAttempt = attempts.slice().sort((a, b) => Number(b.quality || 0) - Number(a.quality || 0))[0] || null;
      const solved = run.status === 'solved_pending_finalize';
      const hintsUsed = Array.isArray(run.hints) ? run.hints.length : 0;
      let scoredResult = run.scoredEligible === true && run.practice !== true;

      const indexKey = scoredRunIndexKey(run.userId, run.modeId, run.dateKey);
      const existingScoredRunId = state.indexes.scoredSoloRunByUserModeDate[indexKey];
      if (existingScoredRunId && existingScoredRunId !== run.runId) {
        scoredResult = false;
        run.practice = true;
        run.scoredEligible = false;
      }
      if (scoredResult && !existingScoredRunId) {
        state.indexes.scoredSoloRunByUserModeDate[indexKey] = run.runId;
      }

      const progression = state.playerProgression[run.userId] && typeof state.playerProgression[run.userId] === 'object'
        ? state.playerProgression[run.userId]
        : null;
      const streakData = {
        previousStreak: 0,
        currentStreak: 0,
        longestStreak: 0
      };
      if (progression && scoredResult) {
        progression.solo = progression.solo && typeof progression.solo === 'object' ? progression.solo : {};
        progression.solo.modes = progression.solo.modes && typeof progression.solo.modes === 'object'
          ? progression.solo.modes
          : {};
        const modeState = progression.solo.modes[run.modeId] && typeof progression.solo.modes[run.modeId] === 'object'
          ? progression.solo.modes[run.modeId]
          : {
            currentStreak: 0,
            longestStreak: 0,
            lastScoredDayKey: '',
            totalScoredRuns: 0,
            bestScore: 0
          };
        const previous = Math.max(0, Number(modeState.currentStreak) || 0);
        const expectedPreviousDay = previousUtcDayKey(run.dateKey);
        let nextStreak = 1;
        if (String(modeState.lastScoredDayKey || '') === String(expectedPreviousDay || '')) {
          nextStreak = previous + 1;
        } else if (String(modeState.lastScoredDayKey || '') === String(run.dateKey || '')) {
          nextStreak = previous || 1;
        }
        modeState.currentStreak = nextStreak;
        modeState.longestStreak = Math.max(Math.max(0, Number(modeState.longestStreak) || 0), nextStreak);
        modeState.lastScoredDayKey = run.dateKey;
        modeState.totalScoredRuns = Math.max(0, Number(modeState.totalScoredRuns) || 0) + 1;
        progression.solo.modes[run.modeId] = modeState;
        progression.updatedAt = new Date(nowMs).toISOString();
        streakData.previousStreak = previous;
        streakData.currentStreak = modeState.currentStreak;
        streakData.longestStreak = modeState.longestStreak;
      }

      const scoreBreakdown = computeScoreBreakdown({
        bestAttempt,
        solved,
        attemptsUsed: attempts.length,
        maxAttempts: run.maxAttempts,
        hintsUsed,
        maxHints: run.maxHints,
        streakForBonus: scoredResult ? Math.max(1, streakData.currentStreak) : 1
      });

      const finalSummary = {
        runId: run.runId,
        userId: run.userId,
        modeId: run.modeId,
        dateKey: run.dateKey,
        outcome: solved ? 'solved' : 'failed',
        attemptsUsed: attempts.length,
        hintsUsed,
        scored: scoredResult,
        practice: run.practice === true,
        scoreBreakdown,
        finalScore: scoreBreakdown.finalScore,
        team: bestAttempt && bestAttempt.teamSummary
          ? clone(bestAttempt.teamSummary)
          : {
            averageOVR: 0,
            totalScore: 0,
            inCategoryCount: 0,
            lowOvrCount: 0,
            targetOVR: 0,
            minInCategory: 0,
            maxLowCards: 0
          },
        bestCards: bestAttempt && Array.isArray(bestAttempt.cards)
          ? bestAttempt.cards.slice().sort((a, b) => (Number(b.ovr) || 0) - (Number(a.ovr) || 0)).slice(0, 4)
          : [],
        streak: scoredResult ? streakData : {
          previousStreak: 0,
          currentStreak: 0,
          longestStreak: 0
        },
        antiCheat: clone(run.antiCheat || { flags: [], suspicious: false }),
        xp: {
          grantId: `solo:${run.modeId}:${run.dateKey}:${run.userId}`,
          requestedXp: scoredResult
            ? clampInt(
              40
              + (solved ? 20 : 0)
              + ((scoreBreakdown.finalScore / 134) * 20)
              + (Math.max(0, (streakData.currentStreak || 1) - 1) * 2),
              0,
              90
            )
            : 0,
          grantedXp: 0,
          status: scoredResult ? 'pending' : 'practice_no_xp'
        },
        leaderboard: null,
        finalizedAtMs: nowMs
      };

      run.status = solved ? 'solved' : 'failed';
      run.finalized = true;
      run.scoredResult = scoredResult;
      run.completedAtMs = nowMs;
      run.lastClientTimestampMs = tsGuard.clientTimestampMs;
      run.finalSummary = finalSummary;
      run.idempotency.finalize[safeIdempotencyKey] = nowMs;

      if (run.antiCheat && run.antiCheat.suspicious === true) {
        console.warn(`[Solo anti-cheat] suspicious run flagged runId=${run.runId} userId=${run.userId} flags=${(run.antiCheat.flags || []).join('|')}`);
      }

      const snapshot = recalcLeaderboardSnapshotInPlace(state, { modeId: run.modeId, dateKey: run.dateKey });
      const boardEntry = (snapshot.entries || []).find((entry) => entry.runId === run.runId) || null;
      run.finalSummary.leaderboard = boardEntry
        ? {
          rank: boardEntry.rank,
          totalEntries: snapshot.totalEntries,
          percentile: boardEntry.percentile,
          percentileBand: boardEntry.percentileBand,
          updatedAtMs: snapshot.updatedAtMs
        }
        : {
          rank: null,
          totalEntries: snapshot.totalEntries,
          percentile: 0,
          percentileBand: 'lower_50',
          updatedAtMs: snapshot.updatedAtMs
        };

      return {
        ok: true,
        idempotent: false,
        summary: clone(run.finalSummary),
        run: buildRunClientView(run),
        xpGrantRequest: scoredResult
          ? {
            userId: run.userId,
            grantId: run.finalSummary.xp.grantId,
            source: 'solo_daily_completion',
            amount: run.finalSummary.xp.requestedXp,
            reason: solved ? 'solo_daily_solved' : 'solo_daily_failed',
            metadata: {
              modeId: run.modeId,
              dateKey: run.dateKey,
              runId: run.runId,
              outcome: finalSummary.outcome,
              score: finalSummary.finalScore
            },
            occurredAtMs: nowMs
          }
          : null
      };
    });

    if (!finalized || finalized.ok !== true || finalized.idempotent === true || !finalized.xpGrantRequest) {
      return finalized;
    }

    let xpResult = null;
    if (metaService && typeof metaService.grantXp === 'function') {
      xpResult = metaService.grantXp(finalized.xpGrantRequest);
    } else {
      xpResult = { ok: false, code: 'meta_service_unavailable' };
    }

    const patched = adapter.writeState((state) => {
      ensureSoloStateInPlace(state);
      const run = findRunById(state, safeRunId);
      if (!run || !run.finalSummary) return null;
      if (!xpResult || xpResult.ok !== true) {
        run.finalSummary.xp.grantedXp = 0;
        run.finalSummary.xp.status = xpResult && xpResult.code ? String(xpResult.code) : 'xp_grant_failed';
      } else {
        run.finalSummary.xp.grantedXp = Number(xpResult.grant && xpResult.grant.amountGranted) || 0;
        run.finalSummary.xp.status = xpResult.idempotent ? 'idempotent' : 'applied';
      }
      return clone(run.finalSummary);
    });

    const finalSummary = patched || finalized.summary;
    let seasonResult = null;
    if (seasonService && typeof seasonService.recordSoloRunFinalized === 'function') {
      seasonResult = seasonService.recordSoloRunFinalized({
        userId: safeUserId,
        runId: safeRunId,
        modeId: finalSummary && finalSummary.modeId ? finalSummary.modeId : DEFAULT_MODE_ID,
        dateKey: finalSummary && finalSummary.dateKey ? finalSummary.dateKey : toUtcDayKey(nowMs),
        summary: finalSummary,
        nowMs
      });
    }

    return {
      ok: true,
      idempotent: false,
      summary: finalSummary,
      run: finalized.run,
      season: seasonResult && seasonResult.ok === true ? seasonResult : null
    };
  }

  function getDailyLeaderboard({
    modeId = DEFAULT_MODE_ID,
    dateKey = toUtcDayKey(),
    limit = 50,
    userId = ''
  } = {}) {
    const safeModeId = sanitizeText(modeId, 64) || DEFAULT_MODE_ID;
    const safeDateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || '')) ? String(dateKey) : toUtcDayKey();
    const safeLimit = clampInt(limit, 1, 200);
    const safeUserId = sanitizeText(userId, 120);

    const state = adapter.readState();
    ensureSoloStateInPlace(state);
    const key = challengeKey(safeModeId, safeDateKey);
    const snapshot = state.leaderboardSnapshots[key] && typeof state.leaderboardSnapshots[key] === 'object'
      ? clone(state.leaderboardSnapshots[key])
      : recalcLeaderboardSnapshotInPlace(state, { modeId: safeModeId, dateKey: safeDateKey });

    const entries = Array.isArray(snapshot.entries) ? snapshot.entries.slice(0, safeLimit) : [];
    const userEntry = safeUserId
      ? (Array.isArray(snapshot.entries) ? snapshot.entries.find((entry) => entry.userId === safeUserId) || null : null)
      : null;

    return {
      ok: true,
      snapshotKey: key,
      modeId: safeModeId,
      dateKey: safeDateKey,
      updatedAtMs: Number(snapshot.updatedAtMs) || Date.now(),
      totalEntries: Number(snapshot.totalEntries) || 0,
      percentileBands: snapshot.percentileBands || {
        top_1: 0,
        top_10: 0,
        top_25: 0,
        top_50: 0,
        lower_50: 0
      },
      entries,
      userEntry
    };
  }

  return {
    flags,
    limits: runtimeLimits,
    runStartupMigrations,
    startRun,
    submitAttempt,
    requestHint,
    finalizeRun,
    getDailyLeaderboard,
    toUtcDayKey
  };
}

module.exports = {
  DEFAULT_MODE_ID,
  SLOT_DEFS,
  buildSoloEngineService,
  createDailyChallenge,
  recalcLeaderboardSnapshotInPlace,
  challengeKey,
  toUtcDayKey
};
