const { scoreCharacter } = require('../evaluator');
const { canonicalizeName } = require('../evaluator/core/textUtils');
const { evaluateEntryContext } = require('./evaluation/pipeline/evaluateEntryContext');
const { resolveEntryIdentity } = require('./evaluation/resolver/resolveEntryIdentity');
const { EvaluationCache } = require('./evaluation/cache/evaluationCache');

const VALID_ENGINE_MODES = new Set(['legacy', 'context_shadow', 'context']);
const CONTEXT_CACHE = new EvaluationCache(45 * 1000);
const CONTEXT_INFLIGHT = new Map();
const WARMUP_CACHE = new EvaluationCache(90 * 1000);
const WARMUP_INFLIGHT = new Map();
const RESOLUTION_SEED_CACHE = new EvaluationCache(10 * 60 * 1000);
const EVAL_WARMUP_JOIN_TIMEOUT_MS = Math.max(0, Number(process.env.EVAL_WARMUP_JOIN_TIMEOUT_MS) || 1200);
const EVAL_WARMUP_PRESEED_CONTEXT = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.EVAL_WARMUP_PRESEED_CONTEXT || 'false').toLowerCase()
);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function buildResolverSeedCacheKey(character) {
  const compact = canonicalizeName(character);
  return compact ? `seed:${compact}` : null;
}

function cacheResolverSeedForCharacter(character, seed) {
  const key = buildResolverSeedCacheKey(character);
  if (!key || !seed || typeof seed !== 'object' || !seed.scoringInfo) return;
  RESOLUTION_SEED_CACHE.set(key, cloneValue(seed));
}

function getCachedResolverSeedForCharacter(character) {
  const key = buildResolverSeedCacheKey(character);
  if (!key) return null;
  const value = RESOLUTION_SEED_CACHE.get(key);
  return value ? cloneValue(value) : null;
}

function buildResolverSeedFromResolution(character, resolution) {
  if (!resolution || typeof resolution !== 'object' || !resolution.scoringInfo) return null;
  return {
    normalizedName: resolution.normalizedName || character,
    compactName: resolution.compactName || canonicalizeName(resolution.normalizedName || character),
    infoConfidence: Number(resolution.infoConfidence) || 0,
    resolutionStatus: resolution.resolutionStatus || 'unknown',
    source: resolution.source || null,
    riskFlags: Array.isArray(resolution.riskFlags) ? resolution.riskFlags.slice(0, 12) : [],
    confidenceBand: resolution.confidenceBand || null,
    lookupMeta: resolution.lookupMeta || null,
    scoringInfo: resolution.scoringInfo || null,
    trustedInfo: Boolean(resolution.trustedInfo)
  };
}

function buildSeededOptions(character, options = {}) {
  const safeOptions = options && typeof options === 'object' ? options : {};
  if (safeOptions.forceRefresh) return safeOptions;
  if (safeOptions.resolutionSeed && typeof safeOptions.resolutionSeed === 'object') return safeOptions;
  const seed = getCachedResolverSeedForCharacter(character);
  if (!seed) return safeOptions;
  return {
    ...safeOptions,
    resolutionSeed: seed
  };
}

function getEvaluationEngineMode() {
  const raw = String(process.env.EVAL_ENGINE_MODE || 'context').trim().toLowerCase();
  return VALID_ENGINE_MODES.has(raw) ? raw : 'legacy';
}

