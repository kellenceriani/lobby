const express = require('express');
const http = require('http');
const path = require('path');
const compression = require('compression');
const { Server } = require('socket.io');
const { initWordCache } = require('./server/core/gameEngine');
const registerSocketHandlers = require('./server/socket/socketHandlers');
const { getPackCatalog, getPackMetricsSnapshot } = require('./server/content/packRegistry');
const { getCategoryRegistrySnapshot } = require('./server/services/categoryRegistryService');
const { resolveAudioCalloutBatch } = require('./server/services/audioCalloutResolverService');
const { createMetaStoreAdapter } = require('./server/storage/metaStoreAdapter');
const { buildIdentityService } = require('./server/services/identityService');
const { buildMetaService } = require('./server/services/metaService');
const { buildSoloEngineService } = require('./server/services/soloEngineService');
const { buildSeasonService } = require('./server/services/seasonService');
const {
  sanitizeUserId,
  validateGuestSessionCreate,
  validateAccountLink,
  validateProfilePatch,
  validateXpGrant
} = require('./server/services/metaApiValidation');
const {
  validateSoloRunStart,
  validateSoloSubmitAttempt,
  validateSoloHintRequest,
  validateSoloFinalize,
  validateSoloLeaderboardQuery
} = require('./server/services/soloApiValidation');
const {
  validateSeasonLeaderboardQuery,
  validateSeasonProfileQuery,
  validateSeasonPartyResult,
  validateSeasonMilestoneClaim,
  validateSeasonAdminOpen,
  validateSeasonAdminClose
} = require('./server/services/seasonApiValidation');
const {
  NARRATOR_VOICES,
  getAdaptiveTtsCatalogPayload,
  synthesizeAdaptiveTts
} = require('./server/services/adaptiveTtsService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
  connectTimeout: 45000,
  maxHttpBufferSize: 1e6,
  allowEIO3: true
});
const metaStoreAdapter = createMetaStoreAdapter();
const identityService = buildIdentityService({ adapter: metaStoreAdapter });
const metaService = buildMetaService({ adapter: metaStoreAdapter });
const seasonService = buildSeasonService({
  adapter: metaStoreAdapter,
  metaService
});
const soloEngineService = buildSoloEngineService({
  adapter: metaStoreAdapter,
  metaService,
  seasonService
});
const ttsNoProviderLogState = {
  lastAt: 0,
  suppressed: 0
};
const AUDIO_CALLOUT_MAX_BATCH_ENTRIES = Math.max(1, Math.min(64, Number(process.env.AUDIO_CALLOUT_MAX_BATCH_ENTRIES) || 24));
const AUDIO_CALLOUT_BATCH_DEDUPE_TTL_MS = Math.max(300, Number(process.env.AUDIO_CALLOUT_BATCH_DEDUPE_TTL_MS) || 2200);
const audioCalloutBatchInflight = new Map();

function readBooleanEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

