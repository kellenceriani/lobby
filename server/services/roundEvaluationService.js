const { evaluateCharacter, evaluateCharactersBatch } = require('./entryEvaluationService');

const {
  summarizeContextDiagnostics,
  formatTopCounts,
  formatSourceDiagnostics,
  formatOwnerDiagnostics,
  formatTitleDiffDiagnostics,
  formatQualityGates,
  formatValidationDiagnostics,
  formatScalingDiagnostics
} = require('./evaluation/diagnostics/telemetry');

const INTEL_TELEMETRY_VERBOSE = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.INTEL_TELEMETRY_VERBOSE || '').toLowerCase()
);

const ROUND_INTEL_TUNING = {
  relevanceWeight: 1.35,
  adaptabilityWeight: 1.1,
  confidenceWeight: 6,
  trustedRatioWeight: 3,
  ovrTierHighBonus: 1,
  ovrTierEliteBonus: 2,
  maxIntelBonus: 12
};

const ROUND_INTEL_PLAYER_CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.ROUND_INTEL_PLAYER_CONCURRENCY) || 2));
const ROUND_INTEL_ENTRY_CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.ROUND_INTEL_ENTRY_CONCURRENCY) || 2));
const ROUND_EVAL_QUALITY_MODE = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.ROUND_EVAL_QUALITY_MODE || 'false').toLowerCase()
);
const ROUND_FAST_RESOLVE_TIMEOUT_MS = Math.max(450, Number(process.env.ROUND_FAST_RESOLVE_TIMEOUT_MS) || 900);
const ROUND_FAST_ALIAS_TIMEOUT_MS = Math.max(250, Number(process.env.ROUND_FAST_ALIAS_TIMEOUT_MS) || 380);
const ROUND_QUALITY_RESOLVE_TIMEOUT_MS = Math.max(1200, Number(process.env.ROUND_QUALITY_RESOLVE_TIMEOUT_MS) || 2600);
const ROUND_QUALITY_ALIAS_TIMEOUT_MS = Math.max(350, Number(process.env.ROUND_QUALITY_ALIAS_TIMEOUT_MS) || 900);
const ROUND_QUALITY_IMAGE_BACKFILL_TIMEOUT_MS = Math.max(550, Number(process.env.ROUND_QUALITY_IMAGE_BACKFILL_TIMEOUT_MS) || 1250);
const ROUND_QUALITY_IMAGE_BACKFILL_BUDGET_MS = Math.max(700, Number(process.env.ROUND_QUALITY_IMAGE_BACKFILL_BUDGET_MS) || 1500);
const ROUND_QUALITY_MAX_BACKFILL_QUERIES = Math.max(3, Number(process.env.ROUND_QUALITY_MAX_BACKFILL_QUERIES) || 6);

async function mapWithConcurrency(items, concurrency, mapper) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeConcurrency = Math.max(1, Math.min(concurrency || 1, safeItems.length || 1));
  const results = new Array(safeItems.length);
  let index = 0;

  async function worker() {
    while (index < safeItems.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(safeItems[current], current);
    }
  }

  await Promise.all(Array.from({ length: safeConcurrency }, () => worker()));
  return results;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildIntelSummary(evaluations) {
  const safeEvals = Array.isArray(evaluations) ? evaluations : [];
  if (!safeEvals.length) {
    return {
      averageScore: 0,
      averageOVR: 0,
      averageRelevance: 0,
      averageAdaptability: 0,
      averageConfidence: 0,
      trustedCount: 0
    };
  }

  const sums = safeEvals.reduce((acc, entry) => {
    acc.score += Number(entry && entry.score) || 0;
    acc.ovr += Number(entry && entry.ovr) || 0;
    acc.relevance += Number(entry && entry.scoreMeta && entry.scoreMeta.relevancePoints) || 0;
    acc.adaptability += Number(entry && entry.scoreMeta && entry.scoreMeta.draftedFitTotal) || 0;
    acc.confidence += Number(entry && entry.scoreMeta && entry.scoreMeta.infoConfidence) || 0;
    acc.fetchMs += Number(entry && entry.scoreMeta && entry.scoreMeta.fetchDurationMs) || 0;
    if (entry && entry.scoreMeta && entry.scoreMeta.trustedInfo) acc.trusted += 1;
    return acc;
  }, { score: 0, ovr: 0, relevance: 0, adaptability: 0, confidence: 0, fetchMs: 0, trusted: 0 });

  const count = safeEvals.length;
  return {
    averageScore: Number((sums.score / count).toFixed(2)),
    averageOVR: Number((sums.ovr / count).toFixed(2)),
    averageRelevance: Number((sums.relevance / count).toFixed(2)),
    averageAdaptability: Number((sums.adaptability / count).toFixed(2)),
    averageConfidence: Number((sums.confidence / count).toFixed(3)),
    averageFetchDurationMs: Number((sums.fetchMs / count).toFixed(1)),
    trustedCount: sums.trusted
  };
}