function buildContextCacheKey(character, scenario, twist, options = {}) {
  const categoryContext = options && options.categoryContext && typeof options.categoryContext === 'object'
    ? options.categoryContext
    : null;
  return JSON.stringify({
    c: String(character || '').trim().toLowerCase(),
    s: String(scenario || '').trim().toLowerCase(),
    t: String(twist || '').trim().toLowerCase(),
    os: String(options && options.originalScenario || '').trim().toLowerCase(),
    ot: String(options && options.originalTwist || '').trim().toLowerCase(),
    mode: String(options && options.evaluationMode || 'round').trim().toLowerCase(),
    roundPool: Array.isArray(options && options.roundPool)
      ? options.roundPool.map((v) => String(v || '').trim().toLowerCase())
      : [],
    teamPool: Array.isArray(options && options.teamPool)
      ? options.teamPool.map((v) => String(v || '').trim().toLowerCase())
      : [],
    categoryId: String(categoryContext && categoryContext.id || '').trim().toLowerCase(),
    categoryVersion: String(categoryContext && categoryContext.version || '').trim().toLowerCase(),
    fastRoundMode: options && Object.prototype.hasOwnProperty.call(options, 'fastRoundMode')
      ? options.fastRoundMode === true
      : null,
    fastAliasOverride: options && Object.prototype.hasOwnProperty.call(options, 'fastAliasOverride')
      ? options.fastAliasOverride === true
      : null,
    roundQualityPass: options && Object.prototype.hasOwnProperty.call(options, 'roundQualityPass')
      ? options.roundQualityPass === true
      : null,
    skipImageEnrichment: options && Object.prototype.hasOwnProperty.call(options, 'skipImageEnrichment')
      ? options.skipImageEnrichment === true
      : null,
    skipImageBackfill: options && Object.prototype.hasOwnProperty.call(options, 'skipImageBackfill')
      ? options.skipImageBackfill === true
      : null,
    skipSyntheticImageUpgrade: options && Object.prototype.hasOwnProperty.call(options, 'skipSyntheticImageUpgrade')
      ? options.skipSyntheticImageUpgrade === true
      : null,
    skipExternalFactEnrichment: options && Object.prototype.hasOwnProperty.call(options, 'skipExternalFactEnrichment')
      ? options.skipExternalFactEnrichment === true
      : null,
    roundResolveTimeoutMs: Number(options && options.roundResolveTimeoutMs) || 0,
    roundAliasOverrideTimeoutMs: Number(options && options.roundAliasOverrideTimeoutMs) || 0,
    imageBackfillTimeoutMs: Number(options && options.imageBackfillTimeoutMs) || 0,
    imageBackfillBudgetMs: Number(options && options.imageBackfillBudgetMs) || 0,
    maxImageBackfillQueries: Number(options && options.maxImageBackfillQueries) || 0,
    externalFactTimeoutMs: Number(options && options.externalFactTimeoutMs) || 0
  });
}

function withEngineMeta(result, {
  mode,
  engine = 'rules-context-baseline',
  path = 'legacy_rules'
} = {}) {
  if (!result || typeof result !== 'object') return result;
  const scoreMeta = result.scoreMeta && typeof result.scoreMeta === 'object'
    ? result.scoreMeta
    : {};
  result.evaluationPath = result.evaluationPath || path;
  result.scoreMeta = {
    ...scoreMeta,
    evaluationEngine: engine,
    evaluationEngineMode: mode
  };
  return result;
}

