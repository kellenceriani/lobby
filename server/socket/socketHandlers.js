const {
  rooms,
  voteTimeouts,
  createRoom,
  startGame,
  startRound,
  startFinalRound,
  revealPlotTwist,
  tallyResults,
  getRandomWord,
  endGame,
  markRoomsDirty
} = require('../core/gameEngine');
const { evaluateRound4FromGame } = require('../services/round4Service');
const {
  warmCharacterEvaluationCaches,
  peekCharacterEvaluationWarmup,
  getEvaluationEngineMode
} = require('../services/entryEvaluationService');
const {
  sanitizeName,
  sanitizeRoomCode,
  sanitizeMessage,
  sanitizeReaction,
  sanitizeDraftCharacter,
  sanitizeSettings,
  createRateLimiter
} = require('./inputValidation');
const {
  getPackCatalog,
  getPublicPackMeta,
  coercePackId,
  recordPackRematch
} = require('../content/packRegistry');
const {
  buildRound4EvaluatedVoiceCues,
  buildFinalRoundResultsVoiceCues
} = require('../services/voiceCueFactory');
const { prewarmAdaptiveNarratorVoiceCues } = require('../services/adaptiveTtsService');
const {
  normalizeCategorySettings,
  buildVoteOptions
} = require('../services/categoryRegistryService');

const allowRequest = createRateLimiter();
const CHAT_MAX_MESSAGES = 10;
const CHAT_PRUNE_BATCH = 1;
const NARRATOR_VOICE_IDS = new Set(['af_heart', 'af_bella', 'am_michael', 'bm_george']);
const EVAL_WARMUP_ON_DRAFT = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.EVAL_WARMUP_ON_DRAFT || 'true').toLowerCase()
);
const ROUND4_EVAL_WATCHDOG_MS = Math.max(4000, Math.min(120000, Number(process.env.ROUND4_EVAL_WATCHDOG_MS) || 16000));
const ROUND4_TIMEOUT_FALLBACK_ENABLED = !['0', 'false', 'no', 'off'].includes(
  String(process.env.ROUND4_TIMEOUT_FALLBACK_ENABLED || 'true').toLowerCase()
);
const ROUND4_FINAL_LOCK_TIMEOUT_MS = Math.max(8000, Math.min(180000, Number(process.env.ROUND4_FINAL_LOCK_TIMEOUT_MS) || 25000));
const ROUND4_FINAL_AUTO_ADVANCE_GRACE_MS = Math.max(0, Math.min(120000, Number(process.env.ROUND4_FINAL_AUTO_ADVANCE_GRACE_MS) || 7000));
const draftWarmupDedupe = new Map();
const DRAFT_WARMUP_DEDUPE_WINDOW_MS = Math.max(3000, Number(process.env.DRAFT_WARMUP_DEDUPE_MS) || 45000);
const CATEGORY_VOTE_TIMEOUT_MS = Math.max(6000, Math.min(90000, Number(process.env.CATEGORY_VOTE_TIMEOUT_MS) || 22000));
const CATEGORY_VOTE_OPTION_COUNT = Math.max(3, Math.min(5, Number(process.env.CATEGORY_VOTE_OPTION_COUNT) || 4));
const ROOM_SETTINGS_DEFAULTS = Object.freeze({
  difficulty: 'normal',
  scenarioTheme: 'all',
  plotTwists: true,
  noFinalScenarioTwist: false,
  maxPlayers: 6,
  customScenario: '',
  categoriesMode: 'smart_random',
  categoryId: null,
  categoryVoteOptions: [],
  categoryVersion: 'v1',
  contentPackId: 'default'
});

function buildDefaultRoomSettings(baseSettings = null) {
  const maxPlayersSource = Number(baseSettings && baseSettings.maxPlayers);
  const safeMaxPlayers = Number.isFinite(maxPlayersSource)
    ? Math.min(6, Math.max(3, Math.floor(maxPlayersSource)))
    : ROOM_SETTINGS_DEFAULTS.maxPlayers;
  const categorySettings = normalizeCategorySettings(baseSettings || {});
  return {
    ...ROOM_SETTINGS_DEFAULTS,
    maxPlayers: safeMaxPlayers,
    ...categorySettings,
    contentPackId: 'default'
  };
}

function normalizeSettingValueForDiff(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (value == null) return null;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function getChangedSettingKeys(previousSettings = {}, nextSettings = {}) {
  const keys = new Set([
    ...Object.keys(previousSettings || {}),
    ...Object.keys(nextSettings || {})
  ]);
  const changed = [];
  keys.forEach((key) => {
    const before = normalizeSettingValueForDiff(previousSettings[key]);
    const after = normalizeSettingValueForDiff(nextSettings[key]);
    if (before !== after) changed.push(String(key));
  });
  return changed;
}

function emitSettingsSync(io, roomCode, roomData, {
  changedKeys = [],
  changedBy = '',
  system = false,
  summary = ''
} = {}) {
  io.to(roomCode).emit('settingsUpdated', roomData.settings);
  if (!Array.isArray(changedKeys) || (!changedKeys.length && !summary)) return;
  io.to(roomCode).emit('settingsChangePing', {
    changedKeys: changedKeys.map((key) => String(key)),
    changedBy: String(changedBy || ''),
    system: system === true,
    summary: String(summary || ''),
    settings: roomData.settings,
    timestamp: Date.now()
  });
}

function resetRoomSettingsToDefaults(roomData) {
  const previousSettings = { ...(roomData && roomData.settings ? roomData.settings : {}) };
  roomData.settings = buildDefaultRoomSettings(previousSettings);
  roomData.settings.contentPackId = coercePackId(roomData.settings.contentPackId);
  const changedKeys = getChangedSettingKeys(previousSettings, roomData.settings);
  return changedKeys;
}

async function emitRoomEventWithVoiceCuePrewarm(io, roomCode, eventName, payload, { timeoutMs = 1800 } = {}) {
  io.to(roomCode).emit(eventName, payload);
  const voiceCues = Array.isArray(payload && payload.voiceCues) ? payload.voiceCues : [];
  if (!voiceCues.length) return;
  const roomData = rooms[roomCode];
  const narratorVoiceId = roomData && roomData.voiceConfig && NARRATOR_VOICE_IDS.has(String(roomData.voiceConfig.narratorVoiceId || ''))
    ? String(roomData.voiceConfig.narratorVoiceId)
    : 'bm_george';
  Promise.resolve()
    .then(async () => {
      await prewarmAdaptiveNarratorVoiceCues({
        cues: voiceCues,
        narratorVoiceId,
        timeoutMs
      });
    })
    .catch(() => {});
}

function withTimeout(promise, timeoutMs, label = 'operation_timeout') {
  const safeTimeoutMs = Math.max(0, Number(timeoutMs) || 0);
  if (safeTimeoutMs <= 0) return promise;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const error = new Error(`${label}_${safeTimeoutMs}ms`);
        error.code = 'ROUND4_EVAL_TIMEOUT';
        error.timeoutMs = safeTimeoutMs;
        reject(error);
      }, safeTimeoutMs);
    })
  ]);
}

function buildRound4EmergencyFallbackScored(game, reason = 'round4_eval_timeout') {
  const scenario = String(game && game.currentScenario || 'Final scenario');
  const twist = String(game && game.currentTwist || 'NO PLOT TWIST');
  const players = Array.isArray(game && game.players) ? game.players : [];
  const teamEvaluations = {};
  const roundPoints = {};
  const pointBreakdown = {};
  const finalLeaderboard = [];

  players.forEach((player, playerIndex) => {
    const roster = Array.isArray(player && player.finalTeam) ? player.finalTeam.slice(0, 6).filter(Boolean) : [];
    const evaluations = roster.map((character) => ({
      character,
      emotion: 'neutral',
      phrase: 'Fallback evaluation used while final scoring recovered.',
      score: 10,
      ovr: 55,
      reason: 'Emergency Round 4 fallback',
      notes: ['Temporary Round 4 fallback was applied to prevent loading deadlock.'],
      imageUrl: null,
      scoreMeta: {
        relevancePoints: 0,
        draftedFitTotal: 0,
        draftedScenarioBonus: 0,
        draftedTwistBonus: 0,
        infoConfidence: 0,
        trustedInfo: false,
        fetchDurationMs: 0,
        evaluationEngine: 'round4-emergency-fallback-v1',
        evaluationEngineMode: String(process.env.EVAL_ENGINE_MODE || 'context').toLowerCase(),
        contextFallbackError: String(reason || 'round4_eval_timeout')
      },
      breakdown: {
        characterSummary: 'Emergency fallback evaluation used to keep match progression alive.',
        scoreBreakdown: [{ step: 'Fallback', points: 10, description: 'Emergency Round 4 fallback.' }],
        scenarioRelevance: 'Fallback evaluation.',
        twistRelevance: 'Fallback evaluation.',
        ovrBreakdown: {
          base: 55,
          rarityBonus: 0,
          attributeBonus: 0,
          fitMultiplier: 1,
          fitDelta: 0,
          finalOVR: 55
        }
      }
    }));

    const averageOVR = evaluations.length
      ? Math.round(evaluations.reduce((sum, row) => sum + (Number(row && row.ovr) || 0), 0) / evaluations.length)
      : 55;
    const cumulativeOVR = evaluations.reduce((sum, row) => sum + (Number(row && row.ovr) || 0), 0);
    const totalOVR = averageOVR;
    const topPick = evaluations[0] ? evaluations[0].character : 'N/A';
    const round4Points = Math.max(40, 120 - Math.min(20, playerIndex * 2));

    teamEvaluations[player.name] = {
      evaluations,
      teamSummary: {
        totalOVR,
        cumulativeOVR,
        chemistryBonus: 0,
        chemistryDetails: ['Emergency fallback: chemistry unavailable.'],
        chemistryRawScore: null,
        chemistryBase: null,
        averageOVR,
        topPick,
        highestOVR: evaluations.length ? 55 : 0,
        evaluationCount: evaluations.length
      }
    };
    roundPoints[player.name] = round4Points;
    pointBreakdown[player.name] = [
      'Emergency fallback applied',
      `Scenario: ${scenario}`,
      `Twist: ${twist}`,
      `Fallback reason: ${String(reason || 'round4_eval_timeout')}`,
      `Round 4 Total: ${round4Points}`
    ];
  });

  players.forEach((player) => {
    const teamData = teamEvaluations[player.name] || { teamSummary: {}, evaluations: [] };
    finalLeaderboard.push({
      playerName: player.name,
      round4Points: roundPoints[player.name] || 0,
      totalOVR: Number(teamData.teamSummary && teamData.teamSummary.totalOVR) || 0,
      cumulativeOVR: Number(teamData.teamSummary && teamData.teamSummary.cumulativeOVR) || 0,
      averageOVR: Number(teamData.teamSummary && teamData.teamSummary.averageOVR) || 0,
      chemistryBonus: Number(teamData.teamSummary && teamData.teamSummary.chemistryBonus) || 0,
      topPick: teamData.teamSummary && teamData.teamSummary.topPick ? teamData.teamSummary.topPick : 'N/A',
      topPickImageUrl: null
    });
  });

  finalLeaderboard.sort((a, b) => {
    if ((b.round4Points || 0) !== (a.round4Points || 0)) return (b.round4Points || 0) - (a.round4Points || 0);
    if ((b.totalOVR || 0) !== (a.totalOVR || 0)) return (b.totalOVR || 0) - (a.totalOVR || 0);
    return String(a.playerName || '').localeCompare(String(b.playerName || ''));
  });

  return {
    scenario,
    twist,
    teamEvaluations,
    roundPoints,
    pointBreakdown,
    finalLeaderboard,
    emergencyFallback: true,
    emergencyFallbackReason: String(reason || 'round4_eval_timeout')
  };
}

