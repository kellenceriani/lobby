const { evaluateCharacter, evaluateCharactersBatch, getEvaluationEngineMode } = require('./entryEvaluationService');
const { getRandomPhrase } = require('../evaluator/presentation/phraseGenerator');
const { calculateChemistryDetails } = require('../evaluator/team/chemistryCalculator');
const { calculateRound4Points, describeRound4PointFormula } = require('./scoreScaling');
const { canonicalizeName } = require('../evaluator/core/textUtils');
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

const FINAL_REFINE_CONFIDENCE_THRESHOLD = 0.68;
const MAX_REFINE_PER_TEAM = 1;
const ROUND4_TEAM_CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.ROUND4_TEAM_CONCURRENCY) || 3));
const ROUND4_ENTRY_CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.ROUND4_ENTRY_CONCURRENCY) || 3));

function isRound4RefineEnabled() {
  const raw = process.env.ROUND4_REFINE_ENABLED;
  if (raw != null && String(raw).trim() !== '') {
    return String(raw).trim().toLowerCase() === 'true';
  }
  const mode = getEvaluationEngineMode();
  return mode === 'legacy';
}

function getInfoConfidence(evalData) {
  return Number(evalData && evalData.scoreMeta && evalData.scoreMeta.infoConfidence) || 0;
}

function shouldRefineEvaluation(evalData) {
  if (!evalData) return false;
  const confidence = getInfoConfidence(evalData);
  const trusted = Boolean(evalData && evalData.scoreMeta && evalData.scoreMeta.trustedInfo);
  return !trusted || confidence < FINAL_REFINE_CONFIDENCE_THRESHOLD;
}

function chooseBetterEvaluation(primaryEval, refinedEval) {
  if (!refinedEval) return primaryEval;
  if (!primaryEval) return refinedEval;

  const primaryConfidence = getInfoConfidence(primaryEval);
  const refinedConfidence = getInfoConfidence(refinedEval);
  const primaryTrusted = Boolean(primaryEval && primaryEval.scoreMeta && primaryEval.scoreMeta.trustedInfo);
  const refinedTrusted = Boolean(refinedEval && refinedEval.scoreMeta && refinedEval.scoreMeta.trustedInfo);

  if (refinedTrusted && !primaryTrusted) return refinedEval;
  if (!refinedTrusted && primaryTrusted) return primaryEval;

  if (refinedConfidence > primaryConfidence + 0.03) return refinedEval;
  if (primaryConfidence > refinedConfidence + 0.03) return primaryEval;

  return (Number(refinedEval.ovr) || 0) >= (Number(primaryEval.ovr) || 0)
    ? refinedEval
    : primaryEval;
}

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

function getResolverSeedForCharacter(priorResolverSeedIndex, character) {
  if (!priorResolverSeedIndex || typeof priorResolverSeedIndex.get !== 'function') return null;
  const key = canonicalizeName(character);
  if (!key) return null;
  return priorResolverSeedIndex.get(key) || null;
}

function buildPriorResolverSeedIndex(game) {
  const index = new Map();
  const rounds = Array.isArray(game && game.results) ? game.results : [];
  for (const round of rounds) {
    const teamEval = round && round.teamEvaluation && typeof round.teamEvaluation === 'object' ? round.teamEvaluation : null;
    if (!teamEval) continue;
    for (const playerData of Object.values(teamEval)) {
      const evaluations = Array.isArray(playerData && playerData.evaluations) ? playerData.evaluations : [];
      for (const evaluation of evaluations) {
        if (!evaluation || typeof evaluation !== 'object') continue;
        const scoreMeta = evaluation.scoreMeta && typeof evaluation.scoreMeta === 'object' ? evaluation.scoreMeta : null;
        const seed = scoreMeta && scoreMeta.contextResolverSeed && typeof scoreMeta.contextResolverSeed === 'object'
          ? scoreMeta.contextResolverSeed
          : null;
        if (!seed || !seed.scoringInfo) continue;
        const candidateKeys = Array.from(new Set([
          canonicalizeName(evaluation.character),
          canonicalizeName(seed.normalizedName),
          canonicalizeName(seed.compactName)
        ].filter(Boolean)));
        if (!candidateKeys.length) continue;
        const nextConfidence = Number(seed.infoConfidence) || 0;
        const nextTrusted = seed.trustedInfo === true || String(seed.resolutionStatus || '').toLowerCase() === 'trusted';

        for (const key of candidateKeys) {
          const current = index.get(key);
          if (!current) {
            index.set(key, seed);
            continue;
          }
          const currentConfidence = Number(current.infoConfidence) || 0;
          const currentTrusted = current.trustedInfo === true || String(current.resolutionStatus || '').toLowerCase() === 'trusted';
          if (nextTrusted && !currentTrusted) {
            index.set(key, seed);
            continue;
          }
          if (nextTrusted === currentTrusted && nextConfidence > currentConfidence) {
            index.set(key, seed);
          }
        }
      }
    }
  }
  return index;
}