async function runAdaptiveTtsStartupPreflight() {
  const startedAt = Date.now();
  try {
    const catalog = getAdaptiveTtsCatalogPayload();
    const providers = Array.isArray(catalog && catalog.providers) ? catalog.providers : [];
    const configuredProviders = providers.filter((provider) => provider && provider.configured === true);
    const configuredList = configuredProviders.map((provider) => `${provider.id}(${provider.label})`).join(', ');
    console.log(
      `[TTS startup] Adaptive router mode=${String(catalog && catalog.engine && catalog.engine.mode || 'unknown')}` +
      ` configuredProviders=${configuredProviders.length}` +
      `${configuredList ? ` [${configuredList}]` : ''}`
    );
    const narratorSummary = (Array.isArray(NARRATOR_VOICES) ? NARRATOR_VOICES : [])
      .map((voice) => `${String(voice && voice.id || '')}->${String(voice && (voice.edgeVoice || voice.provider) || '')}`)
      .join(' | ');
    if (narratorSummary) {
      console.log(`[TTS startup] Narrator cast ${narratorSummary}`);
    }

    if (!configuredProviders.length) {
      console.log('[TTS startup] No server TTS provider configured. Client startup will preload browser fallback voices for instant lobby previews.');
      return;
    }

    const prewarmEnabled = String(process.env.LOBBY_TTS_STARTUP_PREWARM || '1').trim().toLowerCase() !== '0';
    if (!prewarmEnabled) {
      console.log('[TTS startup] Startup prewarm disabled by LOBBY_TTS_STARTUP_PREWARM=0');
      return;
    }

    const warmSpecs = [
      { voiceId: 'bm_george', text: 'Final brief. Scenario locked.', speed: 0.9 },
      { voiceId: 'af_heart', text: 'Round begins.', speed: 1.0 },
      { voiceId: 'af_bella', text: "I'm ready!", speed: 1.08 },
      { voiceId: 'am_michael', text: 'Stay focused.', speed: 0.98 },
      { voiceId: 'bm_george', text: 'Final evaluation begins.', speed: 0.92 }
    ];
    let warmed = 0;
    for (let i = 0; i < warmSpecs.length; i += 1) {
      const spec = warmSpecs[i];
      const itemStartedAt = Date.now();
      try {
        const result = await synthesizeAdaptiveTts(spec);
        warmed += 1;
        console.log(
          `[TTS startup] Warmed ${spec.voiceId} provider=${String(result && result.providerId || 'unknown')}` +
          ` cache=${result && result.cacheHit ? 'hit' : 'miss'} ms=${Math.max(0, Date.now() - itemStartedAt)}`
        );
      } catch (error) {
        console.warn(
          `[TTS startup] Warm failed ${spec.voiceId} err=${String(error && error.message || 'unknown')}`
        );
      }
    }
    console.log(`[TTS startup] Prewarm complete warmed=${warmed}/${warmSpecs.length} elapsedMs=${Math.max(0, Date.now() - startedAt)}`);
  } catch (error) {
    console.warn(`[TTS startup] Preflight failed err=${String(error && error.message || 'unknown')}`);
  }
}

app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '256kb' }));

app.get('/api/packs', (_req, res) => {
  res.json(getPackCatalog());
});

app.get('/api/packs/metrics', (_req, res) => {
  res.json(getPackMetricsSnapshot());
});

app.get('/api/categories', (_req, res) => {
  res.json(getCategoryRegistrySnapshot());
});

app.get('/api/meta/flags', (_req, res) => {
  res.json({
    progressionEnabled: metaService.flags.progressionEnabled === true,
    achievementsEnabled: metaService.flags.achievementsEnabled === true,
    soloEngineEnabled: soloEngineService.flags.soloEnabled === true,
    seasonLayerEnabled: seasonService.flags.seasonEnabled === true,
    dualHubUiEnabled: readBooleanEnv('DUAL_HUB_UI_ENABLED', true)
  });
});

app.post('/api/identity/guest-session', (req, res) => {
  const payload = validateGuestSessionCreate(req.body || {});
  const created = identityService.createGuestSession(payload);
  const statusCode = created && created.created === true ? 201 : 200;
  res.status(statusCode).json({
    created: created && created.created === true,
    user: created ? created.user : null,
    profile: created ? created.profile : null,
    progression: created ? created.progression : null
  });
});

app.post('/api/identity/link-account', (req, res) => {
  const validated = validateAccountLink(req.body || {});
  if (!validated.ok) {
    res.status(400).json({
      error: validated.code
    });
    return;
  }

  const linked = identityService.linkGuestToAccount(validated.value);
  if (!linked || linked.ok !== true) {
    if (linked && linked.code === 'user_not_found') {
      res.status(404).json({ error: linked.code });
      return;
    }
    if (linked && linked.code === 'provider_account_already_linked') {
      res.status(409).json({ error: linked.code });
      return;
    }
    res.status(400).json({ error: linked && linked.code ? linked.code : 'account_link_failed' });
    return;
  }

  // Re-evaluate achievements after account status upgrade if achievement flag is enabled.
  if (metaService.flags.achievementsEnabled === true) {
    try {
      metaService.ensureAchievementDefinitions();
      metaService.evaluateAchievementsForUser(linked.user && linked.user.userId ? linked.user.userId : '');
    } catch (_error) {}
  }

  res.json(linked);
});