function getFinalResultsFailSafeState(roomData, game) {
  const eligiblePlayers = getEligibleFinalPlayers(roomData, game);
  const readyCount = eligiblePlayers.filter((playerName) => game.finalResultsReady[playerName] === true).length;
  const allReady = eligiblePlayers.length > 0
    && eligiblePlayers.every((playerName) => game.finalResultsReady[playerName] === true);

  const gateStartedAt = Number(game.finalResultsGateStartedAtMs) || 0;
  const elapsedMs = gateStartedAt > 0 ? Math.max(0, Date.now() - gateStartedAt) : 0;
  const timeoutReached = gateStartedAt > 0 && elapsedMs >= ROUND4_FINAL_LOCK_TIMEOUT_MS;
  const autoAdvanceReached = timeoutReached && elapsedMs >= (ROUND4_FINAL_LOCK_TIMEOUT_MS + ROUND4_FINAL_AUTO_ADVANCE_GRACE_MS);
  const hostName = roomData && roomData.host ? String(roomData.host) : '';
  const hostEligible = hostName && eligiblePlayers.includes(hostName);
  const hostReady = hostEligible && game.finalResultsReady[hostName] === true;

  return {
    eligiblePlayers,
    readyCount,
    allReady,
    elapsedMs,
    timeoutReached,
    autoAdvanceReached,
    hostEligible,
    hostReady
  };
}

function shouldForceEmitFinalResults(state) {
  if (!state) return false;
  if (state.allReady) return true;
  if (state.timeoutReached && state.hostReady) return true;
  if (state.autoAdvanceReached && state.readyCount > 0) return true;
  return false;
}

function getFinalResultsForceReason(state) {
  if (!state) return '';
  if (state.allReady) return 'all_ready';
  if (state.timeoutReached && state.hostReady) return 'host_timeout_override';
  if (state.autoAdvanceReached && state.readyCount > 0) return 'auto_advance_timeout';
  return '';
}

function armFinalResultsFailSafeTimers(io, room, game) {
  if (!game || game.finalResultsFailSafeTimersArmed === true) return;
  game.finalResultsFailSafeTimersArmed = true;

  const runCheck = () => {
    const roomData = getRoomData(room);
    if (!roomData || roomData.gameState !== game) return;
    updateFinalResultsWaiting(io, room, roomData, game);
    markRoomsDirty();
  };

  setTimeout(runCheck, ROUND4_FINAL_LOCK_TIMEOUT_MS + 80);
  setTimeout(runCheck, ROUND4_FINAL_LOCK_TIMEOUT_MS + ROUND4_FINAL_AUTO_ADVANCE_GRACE_MS + 180);
}

function shouldRunDraftWarmup() {
  if (!EVAL_WARMUP_ON_DRAFT) return false;
  const mode = getEvaluationEngineMode();
  return mode === 'context' || mode === 'context_shadow';
}

function getDraftWarmupTwist(game) {
  if (!game) return 'NO PLOT TWIST';
  if (game.activePhase === 'DRAFT') return 'NO PLOT TWIST';
  return game.currentTwist || 'NO PLOT TWIST';
}

function scheduleDraftWarmup(game, character) {
  if (!shouldRunDraftWarmup()) return;
  if (!game || !character) return;
  const scenario = game.currentScenario || '';
  const twist = getDraftWarmupTwist(game);
  const key = [
    String(game.id || game.roomCode || ''),
    String(game.currentRound || 0),
    String(scenario || '').trim().toLowerCase(),
    String(twist || '').trim().toLowerCase(),
    String(character || '').trim().toLowerCase()
  ].join('|');
  const now = Date.now();
  const lastAt = Number(draftWarmupDedupe.get(key) || 0);
  if (lastAt > 0 && (now - lastAt) < DRAFT_WARMUP_DEDUPE_WINDOW_MS) {
    return;
  }
  draftWarmupDedupe.set(key, now);
  if (draftWarmupDedupe.size > 600) {
    const cutoff = now - (DRAFT_WARMUP_DEDUPE_WINDOW_MS * 2);
    for (const [k, ts] of draftWarmupDedupe.entries()) {
      if (Number(ts) < cutoff) draftWarmupDedupe.delete(k);
      if (draftWarmupDedupe.size <= 400) break;
    }
  }
  warmCharacterEvaluationCaches(character, scenario, twist, {
    evaluationMode: 'round',
    fastRoundMode: false,
    roundQualityPass: true,
    roundResolveTimeoutMs: Math.max(1800, Number(process.env.ROUND_QUALITY_RESOLVE_TIMEOUT_MS) || 2600),
    roundAliasOverrideTimeoutMs: Math.max(500, Number(process.env.ROUND_QUALITY_ALIAS_TIMEOUT_MS) || 900),
    skipImageEnrichment: false,
    skipImageBackfill: false,
    skipSyntheticImageUpgrade: false,
    imageBackfillTimeoutMs: Math.max(700, Number(process.env.ROUND_QUALITY_IMAGE_BACKFILL_TIMEOUT_MS) || 1250),
    imageBackfillBudgetMs: Math.max(900, Number(process.env.ROUND_QUALITY_IMAGE_BACKFILL_BUDGET_MS) || 1500),
    maxImageBackfillQueries: Math.max(4, Number(process.env.ROUND_QUALITY_MAX_BACKFILL_QUERIES) || 6),
    fetchContext: {
      scenario,
      twist
    }
  })
    .then((result) => {
      if (!result || result.ok !== true) return;
      if (process.env.EVAL_WARMUP_VERBOSE === '1') {
        const imgTag = !result.imageUrl ? 'n' : (result.imageSynthetic ? 'syn' : 'y');
        console.log(`[Eval warmup] ${character} source=${result.source || 'n/a'} conf=${Math.round((result.confidence || 0) * 100)}% img=${imgTag}`);
      }
    })
    .catch(() => {});
}

function getFilledDraftSlotCount(player) {
  return Array.isArray(player && player.team)
    ? player.team.filter((entry) => String(entry || '').trim()).length
    : 0;
}

function countDraftEntriesForPlayer(game, playerName) {
  const rows = Array.isArray(game && game.draftEntries && game.draftEntries[playerName])
    ? game.draftEntries[playerName]
    : [];
  return rows.filter((entry) => entry && String(entry.character || '').trim()).length;
}

function ensurePlayerDraftSlotArrays(game, player, playerName) {
  if (!player || typeof player !== 'object') return;
  if (!Array.isArray(player.team)) player.team = [];
  if (!Array.isArray(player.teamAutoFilled)) player.teamAutoFilled = [];
  if (!Array.isArray(player.teamEditLocks)) player.teamEditLocks = [];
  if (!game.draftEntries || typeof game.draftEntries !== 'object') game.draftEntries = {};
  if (!Array.isArray(game.draftEntries[playerName])) game.draftEntries[playerName] = [];
}

function replaceCharInAllCharactersDrafted(game, previousCharacter, nextCharacter) {
  if (!game || !Array.isArray(game.allCharactersDrafted)) return;
  const prev = String(previousCharacter || '').trim().toLowerCase();
  const next = String(nextCharacter || '').trim();
  if (!prev) {
    if (next) game.allCharactersDrafted.push(next);
    return;
  }
  const index = game.allCharactersDrafted.findIndex((entry) => String(entry || '').trim().toLowerCase() === prev);
  if (index < 0) {
    if (next) game.allCharactersDrafted.push(next);
    return;
  }
  if (!next) {
    game.allCharactersDrafted.splice(index, 1);
    return;
  }
  game.allCharactersDrafted[index] = next;
}

function buildDraftSlotPayloadsForPlayer(game, player) {
  const name = player && player.name ? String(player.name) : '';
  const draftEntries = Array.isArray(game && game.draftEntries && game.draftEntries[name]) ? game.draftEntries[name] : [];
  const team = Array.isArray(player && player.team) ? player.team : [];
  const teamAutoFilled = Array.isArray(player && player.teamAutoFilled) ? player.teamAutoFilled : [];
  const teamEditLocks = Array.isArray(player && player.teamEditLocks) ? player.teamEditLocks : [];
  const slots = [];
  for (let index = 0; index < 2; index += 1) {
    const character = String(team[index] || '').trim();
    const meta = draftEntries[index] && typeof draftEntries[index] === 'object' ? draftEntries[index] : null;
    const autoFilled = teamAutoFilled[index] === true;
    const editLocked = teamEditLocks[index] === true || autoFilled === true || (meta && meta.editLocked === true);
    slots.push({
      slotIndex: index,
      character,
      filled: Boolean(character),
      autoFilled,
      editable: Boolean(character) && !editLocked,
      editLocked,
      lockReason: editLocked ? (autoFilled ? 'auto_fill' : (meta && meta.lockReason ? String(meta.lockReason) : 'locked')) : '',
      editedCount: Math.max(0, Number(meta && meta.editCount) || 0),
      updatedAtMs: Number(meta && meta.updatedAtMs) || Number(meta && meta.draftedAtWallMs) || 0
    });
  }
  return slots;
}