function calculateIntelRoundBonus(summary) {
  const relevanceContribution = summary.averageRelevance * ROUND_INTEL_TUNING.relevanceWeight;
  const adaptabilityContribution = summary.averageAdaptability * ROUND_INTEL_TUNING.adaptabilityWeight;
  const confidenceContribution = summary.averageConfidence * ROUND_INTEL_TUNING.confidenceWeight;
  const trustedRatio = summary.trustedCount > 0 ? (summary.trustedCount / 2) : 0;
  const trustedRatioContribution = trustedRatio * ROUND_INTEL_TUNING.trustedRatioWeight;
  const ovrContribution = summary.averageOVR >= 90
    ? ROUND_INTEL_TUNING.ovrTierEliteBonus
    : summary.averageOVR >= 82
      ? ROUND_INTEL_TUNING.ovrTierHighBonus
      : 0;

  const rawBonus = relevanceContribution
    + adaptabilityContribution
    + confidenceContribution
    + trustedRatioContribution
    + ovrContribution;

  return clamp(Math.round(rawBonus), 0, ROUND_INTEL_TUNING.maxIntelBonus);
}

function buildFailedEvaluation(character) {
  return {
    character,
    emotion: 'neutral',
    score: 4,
    ovr: 56,
    reason: 'Evaluation fallback',
    notes: ['Fallback score used due to temporary evaluation failure.'],
    scoreMeta: {
      relevancePoints: 0,
      draftedFitTotal: 0,
      draftedScenarioBonus: 0,
      draftedTwistBonus: 0,
      infoConfidence: 0,
      trustedInfo: false,
      fetchDurationMs: 0
    }
  };
}

function buildRoundEvalOptions({ character, roster, draftMeta, scenario, twist, roundIndex, categoryContext }) {
  const draftedMeta = (Array.isArray(draftMeta) ? draftMeta : []).find((entry) =>
    entry && entry.character && String(entry.character).toLowerCase() === String(character).toLowerCase()
  );

  const base = {
    originalScenario: draftedMeta && draftedMeta.originalScenario ? draftedMeta.originalScenario : scenario,
    originalTwist: draftedMeta && draftedMeta.originalTwist ? draftedMeta.originalTwist : twist,
    evaluationMode: 'round',
    categoryContext: categoryContext || null,
    fastRoundMode: true,
    roundQualityPass: false,
    roundResolveTimeoutMs: ROUND_FAST_RESOLVE_TIMEOUT_MS,
    roundAliasOverrideTimeoutMs: ROUND_FAST_ALIAS_TIMEOUT_MS,
    skipImageEnrichment: true,
    skipImageBackfill: true,
    skipSyntheticImageUpgrade: true,
    skipExternalFactEnrichment: true,
    teamPool: Array.isArray(roster) ? roster : [],
    fetchContext: {
      scenario,
      twist,
      originalScenario: draftedMeta && draftedMeta.originalScenario ? draftedMeta.originalScenario : scenario,
      originalTwist: draftedMeta && draftedMeta.originalTwist ? draftedMeta.originalTwist : twist,
      draftedRound: (roundIndex || 0) + 1
    }
  };

  if (!ROUND_EVAL_QUALITY_MODE) return base;
  return {
    ...base,
    fastRoundMode: false,
    roundQualityPass: true,
    skipExternalFactEnrichment: false,
    roundResolveTimeoutMs: ROUND_QUALITY_RESOLVE_TIMEOUT_MS,
    roundAliasOverrideTimeoutMs: ROUND_QUALITY_ALIAS_TIMEOUT_MS,
    skipImageEnrichment: false,
    skipImageBackfill: false,
    skipSyntheticImageUpgrade: false,
    imageBackfillTimeoutMs: ROUND_QUALITY_IMAGE_BACKFILL_TIMEOUT_MS,
    imageBackfillBudgetMs: ROUND_QUALITY_IMAGE_BACKFILL_BUDGET_MS,
    maxImageBackfillQueries: ROUND_QUALITY_MAX_BACKFILL_QUERIES
  };
}