app.get('/api/meta/profile/:userId', (req, res) => {
  const userId = sanitizeUserId(req.params.userId || '');
  if (!userId) {
    res.status(400).json({ error: 'invalid_user_id' });
    return;
  }
  const bundle = metaService.getProfileBundle(userId);
  if (!bundle) {
    res.status(404).json({ error: 'user_not_found' });
    return;
  }
  res.json(bundle);
});

app.patch('/api/meta/profile/:userId', (req, res) => {
  const userId = sanitizeUserId(req.params.userId || '');
  if (!userId) {
    res.status(400).json({ error: 'invalid_user_id' });
    return;
  }
  const validated = validateProfilePatch(req.body || {});
  if (!validated.ok) {
    res.status(400).json({ error: validated.code });
    return;
  }
  const updated = metaService.updateProfile(userId, validated.value);
  if (!updated || updated.ok !== true) {
    res.status(404).json({ error: updated && updated.code ? updated.code : 'profile_update_failed' });
    return;
  }
  res.json(updated);
});

app.get('/api/meta/progression/:userId', (req, res) => {
  const userId = sanitizeUserId(req.params.userId || '');
  if (!userId) {
    res.status(400).json({ error: 'invalid_user_id' });
    return;
  }
  const bundle = metaService.getProfileBundle(userId);
  if (!bundle) {
    res.status(404).json({ error: 'user_not_found' });
    return;
  }
  res.json({
    user: bundle.user,
    progression: bundle.progression
  });
});

app.post('/api/meta/xp-grants', (req, res) => {
  const validated = validateXpGrant(req.body || {});
  if (!validated.ok) {
    res.status(400).json({ error: validated.code });
    return;
  }

  let userId = validated.value.userId;
  if (!userId && validated.value.legacyGuestName) {
    const resolved = identityService.resolveOrCreateLegacyGuest(validated.value.legacyGuestName);
    if (!resolved || resolved.ok !== true || !resolved.user || !resolved.user.userId) {
      res.status(404).json({ error: 'legacy_guest_resolve_failed' });
      return;
    }
    userId = resolved.user.userId;
  }

  const granted = metaService.grantXp({
    userId,
    grantId: validated.value.grantId,
    source: validated.value.source,
    amount: validated.value.amount,
    reason: validated.value.reason,
    metadata: validated.value.metadata,
    occurredAtMs: validated.value.occurredAtMs
  });

  if (!granted || granted.ok !== true) {
    if (granted && granted.code === 'meta_progression_disabled') {
      res.status(403).json({ error: granted.code });
      return;
    }
    if (granted && granted.code === 'user_not_found') {
      res.status(404).json({ error: granted.code });
      return;
    }
    res.status(400).json({ error: granted && granted.code ? granted.code : 'xp_grant_failed' });
    return;
  }

  res.status(granted.idempotent ? 200 : 201).json(granted);
});

app.get('/api/meta/xp-ledger/:userId', (req, res) => {
  const userId = sanitizeUserId(req.params.userId || '');
  if (!userId) {
    res.status(400).json({ error: 'invalid_user_id' });
    return;
  }
  const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
  res.json({
    userId,
    entries: metaService.listXpLedgerForUser(userId, { limit })
  });
});

app.get('/api/meta/achievements/:userId', (req, res) => {
  const userId = sanitizeUserId(req.params.userId || '');
  if (!userId) {
    res.status(400).json({ error: 'invalid_user_id' });
    return;
  }
  res.json(metaService.listAchievements(userId));
});

