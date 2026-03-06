const crypto = require('crypto');
const { sanitizeText } = require('../storage/metaStoreAdapter');

const DEFAULT_MODE_ID = 'daily_cipher_clash';
const SOLO_SCHEMA_VERSION = 2;

const SLOT_DEFS = Object.freeze([
  { slotId: 'lead', label: 'Lead', role: 'Open with pressure and tempo control.' },
  { slotId: 'anchor', label: 'Anchor', role: 'Stabilize the core plan with consistency.' },
  { slotId: 'wildcard', label: 'Wildcard', role: 'Counter the twist with a disruption pick.' },
  { slotId: 'closer', label: 'Closer', role: 'Finish the mission under endgame pressure.' }
]);

const SCENARIOS = Object.freeze([
  'Signal Breach',
  'Silent Summit',
  'Vault Escape',
  'Relay Gauntlet',
  'Skyline Chase',
  'Final Briefing',
  'Cipher Cascade'
]);

const TWISTS = Object.freeze([
  'Distinct Roster Signals',
  'Multi-Word Synergy',
  'Precision Labels',
  'Wildcard Pressure',
  'Category Lock Hardening',
  'Counterflow Late Close'
]);

const SOLO_CATEGORY_LOCKS = Object.freeze([
  {
    id: 'fictional-beings',
    displayName: 'Fictional Beings',
    family: 'fictional beings',
    strongExamples: ['Batman', 'Wonder Woman', 'Gandalf', 'Spider-Man']
  },
  {
    id: 'science-tech',
    displayName: 'Science / Technology',
    family: 'science/technology',
    strongExamples: ['Ada Lovelace', 'Alan Turing', 'Marie Curie', 'Nikola Tesla']
  },
  {
    id: 'sports-competition',
    displayName: 'Sports / Competition',
    family: 'sports/competition',
    strongExamples: ['Michael Jordan', 'Serena Williams', 'Lionel Messi', 'Simone Biles']
  },
  {
    id: 'history-politics',
    displayName: 'History / Politics',
    family: 'history/politics',
    strongExamples: ['Abraham Lincoln', 'Nelson Mandela', 'Winston Churchill', 'Harriet Tubman']
  },
  {
    id: 'mythology-religion',
    displayName: 'Mythology / Religion',
    family: 'mythology/religion',
    strongExamples: ['Zeus', 'Athena', 'Odin', 'Anubis']
  }
]);