function calculateTeamOVRWithChemistryGate(averageOVR, chemistryBonus) {
  const safeAverage = Math.max(0, Math.round(Number(averageOVR) || 0));
  const safeChemistry = Number.isFinite(Number(chemistryBonus)) ? Number(chemistryBonus) : 0;
  const rawTotal = safeAverage + safeChemistry;

  if (rawTotal <= 99) {
    return Math.max(0, Math.round(rawTotal));
  }

  const overflow = rawTotal - 99;
  const gatedOverflow = Math.round(overflow * 0.35);
  let capped = 99 + Math.max(0, gatedOverflow);

  if (safeAverage < 88 || safeChemistry < 8) {
    capped = 99;
  } else if (safeAverage < 92 || safeChemistry < 10) {
    capped = Math.min(101, capped);
  }

  return Math.max(0, Math.min(110, Math.round(capped)));
}

function buildFinalEvalOptions({ char, draftedMeta, scenario, twist, teamPool, roundPool, resolverSeed }) {
  return {
    originalScenario: draftedMeta && draftedMeta.originalScenario ? draftedMeta.originalScenario : scenario,
    originalTwist: draftedMeta && draftedMeta.originalTwist ? draftedMeta.originalTwist : twist,
    evaluationMode: 'final',
    resolutionSeed: resolverSeed || null,
    teamPool: Array.isArray(teamPool) ? teamPool : [],
    roundPool: Array.isArray(roundPool) ? roundPool : [],
    fetchContext: {
      scenario,
      twist,
      originalScenario: draftedMeta && draftedMeta.originalScenario ? draftedMeta.originalScenario : scenario,
      originalTwist: draftedMeta && draftedMeta.originalTwist ? draftedMeta.originalTwist : twist,
      draftedRound: draftedMeta && Number.isFinite(Number(draftedMeta.draftedRound))
        ? Number(draftedMeta.draftedRound)
        : null
    }
  };
}

function buildRound4FallbackEvaluation(character) {
  return {
    character,
    emotion: 'neutral',
    phrase: getRandomPhrase('neutral'),
    score: 10,
    ovr: 58,
    reason: 'Final evaluation fallback',
    notes: ['Fallback final evaluation used due to temporary error.'],
    imageUrl: null,
    scoreMeta: {
      relevancePoints: 0,
      draftedFitTotal: 0,
      draftedScenarioBonus: 0,
      draftedTwistBonus: 0,
      infoConfidence: 0,
      trustedInfo: false,
      fetchDurationMs: 0,
      evaluationEngine: 'fallback-safe-v1',
      evaluationEngineMode: String(process.env.EVAL_ENGINE_MODE || 'legacy').toLowerCase(),
      contextFallbackError: 'Round 4 evaluation fallback'
    },
    breakdown: {
      characterSummary: 'Round 4 fallback evaluation due to temporary evaluator error.',
      scoreBreakdown: [{ step: 'Fallback', points: 10, description: 'Temporary evaluation fallback used.' }],
      scenarioRelevance: 'Fallback evaluation.',
      twistRelevance: 'Fallback evaluation.',
      ovrBreakdown: {
        base: 58,
        rarityBonus: 0,
        attributeBonus: 0,
        fitMultiplier: 1,
        fitDelta: 0,
        finalOVR: 58
      }
    }
  };
}