function mapSoloErrorToStatus(code = '') {
  const safeCode = String(code || '');
  if (!safeCode) return 400;
  if (safeCode === 'solo_engine_disabled') return 403;
  if (safeCode === 'user_not_found' || safeCode === 'run_not_found') return 404;
  if (safeCode.includes('not_active') || safeCode.includes('not_complete') || safeCode.includes('ready_to_finalize')) return 409;
  if (safeCode.includes('timestamp')) return 400;
  return 400;
}

function mapSeasonErrorToStatus(code = '') {
  const safeCode = String(code || '');
  if (!safeCode) return 400;
  if (safeCode === 'season_layer_disabled') return 403;
  if (safeCode === 'season_not_found' || safeCode === 'milestone_not_found' || safeCode === 'user_not_found') return 404;
  if (safeCode.includes('invalid') || safeCode.includes('payload')) return 400;
  if (safeCode.includes('limit') || safeCode.includes('cap') || safeCode.includes('not_eligible')) return 429;
  if (safeCode.includes('conflict') || safeCode.includes('exists') || safeCode.includes('state') || safeCode.includes('not_open')) return 409;
  return 400;
}

app.post('/api/solo/runs/start', (req, res) => {
  const validated = validateSoloRunStart(req.body || {});
  if (!validated.ok) {
    res.status(400).json({ error: validated.code });
    return;
  }
  const started = soloEngineService.startRun({
    userId: validated.value.userId,
    modeId: validated.value.modeId,
    practice: validated.value.practice,
    nowMs: Date.now()
  });
  if (!started || started.ok !== true) {
    res.status(mapSoloErrorToStatus(started && started.code)).json({
      error: started && started.code ? started.code : 'solo_start_failed'
    });
    return;
  }
  res.status(started.created === true ? 201 : 200).json(started);
});

app.post('/api/solo/runs/submit', (req, res) => {
  const validated = validateSoloSubmitAttempt(req.body || {});
  if (!validated.ok) {
    res.status(400).json({ error: validated.code });
    return;
  }
  const submitted = soloEngineService.submitAttempt({
    userId: validated.value.userId,
    runId: validated.value.runId,
    idempotencyKey: validated.value.idempotencyKey,
    picksBySlot: validated.value.entriesBySlot,
    clientSubmittedAtMs: validated.value.clientSubmittedAtMs || Date.now(),
    nowMs: Date.now()
  });
  if (!submitted || submitted.ok !== true) {
    res.status(mapSoloErrorToStatus(submitted && submitted.code)).json({
      error: submitted && submitted.code ? submitted.code : 'solo_submit_failed'
    });
    return;
  }
  res.json(submitted);
});

app.post('/api/solo/runs/hint', (req, res) => {
  const validated = validateSoloHintRequest(req.body || {});
  if (!validated.ok) {
    res.status(400).json({ error: validated.code });
    return;
  }
  const hinted = soloEngineService.requestHint({
    userId: validated.value.userId,
    runId: validated.value.runId,
    idempotencyKey: validated.value.idempotencyKey,
    clientRequestedAtMs: validated.value.clientRequestedAtMs || Date.now(),
    nowMs: Date.now()
  });
  if (!hinted || hinted.ok !== true) {
    res.status(mapSoloErrorToStatus(hinted && hinted.code)).json({
      error: hinted && hinted.code ? hinted.code : 'solo_hint_failed'
    });
    return;
  }
  res.json(hinted);
});

app.post('/api/solo/runs/finalize', (req, res) => {
  const validated = validateSoloFinalize(req.body || {});
  if (!validated.ok) {
    res.status(400).json({ error: validated.code });
    return;
  }
  const finalized = soloEngineService.finalizeRun({
    userId: validated.value.userId,
    runId: validated.value.runId,
    idempotencyKey: validated.value.idempotencyKey,
    clientFinalizedAtMs: validated.value.clientFinalizedAtMs || Date.now(),
    nowMs: Date.now()
  });
  if (!finalized || finalized.ok !== true) {
    res.status(mapSoloErrorToStatus(finalized && finalized.code)).json({
      error: finalized && finalized.code ? finalized.code : 'solo_finalize_failed'
    });
    return;
  }
  res.status(finalized.idempotent === true ? 200 : 201).json(finalized);
});

