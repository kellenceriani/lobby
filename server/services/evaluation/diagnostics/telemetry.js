function summarizeEvaluationPaths(evaluations = []) {
  const summary = {
    total: 0,
    legacyRules: 0,
    contextEngine: 0,
    fallback: 0,
    unknown: 0,
    avgFetchDurationMs: 0,
    avgConfidence: 0
  };

  let fetchMsTotal = 0;
  let fetchMsCount = 0;
  let confidenceTotal = 0;
  let confidenceCount = 0;

  (Array.isArray(evaluations) ? evaluations : []).forEach((entry) => {
    summary.total += 1;
    const path = String(entry && entry.evaluationPath ? entry.evaluationPath : '').toLowerCase();
    if (path.includes('context')) summary.contextEngine += 1;
    else if (path.includes('legacy')) summary.legacyRules += 1;
    else if (path.includes('fallback')) summary.fallback += 1;
    else summary.unknown += 1;

    const fetchMs = Number(entry && entry.scoreMeta && entry.scoreMeta.fetchDurationMs);
    if (Number.isFinite(fetchMs) && fetchMs >= 0) {
      fetchMsTotal += fetchMs;
      fetchMsCount += 1;
    }

    const confidence = Number(entry && entry.scoreMeta && entry.scoreMeta.infoConfidence);
    if (Number.isFinite(confidence)) {
      confidenceTotal += confidence;
      confidenceCount += 1;
    }
  });

  summary.avgFetchDurationMs = fetchMsCount ? Number((fetchMsTotal / fetchMsCount).toFixed(1)) : 0;
  summary.avgConfidence = confidenceCount ? Number((confidenceTotal / confidenceCount).toFixed(3)) : 0;
  return summary;
}