async function evaluateTeamRoster({ playerName, roster, draftMeta, scenario, twist, roundPool, priorResolverSeedIndex }) {
  let teamRefineBudgetUsed = 0;

  const batchRows = roster.map((char) => {
    const draftedMeta = (Array.isArray(draftMeta) ? draftMeta : []).find((entry) =>
      entry && entry.character && entry.character.toLowerCase() === String(char).toLowerCase()
    );
    const resolverSeed = getResolverSeedForCharacter(priorResolverSeedIndex, char);
    return {
      character: char,
      scenario,
      twist,
      options: buildFinalEvalOptions({
        char,
        draftedMeta,
        scenario,
        twist,
        teamPool: roster,
        roundPool,
        resolverSeed
      })
    };
  });

  let evaluations;
  try {
    evaluations = await evaluateCharactersBatch(batchRows, { concurrency: ROUND4_ENTRY_CONCURRENCY });
  } catch (error) {
    console.warn(`Round 4 batch evaluation failed for "${playerName}": ${error && error.message ? error.message : 'unknown error'}`);
    evaluations = await mapWithConcurrency(roster, ROUND4_ENTRY_CONCURRENCY, async (char) => {
      const draftedMeta = (Array.isArray(draftMeta) ? draftMeta : []).find((entry) =>
        entry && entry.character && entry.character.toLowerCase() === String(char).toLowerCase()
      );
      try {
        const resolverSeed = getResolverSeedForCharacter(priorResolverSeedIndex, char);
        return await evaluateCharacter(char, scenario, twist, buildFinalEvalOptions({
          char,
          draftedMeta,
          scenario,
          twist,
          teamPool: roster,
          roundPool,
          resolverSeed
        }));
      } catch (itemError) {
        console.warn(`Round 4 character fallback for "${char}": ${itemError && itemError.message ? itemError.message : 'unknown error'}`);
        return buildRound4FallbackEvaluation(char);
      }
    });
  }

  evaluations = evaluations.map((entry, index) => {
    if (entry && typeof entry === 'object' && entry.character) return entry;
    const fallback = buildRound4FallbackEvaluation(roster[index]);
    fallback.scoreMeta.contextFallbackError = 'Invalid batch result shape';
    return fallback;
  });

  evaluations = await mapWithConcurrency(evaluations, ROUND4_ENTRY_CONCURRENCY, async (primaryEval, index) => {
    const char = roster[index];
    const draftedMeta = (Array.isArray(draftMeta) ? draftMeta : []).find((entry) =>
      entry && entry.character && entry.character.toLowerCase() === String(char).toLowerCase()
    );

    let finalEval = primaryEval;
    if (isRound4RefineEnabled() && teamRefineBudgetUsed < MAX_REFINE_PER_TEAM && shouldRefineEvaluation(primaryEval)) {
      teamRefineBudgetUsed += 1;
      try {
        const resolverSeed = getResolverSeedForCharacter(priorResolverSeedIndex, char);
        const refinedEval = await evaluateCharacter(char, scenario, twist, {
          ...buildFinalEvalOptions({
            char,
            draftedMeta,
            scenario,
            twist,
            teamPool: roster,
            roundPool,
            resolverSeed
          }),
          forceRefresh: true,
          fetchCacheTtlMs: 45000,
          fetchContext: {
            ...buildFinalEvalOptions({
              char,
              draftedMeta,
              scenario,
              twist,
              teamPool: roster,
              roundPool
            }).fetchContext,
            contextHints: ['final verification pass', 'quality recheck']
          }
        });
        finalEval = chooseBetterEvaluation(primaryEval, refinedEval);
      } catch (refineError) {
        if (finalEval && finalEval.scoreMeta) {
          finalEval.scoreMeta.finalRefineError = refineError && refineError.message ? refineError.message : 'unknown refine error';
        }
      }
    }

    if (!finalEval || typeof finalEval !== 'object') {
      finalEval = buildRound4FallbackEvaluation(char);
    }
    finalEval.phrase = getRandomPhrase(finalEval.emotion);
    return finalEval;
  });

  return evaluations;
}