app.get('/api/solo/leaderboards/daily', (req, res) => {
  const validated = validateSoloLeaderboardQuery(req.query || {});
  if (!validated.ok) {
    res.status(400).json({ error: validated.code });
    return;
  }
  const leaderboard = soloEngineService.getDailyLeaderboard({
    modeId: validated.value.modeId,
    dateKey: validated.value.dateKey,
    limit: validated.value.limit,
    userId: validated.value.userId
  });
  if (!leaderboard || leaderboard.ok !== true) {
    res.status(400).json({ error: leaderboard && leaderboard.code ? leaderboard.code : 'solo_leaderboard_failed' });
    return;
  }
  res.json(leaderboard);
});

function isSeasonAdminAuthorized(req) {
  const configuredToken = String(process.env.SEASON_ADMIN_TOKEN || '').trim();
  if (!configuredToken) return true;
  const headerToken = String(req.headers['x-season-admin-token'] || '').trim();
  return headerToken && headerToken === configuredToken;
}

app.get('/api/seasons/active', (_req, res) => {
  const active = seasonService.getActiveSeason();
  res.json(active);
});

app.get('/api/seasons/list', (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 20));
  res.json(seasonService.listSeasons({ limit }));
});

app.get('/api/seasons/leaderboards/:trackId', (req, res) => {
  const validated = validateSeasonLeaderboardQuery({
    ...req.query,
    trackId: req.params.trackId
  });
  if (!validated.ok) {
    res.status(400).json({ error: validated.code });
    return;
  }
  const board = seasonService.getSeasonLeaderboard(validated.value);
  if (!board || board.ok !== true) {
    res.status(mapSeasonErrorToStatus(board && board.code)).json({
      error: board && board.code ? board.code : 'season_leaderboard_failed'
    });
    return;
  }
  res.json(board);
});

app.get('/api/seasons/profile/:userId', (req, res) => {
  const validated = validateSeasonProfileQuery({
    params: req.params || {},
    query: req.query || {}
  });
  if (!validated.ok) {
    res.status(400).json({ error: validated.code });
    return;
  }
  const profile = seasonService.getSeasonProfile(validated.value);
  if (!profile || profile.ok !== true) {
    res.status(mapSeasonErrorToStatus(profile && profile.code)).json({
      error: profile && profile.code ? profile.code : 'season_profile_failed'
    });
    return;
  }
  res.json(profile);
});

app.post('/api/seasons/party/results', (req, res) => {
  const validated = validateSeasonPartyResult(req.body || {});
  if (!validated.ok) {
    res.status(400).json({ error: validated.code });
    return;
  }
  const recorded = seasonService.recordPartyMatchResult(validated.value);
  if (!recorded || recorded.ok !== true) {
    res.status(mapSeasonErrorToStatus(recorded && recorded.code)).json({
      error: recorded && recorded.code ? recorded.code : 'season_party_result_failed'
    });
    return;
  }
  res.status(recorded.idempotent === true ? 200 : 201).json(recorded);
});

app.post('/api/seasons/quests/claim', (req, res) => {
  const validated = validateSeasonMilestoneClaim(req.body || {});
  if (!validated.ok) {
    res.status(400).json({ error: validated.code });
    return;
  }
  const claimed = seasonService.claimMilestoneReward(validated.value);
  if (!claimed || claimed.ok !== true) {
    res.status(mapSeasonErrorToStatus(claimed && claimed.code)).json({
      error: claimed && claimed.code ? claimed.code : 'season_milestone_claim_failed'
    });
    return;
  }
  res.status(claimed.idempotent === true ? 200 : 201).json(claimed);
});

