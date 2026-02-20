const { scoreCharacter } = require('../evaluator');

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

async function mapWithConcurrency(items, concurrency, mapper) {
  const safeConcurrency = Math.max(1, Math.min(concurrency || 1, items.length || 1));
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
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
  const trustedRatio = summary.trustedCount > 0
    ? (summary.trustedCount / 2)
    : 0;
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

  await mapWithConcurrency(game.players, 2, async (player) => {
    const roster = Array.isArray(player.team) ? player.team.slice(0, 2) : [];
    const draftMeta = Array.isArray(game.draftEntries[player.name]) ? game.draftEntries[player.name] : [];

    const evaluations = await mapWithConcurrency(roster, 2, async (character) => {
      const draftedMeta = draftMeta.find((entry) =>
        entry && entry.character && String(entry.character).toLowerCase() === String(character).toLowerCase()
      );

      try {
        const evaluated = await scoreCharacter(character, scenario, twist, {
          originalScenario: draftedMeta && draftedMeta.originalScenario ? draftedMeta.originalScenario : scenario,
          originalTwist: draftedMeta && draftedMeta.originalTwist ? draftedMeta.originalTwist : twist,
          evaluationMode: 'round',
          fetchContext: {
            scenario,
            twist,
            originalScenario: draftedMeta && draftedMeta.originalScenario ? draftedMeta.originalScenario : scenario,
            originalTwist: draftedMeta && draftedMeta.originalTwist ? draftedMeta.originalTwist : twist,
            draftedRound: (roundIndex || 0) + 1
          }
        });
        if (onCharacterEvaluated) {
          onCharacterEvaluated({
            playerName: player.name,
            character,
            success: true
          });
        }
        return evaluated;
      } catch (error) {
        console.warn(`⚠️ Round ${roundIndex + 1} character evaluation fallback for "${character}": ${error && error.message ? error.message : 'unknown error'}`);
        if (onCharacterEvaluated) {
          onCharacterEvaluated({
            playerName: player.name,
            character,
            success: false
          });
        }
        return buildFailedEvaluation(character);
      }
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
    `📈 [Round ${roundIndex + 1} Intel Telemetry] avgConfidence=${Math.round(avgConfidence * 100)}% avgFetchMs=${avgFetchDurationMs} trusted=${trustedTotal}/${evalTotal}`
  );

  if (INTEL_TELEMETRY_VERBOSE) {
    const playerRows = safeRows
      .map((row) => `${row.playerName}: conf=${Math.round((row.averageConfidence || 0) * 100)}% fetchMs=${row.averageFetchDurationMs} trusted=${row.trustedCount}/${row.totalEvaluations}`)
      .join(' | ');
    console.log(`📊 [Round ${roundIndex + 1} Intel Telemetry:Verbose] ${playerRows}`);
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