function attachContextShadow(legacyResult, contextOutcome) {
  if (!legacyResult || typeof legacyResult !== 'object') return legacyResult;
  const shadowResult = contextOutcome && contextOutcome.publicResult ? contextOutcome.publicResult : null;
  const scoreMeta = legacyResult.scoreMeta && typeof legacyResult.scoreMeta === 'object'
    ? legacyResult.scoreMeta
    : {};

  if (!shadowResult) {
    legacyResult.scoreMeta = {
      ...scoreMeta,
      contextShadow: {
        ok: false,
        error: contextOutcome && contextOutcome.error ? contextOutcome.error.message : 'Context Engine shadow failed'
      }
    };
    if (legacyResult.breakdown && typeof legacyResult.breakdown === 'object') {
      legacyResult.breakdown.characterSummary = `Shadow CE failed. ${legacyResult.breakdown.characterSummary || ''}`.trim();
    }
    return legacyResult;
  }

  const legacyScore = Number(legacyResult.score) || 0;
  const legacyOVR = Number(legacyResult.ovr) || 0;
  const shadowScore = Number(shadowResult.score) || 0;
  const shadowOVR = Number(shadowResult.ovr) || 0;
  const deltaScore = shadowScore - legacyScore;
  const deltaOVR = shadowOVR - legacyOVR;
  const contextMeta = shadowResult.scoreMeta && typeof shadowResult.scoreMeta === 'object'
    ? shadowResult.scoreMeta
    : {};

  legacyResult.scoreMeta = {
    ...scoreMeta,
    contextShadow: {
      ok: true,
      score: shadowScore,
      ovr: shadowOVR,
      deltaScore,
      deltaOVR,
      confidence: Number(contextMeta.infoConfidence) || 0,
      resolverConfidence: Number(contextMeta.resolverConfidence) || 0,
      contextFitConfidence: Number(contextMeta.contextFitConfidence) || 0,
      status: contextMeta.contextExplainability && contextMeta.contextExplainability.status
        ? contextMeta.contextExplainability.status
        : 'unknown',
      matchedTraits: contextMeta.contextSignals && Array.isArray(contextMeta.contextSignals.matchedTraits)
        ? contextMeta.contextSignals.matchedTraits.slice(0, 6)
        : [],
      riskFlags: contextMeta.contextSignals && Array.isArray(contextMeta.contextSignals.riskFlags)
        ? contextMeta.contextSignals.riskFlags.slice(0, 6)
        : []
    }
  };

  if (legacyResult.breakdown && typeof legacyResult.breakdown === 'object') {
    const shadow = legacyResult.scoreMeta.contextShadow;
    const summary = [
      `CE Shadow ${shadow.status}`,
      `Score ${shadow.score} (${deltaScore >= 0 ? '+' : ''}${deltaScore})`,
      `OVR ${shadow.ovr} (${deltaOVR >= 0 ? '+' : ''}${deltaOVR})`,
      `Conf ${Math.round((shadow.confidence || 0) * 100)}%`
    ].join(' | ');
    legacyResult.breakdown.characterSummary = `${summary}. ${legacyResult.breakdown.characterSummary || ''}`.trim();
    if (Array.isArray(legacyResult.breakdown.scoreBreakdown)) {
      legacyResult.breakdown.scoreBreakdown = [
        {
          step: 'Context Shadow',
          points: 0,
          description: summary
        },
        ...legacyResult.breakdown.scoreBreakdown
      ];
    }
  }

  return legacyResult;
}

function decorateContextResult(result, mode) {
  if (!result || typeof result !== 'object') return result;
  return withEngineMeta(result, {
    mode,
    engine: 'rules-context-v1',
    path: 'context_engine'
  });
}

async function runContextEngine(character, scenario, twist, options = {}) {
  const cacheable = !Boolean(options && options.forceRefresh);
  const cacheKey = cacheable ? buildContextCacheKey(character, scenario, twist, options) : null;

  if (cacheKey) {
    const cached = CONTEXT_CACHE.get(cacheKey);
    if (cached) return cloneValue(cached);
    if (CONTEXT_INFLIGHT.has(cacheKey)) {
      const inflight = await CONTEXT_INFLIGHT.get(cacheKey);
      return cloneValue(inflight);
    }
  }

  const task = (async () => {
    const outcome = await evaluateEntryContext({
      character,
      scenario,
      twist,
      options
    });
    if (!outcome || outcome.ok !== true || !outcome.publicResult) {
      const error = new Error('Context Engine returned invalid result');
      error.code = 'CONTEXT_ENGINE_INVALID_RESULT';
      throw error;
    }
    const cachedSeed = outcome.publicResult
      && outcome.publicResult.scoreMeta
      && outcome.publicResult.scoreMeta.contextResolverSeed
      ? outcome.publicResult.scoreMeta.contextResolverSeed
      : null;
    if (cachedSeed) {
      cacheResolverSeedForCharacter(character, cachedSeed);
      if (cachedSeed.normalizedName) cacheResolverSeedForCharacter(cachedSeed.normalizedName, cachedSeed);
    }
    return outcome;
  })();

  if (cacheKey) CONTEXT_INFLIGHT.set(cacheKey, task);
  try {
    const outcome = await task;
    if (cacheKey) CONTEXT_CACHE.set(cacheKey, outcome);
    return cloneValue(outcome);
  } finally {
    if (cacheKey) CONTEXT_INFLIGHT.delete(cacheKey);
  }
}