app.post('/api/seasons/admin/open', (req, res) => {
  if (!isSeasonAdminAuthorized(req)) {
    res.status(403).json({ error: 'season_admin_unauthorized' });
    return;
  }
  const validated = validateSeasonAdminOpen(req.body || {});
  if (!validated.ok) {
    res.status(400).json({ error: validated.code });
    return;
  }
  const opened = seasonService.openSeason({
    ...validated.value,
    adminActor: 'api_admin'
  });
  if (!opened || opened.ok !== true) {
    res.status(mapSeasonErrorToStatus(opened && opened.code)).json({
      error: opened && opened.code ? opened.code : 'season_open_failed'
    });
    return;
  }
  res.status(opened.idempotent === true ? 200 : 201).json(opened);
});

app.post('/api/seasons/admin/close', (req, res) => {
  if (!isSeasonAdminAuthorized(req)) {
    res.status(403).json({ error: 'season_admin_unauthorized' });
    return;
  }
  const validated = validateSeasonAdminClose(req.body || {});
  if (!validated.ok) {
    res.status(400).json({ error: validated.code });
    return;
  }
  const closed = seasonService.closeSeason({
    ...validated.value,
    adminActor: 'api_admin'
  });
  if (!closed || closed.ok !== true) {
    res.status(mapSeasonErrorToStatus(closed && closed.code)).json({
      error: closed && closed.code ? closed.code : 'season_close_failed'
    });
    return;
  }
  res.status(closed.idempotent === true ? 200 : 201).json(closed);
});