async function evaluateRound4FromGame(game) {
  const scenario = game.currentScenario;
  const twist = game.currentTwist;

  const teams = game.players.map((player) => ({
    playerName: player.name,
    roster: Array.isArray(player.finalTeam) ? player.finalTeam.slice(0, 6) : [],
    draftMeta: Array.isArray(player.finalTeamDraftMeta) ? player.finalTeamDraftMeta : []
  }));
  const roundPool = teams.flatMap((team) => (Array.isArray(team.roster) ? team.roster.filter(Boolean) : []));
  const priorResolverSeedIndex = buildPriorResolverSeedIndex(game);

  const evaluatedTeams = await mapWithConcurrency(teams, ROUND4_TEAM_CONCURRENCY, async ({ playerName, roster, draftMeta }) => {
    const evaluations = await evaluateTeamRoster({
      playerName,
      roster,
      draftMeta,
      scenario,
      twist,
      roundPool,
      priorResolverSeedIndex
    });

    const chemistryInfo = calculateChemistryDetails(roster);
    const chemistryBonus = chemistryInfo.bonus;
    const cumulativeOVR = evaluations.length
      ? Math.round(evaluations.reduce((sum, entry) => sum + (Number(entry && entry.ovr) || 0), 0))
      : 0;
    const averageOVR = evaluations.length
      ? Math.round(evaluations.reduce((sum, e) => sum + (Number(e && e.ovr) || 0), 0) / evaluations.length)
      : 0;
    const teamOVR = calculateTeamOVRWithChemistryGate(averageOVR, chemistryBonus);
    const topPickEval = evaluations.reduce((best, current) => {
      if (!best || (Number(current && current.ovr) || 0) > (Number(best && best.ovr) || 0)) return current;
      return best;
    }, null);

    return {
      playerName,
      evaluations,
      teamSummary: {
        totalOVR: teamOVR,
        cumulativeOVR,
        chemistryBonus,
        chemistryDetails: chemistryInfo.details,
        chemistryRawScore: typeof chemistryInfo.rawScore === 'number' ? chemistryInfo.rawScore : null,
        chemistryBase: typeof chemistryInfo.base === 'number' ? chemistryInfo.base : null,
        averageOVR,
        topPick: topPickEval ? topPickEval.character : 'N/A',
        highestOVR: topPickEval ? topPickEval.ovr : 0,
        evaluationCount: evaluations.length
      }
    };
  });

  const teamEvaluations = {};
  const roundPoints = {};
  const pointBreakdown = {};

  evaluatedTeams.forEach(({ playerName, evaluations, teamSummary }) => {
    teamEvaluations[playerName] = { evaluations, teamSummary };
    const weightedRoundPoints = calculateRound4Points(teamSummary.totalOVR);
    const formula = describeRound4PointFormula(teamSummary.totalOVR);
    roundPoints[playerName] = weightedRoundPoints;
    pointBreakdown[playerName] = [
      `Team OVR: ${teamSummary.totalOVR}`,
      `Average OVR: ${teamSummary.averageOVR}`,
      `Chemistry Adjustment: ${teamSummary.chemistryBonus >= 0 ? '+' : ''}${teamSummary.chemistryBonus}`,
      ...(typeof teamSummary.chemistryRawScore === 'number' && typeof teamSummary.chemistryBase === 'number'
        ? [`Chemistry Raw Score: ${teamSummary.chemistryRawScore} (base ${teamSummary.chemistryBase})`]
        : []),
      `Round 4 Base (${formula.safeOVR} × 2.35): +${formula.basePoints}`,
      `Competitive Bonus (OVR > 60): +${formula.competitivePoints}`,
      `Elite Bonus (OVR > 80 curve): +${formula.elitePoints}`,
      `Round 4 Total: ${formula.totalPoints}`,
      `Top Pick: ${teamSummary.topPick}`
    ];
  });

  const finalLeaderboard = Object.entries(teamEvaluations)
    .map(([playerName, teamData]) => ({
      playerName,
      round4Points: roundPoints[playerName] || 0,
      totalOVR: teamData.teamSummary.totalOVR,
      cumulativeOVR: teamData.teamSummary.cumulativeOVR,
      averageOVR: teamData.teamSummary.averageOVR,
      chemistryBonus: teamData.teamSummary.chemistryBonus,
      topPick: teamData.teamSummary.topPick,
      topPickImageUrl: (teamData.evaluations.find((entry) => entry.character === teamData.teamSummary.topPick) || {}).imageUrl || null
    }))
    .sort((a, b) => {
      if ((b.round4Points || 0) !== (a.round4Points || 0)) return (b.round4Points || 0) - (a.round4Points || 0);
      if ((b.totalOVR || 0) !== (a.totalOVR || 0)) return (b.totalOVR || 0) - (a.totalOVR || 0);
      return String(a.playerName || '').localeCompare(String(b.playerName || ''));
    });

  const allEvaluations = Object.entries(teamEvaluations).flatMap(([playerName, team]) => (
    Array.isArray(team && team.evaluations)
      ? team.evaluations.map((entry) => ({ ...(entry || {}), __ownerName: playerName }))
      : []
  ));
  if (allEvaluations.length) {
    const seededResolverCount = allEvaluations.filter((entry) =>
      String(entry && entry.scoreMeta && entry.scoreMeta.resolverResolutionSource || '').toLowerCase() === 'seed'
    ).length;
    const zeroFetchCount = allEvaluations.filter((entry) => (Number(entry && entry.scoreMeta && entry.scoreMeta.fetchDurationMs) || 0) === 0).length;
    const avgFetchMs = Number((allEvaluations.reduce((sum, entry) => (
      sum + (Number(entry && entry.scoreMeta && entry.scoreMeta.fetchDurationMs) || 0)
    ), 0) / allEvaluations.length).toFixed(1));
    console.log(`Round 4 Context Telemetry seededResolver=${seededResolverCount}/${allEvaluations.length} zeroFetch=${zeroFetchCount}/${allEvaluations.length} avgFetchMs=${avgFetchMs}`);

    const ctxDiag = summarizeContextDiagnostics(allEvaluations, { suspiciousLimit: 8 });
    console.log(`Round 4 Context Prompt scenario="${scenario}" twist="${twist}"`);
    const topSources = Object.entries(ctxDiag.sources)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    console.log(
      `Round 4 Context Quality img(real/syn/none)=${ctxDiag.images.real}/${ctxDiag.images.synthetic}/${ctxDiag.images.none}` +
      ` titleDiff=${ctxDiag.counts.titleDiffers}` +
      ` lowConf=${ctxDiag.counts.lowConfidence}` +
      ` fastFallback=${ctxDiag.counts.fastFallback}` +
      ` sources=[${topSources}]`
    );
    console.log(
      `Round 4 Context Scores avgOVR=${ctxDiag.averages.ovr}` +
      ` avgScore=${ctxDiag.averages.score}` +
      ` avgBase=${ctxDiag.averages.baseAbility}` +
      ` avgSFit=${ctxDiag.averages.scenarioFit}` +
      ` avgTFit=${ctxDiag.averages.twistFit}` +
      ` avgFitDelta=${ctxDiag.averages.fitDelta}` +
      ` conf(resolve/context/info)=${Math.round(ctxDiag.averages.resolverConfidence * 100)}%/${Math.round(ctxDiag.averages.contextFitConfidence * 100)}%/${Math.round(ctxDiag.averages.infoConfidence * 100)}%`
    );
    const topRiskFlags = formatTopCounts(ctxDiag.flags, 8);
    const topResolveSources = formatTopCounts(ctxDiag.resolutionSources, 4);
    const trippedGates = formatQualityGates(ctxDiag.qualityGates);
    console.log(
      `Round 4 Context Risk Rates syn=${ctxDiag.rates.syntheticImagePct}%` +
      ` titleDiff=${ctxDiag.rates.titleDiffPct}%` +
      ` titleDiffDanger=${ctxDiag.rates.titleDiffDangerousPct}%` +
      ` lowConf=${ctxDiag.rates.lowConfidencePct}%` +
      ` lowResolve=${ctxDiag.rates.lowResolvePct}%` +
      ` fastFallback=${ctxDiag.rates.fastFallbackPct}%` +
      ` flags=[${topRiskFlags}]` +
      ` resolveSources=[${topResolveSources}]` +
      `${trippedGates ? ` gates=[${trippedGates}]` : ''}`
    );
    const titleDiffAudit = formatTitleDiffDiagnostics(ctxDiag.titleDiffDiagnostics, { exampleLimit: 6 });
    if (titleDiffAudit) {
      console.log(`Round 4 Context TitleDiff Audit ${titleDiffAudit}`);
    }
    const sourceQuality = formatSourceDiagnostics(ctxDiag.sourceDiagnostics, 4, { includeAvgOvr: true });
    if (sourceQuality) {
      console.log(`Round 4 Context Sources Detail ${sourceQuality}`);
    }
    const ownerQuality = formatOwnerDiagnostics(ctxDiag.ownerDiagnostics, 6, { includeAvgScenarioFit: true });
    if (ownerQuality) {
      console.log(`Round 4 Context Player Quality ${ownerQuality}`);
    }
    const validationSummary = formatValidationDiagnostics(ctxDiag.validation, { reasonLimit: 4, exampleLimit: 4 });
    if (validationSummary) {
      console.log(`Round 4 Context Validation ${validationSummary}`);
    }
    const scalingAudit = formatScalingDiagnostics(ctxDiag.scaling, { exampleLimit: 4 });
    if (scalingAudit) {
      console.log(`Round 4 Context Scaling Audit ${scalingAudit}`);
    }
    if (ctxDiag.suspicious.length) {
      console.log(
        `Round 4 Context Suspects ${ctxDiag.suspicious.map((row) => (
          `${row.character}->${row.resolvedTitle || '?'} ` +
          `[img:${row.image} src:${row.source || '?'} conf:${Math.round(row.infoConfidence * 100)}% ` +
          `sf:${row.scenarioFit} tf:${row.twistFit} ba:${row.baseAbility} ovr:${row.ovr} flags:${row.flags.join('|') || '-'}]`
        )).join(' | ')}`
      );
    }
    const imageGapRows = allEvaluations
      .map((entry) => {
        const scoreMeta = entry && entry.scoreMeta && typeof entry.scoreMeta === 'object' ? entry.scoreMeta : {};
        const imageSynthetic = Boolean(scoreMeta.imageSynthetic);
        const hasImage = Boolean(entry && entry.imageUrl);
        const resolvedTitle = scoreMeta.resolvedTitle || null;
        const resolvedSource = scoreMeta.resolvedSource || null;
        const riskFlags = Array.isArray(scoreMeta.contextSignals && scoreMeta.contextSignals.riskFlags)
          ? scoreMeta.contextSignals.riskFlags
          : [];
        return {
          character: String(entry && entry.character || 'Unknown'),
          status: hasImage ? (imageSynthetic ? 'syn' : 'real') : 'none',
          resolvedTitle,
          resolvedSource,
          titleDiffers: riskFlags.includes('title_differs_from_input')
        };
      })
      .filter((row) => row.status !== 'real' || row.titleDiffers)
      .slice(0, 12);
    if (imageGapRows.length) {
      console.log(
        `Round 4 Context Image Gaps ${imageGapRows.map((row) => (
          `${row.character}[img:${row.status}${row.titleDiffers ? ',titleDiff' : ''}]` +
          `${row.resolvedTitle ? `->${row.resolvedTitle}` : ''}` +
          `${row.resolvedSource ? `@${row.resolvedSource}` : ''}`
        )).join(' | ')}`
      );
    }
    const topHeuristics = Object.entries(ctxDiag.heuristicFlags || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    if (topHeuristics) {
      console.log(`Round 4 Context Heuristics [${topHeuristics}]`);
    }
  }

  return {
    scenario,
    twist,
    teamEvaluations,
    finalLeaderboard,
    roundPoints,
    pointBreakdown
  };
}

module.exports = {
  evaluateRound4FromGame
};