const DEFAULT_LIMITS = Object.freeze({
  maxAttempts: 6,
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

function createDailyChallenge({
  modeId = DEFAULT_MODE_ID,
  dateKey = toUtcDayKey(),
  seedSalt = ''
} = {}) {
  const seedInput = `${String(modeId)}|${String(dateKey)}|${String(seedSalt || '')}`;
  const seedHash = hashHex(seedInput);
  const rng = createMulberry32(hashToSeed(seedInput));
  const scenarioId = SCENARIOS[Math.floor(rng() * SCENARIOS.length)];
  const twistId = TWISTS[Math.floor(rng() * TWISTS.length)];
  const category = SOLO_CATEGORY_LOCKS[Math.floor(rng() * SOLO_CATEGORY_LOCKS.length)] || SOLO_CATEGORY_LOCKS[0];
  const targetProfile = {
    solveTeamOvr: 78 + Math.floor(rng() * 7), // 78..84
    minInCategory: 2 + (rng() > 0.72 ? 1 : 0),
    maxLowCards: rng() > 0.52 ? 1 : 2
  };
  const promptDeck = SLOT_DEFS.map((slot) => ({
    slotId: slot.slotId,
    label: slot.label,
    role: slot.role,
    prompt: `${slot.role} Category lock: ${category.displayName}. Scenario: ${scenarioId}. Twist: ${twistId}.`,
    keywords: collectKeywordPool([slot.role, scenarioId, twistId, category.displayName], 16)
  }));
  const referenceEntries = deterministicShuffle(category.strongExamples || [], rng).slice(0, SLOT_DEFS.length);
  const idealEntriesBySlot = {};
  SLOT_DEFS.forEach((slot, idx) => {
    idealEntriesBySlot[slot.slotId] = referenceEntries[idx] || (category.strongExamples && category.strongExamples[0]) || 'Batman';
  });

  return {
    challengeKey: challengeKey(modeId, dateKey),
    modeId,
    dateKey,
    seedHash,
    scenarioId,
    twistId,
    lockedCategory: {
      id: category.id,
      displayName: category.displayName,
      family: category.family
    },
    entryPrompts: promptDeck,
    targetProfile,
    referenceEntries: category.strongExamples || [],
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

function computeAttemptFeedback({
  challenge,
  picksBySlot,
  previousAttempt = null
} = {}) {
  const category = challenge && challenge.lockedCategory && typeof challenge.lockedCategory === 'object'
    ? challenge.lockedCategory
    : { displayName: 'Open Meta', family: 'general' };
  const scenarioKeywords = collectKeywordPool([challenge && challenge.scenarioId, category.displayName], 16);
  const twistKeywords = collectKeywordPool([challenge && challenge.twistId], 12);
  const categoryKeywords = collectKeywordPool([
    category.displayName,
    category.family,
    ...(Array.isArray(challenge && challenge.referenceEntries) ? challenge.referenceEntries : [])
  ], 20);
  const targetProfile = challenge && challenge.targetProfile && typeof challenge.targetProfile === 'object'
    ? challenge.targetProfile
    : { solveTeamOvr: 80, minInCategory: 2, maxLowCards: 1 };

  const normalizedEntries = SLOT_DEFS.map((slot) => normalizeEntryKey(picksBySlot && picksBySlot[slot.slotId]));
  const duplicateCounts = normalizedEntries.reduce((acc, key) => {
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const slotFeedback = [];
  let perfect = 0;
  let strong = 0;
  let weak = 0;
  let miss = 0;
  let totalScore = 0;
  let totalOvr = 0;
  let inCategoryCount = 0;
  let lowOvrCount = 0;

  SLOT_DEFS.forEach((slot, index) => {
    const entry = String(picksBySlot[slot.slotId] || '').trim();
    const entryTokens = tokenizeLoose(entry);
    const roleKeywords = collectKeywordPool([slot.role], 8);
    const scenarioHits = countTokenHits(entryTokens, scenarioKeywords);
    const twistHits = countTokenHits(entryTokens, twistKeywords);
    const categoryHits = countTokenHits(entryTokens, categoryKeywords);
    const roleHits = countTokenHits(entryTokens, roleKeywords);
    const lexicalQuality = clampInt(28 + Math.min(20, entry.length) + (entryTokens.length * 6), 0, 100);
    const duplicatePenalty = (duplicateCounts[normalizeEntryKey(entry)] || 0) > 1 ? 10 : 0;
    const hashNoise = (hashToSeed(`${String(challenge && challenge.seedHash || '')}|${slot.slotId}|${entry}`) % 11) - 5;
    const ovr = clampInt(
      34
      + Math.round(lexicalQuality * 0.24)
      + (categoryHits * 12)
      + (scenarioHits * 5)
      + (twistHits * 4)
      + (roleHits * 4)
      + hashNoise
      - duplicatePenalty,
      28,
      99
    );
    const slotScore = clampInt((ovr / 99) * 30, 0, 30);
    const categoryStatus = categoryHits >= 2 ? 'in_category' : categoryHits === 1 ? 'borderline' : 'not_in_category';
    if (categoryStatus === 'in_category') inCategoryCount += 1;
    if (ovr < 60) lowOvrCount += 1;

    let grade = 'Miss';
    if (ovr >= 88) {
      grade = 'Perfect';
      perfect += 1;
    } else if (ovr >= 76) {
      grade = 'Strong';
      strong += 1;
    } else if (ovr >= 63) {
      grade = 'Weak';
      weak += 1;
    } else {
      miss += 1;
    }
    totalOvr += ovr;
    totalScore += slotScore;
    slotFeedback.push({
      slotId: slot.slotId,
      label: slot.label,
      pickedCandidateId: entry,
      grade,
      score: slotScore,
      ovr,
      categoryStatus,
      notes: [
        `Scenario fit hits: ${scenarioHits}`,
        `Twist fit hits: ${twistHits}`,
        `Category fit hits: ${categoryHits}`
      ]
    });
  });

  const averageOVR = SLOT_DEFS.length ? Math.round(totalOvr / SLOT_DEFS.length) : 0;
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
  );
  const points = clampInt((totalScore / (SLOT_DEFS.length * 30)) * 100, 0, 100);
  const quality = clampInt(
    (averageOVR * 0.62)
    + ((inCategoryCount / SLOT_DEFS.length) * 25)
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
      inCategoryCount,
      lowOvrCount,
      targetOVR: Number(targetProfile.solveTeamOvr || 80),
      minInCategory: Number(targetProfile.minInCategory || 2),
      maxLowCards: Number(targetProfile.maxLowCards || 1)
    },
    weakSlot: weakest
      ? {
        slotId: weakest.slotId,
        slotLabel: weakest.label,
        ovr: weakest.ovr
      }
      : null,
    teamSynergyTrend: synergyTrend,
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
    modeId: challenge.modeId,
    dateKey: challenge.dateKey,
    seedHash: challenge.seedHash,
    scenarioId: challenge.scenarioId,
    twistId: challenge.twistId,
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
    attemptLimit: DEFAULT_LIMITS.maxAttempts,
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
    soloEnabled: featureFlags.soloEnabled === true || boolEnv('SOLO_ENGINE_ENABLED', false),
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

  function getOrCreateChallengeInPlace(state, { modeId = DEFAULT_MODE_ID, dateKey = toUtcDayKey() } = {}) {
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
        seedSalt
      });
    }
    return state.dailyChallenges[key];
  }

  function findExistingActiveScoredRun(state, { userId = '', modeId = DEFAULT_MODE_ID, dateKey = toUtcDayKey() } = {}) {
    return Object.values(state.soloRuns || {}).find((run) => (
      run
      && run.userId === userId
      && run.modeId === modeId
      && run.dateKey === dateKey
      && run.practice !== true
      && run.finalized !== true
      && ['active', 'solved_pending_finalize', 'failed_pending_finalize'].includes(String(run.status || ''))
    )) || null;
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
      const indexKey = scoredRunIndexKey(safeUserId, safeModeId, dateKey);
      const existingScoredRunId = state.indexes.scoredSoloRunByUserModeDate[indexKey];
      const forcedPractice = Boolean(existingScoredRunId);
      const existingActiveScored = !forcedPractice && !safePractice
        ? findExistingActiveScoredRun(state, { userId: safeUserId, modeId: safeModeId, dateKey })
        : null;
      const challenge = getOrCreateChallengeInPlace(state, { modeId: safeModeId, dateKey });

      if (existingActiveScored) {
        return {
          ok: true,
          created: false,
          idempotent: true,
          run: buildRunClientView(existingActiveScored),
          challenge: buildChallengeClientView(challenge, { exposeSolution: flags.exposeSolution }),
          practiceForced: false
        };
      }

      const runId = createRunId();
      const run = {
        runId,
        userId: safeUserId,
        modeId: safeModeId,
        dateKey,
        challengeKey: challenge.challengeKey,
        practice: safePractice || forcedPractice,
        scoredEligible: !safePractice && !forcedPractice,
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
      return {
        ok: true,
        created: true,
        idempotent: false,
        run: buildRunClientView(run),
        challenge: buildChallengeClientView(challenge, { exposeSolution: flags.exposeSolution }),
        practiceForced: forcedPractice
      };
    });
  }

  function submitAttempt({
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
      if (run.status !== 'active') {
        return { ok: false, code: 'run_ready_to_finalize' };
      }

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

      const challenge = state.dailyChallenges[run.challengeKey];
      if (!challenge) return { ok: false, code: 'challenge_missing' };
      const pickValidation = verifyPicksAgainstChallenge(challenge, picksBySlot);
      if (!pickValidation.ok) return { ok: false, code: pickValidation.code };
      const previousAttempt = run.attempts.length ? run.attempts[run.attempts.length - 1] : null;
      const feedback = computeAttemptFeedback({
        challenge,
        picksBySlot: pickValidation.picksBySlot,
        previousAttempt
      });
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
      const hintNumber = run.hints.length + 1;
      const hintId = `hnt_${run.runId}_${hintNumber}`;
      const hint = {
        hintId,
        hintNumber,
        slotId: nextSlot.slotId,
        slotLabel: nextSlot.label,
        message: nextSuggestion
          ? `${nextSlot.label} is under target. Stay in ${String(challenge.lockedCategory && challenge.lockedCategory.displayName || 'category')} lane and look for +${teamDelta} team OVR. Try an entry with confidence similar to "${nextSuggestion}".`
          : `${nextSlot.label} is under target. Stay in ${String(challenge.lockedCategory && challenge.lockedCategory.displayName || 'category')} lane and look for +${teamDelta} team OVR.`,
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