function normalizeAudioCalloutEntry(entry = {}) {
  const safe = entry && typeof entry === 'object' ? entry : {};
  return {
    character: String(safe.character || '').trim().slice(0, 120),
    resolvedTitle: String(safe.resolvedTitle || '').trim().slice(0, 160),
    aliases: (Array.isArray(safe.aliases) ? safe.aliases : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .slice(0, 16),
    description: String(safe.description || '').trim().slice(0, 700),
    resolvedSource: String(safe.resolvedSource || '').trim().slice(0, 80),
    riskFlags: (Array.isArray(safe.riskFlags) ? safe.riskFlags : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .slice(0, 16),
    imageSynthetic: Boolean(safe.imageSynthetic),
    infoConfidence: Number(safe.infoConfidence) || 0,
    resolverConfidence: Number(safe.resolverConfidence) || 0,
    ovr: Number(safe.ovr) || 0
  };
}

function buildAudioCalloutBatchDedupeKey(entries = [], purpose = 'entry-callout') {
  const fingerprintRows = (Array.isArray(entries) ? entries : [])
    .slice(0, AUDIO_CALLOUT_MAX_BATCH_ENTRIES)
    .map((entry) => {
      const safe = normalizeAudioCalloutEntry(entry);
      return [
        safe.character.toLowerCase(),
        safe.resolvedTitle.toLowerCase(),
        safe.aliases.join('|').toLowerCase(),
        safe.description.slice(0, 180).toLowerCase(),
        safe.resolvedSource.toLowerCase(),
        safe.riskFlags.join('|').toLowerCase(),
        safe.imageSynthetic ? 1 : 0
      ];
    });
  return `${String(purpose || 'entry-callout').toLowerCase()}::${JSON.stringify(fingerprintRows)}`;
}

function pruneAudioCalloutBatchInflight() {
  const now = Date.now();
  for (const [key, state] of audioCalloutBatchInflight.entries()) {
    if (!state || Number(state.expiresAt) <= now) {
      audioCalloutBatchInflight.delete(key);
    }
  }
}

async function handleAudioCalloutResolveBatch(req, res) {
  const body = req && req.body && typeof req.body === 'object' ? req.body : {};
  const entries = Array.isArray(body.entries) ? body.entries : [];
  const normalizedEntries = entries
    .slice(0, AUDIO_CALLOUT_MAX_BATCH_ENTRIES)
    .map((entry) => normalizeAudioCalloutEntry(entry));
  const purpose = String(body.purpose || body.mode || 'entry-callout').trim().toLowerCase() || 'entry-callout';
  pruneAudioCalloutBatchInflight();
  const dedupeKey = buildAudioCalloutBatchDedupeKey(normalizedEntries, purpose);
  const now = Date.now();
  const existing = audioCalloutBatchInflight.get(dedupeKey);
  try {
    const payloadPromise = existing && existing.promise && Number(existing.expiresAt) > now
      ? existing.promise
      : resolveAudioCalloutBatch(null, normalizedEntries, { purpose });
    if (!(existing && existing.promise && Number(existing.expiresAt) > now)) {
      audioCalloutBatchInflight.set(dedupeKey, {
        promise: payloadPromise,
        expiresAt: now + AUDIO_CALLOUT_BATCH_DEDUPE_TTL_MS
      });
    }
    const payload = await payloadPromise;
    const stats = payload && payload.stats && typeof payload.stats === 'object' ? payload.stats : {};
    const speechSourceCounts = {};
    const rows = Array.isArray(payload && payload.results) ? payload.results : [];
    rows.forEach((row) => {
      const source = String(row && row.speech && row.speech.source || '').trim();
      if (!source) return;
      speechSourceCounts[source] = (speechSourceCounts[source] || 0) + 1;
    });
    const speechSourceText = Object.entries(speechSourceCounts)
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .slice(0, 6)
      .map(([source, count]) => `${source}:${count}`)
      .join('|');
    const classCounts = stats && stats.associationClassCounts && typeof stats.associationClassCounts === 'object'
      ? stats.associationClassCounts
      : {};
    const classText = Object.entries(classCounts)
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .slice(0, 6)
      .map(([classId, count]) => `${classId}:${count}`)
      .join('|');
    console.log(
      `[Audio callouts] resolve-batch req=${normalizedEntries.length}` +
      ` purpose=${purpose}` +
      ` assoc=${Number(stats.speechAssociation || stats.speechFact) || 0}` +
      ` speechQ=${Number(stats.speechQuote) || 0}` +
      ` miss=${Number(stats.misses) || 0}` +
      ` elapsedMs=${Number(stats.elapsedMs) || 0}` +
      ` cache=${payload && payload.cacheHit ? 'hit' : 'miss'}` +
      `${classText ? ` classes=[${classText}]` : ''}` +
      `${speechSourceText ? ` sources=[${speechSourceText}]` : ''}`
    );
    res.json(payload);
  } catch (error) {
    audioCalloutBatchInflight.delete(dedupeKey);
    console.warn(
      `[Audio callouts] resolve-batch failed req=${normalizedEntries.length} purpose=${purpose} error=${String(error && error.message || 'unknown')}`
    );
    res.status(500).json({
      error: 'audio_callout_resolve_failed',
      message: String(error && error.message || 'unknown error')
    });
  }
}

app.post('/api/audio-callouts/resolve-batch', handleAudioCalloutResolveBatch);
app.post('/api/audio-blurbs/resolve-batch', handleAudioCalloutResolveBatch); // legacy alias

app.get('/api/tts/catalog', (_req, res) => {
  res.json(getAdaptiveTtsCatalogPayload());
});

app.post('/api/tts/synthesize', async (req, res) => {
  const body = req && req.body && typeof req.body === 'object' ? req.body : {};
  try {
    const result = await synthesizeAdaptiveTts({
      text: body.text,
      voiceId: body.voiceId,
      speed: body.speed,
      pitch: body.pitch
    });
    const providerId = String(result && result.providerId || '');
    const attempts = Array.isArray(result && result.providerAttempts) ? result.providerAttempts : [];
    res.setHeader('Content-Type', String(result && result.mimeType || 'audio/mpeg'));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Lobby-TTS-Provider', providerId || 'unknown');
    res.setHeader('X-Lobby-TTS-Cache', result && result.cacheHit ? 'hit' : 'miss');
    res.setHeader('X-Lobby-TTS-Attempts', attempts.map((a) => `${a.providerId}:${a.ok ? 'ok' : 'fail'}`).join(',').slice(0, 512));
    res.send(result.buffer);
  } catch (error) {
    const statusCode = Math.max(400, Math.min(599, Number(error && error.statusCode) || 500));
    const attempts = Array.isArray(error && error.providerAttempts) ? error.providerAttempts : [];
    const errMessage = String(error && error.message || 'unknown');
    if (/no_tts_provider_available/i.test(errMessage)) {
      const now = Date.now();
      const throttleMs = 15000;
      if ((now - Number(ttsNoProviderLogState.lastAt || 0)) >= throttleMs) {
        const suffix = ttsNoProviderLogState.suppressed > 0
          ? ` (+${ttsNoProviderLogState.suppressed} similar suppressed)`
          : '';
        console.warn(`[TTS] synth unavailable voice=${String(body && body.voiceId || '')} err=${errMessage}${suffix}`);
        ttsNoProviderLogState.lastAt = now;
        ttsNoProviderLogState.suppressed = 0;
      } else {
        ttsNoProviderLogState.suppressed += 1;
      }
    } else {
      console.warn(`[TTS] synth failed voice=${String(body && body.voiceId || '')} err=${errMessage}`);
    }
    res.status(statusCode).json({
      error: 'tts_synthesize_failed',
      message: errMessage,
      providerAttempts: attempts
    });
  }
});

app.use('/audio', express.static(path.join(__dirname, 'audio'), {
  etag: true,
  lastModified: true,
  maxAge: '1d'
}));

app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  lastModified: true,
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    const isDev = String(process.env.NODE_ENV || 'development').toLowerCase() !== 'production';
    const lowerPath = String(filePath || '').toLowerCase();
    const isHtml = lowerPath.endsWith('.html');
    const isFrontendCode = lowerPath.endsWith('.js') || lowerPath.endsWith('.css') || lowerPath.endsWith('.webmanifest');
    if (isHtml) {
      res.setHeader('Cache-Control', 'no-cache');
      return;
    }
    if (isDev && isFrontendCode) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return;
    }
    if (isFrontendCode) {
      // Revalidate frontend code on every navigation so deploys go live immediately.
      // ETag/Last-Modified still allow cheap 304 responses when unchanged.
      res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }
}));