async function evaluatePlayerRoster({
  player,
  roster,
  draftMeta,
  scenario,
  twist,
  roundIndex,
  roundPool,
  categoryContext,
  onCharacterEvaluated
}) {
  const batchRows = roster.map((character) => ({
    character,
    scenario,
    twist,
    options: {
      ...buildRoundEvalOptions({ character, roster, draftMeta, scenario, twist, roundIndex, categoryContext }),
      roundPool
    }
  }));

  try {
    const batchResults = await evaluateCharactersBatch(batchRows, { concurrency: ROUND_INTEL_ENTRY_CONCURRENCY });
    return batchResults.map((entry, index) => {
      const character = roster[index];
      const success = Boolean(entry && typeof entry === 'object' && entry.character);
      if (onCharacterEvaluated) {
        onCharacterEvaluated({ playerName: player.name, character, success });
      }
      if (success) return entry;
      console.warn(`Round ${roundIndex + 1} character evaluation fallback for "${character}": invalid batch result`);
      return buildFailedEvaluation(character);
    });
  } catch (error) {
    console.warn(`Round ${roundIndex + 1} batch evaluation failed for "${player.name}": ${error && error.message ? error.message : 'unknown error'}`);
    return mapWithConcurrency(roster, ROUND_INTEL_ENTRY_CONCURRENCY, async (character) => {
      try {
        const evaluated = await evaluateCharacter(character, scenario, twist, {
          ...buildRoundEvalOptions({ character, roster, draftMeta, scenario, twist, roundIndex, categoryContext }),
          roundPool
        });
        if (onCharacterEvaluated) {
          onCharacterEvaluated({ playerName: player.name, character, success: true });
        }
        return evaluated;
      } catch (itemError) {
        console.warn(`Round ${roundIndex + 1} character evaluation fallback for "${character}": ${itemError && itemError.message ? itemError.message : 'unknown error'}`);
        if (onCharacterEvaluated) {
          onCharacterEvaluated({ playerName: player.name, character, success: false });
        }
        return buildFailedEvaluation(character);
      }
    });
  }
}