function buildDraftUpdatePayload(game) {
  const allDraftsList = [];
  const playerDraftSlots = {};
  (Array.isArray(game && game.players) ? game.players : []).forEach((p) => {
    if (!p || !p.name) return;
    const slots = buildDraftSlotPayloadsForPlayer(game, p);
    playerDraftSlots[p.name] = slots;
    slots.forEach((slot) => {
      if (!slot || !slot.filled) return;
      allDraftsList.push({
        name: p.name,
        character: slot.character,
        autoFilled: slot.autoFilled === true,
        slotIndex: Number(slot.slotIndex) || 0,
        editLocked: slot.editLocked === true,
        updatedAtMs: Number(slot.updatedAtMs) || 0,
        editedCount: Number(slot.editedCount) || 0
      });
    });
  });

  allDraftsList.sort((a, b) => {
    const timeDelta = (Number(b.updatedAtMs) || 0) - (Number(a.updatedAtMs) || 0);
    if (timeDelta !== 0) return timeDelta;
    const slotDelta = (Number(a.slotIndex) || 0) - (Number(b.slotIndex) || 0);
    if (slotDelta !== 0) return slotDelta;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  const playerEntryCounts = (Array.isArray(game && game.players) ? game.players : []).reduce((acc, p) => {
    if (!p || !p.name) return acc;
    acc[p.name] = countDraftEntriesForPlayer(game, p.name);
    return acc;
  }, {});
  const playerTeamSizes = (Array.isArray(game && game.players) ? game.players : []).reduce((acc, p) => {
    if (!p || !p.name) return acc;
    acc[p.name] = getFilledDraftSlotCount(p);
    return acc;
  }, {});

  return {
    allDrafts: allDraftsList,
    playerEntryCounts,
    playerTeamSizes,
    playerDraftSlots
  };
}

function emitDraftUpdate(io, room, game) {
  io.to(room).emit('draftUpdate', buildDraftUpdatePayload(game));
}

function getNextOpenDraftSlotIndex(player) {
  if (!player || !Array.isArray(player.team)) return 0;
  for (let i = 0; i < 2; i += 1) {
    if (!String(player.team[i] || '').trim()) return i;
  }
  return -1;
}

function appendChatMessage(roomData, message) {
  if (!roomData || !Array.isArray(roomData.messages)) {
    return { prunedCount: 0 };
  }

  roomData.messages.push(message);
  if (roomData.messages.length <= CHAT_MAX_MESSAGES) {
    return { prunedCount: 0 };
  }

  const removeCount = Math.min(CHAT_PRUNE_BATCH, roomData.messages.length);
  roomData.messages.splice(0, removeCount);
  return { prunedCount: removeCount };
}

function getRoomData(roomCode) {
  if (!roomCode) return null;
  return rooms[roomCode] || null;
}

function hashString(input = '') {
  let hash = 2166136261;
  const text = String(input || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function ensureCategoryTelemetry(roomData) {
  if (!roomData || typeof roomData !== 'object') return null;
  if (!roomData.categoryTelemetry || typeof roomData.categoryTelemetry !== 'object') {
    roomData.categoryTelemetry = {
      voteSessionsStarted: 0,
      votesCast: 0,
      votesChanged: 0,
      startBlockedByVote: 0,
      startResumedAfterVote: 0,
      voteFinalizeReasons: {},
      lastLockedCategoryId: null,
      lastLockedAtMs: 0,
      round4CategoryImpact: {
        matches: 0,
        sampleCount: 0,
        avgCategoryFit: 0,
        avgNetImpact: 0
      }
    };
  }
  return roomData.categoryTelemetry;
}

function getCategoryTelemetryPublicState(roomData) {
  const telemetry = ensureCategoryTelemetry(roomData);
  if (!telemetry) return null;
  const reasons = telemetry.voteFinalizeReasons && typeof telemetry.voteFinalizeReasons === 'object'
    ? telemetry.voteFinalizeReasons
    : {};
  return {
    voteSessionsStarted: Number(telemetry.voteSessionsStarted) || 0,
    votesCast: Number(telemetry.votesCast) || 0,
    votesChanged: Number(telemetry.votesChanged) || 0,
    startBlockedByVote: Number(telemetry.startBlockedByVote) || 0,
    startResumedAfterVote: Number(telemetry.startResumedAfterVote) || 0,
    voteFinalizeReasons: {
      timeout: Number(reasons.timeout) || 0,
      all_voted: Number(reasons.all_voted) || 0,
      disconnect_rebalance: Number(reasons.disconnect_rebalance) || 0,
      manual: Number(reasons.manual) || 0
    },
    lastLockedCategoryId: telemetry.lastLockedCategoryId ? String(telemetry.lastLockedCategoryId) : null,
    lastLockedAtMs: Number(telemetry.lastLockedAtMs) || 0,
    round4CategoryImpact: {
      matches: Number(telemetry.round4CategoryImpact && telemetry.round4CategoryImpact.matches) || 0,
      sampleCount: Number(telemetry.round4CategoryImpact && telemetry.round4CategoryImpact.sampleCount) || 0,
      avgCategoryFit: Number(telemetry.round4CategoryImpact && telemetry.round4CategoryImpact.avgCategoryFit) || 0,
      avgNetImpact: Number(telemetry.round4CategoryImpact && telemetry.round4CategoryImpact.avgNetImpact) || 0
    }
  };
}

function getCategoryVotePublicState(roomData) {
  const voteState = roomData && roomData.categoryVoteState && typeof roomData.categoryVoteState === 'object'
    ? roomData.categoryVoteState
    : null;
  if (!voteState || voteState.active !== true) return null;

  const votesByPlayer = voteState.votesByPlayer && typeof voteState.votesByPlayer === 'object'
    ? voteState.votesByPlayer
    : {};
  const voteCounts = {};
  Object.values(votesByPlayer).forEach((categoryId) => {
    const key = String(categoryId || '').trim();
    if (!key) return;
    voteCounts[key] = (voteCounts[key] || 0) + 1;
  });

  return {
    active: true,
    startedAtMs: Number(voteState.startedAtMs) || 0,
    endsAtMs: Number(voteState.endsAtMs) || 0,
    startedBy: voteState.startedBy ? String(voteState.startedBy) : '',
    totalPlayers: Array.isArray(roomData && roomData.players) ? roomData.players.length : 0,
    voteCount: Object.keys(votesByPlayer).length,
    options: Array.isArray(voteState.options)
      ? voteState.options.map((option) => ({
        id: String(option && option.id || ''),
        displayName: String(option && option.displayName || ''),
        family: String(option && option.family || 'unknown'),
        riskLevel: String(option && option.riskLevel || 'med'),
        votes: Number(voteCounts[String(option && option.id || '')]) || 0
      }))
      : []
  };
}

function clearCategoryVoteState(roomData) {
  const voteState = roomData && roomData.categoryVoteState && typeof roomData.categoryVoteState === 'object'
    ? roomData.categoryVoteState
    : null;
  if (voteState && voteState.timeoutHandle) {
    clearTimeout(voteState.timeoutHandle);
  }
  if (roomData) {
    roomData.categoryVoteState = null;
  }
}

function pickCategoryVoteWinner(roomCode, roomData, voteState) {
  const options = Array.isArray(voteState && voteState.options)
    ? voteState.options.filter((option) => option && option.id)
    : [];
  if (!options.length) return null;

  const votesByPlayer = voteState && voteState.votesByPlayer && typeof voteState.votesByPlayer === 'object'
    ? voteState.votesByPlayer
    : {};
  const connectedPlayers = new Set(
    (Array.isArray(roomData && roomData.players) ? roomData.players : [])
      .map((player) => String(player && player.name || '').trim())
      .filter(Boolean)
  );

  const counts = {};
  Object.entries(votesByPlayer).forEach(([playerName, categoryId]) => {
    if (!connectedPlayers.has(String(playerName || '').trim())) return;
    const key = String(categoryId || '').trim();
    if (!key) return;
    counts[key] = (counts[key] || 0) + 1;
  });

  let topCount = -1;
  let topIds = [];
  options.forEach((option) => {
    const count = Number(counts[option.id]) || 0;
    if (count > topCount) {
      topCount = count;
      topIds = [option.id];
      return;
    }
    if (count === topCount) {
      topIds.push(option.id);
    }
  });

  if (!topIds.length) return options[0];
  if (topIds.length === 1) {
    return options.find((option) => option.id === topIds[0]) || options[0];
  }

  const seed = `${roomCode}|${Number(voteState && voteState.startedAtMs) || 0}`;
  topIds.sort((left, right) => {
    const leftHash = hashString(`${seed}|${left}`);
    const rightHash = hashString(`${seed}|${right}`);
    if (leftHash !== rightHash) return leftHash - rightHash;
    return String(left).localeCompare(String(right));
  });
  const winnerId = topIds[0];
  return options.find((option) => option.id === winnerId) || options[0];
}

function finalizeCategoryVote(io, roomCode, roomData, reason = 'timeout') {
  const voteState = roomData && roomData.categoryVoteState && typeof roomData.categoryVoteState === 'object'
    ? roomData.categoryVoteState
    : null;
  if (!voteState || voteState.active !== true) return null;

  const winner = pickCategoryVoteWinner(roomCode, roomData, voteState);
  const optionIds = Array.isArray(voteState.options)
    ? voteState.options.map((option) => String(option && option.id || '')).filter(Boolean)
    : [];
  const winnerId = winner && winner.id ? String(winner.id) : (optionIds[0] || null);
  const orderedOptions = winnerId
    ? [winnerId, ...optionIds.filter((id) => id !== winnerId)]
    : optionIds;

  const previousSettings = { ...(roomData && roomData.settings ? roomData.settings : {}) };
  roomData.settings = {
    ...roomData.settings,
    categoryId: winnerId,
    categoryVoteOptions: orderedOptions,
    categoryVersion: String(roomData && roomData.settings && roomData.settings.categoryVersion || 'v1')
  };
  roomData.settings = {
    ...roomData.settings,
    ...normalizeCategorySettings(roomData.settings)
  };

  const changedKeys = getChangedSettingKeys(previousSettings, roomData.settings);
  if (changedKeys.length) {
    emitSettingsSync(io, roomCode, roomData, {
      changedKeys,
      changedBy: voteState.startedBy || 'system',
      system: voteState.startedBy ? false : true,
      summary: `Category vote locked: ${winner && winner.displayName ? winner.displayName : 'Unknown'}`
    });
  }

  const pendingGameStart = voteState.pendingGameStart === true;
  const telemetry = ensureCategoryTelemetry(roomData);
  if (telemetry) {
    telemetry.voteFinalizeReasons = telemetry.voteFinalizeReasons && typeof telemetry.voteFinalizeReasons === 'object'
      ? telemetry.voteFinalizeReasons
      : {};
    const reasonKey = String(reason || 'manual').trim().toLowerCase() || 'manual';
    telemetry.voteFinalizeReasons[reasonKey] = (Number(telemetry.voteFinalizeReasons[reasonKey]) || 0) + 1;
    telemetry.lastLockedCategoryId = winnerId || null;
    telemetry.lastLockedAtMs = Date.now();
  }
  const publicState = getCategoryVotePublicState(roomData);
  clearCategoryVoteState(roomData);
  io.to(roomCode).emit('categoryVoteLocked', {
    reason: String(reason || 'timeout'),
    winner: winner ? {
      id: String(winner.id || ''),
      displayName: String(winner.displayName || winner.id || ''),
      family: String(winner.family || 'unknown'),
      riskLevel: String(winner.riskLevel || 'med')
    } : null,
    vote: publicState
  });

  return {
    winnerId,
    pendingGameStart
  };
}

function startCategoryVote(io, roomCode, roomData, startedBy = '') {
  clearCategoryVoteState(roomData);
  const telemetry = ensureCategoryTelemetry(roomData);
  if (telemetry) {
    telemetry.voteSessionsStarted = (Number(telemetry.voteSessionsStarted) || 0) + 1;
  }
  const history = Array.isArray(roomData && roomData.categoryHistory)
    ? roomData.categoryHistory
    : [];
  const options = buildVoteOptions({
    count: CATEGORY_VOTE_OPTION_COUNT,
    recentCategoryIds: history
  });
  if (!options.length) return null;

  const startedAtMs = Date.now();
  const voteState = {
    active: true,
    startedAtMs,
    endsAtMs: startedAtMs + CATEGORY_VOTE_TIMEOUT_MS,
    startedBy: String(startedBy || ''),
    options: options.map((entry) => ({
      id: String(entry.id || ''),
      displayName: String(entry.displayName || entry.id || ''),
      family: String(entry.family || 'unknown'),
      riskLevel: String(entry.riskLevel || 'med')
    })),
    votesByPlayer: {},
    timeoutHandle: null,
    pendingGameStart: false
  };
  voteState.timeoutHandle = setTimeout(() => {
    const current = getRoomData(roomCode);
    if (!current) return;
    const finalized = finalizeCategoryVote(io, roomCode, current, 'timeout');
    if (finalized && finalized.pendingGameStart) {
      const telemetry = ensureCategoryTelemetry(current);
      if (telemetry) {
        telemetry.startResumedAfterVote = (Number(telemetry.startResumedAfterVote) || 0) + 1;
      }
      startGame(io, roomCode);
    }
    markRoomsDirty();
  }, CATEGORY_VOTE_TIMEOUT_MS + 20);

  roomData.categoryVoteState = voteState;
  const payload = getCategoryVotePublicState(roomData);
  io.to(roomCode).emit('categoryVoteStart', payload);
  io.to(roomCode).emit('categoryVoteUpdate', payload);
  return payload;
}

function emitRoomData(io, roomCode, roomData) {
  if (!roomData.voiceConfig || typeof roomData.voiceConfig !== 'object') {
    roomData.voiceConfig = {
      narratorVoiceId: 'bm_george',
      updatedBy: '',
      updatedAt: 0
    };
  }
  const narratorVoiceId = NARRATOR_VOICE_IDS.has(String(roomData.voiceConfig.narratorVoiceId || ''))
    ? String(roomData.voiceConfig.narratorVoiceId)
    : 'bm_george';
  roomData.voiceConfig.narratorVoiceId = narratorVoiceId;
  const safePackId = coercePackId(roomData && roomData.settings && roomData.settings.contentPackId);
  if (roomData && roomData.settings) {
    roomData.settings = {
      ...roomData.settings,
      ...normalizeCategorySettings(roomData.settings)
    };
    roomData.settings.contentPackId = safePackId;
  }
  io.to(roomCode).emit('roomData', {
    players: roomData.players,
    isGameActive: roomData.isGameActive,
    host: roomData.host,
    settings: roomData.settings,
    categoryTelemetry: getCategoryTelemetryPublicState(roomData),
    categoryVote: getCategoryVotePublicState(roomData),
    messages: roomData.messages,
    voiceConfig: {
      narratorVoiceId,
      updatedBy: roomData.voiceConfig.updatedBy ? String(roomData.voiceConfig.updatedBy) : '',
      updatedAt: Number(roomData.voiceConfig.updatedAt) || 0
    },
    packCatalog: getPackCatalog(),
    selectedPackMeta: getPublicPackMeta(safePackId)
  });
}

function getJoinedRoom(socket) {
  const room = socket.data.room;
  const name = socket.data.name;
  if (!room || !name) return null;

  const roomData = getRoomData(room);
  if (!roomData) return null;

  return { room, name, roomData };
}

function shouldDropBurstChat(socket, type, value) {
  const now = Date.now();
  const key = type === 'reaction' ? 'reaction' : 'message';
  const metaKey = `chatMeta_${key}`;
  const meta = socket.data[metaKey] || { lastText: '', lastAt: 0 };

  const text = String(value || '');
  const delta = now - (Number(meta.lastAt) || 0);
  const isRapidBurst = delta < 220;
  const isDuplicateFlood = meta.lastText === text && delta < 1400;

  socket.data[metaKey] = {
    lastText: text,
    lastAt: now
  };

  return isRapidBurst || isDuplicateFlood;
}

function getEligibleFinalPlayers(roomData, game) {
  if (!roomData || !game || !Array.isArray(game.players)) return [];
  const connectedNames = new Set((roomData.players || []).map((p) => p.name));
  return game.players
    .filter((player) => !player.isBot && connectedNames.has(player.name))
    .map((player) => player.name);
}

async function buildDraftWaitPreviewForPlayer(game, playerName) {
  if (!game || !playerName) return null;
  if (game.activePhase !== 'DRAFT') return null;

  const player = Array.isArray(game.players) ? game.players.find((p) => p && p.name === playerName) : null;
  if (!player || player.draftLocked !== true) return null;

  const roster = Array.isArray(player.team) ? player.team.slice(0, 2).filter(Boolean) : [];
  if (!roster.length) return null;

  const scenario = String(game.currentScenario || '').trim();
  const twist = getDraftWarmupTwist(game);
  if (!scenario) return null;
  // Keep preview requests cheap/non-blocking: only read already-warmed cache.
  // Heavy warmups in a request loop can stall the event loop and hurt socket reliability.
  const warmups = await Promise.all(roster.map((character) => (
    peekCharacterEvaluationWarmup(character, scenario, twist, { evaluationMode: 'round' })
      .catch(() => null)
  )));

  const evaluations = roster.map((character, index) => {
    const warm = warmups[index];
    const hasWarm = Boolean(warm && typeof warm === 'object');
    const categoryFit = hasWarm ? (Number(warm.categoryFit) || 0) : 0;
    const categoryMembershipConfidence = hasWarm ? (Number(warm.categoryMembershipConfidence) || 0) : 0;
    const categoryNetImpact = hasWarm ? (Number(warm.categoryNetImpact) || 0) : 0;
    const statusRaw = hasWarm && warm.categoryStatus
      ? String(warm.categoryStatus)
      : '';
    const hasCategoryNumbers = categoryFit > 0 || categoryMembershipConfidence > 0 || categoryNetImpact !== 0;
    let categoryStatus = statusRaw;
    if (!categoryStatus && hasWarm && warm.ok === true) {
      if (hasCategoryNumbers) {
        if (categoryFit >= 66 && categoryMembershipConfidence >= 54 && categoryNetImpact >= 0) {
          categoryStatus = 'in_category';
        } else if (categoryFit >= 42 || categoryMembershipConfidence >= 28 || categoryNetImpact >= -4) {
          categoryStatus = 'borderline';
        } else {
          categoryStatus = 'not_in_category';
        }
      } else {
        categoryStatus = 'still_determining';
      }
    }
    const statusLabelRaw = hasWarm && warm.categoryStatusLabel
      ? String(warm.categoryStatusLabel)
      : '';
    const normalizedStatus = String(categoryStatus || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const categoryStatusLabel = statusLabelRaw
      || (
        normalizedStatus === 'in_category'
          ? 'IN CATEGORY'
          : normalizedStatus === 'borderline' || normalizedStatus === 'borderline_entry'
            ? 'BORDERLINE ENTRY'
            : normalizedStatus === 'not_in_category' || normalizedStatus === 'out_of_category'
              ? 'NOT IN CATEGORY'
              : (hasWarm && warm.ok === true ? 'Still determining...' : null)
      );
    return {
      character: String(character || `Pick ${index + 1}`),
      ready: Boolean(hasWarm && warm.ok === true),
      source: hasWarm && warm.source ? String(warm.source) : 'warming',
      confidence: hasWarm ? (Number(warm.confidence) || 0) : 0,
      imageUrl: hasWarm && warm.imageUrl ? String(warm.imageUrl) : '',
      imageSynthetic: Boolean(hasWarm && warm.imageSynthetic),
      resolverSeedReady: Boolean(hasWarm && warm.resolverSeedReady),
      contextPreseeded: Boolean(hasWarm && warm.contextPreseeded),
      fetchDurationMs: hasWarm ? (Number(warm.fetchDurationMs) || 0) : 0,
      categoryFit,
      categoryMembershipConfidence,
      categoryNetImpact,
      categoryStatus: categoryStatus || null,
      categoryStatusLabel
    };
  });

  const readyEntries = evaluations.filter((entry) => entry.ready);
  const trustedCount = readyEntries.filter((entry) => entry.confidence >= 0.75).length;
  const averageConfidence = readyEntries.length
    ? (readyEntries.reduce((sum, entry) => sum + (Number(entry.confidence) || 0), 0) / readyEntries.length)
    : 0;
  const inCategoryCount = readyEntries.filter((entry) => String(entry && entry.categoryStatus || '').toLowerCase() === 'in_category').length;
  const borderlineCount = readyEntries.filter((entry) => String(entry && entry.categoryStatus || '').toLowerCase() === 'borderline').length;
  const notInCategoryCount = readyEntries.filter((entry) => {
    const status = String(entry && entry.categoryStatus || '').toLowerCase();
    return status === 'not_in_category' || status === 'out_of_category';
  }).length;
  const pendingCategoryCount = evaluations.filter((entry) => {
    if (!entry || entry.ready !== true) return true;
    const status = String(entry.categoryStatus || '').trim().toLowerCase();
    return !status || status === 'still_determining' || status === 'pending';
  }).length;

  return {
    roundNumber: (Number(game.currentRound) || 0) + 1,
    source: 'draft_warm_cache',
    scenario,
    twistPending: true,
    summary: {
      readyCount: readyEntries.length,
      totalCount: evaluations.length,
      trustedCount,
      averageConfidence,
      inCategoryCount,
      borderlineCount,
      notInCategoryCount,
      pendingCategoryCount
    },
    evaluations
  };
}

async function emitFinalRoundResults(io, room, game) {
  if (!game || !game.round4Results) return false;
  if (game.finalResultsEmitted) return true;

  game.finalResultsEmitted = true;
  const finalRoundResultsPayload = {
    winner: game.round4Results.winner || null,
    isTie: game.round4Results.isTie === true,
    tiedPlayers: Array.isArray(game.round4Results.tiedPlayers) ? game.round4Results.tiedPlayers : [],
    roundPoints: game.round4Results.roundPoints,
    voteCount: {},
    leaderboard: game.round4Results.leaderboardData,
    pointBreakdown: game.round4Results.pointBreakdown,
    lockedCategory: game.lockedCategory || null,
    categoryImpactSummary: game.round4Results && game.round4Results.payload ? (game.round4Results.payload.categoryImpactSummary || null) : null,
    packMeta: game.packMeta || getPublicPackMeta(game && game.settings && game.settings.contentPackId),
    voiceCues: buildFinalRoundResultsVoiceCues({
      isTie: game.round4Results.isTie === true
    })
  };
  await emitRoomEventWithVoiceCuePrewarm(io, room, 'finalRoundResults', finalRoundResultsPayload, { timeoutMs: 2200 });

  setTimeout(() => endGame(io, room), 3000);
  return true;
}

function updateFinalResultsWaiting(io, room, roomData, game) {
  if (!game || !game.round4Results || game.finalResultsEmitted) return;

  game.finalResultsReady = game.finalResultsReady || {};
  const state = getFinalResultsFailSafeState(roomData, game);
  const eligiblePlayers = state.eligiblePlayers;
  const readyCount = state.readyCount;

  io.to(room).emit('finalResultsWaiting', {
    readyCount,
    totalPlayers: eligiblePlayers.length,
    timeoutMs: ROUND4_FINAL_LOCK_TIMEOUT_MS,
    elapsedMs: state.elapsedMs,
    hostOverrideEligible: state.hostEligible === true
  });

  if (shouldForceEmitFinalResults(state)) {
    const reason = getFinalResultsForceReason(state);
    if (reason && reason !== 'all_ready') {
      console.warn(
        `[Round4 socket] Forcing final results for room ${room}` +
        ` reason=${reason} ready=${readyCount}/${eligiblePlayers.length}` +
        ` elapsedMs=${state.elapsedMs}`
      );
    }
    emitFinalRoundResults(io, room, game);
  }
}

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('joinRoom', (payload) => {
      if (!allowRequest(`${socket.id}:joinRoom`, 10000, 6)) {
        socket.emit('joinError', 'Too many join attempts. Please wait a moment.');
        return;
      }

      const name = sanitizeName(payload && payload.name);
      const room = sanitizeRoomCode(payload && payload.room);
      const joinAsHost = payload && payload.joinAsHost === true;

      if (!name || !room) {
        socket.emit('joinError', 'Invalid name or room code format.');
        return;
      }

      if (!rooms[room]) {
        rooms[room] = createRoom(room);
      }

      const roomData = rooms[room];

      const hostStillInRoom = roomData.host
        && Array.isArray(roomData.players)
        && roomData.players.some((player) => player.name === roomData.host);
      if (roomData.host && !hostStillInRoom) {
        roomData.host = null;
      }

      if (joinAsHost && roomData.host && roomData.host.toLowerCase() !== name.toLowerCase()) {
        socket.emit('joinError', `Room host is already set to ${roomData.host}. Join without "Join as host".`);
        return;
      }

      if (roomData.isGameActive && (!Array.isArray(roomData.players) || roomData.players.length === 0)) {
        roomData.isGameActive = false;
        roomData.gameState = null;
      }

      if (roomData.isGameActive) {
        socket.emit('joinError', 'Game already in progress. Try again next round!');
        return;
      }

      if (roomData.players.length >= roomData.settings.maxPlayers) {
        socket.emit('joinError', `Room is full (${roomData.settings.maxPlayers} player limit).`);
        return;
      }

      if (roomData.players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
        socket.emit('joinError', 'Name already taken in this room.');
        return;
      }

      roomData.players.push({
        id: socket.id,
        name,
        ready: false,
        reactions: []
      });

      if (joinAsHost && !roomData.host) {
        roomData.host = name;
      }

      socket.join(room);
      socket.data.room = room;
      socket.data.name = name;

      emitRoomData(io, room, roomData);
      markRoomsDirty();
      console.log(`${name} joined room ${room}`);
    });

    socket.on('updateSettings', (newSettings) => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;
      if (roomData.host !== name || roomData.isGameActive) return;

      const previousSettings = { ...(roomData.settings || {}) };
      const cleaned = sanitizeSettings(newSettings);
      if (Object.prototype.hasOwnProperty.call(cleaned, 'contentPackId')) {
        cleaned.contentPackId = coercePackId(cleaned.contentPackId);
      }
      roomData.settings = { ...roomData.settings, ...cleaned };
      roomData.settings = {
        ...roomData.settings,
        ...normalizeCategorySettings(roomData.settings)
      };
      roomData.settings.contentPackId = coercePackId(roomData.settings.contentPackId);
      const changedKeys = getChangedSettingKeys(previousSettings, roomData.settings);
      if (!changedKeys.length) return;

      if (changedKeys.some((key) => ['categoriesMode', 'categoryId', 'categoryVoteOptions'].includes(String(key)))) {
        clearCategoryVoteState(roomData);
      }

      emitSettingsSync(io, room, roomData, {
        changedKeys,
        changedBy: name
      });
      markRoomsDirty();
    });

    const handleQueueNarratorVoice = (payload) => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;
      if (!roomData || roomData.host !== name) return;

      const requestedId = String(payload && payload.voiceId || '').trim();
      if (!NARRATOR_VOICE_IDS.has(requestedId)) return;

      const previousId = roomData.voiceConfig && roomData.voiceConfig.narratorVoiceId
        ? String(roomData.voiceConfig.narratorVoiceId)
        : 'bm_george';
      const now = Date.now();
      roomData.voiceConfig = {
        narratorVoiceId: requestedId,
        updatedBy: name,
        updatedAt: now
      };

      const eventPayload = {
        narratorVoiceId: requestedId,
        previousNarratorVoiceId: previousId,
        queuedBy: name,
        queuedAt: now
      };
      io.to(room).emit('narratorVoiceQueued', eventPayload);
      io.to(room).emit('kokoroNarratorQueued', eventPayload); // legacy alias
      markRoomsDirty();
    };

    socket.on('queueNarratorVoice', handleQueueNarratorVoice);
    socket.on('queueKokoroNarratorVoice', handleQueueNarratorVoice); // legacy alias

    socket.on('toggleReady', () => {
      if (!allowRequest(`${socket.id}:toggleReady`, 2500, 2)) {
        socket.emit('gameError', 'Ready toggle locked briefly. Please wait a second.');
        return;
      }

      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;
      const player = roomData.players.find(p => p.name === name);
      if (!player) return;

      player.ready = !player.ready;
      emitRoomData(io, room, roomData);
      markRoomsDirty();
    });

    socket.on('readyForNextRound', () => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;
      const game = roomData.gameState;
      if (!game) return;

      game.resultsReady = game.resultsReady || {};
      game.resultsReady[name] = true;

      const allReady = game.players.every(p => game.resultsReady[p.name] === true);
      if (!allReady) return;

      game.currentRound += 1;
      if (game.currentRound < game.totalRounds) {
        startRound(io, room);
      } else {
        startFinalRound(io, room);
      }
      markRoomsDirty();
    });

    socket.on('sendMessage', (rawMessage) => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      if (!allowRequest(`${socket.id}:sendMessage`, 5000, 6)) {
        socket.emit('gameError', 'Slow down—message rate limit reached.');
        return;
      }

      const { room, name, roomData } = joined;
      const message = sanitizeMessage(rawMessage, 240);
      if (!message) return;
      if (shouldDropBurstChat(socket, 'message', message)) return;

      const msg = { player: name, text: message, timestamp: Date.now() };
      const { prunedCount } = appendChatMessage(roomData, msg);

      io.to(room).emit('newMessage', { ...msg, prunedCount });
      markRoomsDirty();
    });

    socket.on('sendReaction', (rawReaction) => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      if (!allowRequest(`${socket.id}:sendReaction`, 5000, 10)) {
        return;
      }

      const { room, name, roomData } = joined;
      const reaction = sanitizeReaction(rawReaction);
      if (!reaction) return;
      if (shouldDropBurstChat(socket, 'reaction', reaction)) return;

      const msg = { player: name, text: reaction, timestamp: Date.now(), isReaction: true };
      const { prunedCount } = appendChatMessage(roomData, msg);

      io.to(room).emit('newMessage', { ...msg, prunedCount });
      markRoomsDirty();
    });

    socket.on('startGame', () => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;

      if (roomData.host !== name) {
        socket.emit('gameError', 'Only the host can start the game.');
        return;
      }

      if (roomData.players.length < 3) {
        socket.emit('gameError', 'Need at least 3 players to start.');
        return;
      }

      const readyCount = roomData.players.filter(p => p.ready).length;
      if (readyCount < 3 || readyCount !== roomData.players.length) {
        socket.emit('gameError', 'All players must be ready to start.');
        return;
      }

      const normalizedCategorySettings = normalizeCategorySettings(roomData.settings || {});
      roomData.settings = {
        ...roomData.settings,
        ...normalizedCategorySettings
      };
      if (normalizedCategorySettings.categoriesMode === 'group_vote') {
        const telemetry = ensureCategoryTelemetry(roomData);
        const voteState = roomData.categoryVoteState;
        if (voteState && voteState.active === true) {
          if (telemetry) {
            telemetry.startBlockedByVote = (Number(telemetry.startBlockedByVote) || 0) + 1;
          }
          voteState.pendingGameStart = true;
          socket.emit('gameError', 'Category vote in progress. Start will continue once vote locks.');
          markRoomsDirty();
          return;
        }

        const votePayload = startCategoryVote(io, room, roomData, name);
        if (!votePayload) {
          socket.emit('gameError', 'Could not start category vote; try updating settings and retry.');
          return;
        }
        if (roomData.categoryVoteState) {
          roomData.categoryVoteState.pendingGameStart = true;
          if (telemetry) {
            telemetry.startBlockedByVote = (Number(telemetry.startBlockedByVote) || 0) + 1;
          }
        }
        markRoomsDirty();
        return;
      }

      startGame(io, room);
      markRoomsDirty();
    });

    socket.on('castCategoryVote', (payload) => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;
      const voteState = roomData && roomData.categoryVoteState && typeof roomData.categoryVoteState === 'object'
        ? roomData.categoryVoteState
        : null;
      if (!voteState || voteState.active !== true) {
        socket.emit('gameError', 'No active category vote.');
        return;
      }

      const categoryId = String(payload && payload.categoryId || '').trim().toLowerCase();
      const validIds = new Set(
        (Array.isArray(voteState.options) ? voteState.options : [])
          .map((option) => String(option && option.id || '').trim().toLowerCase())
          .filter(Boolean)
      );
      if (!categoryId || !validIds.has(categoryId)) {
        socket.emit('gameError', 'Invalid category vote selection.');
        return;
      }

      voteState.votesByPlayer = voteState.votesByPlayer && typeof voteState.votesByPlayer === 'object'
        ? voteState.votesByPlayer
        : {};
      const previousVote = String(voteState.votesByPlayer[name] || '').trim().toLowerCase();
      voteState.votesByPlayer[name] = categoryId;
      const telemetry = ensureCategoryTelemetry(roomData);
      if (telemetry) {
        if (!previousVote) {
          telemetry.votesCast = (Number(telemetry.votesCast) || 0) + 1;
        } else if (previousVote !== categoryId) {
          telemetry.votesChanged = (Number(telemetry.votesChanged) || 0) + 1;
        }
      }

      const publicState = getCategoryVotePublicState(roomData);
      io.to(room).emit('categoryVoteUpdate', publicState);

      const totalPlayers = Array.isArray(roomData.players) ? roomData.players.length : 0;
      const voteCount = Object.keys(voteState.votesByPlayer).length;
      if (totalPlayers > 0 && voteCount >= totalPlayers) {
        const finalized = finalizeCategoryVote(io, room, roomData, 'all_voted');
        if (finalized && finalized.pendingGameStart) {
          if (telemetry) {
            telemetry.startResumedAfterVote = (Number(telemetry.startResumedAfterVote) || 0) + 1;
          }
          startGame(io, room);
        }
      }

      markRoomsDirty();
    });

    socket.on('categoryVoteCast', (payload) => {
      socket.emit('gameError', 'categoryVoteCast is deprecated; use castCategoryVote.');
    });

    socket.on('draftCharacter', (rawCharacter) => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      if (!allowRequest(`${socket.id}:draftCharacter`, 10000, 20)) {
        socket.emit('draftError', 'Too many draft submissions.');
        return;
      }

      const { room, name, roomData } = joined;
      const game = roomData.gameState;
      if (!game || game.activePhase !== 'DRAFT') return;

      const player = game.players.find(p => p.name === name);
      if (!player) return;
      ensurePlayerDraftSlotArrays(game, player, name);

      if (player.draftLocked) {
        socket.emit('draftError', 'You have already locked in your team!');
        return;
      }

      const nextSlotIndex = getNextOpenDraftSlotIndex(player);
      if (nextSlotIndex < 0 || countDraftEntriesForPlayer(game, name) >= 2) {
        socket.emit('draftError', 'You can draft max 2 characters!');
        return;
      }

      const character = sanitizeDraftCharacter(rawCharacter);
      if (!character) return;

      const charNormalized = character.toLowerCase();
      const isDuplicateOwn = player.team.some(c => String(c || '').toLowerCase() === charNormalized);
      const isDuplicateOther = game.players.some(p =>
        p.name !== name && Array.isArray(p.team) && p.team.some(c => String(c || '').toLowerCase() === charNormalized)
      );
      const isDuplicateAcrossRounds = game.allCharactersDrafted.some(c => c.toLowerCase() === charNormalized);

      let finalCharacter = character;
      let autoFilled = false;

      if (isDuplicateOwn || isDuplicateOther || isDuplicateAcrossRounds) {
        let randomWord = getRandomWord();
        while (game.players.some(p => p.team.some(c => c.toLowerCase() === randomWord.toLowerCase())) ||
               game.allCharactersDrafted.some(c => c.toLowerCase() === randomWord.toLowerCase())) {
          randomWord = getRandomWord();
        }
        finalCharacter = randomWord;
        autoFilled = true;
      }

      player.team[nextSlotIndex] = finalCharacter;
      player.teamAutoFilled[nextSlotIndex] = autoFilled;
      player.teamEditLocks[nextSlotIndex] = autoFilled === true;
      replaceCharInAllCharactersDrafted(game, '', finalCharacter);

      const pickNumberInRound = nextSlotIndex + 1;
      const globalDraftOrder = game.allCharactersDrafted.length;
      const draftedAtMs = Math.max(0, Date.now() - (game.roundStartTime || Date.now()));
      game.draftEntries[name][nextSlotIndex] = {
        character: finalCharacter,
        originalScenario: game.currentScenario || '',
        originalTwist: game.currentTwist || '',
        draftedRound: (game.currentRound || 0) + 1,
        pickNumberInRound,
        globalDraftOrder,
        draftedAtMs,
        draftedAtWallMs: Date.now(),
        updatedAtMs: Date.now(),
        autoFilled,
        editLocked: autoFilled === true,
        editCount: 0
      };

      const playerEntryCount = countDraftEntriesForPlayer(game, name);

      socket.emit('draftSuccess', {
        character: finalCharacter,
        teamSize: playerEntryCount,
        autoFilled,
        slotIndex: nextSlotIndex,
        edited: false
      });

      emitDraftUpdate(io, room, game);

      scheduleDraftWarmup(game, finalCharacter);

      markRoomsDirty();
    });

    socket.on('editDraftCharacter', (payload) => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      if (!allowRequest(`${socket.id}:editDraftCharacter`, 10000, 24)) {
        socket.emit('draftError', 'Too many draft edits.');
        return;
      }

      const { room, name, roomData } = joined;
      const game = roomData.gameState;
      if (!game || game.activePhase !== 'DRAFT') return;

      const player = game.players.find(p => p.name === name);
      if (!player) return;
      ensurePlayerDraftSlotArrays(game, player, name);

      if (player.draftLocked) {
        socket.emit('draftError', 'You have already locked in your team!');
        return;
      }

      const slotIndex = Math.max(0, Math.min(1, Number(payload && payload.slotIndex) || 0));
      const existingCharacter = String(player.team[slotIndex] || '').trim();
      if (!existingCharacter) {
        socket.emit('draftError', 'That draft slot is empty.');
        return;
      }

      if (player.teamEditLocks[slotIndex] === true) {
        socket.emit('draftError', 'That entry was auto-filled and is locked for fairness.');
        return;
      }

      const character = sanitizeDraftCharacter(payload && payload.character);
      if (!character) return;

      const nextNormalized = character.toLowerCase();
      const currentNormalized = existingCharacter.toLowerCase();
      if (nextNormalized === currentNormalized) {
        socket.emit('draftSuccess', {
          character: existingCharacter,
          teamSize: countDraftEntriesForPlayer(game, name),
          autoFilled: player.teamAutoFilled[slotIndex] === true,
          slotIndex,
          edited: true,
          unchanged: true
        });
        return;
      }

      const isDuplicateOwn = player.team.some((c, idx) => idx !== slotIndex && String(c || '').toLowerCase() === nextNormalized);
      const isDuplicateOther = game.players.some(p =>
        p.name !== name && Array.isArray(p.team) && p.team.some(c => String(c || '').toLowerCase() === nextNormalized)
      );
      const isDuplicateAcrossRounds = game.allCharactersDrafted.some(c => String(c || '').toLowerCase() === nextNormalized);

      let finalCharacter = character;
      let autoFilled = false;
      if (isDuplicateOwn || isDuplicateOther || isDuplicateAcrossRounds) {
        let randomWord = getRandomWord();
        while (
          game.players.some(p => Array.isArray(p.team) && p.team.some(c => String(c || '').toLowerCase() === randomWord.toLowerCase()))
          || game.allCharactersDrafted.some(c => String(c || '').toLowerCase() === randomWord.toLowerCase())
        ) {
          randomWord = getRandomWord();
        }
        finalCharacter = randomWord;
        autoFilled = true;
      }

      replaceCharInAllCharactersDrafted(game, existingCharacter, finalCharacter);
      player.team[slotIndex] = finalCharacter;
      player.teamAutoFilled[slotIndex] = autoFilled === true;
      player.teamEditLocks[slotIndex] = autoFilled === true;

      const draftedAtMs = Math.max(0, Date.now() - (game.roundStartTime || Date.now()));
      const existingMeta = game.draftEntries[name][slotIndex] && typeof game.draftEntries[name][slotIndex] === 'object'
        ? game.draftEntries[name][slotIndex]
        : {};
      game.draftEntries[name][slotIndex] = {
        ...existingMeta,
        character: finalCharacter,
        originalScenario: existingMeta.originalScenario || game.currentScenario || '',
        originalTwist: existingMeta.originalTwist || game.currentTwist || '',
        draftedRound: existingMeta.draftedRound || ((game.currentRound || 0) + 1),
        pickNumberInRound: slotIndex + 1,
        globalDraftOrder: existingMeta.globalDraftOrder || (game.allCharactersDrafted.length || (slotIndex + 1)),
        draftedAtMs: Number.isFinite(Number(existingMeta.draftedAtMs)) ? Number(existingMeta.draftedAtMs) : draftedAtMs,
        draftedAtWallMs: Number(existingMeta.draftedAtWallMs) || Date.now(),
        updatedAtMs: Date.now(),
        autoFilled: autoFilled === true,
        editLocked: autoFilled === true,
        editCount: Math.max(0, Number(existingMeta.editCount) || 0) + 1,
        editedAtMs: Date.now(),
        editedFromCharacter: existingCharacter
      };

      socket.emit('draftSuccess', {
        character: finalCharacter,
        teamSize: countDraftEntriesForPlayer(game, name),
        autoFilled,
        slotIndex,
        edited: true,
        previousCharacter: existingCharacter
      });

      emitDraftUpdate(io, room, game);
      scheduleDraftWarmup(game, finalCharacter);
      markRoomsDirty();
    });

    socket.on('lockDraft', () => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;
      const game = roomData.gameState;
      if (!game || game.activePhase !== 'DRAFT') return;

      const player = game.players.find(p => p.name === name);
      if (!player) return;
      ensurePlayerDraftSlotArrays(game, player, name);
      for (let slotIndex = 0; slotIndex < 2; slotIndex += 1) {
        const character = String(player.team[slotIndex] || '').trim();
        if (!character) continue;
        if (game.draftEntries[name][slotIndex] && String(game.draftEntries[name][slotIndex].character || '').trim()) continue;
        game.draftEntries[name][slotIndex] = {
          character,
          originalScenario: game.currentScenario || '',
          originalTwist: getDraftWarmupTwist(game),
          draftedRound: (Number(game.currentRound) || 0) + 1,
          pickNumberInRound: slotIndex + 1,
          globalDraftOrder: Array.isArray(game.allCharactersDrafted) ? game.allCharactersDrafted.length + 1 : (slotIndex + 1),
          draftedAtMs: Math.max(0, Date.now() - (game.roundStartTime || Date.now())),
          draftedAtWallMs: Date.now(),
          updatedAtMs: Date.now(),
          autoFilled: player.teamAutoFilled[slotIndex] === true,
          editLocked: player.teamEditLocks[slotIndex] === true,
          lockReason: player.teamAutoFilled[slotIndex] === true ? 'auto_fill' : ''
        };
      }

      const playerEntryCount = countDraftEntriesForPlayer(game, name);
      const filledSlotCount = getFilledDraftSlotCount(player);

      if (playerEntryCount < 2 || filledSlotCount < 2) {
        socket.emit('draftError', 'You must have 2 characters to lock in!');
        return;
      }

      player.draftLocked = true;
      const roundStartMs = Number(game.roundStartTime);
      const lockElapsedMs = Number.isFinite(roundStartMs) && roundStartMs > 0
        ? Math.max(0, Date.now() - roundStartMs)
        : null;
      player.draftLockTime = Number.isFinite(lockElapsedMs) ? lockElapsedMs : null;
      if (Number.isFinite(lockElapsedMs) && lockElapsedMs > 0) {
        const previousBestLock = Number(player.fastestDraftLockMs);
        if (!Number.isFinite(previousBestLock) || previousBestLock <= 0 || lockElapsedMs < previousBestLock) {
          player.fastestDraftLockMs = lockElapsedMs;
        }
      }

      io.to(room).emit('playerLocked', { playerName: name, phase: 'DRAFT' });

      const allLocked = game.players
        .filter(p => !p.isBot)
        .every(p => p.draftLocked === true);

      if (allLocked) {
        if (shouldRunDraftWarmup()) {
          game.players.forEach((p) => {
            const roster = Array.isArray(p && p.team) ? p.team : [];
            roster.forEach((entry) => scheduleDraftWarmup(game, entry));
          });
        }
        clearTimeout(game.draftTimeout);
        revealPlotTwist(io, room);
      }
      markRoomsDirty();
    });

    socket.on('requestDraftWaitPreview', async () => {
      try {
        const joined = getJoinedRoom(socket);
        if (!joined) return;

        if (!allowRequest(`${socket.id}:requestDraftWaitPreview`, 1000, 6)) {
          return;
        }

        const { name, roomData } = joined;
        const game = roomData.gameState;
        if (!game || game.activePhase !== 'DRAFT') return;

        const payload = await buildDraftWaitPreviewForPlayer(game, name);
        if (!payload) return;

        socket.emit('draftWaitIntelPreview', payload);
      } catch (error) {
      }
    });

    socket.on('castVote', (votedPlayerName) => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;
      const game = roomData.gameState;
      if (!game || game.activePhase !== 'VOTING') return;

      const target = sanitizeName(votedPlayerName);
      if (!target || target === name) return;
      if (!game.players.some(p => p.name === target)) return;

      game.votes[name] = target;

      const currentVotes = {};
      game.players.forEach(p => {
        currentVotes[p.name] = 0;
      });
      Object.values(game.votes).forEach(voted => {
        if (Object.prototype.hasOwnProperty.call(currentVotes, voted)) {
          currentVotes[voted] += 1;
        }
      });

      io.to(room).emit('voteUpdate', currentVotes);
      markRoomsDirty();
    });

    socket.on('lockVote', () => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;
      const game = roomData.gameState;
      if (!game || game.activePhase !== 'VOTING') return;

      game.voteLocks[name] = true;

      const allLocked = game.players.every(p => game.voteLocks[p.name] === true);
      if (allLocked) {
        clearTimeout(voteTimeouts[room]);
        if (!game.voteTallyStarted) {
          const fetchQueue = {};
          game.players.forEach((playerEntry) => {
            fetchQueue[playerEntry.name] = Array.isArray(playerEntry.team) ? [...playerEntry.team] : [];
          });

          game.voteTallyStarted = true;
          io.to(room).emit('voteTallying', {
            trigger: 'all_locked',
            settleDelayMs: 1200,
            fetchQueue
          });
          setTimeout(() => tallyResults(io, room), 1200);
        }
      } else {
        io.to(room).emit('voteLockUpdate', {
          lockedPlayers: Object.keys(game.voteLocks),
          totalPlayers: game.players.length
        });
      }
      markRoomsDirty();
    });

    socket.on('evaluateRound4', async () => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;
      const game = roomData.gameState;
      if (!game || game.activePhase !== 'AI_EVALUATION') {
        socket.emit('round4EvaluationError', { message: 'Round 4 is not active.' });
        return;
      }

      if (game.round4Results && game.round4Results.payload) {
        const cachedPayload = game.round4Results.payload;
        console.log(
          `[Round4 socket] Sending cached round4Evaluated to ${name} room ${room} ` +
          `evalId=${cachedPayload && cachedPayload.evaluationId ? cachedPayload.evaluationId : 'n/a'}`
        );
        socket.emit('round4Evaluated', cachedPayload);
        return;
      }

      if (game.round4InProgress) {
        console.log(`[Round4 socket] Ignoring duplicate evaluateRound4 from ${name} in room ${room} (already in progress)`);
        return;
      }

      console.log(`🎮 Server-authoritative Round 4 evaluation requested by ${name} in room ${room}`);

      try {
        const evalStartedAt = Date.now();
        game.round4InProgress = true;
        const evaluationId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const precomputeStore = game && game.evalPrecompute && typeof game.evalPrecompute === 'object'
          ? game.evalPrecompute
          : null;
        const round4Precompute = precomputeStore && precomputeStore.round4 ? precomputeStore.round4 : null;
        let scored;
        try {
          const scoringPromise = (async () => {
            if (round4Precompute && round4Precompute.result) {
              console.log(`[Eval precompute] Reused round 4 eval for room ${room}`);
              return round4Precompute.result;
            }
            if (round4Precompute && round4Precompute.promise) {
              const result = await round4Precompute.promise;
              console.log(`[Eval precompute] Awaited in-flight round 4 eval for room ${room}`);
              return result;
            }
            return evaluateRound4FromGame(game);
          })();
          scored = await withTimeout(scoringPromise, ROUND4_EVAL_WATCHDOG_MS, 'round4_eval_watchdog');
        } catch (evalError) {
          const timedOut = evalError && evalError.code === 'ROUND4_EVAL_TIMEOUT';
          if (!timedOut || !ROUND4_TIMEOUT_FALLBACK_ENABLED) {
            throw evalError;
          }
          console.warn(
            `[Round4 socket] Evaluation watchdog timeout in room ${room}. ` +
            `Using emergency fallback payload after ${ROUND4_EVAL_WATCHDOG_MS}ms.`
          );
          scored = buildRound4EmergencyFallbackScored(
            game,
            evalError && evalError.message ? evalError.message : 'round4_eval_timeout'
          );
        }

        if (!game.round4Applied) {
          game.players.forEach(p => {
            const earned = scored.roundPoints[p.name] || 0;
            p.roundScores[3] = earned;
            p.totalScore += earned;
          });
          game.round4Applied = true;
        }

        const leaderboardData = [...game.players]
          .sort((a, b) => b.totalScore - a.totalScore)
          .map(p => ({
            name: p.name,
            score: p.totalScore,
            roundScore: scored.roundPoints[p.name] || 0,
            breakdown: scored.pointBreakdown[p.name] || []
          }));

        const roundPointEntries = Object.entries(scored.roundPoints);
        const maxRoundPoints = roundPointEntries.length
          ? Math.max(...roundPointEntries.map(([, pts]) => pts))
          : 0;

        const tiedTeams = roundPointEntries
          .filter(([, pts]) => pts === maxRoundPoints)
          .map(([playerName]) => playerName);

        const isTie = tiedTeams.length > 1;
        const roundWinner = tiedTeams[0] || null;

        game.results[3] = {
          winner: roundWinner,
          isTie,
          tiedPlayers: tiedTeams,
          scenario: scored.scenario,
          twist: scored.twist,
          leaderboard: leaderboardData
        };

        const totalScoreByPlayer = game.players.reduce((acc, player) => {
          acc[player.name] = Number(player.totalScore) || 0;
          return acc;
        }, {});

        const evalLeaderboard = scored.finalLeaderboard.map((teamRow) => {
          const sourcePlayer = game.players.find((player) => player.name === teamRow.playerName);
          const fastestLockMs = sourcePlayer
            && Number.isFinite(Number(sourcePlayer.fastestDraftLockMs))
            && Number(sourcePlayer.fastestDraftLockMs) > 0
            ? Math.max(0, Math.round(Number(sourcePlayer.fastestDraftLockMs)))
            : null;
          const round4Points = Number(teamRow.round4Points) || 0;
          const totalScore = Number(totalScoreByPlayer[teamRow.playerName]) || round4Points;
          return {
            playerName: teamRow.playerName,
            totalOVR: typeof teamRow.totalOVR === 'number' ? teamRow.totalOVR : 0,
            cumulativeOVR: typeof teamRow.cumulativeOVR === 'number' ? teamRow.cumulativeOVR : 0,
            averageOVR: typeof teamRow.averageOVR === 'number' ? teamRow.averageOVR : 0,
            chemistryBonus: typeof teamRow.chemistryBonus === 'number' ? teamRow.chemistryBonus : 0,
            topPick: teamRow.topPick || 'N/A',
            topPickImageUrl: teamRow.topPickImageUrl || null,
            fastestLockMs,
            round4Points,
            totalScore,
            previousTotalScore: totalScore - round4Points
          };
        });

        const revealTimeline = {
          startAtMs: Date.now() + 2200,
          initialDelayMs: 2200,
          stepIntervalMs: 1950,
          dockDurationMs: 980,
          finalResultsDelayMs: 1900
        };

        const payload = {
          evaluationId,
          scenario: game.currentScenario,
          twist: game.currentTwist,
          lockedCategory: game.lockedCategory || null,
          allTeamEvaluations: scored.teamEvaluations,
          finalLeaderboard: evalLeaderboard,
          categoryImpactSummary: scored.categoryImpactSummary || null,
          revealTimeline,
          isTie,
          tiedPlayers: tiedTeams,
          voiceCues: buildRound4EvaluatedVoiceCues({
            evaluationId,
            isTie
          })
        };

        const categorySummary = scored && scored.categoryImpactSummary && typeof scored.categoryImpactSummary === 'object'
          ? scored.categoryImpactSummary
          : null;
        if (categorySummary && categorySummary.active === true) {
          const telemetry = ensureCategoryTelemetry(roomData);
          if (telemetry) {
            const impact = telemetry.round4CategoryImpact && typeof telemetry.round4CategoryImpact === 'object'
              ? telemetry.round4CategoryImpact
              : { matches: 0, sampleCount: 0, avgCategoryFit: 0, avgNetImpact: 0 };
            const nextMatches = (Number(impact.matches) || 0) + 1;
            const incomingSamples = Math.max(0, Number(categorySummary.sampleCount) || 0);
            impact.sampleCount = (Number(impact.sampleCount) || 0) + incomingSamples;
            impact.avgCategoryFit = Number((((Number(impact.avgCategoryFit) || 0) * (nextMatches - 1) + (Number(categorySummary.avgCategoryFit) || 0)) / nextMatches).toFixed(2));
            impact.avgNetImpact = Number((((Number(impact.avgNetImpact) || 0) * (nextMatches - 1) + (Number(categorySummary.avgNetImpact) || 0)) / nextMatches).toFixed(2));
            impact.matches = nextMatches;
            telemetry.round4CategoryImpact = impact;
          }
        }

        game.round4Results = {
          evaluationId,
          payload,
          winner: roundWinner,
          isTie,
          tiedPlayers: tiedTeams,
          roundPoints: scored.roundPoints,
          pointBreakdown: scored.pointBreakdown,
          leaderboardData,
          finalResultsGateStartedAtMs: 0
        };
        game.finalResultsGateStartedAtMs = 0;
        game.finalResultsFailSafeTimersArmed = false;

        const totalTeams = Object.keys(scored.teamEvaluations || {}).length;
        const totalEntries = Object.values(scored.teamEvaluations || {}).reduce((sum, team) => (
          sum + (Array.isArray(team && team.evaluations) ? team.evaluations.length : 0)
        ), 0);
        console.log(
          `[Round4 socket] Emitting round4Evaluated to room ${room} evalId=${evaluationId}` +
          ` teams=${totalTeams} entries=${totalEntries} tie=${isTie ? 'yes' : 'no'}` +
          ` in ${Math.max(0, Date.now() - evalStartedAt)}ms`
        );
        await emitRoomEventWithVoiceCuePrewarm(io, room, 'round4Evaluated', payload, { timeoutMs: 2200 });
      } catch (error) {
        console.error('❌ Round 4 evaluation error:', error);
        socket.emit('round4EvaluationError', { message: 'Failed to evaluate Round 4 teams.' });
      } finally {
        if (game) game.round4InProgress = false;
        markRoomsDirty();
      }
    });

    socket.on('requestFinalResults', () => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;
      const game = roomData.gameState;
      if (!game || !game.round4Results) return;

      const eligiblePlayers = getEligibleFinalPlayers(roomData, game);
      if (!eligiblePlayers.includes(name)) return;

      game.finalResultsReady = game.finalResultsReady || {};
      game.finalResultsReady[name] = true;
      if (!Number(game.finalResultsGateStartedAtMs)) {
        game.finalResultsGateStartedAtMs = Date.now();
        armFinalResultsFailSafeTimers(io, room, game);
      }

      updateFinalResultsWaiting(io, room, roomData, game);
      markRoomsDirty();
    });

    socket.on('playAgain', () => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, roomData } = joined;
      const priorPackId = roomData && roomData.gameState && roomData.gameState.packMeta
        ? roomData.gameState.packMeta.id
        : (roomData && roomData.settings ? roomData.settings.contentPackId : 'default');
      recordPackRematch(priorPackId);
      roomData.gameState = null;
      roomData.isGameActive = false;
      roomData.players.forEach(p => {
        p.ready = false;
      });
      roomData.messages = [];
      clearCategoryVoteState(roomData);
      const resetKeys = resetRoomSettingsToDefaults(roomData);

      emitRoomData(io, room, roomData);
      if (resetKeys.length) {
        emitSettingsSync(io, room, roomData, {
          changedKeys: resetKeys,
          changedBy: 'system',
          system: true,
          summary: 'Match complete: settings reset to defaults.'
        });
      }
      markRoomsDirty();
    });

    socket.on('disconnect', () => {
      const room = socket.data.room;
      const name = socket.data.name;
      if (!room || !name) return;

      const roomData = getRoomData(room);
      if (!roomData) return;

      if (roomData.categoryVoteState && roomData.categoryVoteState.active === true) {
        if (roomData.categoryVoteState.votesByPlayer && typeof roomData.categoryVoteState.votesByPlayer === 'object') {
          delete roomData.categoryVoteState.votesByPlayer[name];
        }
      }

      roomData.players = roomData.players.filter(p => p.name !== name);

      if (roomData.categoryVoteState && roomData.categoryVoteState.active === true) {
        if (!roomData.players.length) {
          clearCategoryVoteState(roomData);
        } else {
          io.to(room).emit('categoryVoteUpdate', getCategoryVotePublicState(roomData));
          const livePlayers = roomData.players.length;
          const voteCount = Object.keys(roomData.categoryVoteState.votesByPlayer || {}).length;
          if (voteCount >= livePlayers) {
            const finalized = finalizeCategoryVote(io, room, roomData, 'disconnect_rebalance');
            if (finalized && finalized.pendingGameStart) {
              const telemetry = ensureCategoryTelemetry(roomData);
              if (telemetry) {
                telemetry.startResumedAfterVote = (Number(telemetry.startResumedAfterVote) || 0) + 1;
              }
              startGame(io, room);
            }
          }
        }
      }

      if (roomData.gameState && Array.isArray(roomData.gameState.players)) {
        roomData.gameState.players = roomData.gameState.players.filter(p => p.name !== name);
      }

      if (roomData.gameState && roomData.gameState.evalPrecompute) {
        roomData.gameState.evalPrecompute = { rounds: {}, round4: null };
      }

      if (roomData.gameState) {
        updateFinalResultsWaiting(io, room, roomData, roomData.gameState);
      }

      if (roomData.host === name && roomData.players.length > 0) {
        roomData.host = roomData.players[0].name;
      }

      if (roomData.players.length === 0) {
        clearCategoryVoteState(roomData);
        delete rooms[room];
      } else {
        emitRoomData(io, room, roomData);
      }

      console.log(`${name} left room ${room}`);
      markRoomsDirty();
    });
  });
}

module.exports = registerSocketHandlers;