function buildWarmupKey(character, scenario, twist, options = {}) {
  const categoryContext = options && options.categoryContext && typeof options.categoryContext === 'object'
    ? options.categoryContext
    : null;
  return JSON.stringify({
    c: String(character || '').trim().toLowerCase(),
    s: String(scenario || '').trim().toLowerCase(),
    t: String(twist || '').trim().toLowerCase(),
    m: String(options && options.evaluationMode || 'round').trim().toLowerCase(),
    pcx: options && options.precomputeContext === true ? 1 : 0,
    cid: String(categoryContext && categoryContext.id || '').trim().toLowerCase(),
    cv: String(categoryContext && categoryContext.version || '').trim().toLowerCase()
  });
}

async function awaitWarmupIfInFlight(character, scenario, twist, options = {}) {
  const key = buildWarmupKey(character, scenario, twist, options);
  if (!WARMUP_INFLIGHT.has(key)) return null;
  try {
    const inflight = WARMUP_INFLIGHT.get(key);
    if (!inflight) return null;
    const joined = EVAL_WARMUP_JOIN_TIMEOUT_MS > 0
      ? await Promise.race([
        inflight,
        new Promise((resolve) => setTimeout(() => resolve(null), EVAL_WARMUP_JOIN_TIMEOUT_MS))
      ])
      : await inflight;
    return cloneValue(joined);
  } catch (error) {
    return null;
  }
}

async function warmCharacterEvaluationCaches(character, scenario, twist, options = {}) {
  const safeCharacter = String(character || '').trim();
  if (!safeCharacter) return { ok: false, skipped: 'empty' };

  const key = buildWarmupKey(safeCharacter, scenario, twist, options);
  const cached = WARMUP_CACHE.get(key);
  if (cached) return cloneValue(cached);
  if (WARMUP_INFLIGHT.has(key)) {
    return cloneValue(await WARMUP_INFLIGHT.get(key));
  }

  const task = (async () => {
    const startedAt = Date.now();
    try {
      const warmupOptions = options && typeof options === 'object' ? { ...options } : {};
      const resolution = await resolveEntryIdentity({
        character: safeCharacter,
        scenario,
        twist,
        options: {
          ...warmupOptions,
          evaluationMode: warmupOptions && warmupOptions.evaluationMode ? warmupOptions.evaluationMode : 'round'
        }
      });
      const resolverSeed = buildResolverSeedFromResolution(safeCharacter, resolution);
      if (resolverSeed) {
        cacheResolverSeedForCharacter(safeCharacter, resolverSeed);
        if (resolverSeed.normalizedName) cacheResolverSeedForCharacter(resolverSeed.normalizedName, resolverSeed);
      }

      const shouldPreseedContext = Boolean(
        EVAL_WARMUP_PRESEED_CONTEXT
        && warmupOptions
        && warmupOptions.precomputeContext === true
        && (getEvaluationEngineMode() === 'context' || getEvaluationEngineMode() === 'context_shadow')
      );
      let contextPreseeded = false;
      let contextPreseedError = null;
      let preseedCategoryContext = null;
      if (shouldPreseedContext) {
        try {
          const contextOptions = { ...warmupOptions };
          delete contextOptions.precomputeContext;
          const seededContextOptions = buildSeededOptions(safeCharacter, {
            ...contextOptions,
            resolutionSeed: resolverSeed || contextOptions.resolutionSeed
          });
          const preseedOutcome = await runContextEngine(safeCharacter, scenario, twist, seededContextOptions);
          const publicResult = preseedOutcome && preseedOutcome.ok && preseedOutcome.publicResult
            ? preseedOutcome.publicResult
            : null;
          const categoryContext = publicResult
            && publicResult.scoreMeta
            && publicResult.scoreMeta.categoryContext
            && typeof publicResult.scoreMeta.categoryContext === 'object'
            ? publicResult.scoreMeta.categoryContext
            : null;
          if (categoryContext || publicResult) {
            preseedCategoryContext = {
              categoryFit: Number((categoryContext && categoryContext.categoryFit) || (publicResult && publicResult.categoryFit)) || 0,
              membershipConfidence: Number((categoryContext && categoryContext.membershipConfidence) || (publicResult && publicResult.categoryMembershipConfidence)) || 0,
              netImpact: Number((categoryContext && categoryContext.netImpact) || (publicResult && publicResult.categoryNetImpact)) || 0,
              categoryStatus: String(
                (categoryContext && categoryContext.categoryStatus)
                || (publicResult && publicResult.categoryStatus)
                || ''
              ).trim().toLowerCase(),
              categoryStatusLabel: String(
                (categoryContext && categoryContext.categoryStatusLabel)
                || (publicResult && publicResult.categoryStatusLabel)
                || ''
              ).trim()
            };
          }
          contextPreseeded = true;
        } catch (contextError) {
          contextPreseedError = contextError && contextError.message ? contextError.message : 'context preseed failed';
        }
      }

      const result = {
        ok: true,
        character: safeCharacter,
        fetchDurationMs: Date.now() - startedAt,
        source: resolution && resolution.source ? resolution.source : null,
        confidence: Number(resolution && resolution.infoConfidence) || 0,
        imageUrl: resolution && resolution.scoringInfo && resolution.scoringInfo.imageUrl ? resolution.scoringInfo.imageUrl : null,
        imageSynthetic: Boolean(resolution && resolution.scoringInfo && resolution.scoringInfo.imageSynthetic),
        resolverSeedReady: Boolean(resolverSeed),
        contextPreseeded,
        contextPreseedError,
        categoryFit: Number(preseedCategoryContext && preseedCategoryContext.categoryFit) || 0,
        categoryMembershipConfidence: Number(preseedCategoryContext && preseedCategoryContext.membershipConfidence) || 0,
        categoryNetImpact: Number(preseedCategoryContext && preseedCategoryContext.netImpact) || 0,
        categoryStatus: String(preseedCategoryContext && preseedCategoryContext.categoryStatus || '').trim().toLowerCase() || null,
        categoryStatusLabel: String(preseedCategoryContext && preseedCategoryContext.categoryStatusLabel || '').trim() || null
      };
      WARMUP_CACHE.set(key, result);
      return result;
    } catch (error) {
      const result = {
        ok: false,
        character: safeCharacter,
        error: error && error.message ? error.message : 'warmup failed'
      };
      WARMUP_CACHE.set(key, result, 10 * 1000);
      return result;
    }
  })();

  WARMUP_INFLIGHT.set(key, task);
  try {
    return cloneValue(await task);
  } finally {
    WARMUP_INFLIGHT.delete(key);
  }
}