async function evaluateRoundFromGame(game, roundIndex, options = {}) {
  const onCharacterEvaluated = options && typeof options.onCharacterEvaluated === 'function'
    ? options.onCharacterEvaluated
    : null;
  const scenario = game.currentScenario || (game.scenarios[roundIndex] && game.scenarios[roundIndex].scenario) || '';
  const twist = game.currentTwist || 'NO PLOT TWIST';

  const playerEvaluations = {};
  const intelBonuses = {};
  const intelBreakdown = {};
  const telemetryRows = [];
  const roundPool = Array.isArray(game && game.players)
    ? game.players.flatMap((player) => (
      Array.isArray(player && player.team) ? player.team.slice(0, 2).filter(Boolean) : []
    ))
    : [];
  const categoryContext = game && game.lockedCategory && game.lockedCategory.id
    ? {
      enabled: true,
      id: String(game.lockedCategory.id),
      name: String(game.lockedCategory.displayName || game.lockedCategory.id),
      family: String(game.lockedCategory.family || 'unknown'),
      version: String(game && game.settings && game.settings.categoryVersion || game.lockedCategory.version || 'v1')
    }
    : {
      enabled: false,
      id: null,
      name: null,
      family: null,
      version: String(game && game.settings && game.settings.categoryVersion || 'v1')
    };

  await mapWithConcurrency(game.players, ROUND_INTEL_PLAYER_CONCURRENCY, async (player) => {
    const roster = Array.isArray(player.team) ? player.team.slice(0, 2) : [];
    const draftMeta = Array.isArray(game.draftEntries[player.name]) ? game.draftEntries[player.name] : [];

    const evaluations = await evaluatePlayerRoster({
      player,
      roster,
      draftMeta,
      scenario,
      twist,
      roundIndex,
      roundPool,
      categoryContext,
      onCharacterEvaluated
    });

    const summary = buildIntelSummary(evaluations);
    const bonus = calculateIntelRoundBonus(summary);

    playerEvaluations[player.name] = {
      evaluations,
      summary
    };
    intelBonuses[player.name] = bonus;
    intelBreakdown[player.name] = [
      `Round Intel Bonus: +${bonus}`,
      `Avg Relevance: ${summary.averageRelevance.toFixed(2)} | Avg Adaptability: ${summary.averageAdaptability.toFixed(2)}`,
      `Trusted Intel: ${summary.trustedCount}/${evaluations.length} | Avg Confidence: ${Math.round(summary.averageConfidence * 100)}%`
    ];

    telemetryRows.push({
      playerName: player.name,
      averageConfidence: summary.averageConfidence,
      averageFetchDurationMs: summary.averageFetchDurationMs,
      trustedCount: summary.trustedCount,
      totalEvaluations: evaluations.length
    });
  });

  const safeRows = telemetryRows.length ? telemetryRows : [];
  const avgConfidence = safeRows.length
    ? Number((safeRows.reduce((sum, row) => sum + row.averageConfidence, 0) / safeRows.length).toFixed(3))
    : 0;
  const avgFetchDurationMs = safeRows.length
    ? Number((safeRows.reduce((sum, row) => sum + row.averageFetchDurationMs, 0) / safeRows.length).toFixed(1))
    : 0;
  const trustedTotal = safeRows.reduce((sum, row) => sum + (row.trustedCount || 0), 0);
  const evalTotal = safeRows.reduce((sum, row) => sum + (row.totalEvaluations || 0), 0);

  console.log(
    `Round ${roundIndex + 1} Intel Telemetry avgConfidence=${Math.round(avgConfidence * 100)}% avgFetchMs=${avgFetchDurationMs} trusted=${trustedTotal}/${evalTotal}`
  );
  console.log(`Round ${roundIndex + 1} Prompt scenario="${scenario}" twist="${twist}"`);

  if (INTEL_TELEMETRY_VERBOSE) {
    const playerRows = safeRows
      .map((row) => `${row.playerName}: conf=${Math.round((row.averageConfidence || 0) * 100)}% fetchMs=${row.averageFetchDurationMs} trusted=${row.trustedCount}/${row.totalEvaluations}`)
      .join(' | ');
    console.log(`Round ${roundIndex + 1} Intel Telemetry Verbose ${playerRows}`);
  }

  const allEvaluations = Object.entries(playerEvaluations).flatMap(([playerName, playerData]) => (
    Array.isArray(playerData && playerData.evaluations)
      ? playerData.evaluations.map((entry) => ({ ...(entry || {}), __ownerName: playerName }))
      : []
  ));
  if (allEvaluations.length) {
    const ctxDiag = summarizeContextDiagnostics(allEvaluations, { suspiciousLimit: 6 });
    const topSources = Object.entries(ctxDiag.sources)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    console.log(
      `Round ${roundIndex + 1} Context Quality img(real/syn/none)=${ctxDiag.images.real}/${ctxDiag.images.synthetic}/${ctxDiag.images.none}` +
      ` titleDiff=${ctxDiag.counts.titleDiffers}` +
      ` lowConf=${ctxDiag.counts.lowConfidence}` +
      ` fastFallback=${ctxDiag.counts.fastFallback}` +
      ` sources=[${topSources}]`
    );
    console.log(
      `Round ${roundIndex + 1} Context Scores avgOVR=${ctxDiag.averages.ovr}` +
      ` avgScore=${ctxDiag.averages.score}` +
      ` avgBase=${ctxDiag.averages.baseAbility}` +
      ` avgSFit=${ctxDiag.averages.scenarioFit}` +
      ` avgTFit=${ctxDiag.averages.twistFit}` +
      ` avgFitDelta=${ctxDiag.averages.fitDelta}`
    );
    const topRiskFlags = formatTopCounts(ctxDiag.flags, 6);
    const topResolveSources = formatTopCounts(ctxDiag.resolutionSources, 4);
    const trippedGates = formatQualityGates(ctxDiag.qualityGates);
    console.log(
      `Round ${roundIndex + 1} Context Risk Rates syn=${ctxDiag.rates.syntheticImagePct}%` +
      ` titleDiff=${ctxDiag.rates.titleDiffPct}%` +
      ` titleDiffDanger=${ctxDiag.rates.titleDiffDangerousPct}%` +
      ` lowConf=${ctxDiag.rates.lowConfidencePct}%` +
      ` lowResolve=${ctxDiag.rates.lowResolvePct}%` +
      ` fastFallback=${ctxDiag.rates.fastFallbackPct}%` +
      ` flags=[${topRiskFlags}]` +
      ` resolveSources=[${topResolveSources}]` +
      `${trippedGates ? ` gates=[${trippedGates}]` : ''}`
    );
    const titleDiffAudit = formatTitleDiffDiagnostics(ctxDiag.titleDiffDiagnostics, { exampleLimit: 4 });
    if (titleDiffAudit) {
      console.log(`Round ${roundIndex + 1} Context TitleDiff Audit ${titleDiffAudit}`);
    }
    const sourceQuality = formatSourceDiagnostics(ctxDiag.sourceDiagnostics, 4, { includeAvgOvr: false });
    if (sourceQuality) {
      console.log(`Round ${roundIndex + 1} Context Sources Detail ${sourceQuality}`);
    }
    const ownerQuality = formatOwnerDiagnostics(ctxDiag.ownerDiagnostics, 6, { includeAvgScenarioFit: false });
    if (ownerQuality) {
      console.log(`Round ${roundIndex + 1} Context Player Quality ${ownerQuality}`);
    }
    const validationSummary = formatValidationDiagnostics(ctxDiag.validation, { reasonLimit: 4, exampleLimit: 3 });
    if (validationSummary) {
      console.log(`Round ${roundIndex + 1} Context Validation ${validationSummary}`);
    }
    const scalingAudit = formatScalingDiagnostics(ctxDiag.scaling, { exampleLimit: 3 });
    if (scalingAudit) {
      console.log(`Round ${roundIndex + 1} Context Scaling Audit ${scalingAudit}`);
    }
    if (INTEL_TELEMETRY_VERBOSE && ctxDiag.suspicious.length) {
      console.log(
        `Round ${roundIndex + 1} Context Suspects ${ctxDiag.suspicious.map((row) => (
          `${row.character}->${row.resolvedTitle || '?'} [img:${row.image} src:${row.source || '?'} conf:${Math.round(row.infoConfidence * 100)}% sf:${row.scenarioFit} tf:${row.twistFit} ba:${row.baseAbility} ovr:${row.ovr}]`
        )).join(' | ')}`
      );
    }
  }

  return {
    scenario,
    twist,
    playerEvaluations,
    intelBonuses,
    intelBreakdown
  };
}

module.exports = {
  evaluateRoundFromGame
};