function summarizeContextDiagnostics(evaluations = [], options = {}) {
  const rows = Array.isArray(evaluations) ? evaluations.filter(Boolean) : [];
  const suspiciousLimit = Math.max(1, Math.min(12, Number(options.suspiciousLimit) || 6));
  const summary = {
    total: rows.length,
    images: { real: 0, synthetic: 0, none: 0 },
    sources: {},
    resolutionSources: {},
    flags: {},
    heuristicFlags: {},
    counts: {
      titleDiffers: 0,
      fastFallback: 0,
      syntheticImage: 0,
      lowConfidence: 0,
      lowResolve: 0
    },
    averages: {
      ovr: 0,
      score: 0,
      infoConfidence: 0,
      resolverConfidence: 0,
      contextFitConfidence: 0,
      baseAbility: 0,
      scenarioFit: 0,
      twistFit: 0,
      fitDelta: 0
    },
    suspicious: []
  };
  if (!rows.length) return summary;

  const totals = {
    ovr: 0, score: 0, infoConfidence: 0, resolverConfidence: 0, contextFitConfidence: 0,
    baseAbility: 0, scenarioFit: 0, twistFit: 0, fitDelta: 0
  };
  const suspiciousRows = [];

  function bumpCount(bucket, key) {
    const safeKey = String(key || 'unknown').trim() || 'unknown';
    bucket[safeKey] = (bucket[safeKey] || 0) + 1;
  }

  rows.forEach((entry) => {
    const scoreMeta = entry && entry.scoreMeta && typeof entry.scoreMeta === 'object' ? entry.scoreMeta : {};
    const signals = scoreMeta.contextSignals && typeof scoreMeta.contextSignals === 'object' ? scoreMeta.contextSignals : {};
    const rawSubscores = scoreMeta.contextRawSubscores && typeof scoreMeta.contextRawSubscores === 'object' ? scoreMeta.contextRawSubscores : {};
    const calibration = scoreMeta.contextOvrCalibration && typeof scoreMeta.contextOvrCalibration === 'object'
      ? scoreMeta.contextOvrCalibration
      : (entry && entry.breakdown && entry.breakdown.ovrBreakdown && entry.breakdown.ovrBreakdown.calibration && typeof entry.breakdown.ovrBreakdown.calibration === 'object'
        ? entry.breakdown.ovrBreakdown.calibration
        : {});

    const imageUrl = entry && entry.imageUrl;
    const synthetic = Boolean(scoreMeta.imageSynthetic) || (Array.isArray(signals.riskFlags) && signals.riskFlags.includes('synthetic_image'));
    if (imageUrl && !synthetic) summary.images.real += 1;
    else if (imageUrl && synthetic) summary.images.synthetic += 1;
    else summary.images.none += 1;

    bumpCount(summary.sources, scoreMeta.resolvedSource || 'unknown');
    bumpCount(summary.resolutionSources, scoreMeta.resolverResolutionSource || 'unknown');

    const riskFlags = Array.isArray(signals.riskFlags) ? signals.riskFlags : [];
    riskFlags.forEach((flag) => bumpCount(summary.flags, flag));
    const heuristicFlags = Array.isArray(scoreMeta.contextHeuristic && scoreMeta.contextHeuristic.flags)
      ? scoreMeta.contextHeuristic.flags
      : [];
    heuristicFlags.forEach((flag) => bumpCount(summary.heuristicFlags, flag));

    if (riskFlags.includes('title_differs_from_input')) summary.counts.titleDiffers += 1;
    if (riskFlags.includes('fast_round_timeout_fallback')) summary.counts.fastFallback += 1;
    if (riskFlags.includes('synthetic_image')) summary.counts.syntheticImage += 1;

    const infoConfidence = Number(scoreMeta.infoConfidence) || 0;
    const resolverConfidence = Number(scoreMeta.resolverConfidence) || 0;
    const contextFitConfidence = Number(scoreMeta.contextFitConfidence) || 0;
    if (infoConfidence < 0.6) summary.counts.lowConfidence += 1;
    if (resolverConfidence < 0.7) summary.counts.lowResolve += 1;

    totals.ovr += Number(entry && entry.ovr) || 0;
    totals.score += Number(entry && entry.score) || 0;
    totals.infoConfidence += infoConfidence;
    totals.resolverConfidence += resolverConfidence;
    totals.contextFitConfidence += contextFitConfidence;
    totals.baseAbility += Number(rawSubscores.baseAbility) || 0;
    totals.scenarioFit += Number(rawSubscores.currentScenarioFit) || 0;
    totals.twistFit += Number(rawSubscores.currentTwistFit) || 0;
    totals.fitDelta += Number(calibration.contextFitDelta) || 0;

    const suspiciousScore =
      (synthetic ? 3 : 0) +
      (riskFlags.includes('title_differs_from_input') ? 3 : 0) +
      (riskFlags.includes('fast_round_timeout_fallback') ? 4 : 0) +
      (infoConfidence < 0.6 ? 2 : 0) +
      (resolverConfidence < 0.75 ? 2 : 0) +
      ((Number(rawSubscores.baseAbility) || 0) < 30 ? 1 : 0);

    if (suspiciousScore > 0) {
      suspiciousRows.push({
        score: suspiciousScore,
        character: entry && entry.character ? String(entry.character) : 'Unknown',
        resolvedTitle: scoreMeta.resolvedTitle || null,
        source: scoreMeta.resolvedSource || null,
        resolverSource: scoreMeta.resolverResolutionSource || null,
        image: imageUrl ? (synthetic ? 'syn' : 'real') : 'none',
        infoConfidence,
        resolverConfidence,
        contextFitConfidence,
        ovr: Number(entry && entry.ovr) || 0,
        score30: Number(entry && entry.score) || 0,
        baseAbility: Number(rawSubscores.baseAbility) || 0,
        scenarioFit: Number(rawSubscores.currentScenarioFit) || 0,
        twistFit: Number(rawSubscores.currentTwistFit) || 0,
        fitDelta: Number(calibration.contextFitDelta) || 0,
        flags: riskFlags.slice(0, 6)
      });
    }
  });

  const div = rows.length || 1;
  summary.averages = {
    ovr: Number((totals.ovr / div).toFixed(1)),
    score: Number((totals.score / div).toFixed(1)),
    infoConfidence: Number((totals.infoConfidence / div).toFixed(3)),
    resolverConfidence: Number((totals.resolverConfidence / div).toFixed(3)),
    contextFitConfidence: Number((totals.contextFitConfidence / div).toFixed(3)),
    baseAbility: Number((totals.baseAbility / div).toFixed(1)),
    scenarioFit: Number((totals.scenarioFit / div).toFixed(1)),
    twistFit: Number((totals.twistFit / div).toFixed(1)),
    fitDelta: Number((totals.fitDelta / div).toFixed(1))
  };

  summary.suspicious = suspiciousRows
    .sort((a, b) => b.score - a.score || a.character.localeCompare(b.character))
    .slice(0, suspiciousLimit);
  return summary;
}

module.exports = {
  summarizeEvaluationPaths,
  summarizeContextDiagnostics
};