const PORT = process.env.PORT || 3000;

async function bootServer() {
  // Start TTS preflight first so startup logs clearly show provider readiness before/around word loading.
  const ttsPreflightPromise = runAdaptiveTtsStartupPreflight();
  // Start independent warmups immediately so word loading can overlap with TTS startup preflight.
  initWordCache();
  const metaMigrationResult = metaService.runStartupMigrations();
  const seasonMigrationResult = seasonService.runStartupMigrations();
  const soloMigrationResult = soloEngineService.runStartupMigrations();
  console.log(
    `[Meta startup] schema=v${String(metaMigrationResult.schemaVersion || 'n/a')}` +
    ` progression=${metaMigrationResult.flags && metaMigrationResult.flags.progressionEnabled ? 'on' : 'off'}` +
    ` achievements=${metaMigrationResult.flags && metaMigrationResult.flags.achievementsEnabled ? 'on' : 'off'}`
  );
  console.log(
    `[Season startup] enabled=${seasonMigrationResult.seasonEnabled ? 'on' : 'off'}` +
    ` schema=v${String(seasonMigrationResult.seasonSchemaVersion || 'n/a')}` +
    ` definitions=${Number(seasonMigrationResult.seasonDefinitionCount) || 0}` +
    ` active=${String(seasonMigrationResult.activeSeasonId || 'none')}`
  );
  console.log(
    `[Solo startup] enabled=${soloMigrationResult.soloEnabled ? 'on' : 'off'}` +
    ` schema=v${String(soloMigrationResult.soloSchemaVersion || 'n/a')}` +
    ` challengeCount=${Number(soloMigrationResult.challengeCount) || 0}`
  );
  registerSocketHandlers(io);

  try {
    await ttsPreflightPromise;
  } catch (_error) {
    // TTS preflight is best-effort; boot should continue even if provider warmup fails.
  }

  server.listen(PORT, () => {
    console.log(`LobbyWARS Server running on port ${PORT}`);
  });
}

void bootServer();