async function peekCharacterEvaluationWarmup(character, scenario, twist, options = {}) {
  const safeCharacter = String(character || '').trim();
  if (!safeCharacter) return null;

  const safeOptions = options && typeof options === 'object' ? options : {};
  const key = buildWarmupKey(safeCharacter, scenario, twist, safeOptions);
  const cached = WARMUP_CACHE.get(key);
  if (cached) return cloneValue(cached);

  return awaitWarmupIfInFlight(safeCharacter, scenario, twist, safeOptions);
}

async function evaluateCharacter(character, scenario, twist, options = {}) {
  const mode = getEvaluationEngineMode();

  if (mode === 'legacy') {
    const legacyResult = await scoreCharacter(character, scenario, twist, options);
    return withEngineMeta(legacyResult, {
      mode,
      engine: 'legacy-rules-v1',
      path: 'legacy_rules'
    });
  }

  if (mode === 'context') {
    try {
      const seededOptions = buildSeededOptions(character, options);
      if (!seededOptions.resolutionSeed) {
        await awaitWarmupIfInFlight(character, scenario, twist, seededOptions);
      }
      const contextOutcome = await runContextEngine(character, scenario, twist, buildSeededOptions(character, seededOptions));
      return decorateContextResult(contextOutcome.publicResult, mode);
    } catch (error) {
      const legacyFallback = await scoreCharacter(character, scenario, twist, options);
      const decorated = withEngineMeta(legacyFallback, {
        mode,
        engine: 'legacy-rules-v1',
        path: 'context_fallback_legacy'
      });
      decorated.scoreMeta = {
        ...(decorated.scoreMeta || {}),
        contextFallbackError: error && error.message ? error.message : 'Context Engine failed'
      };
      if (decorated.breakdown && typeof decorated.breakdown === 'object') {
        decorated.breakdown.characterSummary = `Context Engine failed -> legacy fallback. ${decorated.breakdown.characterSummary || ''}`.trim();
      }
      return decorated;
    }
  }

  if (mode === 'context_shadow') {
    const [legacyResult, contextOutcome] = await Promise.all([
      scoreCharacter(character, scenario, twist, options),
      (async () => {
        const seededOptions = buildSeededOptions(character, options);
        if (!seededOptions.resolutionSeed) {
          await awaitWarmupIfInFlight(character, scenario, twist, seededOptions);
        }
        return runContextEngine(character, scenario, twist, buildSeededOptions(character, seededOptions));
      })().catch((error) => ({ ok: false, error }))
    ]);

    const decoratedLegacy = withEngineMeta(legacyResult, {
      mode,
      engine: 'legacy-rules-v1',
      path: 'legacy_rules_shadow'
    });
    attachContextShadow(decoratedLegacy, contextOutcome);
    return decoratedLegacy;
  }

  const fallbackLegacy = await scoreCharacter(character, scenario, twist, options);
  return withEngineMeta(fallbackLegacy, {
    mode: 'legacy',
    engine: 'legacy-rules-v1',
    path: 'legacy_rules'
  });
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const safe = Array.isArray(items) ? items : [];
  if (!safe.length) return [];
  const limit = clamp(Number(concurrency) || 1, 1, safe.length);
  const results = new Array(safe.length);
  let cursor = 0;

  async function worker() {
    while (cursor < safe.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(safe[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

async function evaluateCharactersBatch(entries = [], options = {}) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  if (!safeEntries.length) return [];

  const mode = getEvaluationEngineMode();
  const concurrency = clamp(Number(options && options.concurrency) || 2, 1, 8);

  if (mode === 'context') {
    const preparedEntries = await mapWithConcurrency(safeEntries, concurrency, async (entry) => {
      const row = entry || {};
      const seededOptions = buildSeededOptions(row.character, row.options || {});
      if (!seededOptions.resolutionSeed) {
        await awaitWarmupIfInFlight(row.character, row.scenario, row.twist, seededOptions);
      }
      return {
        character: row.character,
        scenario: row.scenario,
        twist: row.twist,
        options: buildSeededOptions(row.character, seededOptions)
      };
    });
    const batchOutcomes = await mapWithConcurrency(preparedEntries, concurrency, async (row) => {
      try {
        return await runContextEngine(row.character, row.scenario, row.twist, row.options || {});
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error && error.code ? error.code : 'CONTEXT_ENGINE_ERROR',
            message: error && error.message ? error.message : 'Context Engine batch item failed'
          }
        };
      }
    });

    return mapWithConcurrency(batchOutcomes, concurrency, async (outcome, index) => {
      const row = safeEntries[index] || {};
      if (outcome && outcome.ok && outcome.publicResult) {
        return decorateContextResult(outcome.publicResult, mode);
      }
      const legacyFallback = await scoreCharacter(row.character, row.scenario, row.twist, row.options || {});
      const decorated = withEngineMeta(legacyFallback, {
        mode,
        engine: 'legacy-rules-v1',
        path: 'context_fallback_legacy'
      });
      decorated.scoreMeta = {
        ...(decorated.scoreMeta || {}),
        contextFallbackError: outcome && outcome.error && outcome.error.message
          ? outcome.error.message
          : 'Context Engine batch item failed'
      };
      return decorated;
    });
  }

  return mapWithConcurrency(safeEntries, concurrency, async (entry) => {
    const row = entry || {};
    return evaluateCharacter(row.character, row.scenario, row.twist, row.options || {});
  });
}

module.exports = {
  getEvaluationEngineMode,
  evaluateCharacter,
  evaluateCharactersBatch,
  warmCharacterEvaluationCaches,
  peekCharacterEvaluationWarmup
};
