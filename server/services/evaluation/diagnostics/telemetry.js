const { CHARACTER_NAME_ALIASES } = require('../../../evaluator/core/constants');

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

function formatTopCounts(counter = {}, limit = 6) {
  return Object.entries(counter || {})
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, Math.max(1, limit))
    .map(([key, value]) => `${key}:${value}`)
    .join(',');
}

function formatSourceDiagnostics(sourceDiagnostics = {}, limit = 4, options = {}) {
  const includeAvgOvr = options && options.includeAvgOvr === true;
  return Object.entries(sourceDiagnostics || {})
    .sort((a, b) => ((b[1] && b[1].total) || 0) - ((a[1] && a[1].total) || 0))
    .slice(0, Math.max(1, limit))
    .map(([source, diag]) => {
      const images = diag && diag.images ? diag.images : {};
      const counts = diag && diag.counts ? diag.counts : {};
      const avg = diag && diag.averages ? diag.averages : {};
      return `${source}(n:${diag.total || 0} img:${images.real || 0}/${images.synthetic || 0}/${images.none || 0} td:${counts.titleDiffers || 0} lowC:${counts.lowConfidence || 0} conf:${Math.round((Number(avg.infoConfidence) || 0) * 100)}%${includeAvgOvr ? ` avgOVR:${Number(avg.ovr) || 0}` : ''})`;
    })
    .join(' | ');
}

function formatOwnerDiagnostics(ownerDiagnostics = {}, limit = 6, options = {}) {
  const includeAvgScenarioFit = options && options.includeAvgScenarioFit === true;
  return Object.entries(ownerDiagnostics || {})
    .sort((a, b) => {
      const aDiag = a[1] || {};
      const bDiag = b[1] || {};
      const aScore = ((aDiag.counts && aDiag.counts.syntheticImage) || 0) + ((aDiag.counts && aDiag.counts.titleDiffers) || 0) + ((aDiag.counts && aDiag.counts.lowConfidence) || 0);
      const bScore = ((bDiag.counts && bDiag.counts.syntheticImage) || 0) + ((bDiag.counts && bDiag.counts.titleDiffers) || 0) + ((bDiag.counts && bDiag.counts.lowConfidence) || 0);
      return bScore - aScore || String(a[0]).localeCompare(String(b[0]));
    })
    .slice(0, Math.max(1, limit))
    .map(([owner, diag]) => {
      const images = diag && diag.images ? diag.images : {};
      const counts = diag && diag.counts ? diag.counts : {};
      const avg = diag && diag.averages ? diag.averages : {};
      return `${owner}(n:${diag.total || 0} img:${images.real || 0}/${images.synthetic || 0}/${images.none || 0} td:${counts.titleDiffers || 0} lowC:${counts.lowConfidence || 0} ff:${counts.fastFallback || 0} avgOVR:${Number(avg.ovr) || 0}${includeAvgScenarioFit ? ` avgSF:${Number(avg.scenarioFit) || 0}` : ''})`;
    })
    .join(' | ');
}

function formatTitleDiffDiagnostics(titleDiff = {}, options = {}) {
  const diag = titleDiff && typeof titleDiff === 'object' ? titleDiff : {};
  const safe = Number(diag.safe) || 0;
  const ambiguous = Number(diag.ambiguous) || 0;
  const dangerous = Number(diag.dangerous) || 0;
  const total = Number(diag.total) || (safe + ambiguous + dangerous);
  if (total <= 0) return '';

  const safePct = Number(diag.safePct) || 0;
  const ambiguousPct = Number(diag.ambiguousPct) || 0;
  const dangerousPct = Number(diag.dangerousPct) || 0;
  const examplesLimit = Math.max(1, Math.min(8, Number(options.exampleLimit) || 4));
  const examples = Array.isArray(diag.examples) ? diag.examples.slice(0, examplesLimit) : [];
  const exampleText = examples
    .map((row) => {
      const input = String(row && row.input || 'Unknown');
      const resolved = String(row && row.resolved || 'Unknown');
      const cls = String(row && row.classification || 'ambiguous');
      const owner = row && row.owner ? `@${row.owner}` : '';
      const source = row && row.source ? `@${row.source}` : '';
      return `${input}->${resolved}[${cls}${owner}${source}]`;
    })
    .join(' | ');

  return `total=${total} safe=${safe} (${safePct}%) ambiguous=${ambiguous} (${ambiguousPct}%) dangerous=${dangerous} (${dangerousPct}%)` +
    `${exampleText ? ` examples=[${exampleText}]` : ''}`;
}

function formatQualityGates(gates = {}) {
  return Object.entries(gates || {})
    .filter(([, value]) => value === true)
    .map(([key]) => key)
    .join(',');
}

function normalizeComparableName(raw = '') {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[.'’`]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(dr)\b/g, 'doctor')
    .replace(/\b(mr)\b/g, 'mister')
    .replace(/\b(ms)\b/g, 'miss')
    .replace(/\b(st)\b/g, 'saint')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeComparableName(raw = '') {
  const normalized = normalizeComparableName(raw);
  if (!normalized) return [];
  return normalized
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      // Lightweight singularization for diagnostics only.
      if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
      if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
      return token;
    });
}

const GENERIC_TITLE_DIFF_TOKENS = new Set([
  'character', 'fictional', 'comic', 'comics', 'film', 'movie', 'series', 'show', 'tv',
  'cartoon', 'anime', 'manga', 'video', 'game', 'games', 'disney', 'marvel', 'dc'
]);

const NICKNAME_EQUIVALENTS = {
  bob: ['robert', 'bobby', 'rob'],
  rob: ['robert', 'bob'],
  bill: ['william', 'billy', 'will'],
  will: ['william', 'bill'],
  jim: ['james', 'jimmy'],
  jimmy: ['james', 'jim'],
  joe: ['joseph', 'joey'],
  joey: ['joseph', 'joe'],
  mike: ['michael', 'mikey'],
  mikey: ['michael', 'mike'],
  tom: ['thomas', 'tommy'],
  tommy: ['thomas', 'tom'],
  dave: ['david', 'davy'],
  davy: ['david', 'dave'],
  liz: ['elizabeth', 'lizzy', 'beth'],
  beth: ['elizabeth', 'liz', 'lizzy'],
  meg: ['megan', 'meghan', 'margaret'],
  megan: ['meghan', 'meg'],
  meghan: ['megan', 'meg']
};

function tokenEditDistance(a = '', b = '') {
  const s = String(a || '');
  const t = String(b || '');
  if (!s || !t) return 99;
  const dp = Array.from({ length: s.length + 1 }, () => Array(t.length + 1).fill(0));
  for (let i = 0; i <= s.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= t.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[s.length][t.length];
}

function areNicknameEquivalentTokens(a = '', b = '') {
  const left = String(a || '').toLowerCase();
  const right = String(b || '').toLowerCase();
  if (!left || !right) return false;
  if (left === right) return true;
  if ((NICKNAME_EQUIVALENTS[left] || []).includes(right)) return true;
  if ((NICKNAME_EQUIVALENTS[right] || []).includes(left)) return true;
  if (left.length >= 4 && right.length >= 4 && tokenEditDistance(left, right) <= 2) return true;
  return false;
}

function aliasMapLinksInputAndResolved(inputName = '', resolvedTitle = '') {
  const inputNorm = normalizeComparableName(inputName);
  const resolvedNorm = normalizeComparableName(resolvedTitle);
  if (!inputNorm || !resolvedNorm) return false;
  const inputCompact = inputNorm.replace(/[^a-z0-9]/g, '');
  const resolvedCompact = resolvedNorm.replace(/[^a-z0-9]/g, '');

  const clusters = [];
  const directKeys = [inputNorm, inputCompact, resolvedNorm, resolvedCompact];
  directKeys.forEach((key) => {
    const aliases = CHARACTER_NAME_ALIASES[key];
    if (Array.isArray(aliases)) clusters.push([key, ...aliases]);
  });

  // Reverse lookup: if either side appears in an alias list, treat the cluster as linked.
  Object.entries(CHARACTER_NAME_ALIASES).forEach(([key, aliases]) => {
    const list = [key, ...(Array.isArray(aliases) ? aliases : [])];
    const normalizedList = list.map((value) => normalizeComparableName(value)).filter(Boolean);
    if (normalizedList.includes(inputNorm) || normalizedList.includes(resolvedNorm)) {
      clusters.push(list);
    }
  });

  return clusters.some((cluster) => {
    const normalizedCluster = new Set(
      cluster
        .map((value) => normalizeComparableName(value))
        .filter(Boolean)
    );
    return normalizedCluster.has(inputNorm) && normalizedCluster.has(resolvedNorm);
  });
}

function classifyTitleDifference(inputName = '', resolvedTitle = '', aliases = []) {
  const input = String(inputName || '').trim();
  const resolved = String(resolvedTitle || '').trim();
  if (!input || !resolved) {
    return { classification: 'dangerous', reason: 'missing_name' };
  }

  const normalizedInput = normalizeComparableName(input);
  const normalizedResolved = normalizeComparableName(resolved);
  if (!normalizedInput || !normalizedResolved) {
    return { classification: 'dangerous', reason: 'empty_normalized' };
  }
  const normalizedInputNoParens = normalizeComparableName(String(input).replace(/\s*\([^)]*\)\s*/g, ' '));
  const normalizedResolvedNoParens = normalizeComparableName(String(resolved).replace(/\s*\([^)]*\)\s*/g, ' '));
  if (normalizedInput === normalizedResolved) {
    return { classification: 'safe', reason: 'normalized_equal' };
  }
  if (
    (normalizedInputNoParens && normalizedInputNoParens === normalizedResolved)
    || (normalizedResolvedNoParens && normalizedResolvedNoParens === normalizedInput)
    || (normalizedInputNoParens && normalizedResolvedNoParens && normalizedInputNoParens === normalizedResolvedNoParens)
  ) {
    return { classification: 'safe', reason: 'parenthetical_variant' };
  }

  const inputTokens = tokenizeComparableName(input);
  const resolvedTokens = tokenizeComparableName(resolved);
  const inputSet = new Set(inputTokens);
  const resolvedSet = new Set(resolvedTokens);

  if (inputTokens.length && resolvedTokens.length && inputTokens.length === resolvedTokens.length) {
    const allIn = inputTokens.every((token) => resolvedSet.has(token));
    const allOut = resolvedTokens.every((token) => inputSet.has(token));
    if (allIn && allOut) {
      return { classification: 'safe', reason: 'token_reorder' };
    }
  }

  const aliasList = Array.isArray(aliases) ? aliases : [];
  const normalizedAliases = new Set(aliasList.map((value) => normalizeComparableName(value)).filter(Boolean));
  if (normalizedAliases.has(normalizedResolved) || normalizedAliases.has(normalizedInput)) {
    return { classification: 'safe', reason: 'alias_match' };
  }
  if (aliasMapLinksInputAndResolved(input, resolved)) {
    return { classification: 'safe', reason: 'alias_index_match' };
  }

  if (inputTokens.length >= 2 && resolvedTokens.length >= 2) {
    const lastInput = inputTokens[inputTokens.length - 1];
    const lastResolved = resolvedTokens[resolvedTokens.length - 1];
    const firstInput = inputTokens[0];
    const firstResolved = resolvedTokens[0];
    const surnameMatch = lastInput && lastResolved && (lastInput === lastResolved || areNicknameEquivalentTokens(lastInput, lastResolved));
    const firstNameNear = firstInput && firstResolved && areNicknameEquivalentTokens(firstInput, firstResolved);
    if (surnameMatch && firstNameNear) {
      return { classification: 'safe', reason: 'person_name_variant' };
    }
  }

  const intersection = inputTokens.filter((token) => resolvedSet.has(token));
  const union = new Set([...inputTokens, ...resolvedTokens]);
  const jaccard = union.size ? (intersection.length / union.size) : 0;
  const overlapInput = inputTokens.length ? (intersection.length / inputTokens.length) : 0;
  const overlapResolved = resolvedTokens.length ? (intersection.length / resolvedTokens.length) : 0;

  const extraResolved = resolvedTokens.filter((token) => !inputSet.has(token));
  const extraInput = inputTokens.filter((token) => !resolvedSet.has(token));
  const extrasAreGeneric = extraResolved.every((token) => GENERIC_TITLE_DIFF_TOKENS.has(token))
    && extraInput.every((token) => GENERIC_TITLE_DIFF_TOKENS.has(token));

  if ((overlapInput >= 0.75 && overlapResolved >= 0.5) || (jaccard >= 0.67)) {
    if (extrasAreGeneric || extraResolved.length <= 1 || extraInput.length <= 1) {
      return { classification: 'safe', reason: 'high_overlap' };
    }
  }

  if (intersection.length === 0) {
    return { classification: 'dangerous', reason: 'no_token_overlap' };
  }

  if (jaccard < 0.34 || (overlapInput < 0.5 && overlapResolved < 0.5)) {
    return { classification: 'dangerous', reason: 'low_overlap' };
  }

  return { classification: 'ambiguous', reason: 'partial_overlap' };
}

function normalizeValidationReason(rawReason = '') {
  const text = String(rawReason || '').trim().toLowerCase();
  if (!text) return '';
  if (text.includes('offensive')) return 'offensive';
  if (text.includes('empty')) return 'empty';
  if (text.includes('too short')) return 'too_short';
  if (text.includes('too long')) return 'too_long';
  if (text.includes('invalid')) return 'invalid';
  return text.replace(/\s+/g, '_').slice(0, 40);
}

function detectValidationIssue(entry = null, scoreMeta = {}, riskFlags = []) {
  const safeEntry = entry && typeof entry === 'object' ? entry : {};
  const safeScoreMeta = scoreMeta && typeof scoreMeta === 'object' ? scoreMeta : {};
  const validation = safeScoreMeta.validation && typeof safeScoreMeta.validation === 'object'
    ? safeScoreMeta.validation
    : null;
  const reasonText = String(safeEntry.reason || '').trim();
  const summaryText = String(safeEntry && safeEntry.breakdown && safeEntry.breakdown.characterSummary || '').trim();
  const riskList = Array.isArray(riskFlags) ? riskFlags : [];
  const lowerReason = reasonText.toLowerCase();
  const reasonLooksValidation =
    lowerReason.includes('invalid')
    || lowerReason.includes('offensive')
    || lowerReason.includes('validation');

  const normalizedValidationReason = normalizeValidationReason(validation && validation.reason);
  const normalizedPublicReason = reasonLooksValidation ? normalizeValidationReason(reasonText) : '';
  const lowerSummary = summaryText.toLowerCase();
  const hasInvalidRiskFlag = riskList.includes('invalid_input');
  const summaryLooksValidation =
    lowerSummary.includes('validation')
    || lowerSummary.includes('basic validation')
    || lowerSummary.includes('invalid input')
    || lowerSummary.includes('offensive');

  const inferredReason = normalizedValidationReason
    || normalizedPublicReason
    || (hasInvalidRiskFlag ? 'invalid' : '')
    || (summaryLooksValidation ? 'invalid' : '');

  if (!inferredReason) return null;

  return {
    rejected: true,
    reason: inferredReason,
    offensive: inferredReason === 'offensive'
  };
}

function formatValidationDiagnostics(validationSummary = {}, options = {}) {
  const summary = validationSummary && typeof validationSummary === 'object' ? validationSummary : {};
  const total = Number(summary.total) || 0;
  const rejected = Number(summary.rejected) || 0;
  if (rejected <= 0 || total <= 0) return '';

  const invalid = Number(summary.invalid) || 0;
  const offensive = Number(summary.offensive) || 0;
  const rate = Number(summary.rejectedPct) || 0;
  const reasons = formatTopCounts(summary.reasons || {}, Math.max(1, Math.min(6, Number(options.reasonLimit) || 4)));
  const examples = Array.isArray(summary.examples) ? summary.examples.slice(0, Math.max(1, Math.min(6, Number(options.exampleLimit) || 3))) : [];
  const sampleText = examples.map((row) => {
    const name = String(row && row.character || 'Unknown');
    const reason = String(row && row.reason || 'invalid');
    const owner = row && row.owner ? `@${row.owner}` : '';
    return `${name}${owner}:${reason}`;
  }).join(' | ');

  return `rejected=${rejected}/${total} (${rate}%) invalid=${invalid} offensive=${offensive}` +
    `${reasons ? ` reasons=[${reasons}]` : ''}` +
    `${sampleText ? ` samples=[${sampleText}]` : ''}`;
}

function percentileFromSortedNumbers(sortedValues = [], percentile = 0.5) {
  const values = Array.isArray(sortedValues) ? sortedValues.filter((n) => Number.isFinite(Number(n))) : [];
  if (!values.length) return 0;
  const p = Math.max(0, Math.min(1, Number(percentile) || 0));
  const index = Math.round((values.length - 1) * p);
  return Number(values[Math.max(0, Math.min(values.length - 1, index))]) || 0;
}

function formatScalingDiagnostics(scalingSummary = {}, options = {}) {
  const scaling = scalingSummary && typeof scalingSummary === 'object' ? scalingSummary : {};
  const total = Number(scaling.total) || 0;
  if (total <= 0) return '';

  const percentiles = scaling.percentiles && typeof scaling.percentiles === 'object'
    ? scaling.percentiles
    : {};
  const buckets = scaling.buckets && typeof scaling.buckets === 'object'
    ? scaling.buckets
    : {};
  const outliers = scaling.outliers && typeof scaling.outliers === 'object'
    ? scaling.outliers
    : {};

  const strong = buckets.strongSignals || {};
  const risky = buckets.riskySignals || {};
  const dangerous = buckets.dangerousTitleDiff || {};
  const syntheticFallback = buckets.syntheticOrFallback || {};
  const riskyHigh = outliers.riskyHighOvr || {};
  const lowConfElite = outliers.lowConfidenceElite || {};
  const examplesLimit = Math.max(1, Math.min(6, Number(options.exampleLimit) || 3));
  const riskyExamples = Array.isArray(riskyHigh.examples) ? riskyHigh.examples.slice(0, examplesLimit) : [];
  const exampleText = riskyExamples.map((row) => {
    const character = String(row && row.character || 'Unknown');
    const ovr = Number(row && row.ovr) || 0;
    const conf = Math.round((Number(row && row.infoConfidence) || 0) * 100);
    const source = String(row && row.source || '?');
    return `${character}(ovr:${ovr} conf:${conf}% src:${source})`;
  }).join(' | ');

  return `ovr(p10/p50/p90)=${Number(percentiles.p10) || 0}/${Number(percentiles.p50) || 0}/${Number(percentiles.p90) || 0}` +
    ` strong=${Number(strong.avgOvr) || 0}(${Number(strong.total) || 0})` +
    ` risky=${Number(risky.avgOvr) || 0}(${Number(risky.total) || 0})` +
    ` dangerTD=${Number(dangerous.avgOvr) || 0}(${Number(dangerous.total) || 0})` +
    ` syn/fb=${Number(syntheticFallback.avgOvr) || 0}(${Number(syntheticFallback.total) || 0})` +
    ` risky60+=${Number(riskyHigh.count) || 0}/${total}` +
    ` lowConf80+=${Number(lowConfElite.count) || 0}/${total}` +
    `${exampleText ? ` examples=[${exampleText}]` : ''}`;
}

function summarizeContextDiagnostics(evaluations = [], options = {}) {
  const rows = Array.isArray(evaluations) ? evaluations.filter(Boolean) : [];
  const suspiciousLimit = Math.max(1, Math.min(12, Number(options.suspiciousLimit) || 6));
  const ownerFieldPreference = Array.isArray(options.ownerFieldPreference)
    ? options.ownerFieldPreference.map((value) => String(value || ''))
    : ['__ownerName', 'ownerName', 'playerName', 'teamOwner', 'teamName'];
  const summary = {
    total: rows.length,
    images: { real: 0, synthetic: 0, none: 0 },
    sources: {},
    resolutionSources: {},
    sourceDiagnostics: {},
    ownerDiagnostics: {},
    flags: {},
    heuristicFlags: {},
    counts: {
      titleDiffers: 0,
      titleDiffSafe: 0,
      titleDiffAmbiguous: 0,
      titleDiffDangerous: 0,
      fastFallback: 0,
      syntheticImage: 0,
      lowConfidence: 0,
      lowResolve: 0
    },
    rates: {
      syntheticImagePct: 0,
      titleDiffPct: 0,
      titleDiffSafePct: 0,
      titleDiffAmbiguousPct: 0,
      titleDiffDangerousPct: 0,
      lowConfidencePct: 0,
      lowResolvePct: 0,
      fastFallbackPct: 0
    },
    qualityGates: {
      syntheticImageRateHigh: false,
      titleDiffRateHigh: false,
      dangerousTitleDiffRateHigh: false,
      lowConfidenceRateHigh: false,
      lowResolveRateHigh: false,
      fastFallbackRateHigh: false,
      invalidInputRateHigh: false
    },
    titleDiffDiagnostics: {
      total: 0,
      safe: 0,
      ambiguous: 0,
      dangerous: 0,
      safePct: 0,
      ambiguousPct: 0,
      dangerousPct: 0,
      byReason: {},
      examples: []
    },
    validation: {
      total: rows.length,
      rejected: 0,
      invalid: 0,
      offensive: 0,
      rejectedPct: 0,
      reasons: {},
      examples: []
    },
    scaling: {
      total: rows.length,
      percentiles: {
        p10: 0,
        p50: 0,
        p90: 0
      },
      buckets: {
        strongSignals: { total: 0, sumOvr: 0, avgOvr: 0 },
        riskySignals: { total: 0, sumOvr: 0, avgOvr: 0 },
        dangerousTitleDiff: { total: 0, sumOvr: 0, avgOvr: 0 },
        syntheticOrFallback: { total: 0, sumOvr: 0, avgOvr: 0 }
      },
      outliers: {
        riskyHighOvr: { count: 0, threshold: 60, examples: [] },
        lowConfidenceElite: { count: 0, threshold: 80, examples: [] }
      }
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
  const ovrValues = [];

  function bumpCount(bucket, key) {
    const safeKey = String(key || 'unknown').trim() || 'unknown';
    bucket[safeKey] = (bucket[safeKey] || 0) + 1;
  }

  function ensureQualityBucket(container, key) {
    const safeKey = String(key || 'unknown').trim() || 'unknown';
    if (!container[safeKey]) {
      container[safeKey] = {
        total: 0,
        images: { real: 0, synthetic: 0, none: 0 },
        counts: {
          titleDiffers: 0,
          fastFallback: 0,
          syntheticImage: 0,
          lowConfidence: 0,
          lowResolve: 0
        },
        sums: {
          infoConfidence: 0,
          resolverConfidence: 0,
          contextFitConfidence: 0,
          ovr: 0,
          score: 0,
          scenarioFit: 0,
          twistFit: 0,
          baseAbility: 0
        },
        averages: {}
      };
    }
    return container[safeKey];
  }

  function finalizeQualityBuckets(container) {
    Object.keys(container || {}).forEach((key) => {
      const bucket = container[key];
      const div = Math.max(1, Number(bucket && bucket.total) || 0);
      bucket.averages = {
        infoConfidence: Number(((Number(bucket.sums.infoConfidence) || 0) / div).toFixed(3)),
        resolverConfidence: Number(((Number(bucket.sums.resolverConfidence) || 0) / div).toFixed(3)),
        contextFitConfidence: Number(((Number(bucket.sums.contextFitConfidence) || 0) / div).toFixed(3)),
        ovr: Number(((Number(bucket.sums.ovr) || 0) / div).toFixed(1)),
        score: Number(((Number(bucket.sums.score) || 0) / div).toFixed(1)),
        scenarioFit: Number(((Number(bucket.sums.scenarioFit) || 0) / div).toFixed(1)),
        twistFit: Number(((Number(bucket.sums.twistFit) || 0) / div).toFixed(1)),
        baseAbility: Number(((Number(bucket.sums.baseAbility) || 0) / div).toFixed(1))
      };
      delete bucket.sums;
    });
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

    let titleDiffClass = null;
    if (riskFlags.includes('title_differs_from_input')) summary.counts.titleDiffers += 1;
    if (riskFlags.includes('title_differs_from_input')) {
      const titleDiffInfo = classifyTitleDifference(
        entry && entry.character ? String(entry.character) : '',
        scoreMeta.resolvedTitle || '',
        scoreMeta.aliases || []
      );
      const diffClass = titleDiffInfo && titleDiffInfo.classification ? titleDiffInfo.classification : 'ambiguous';
      const diffReason = titleDiffInfo && titleDiffInfo.reason ? titleDiffInfo.reason : 'unknown';
      titleDiffClass = diffClass;
      summary.titleDiffDiagnostics.total += 1;
      if (diffClass === 'safe') summary.counts.titleDiffSafe += 1;
      else if (diffClass === 'dangerous') summary.counts.titleDiffDangerous += 1;
      else summary.counts.titleDiffAmbiguous += 1;
      summary.titleDiffDiagnostics[diffClass] += 1;
      bumpCount(summary.titleDiffDiagnostics.byReason, diffReason);
      if (summary.titleDiffDiagnostics.examples.length < 10) {
        summary.titleDiffDiagnostics.examples.push({
          input: entry && entry.character ? String(entry.character) : 'Unknown',
          resolved: scoreMeta.resolvedTitle || 'Unknown',
          classification: diffClass,
          reason: diffReason,
          owner: ownerFieldPreference
            .map((field) => (entry && entry[field] != null ? String(entry[field]).trim() : ''))
            .find(Boolean) || null,
          source: scoreMeta.resolvedSource || null
        });
      }
    }
    if (riskFlags.includes('fast_round_timeout_fallback')) summary.counts.fastFallback += 1;
    if (riskFlags.includes('synthetic_image')) summary.counts.syntheticImage += 1;

    const validationIssue = detectValidationIssue(entry, scoreMeta, riskFlags);
    if (validationIssue && validationIssue.rejected) {
      summary.validation.rejected += 1;
      if (validationIssue.offensive) summary.validation.offensive += 1;
      else summary.validation.invalid += 1;
      bumpCount(summary.validation.reasons, validationIssue.reason || 'invalid');
    }

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
    const ovrValue = Number(entry && entry.ovr) || 0;
    ovrValues.push(ovrValue);

    const hasDangerousTitleDiff = riskFlags.includes('dangerous_title_diff_suspected');
    const hasSyntheticOrFallback = riskFlags.includes('synthetic_image') || riskFlags.includes('fast_round_timeout_fallback');
    const riskySignal =
      hasDangerousTitleDiff
      || infoConfidence < 0.6
      || resolverConfidence < 0.7
      || riskFlags.includes('high_candidate_ambiguity')
      || riskFlags.includes('fast_round_timeout_fallback');
    const strongSignal =
      !riskySignal
      && infoConfidence >= 0.75
      && resolverConfidence >= 0.8
      && !riskFlags.includes('synthetic_image');

    const bumpScalingBucket = (bucket) => {
      if (!bucket || typeof bucket !== 'object') return;
      bucket.total = (Number(bucket.total) || 0) + 1;
      bucket.sumOvr = (Number(bucket.sumOvr) || 0) + ovrValue;
    };
    if (strongSignal) bumpScalingBucket(summary.scaling.buckets.strongSignals);
    if (riskySignal) bumpScalingBucket(summary.scaling.buckets.riskySignals);
    if (hasDangerousTitleDiff) bumpScalingBucket(summary.scaling.buckets.dangerousTitleDiff);
    if (hasSyntheticOrFallback) bumpScalingBucket(summary.scaling.buckets.syntheticOrFallback);

    if (riskySignal && ovrValue >= (Number(summary.scaling.outliers.riskyHighOvr.threshold) || 60)) {
      summary.scaling.outliers.riskyHighOvr.count += 1;
      if (summary.scaling.outliers.riskyHighOvr.examples.length < 8) {
        summary.scaling.outliers.riskyHighOvr.examples.push({
          character: entry && entry.character ? String(entry.character) : 'Unknown',
          resolvedTitle: scoreMeta.resolvedTitle || null,
          ovr: ovrValue,
          infoConfidence,
          resolverConfidence,
          source: scoreMeta.resolvedSource || null,
          flags: riskFlags.slice(0, 6)
        });
      }
    }
    if (infoConfidence < 0.6 && ovrValue >= (Number(summary.scaling.outliers.lowConfidenceElite.threshold) || 80)) {
      summary.scaling.outliers.lowConfidenceElite.count += 1;
    }

    const imageStatus = imageUrl ? (synthetic ? 'synthetic' : 'real') : 'none';
    const sourceBucket = ensureQualityBucket(summary.sourceDiagnostics, scoreMeta.resolvedSource || 'unknown');
    sourceBucket.total += 1;
    sourceBucket.images[imageStatus] += 1;
    sourceBucket.sums.infoConfidence += infoConfidence;
    sourceBucket.sums.resolverConfidence += resolverConfidence;
    sourceBucket.sums.contextFitConfidence += contextFitConfidence;
    sourceBucket.sums.ovr += Number(entry && entry.ovr) || 0;
    sourceBucket.sums.score += Number(entry && entry.score) || 0;
    sourceBucket.sums.scenarioFit += Number(rawSubscores.currentScenarioFit) || 0;
    sourceBucket.sums.twistFit += Number(rawSubscores.currentTwistFit) || 0;
    sourceBucket.sums.baseAbility += Number(rawSubscores.baseAbility) || 0;
    if (riskFlags.includes('title_differs_from_input')) sourceBucket.counts.titleDiffers += 1;
    if (riskFlags.includes('fast_round_timeout_fallback')) sourceBucket.counts.fastFallback += 1;
    if (riskFlags.includes('synthetic_image')) sourceBucket.counts.syntheticImage += 1;
    if (infoConfidence < 0.6) sourceBucket.counts.lowConfidence += 1;
    if (resolverConfidence < 0.7) sourceBucket.counts.lowResolve += 1;

    const ownerName = ownerFieldPreference
      .map((field) => (entry && entry[field] != null ? String(entry[field]).trim() : ''))
      .find(Boolean);
    if (validationIssue && validationIssue.rejected && summary.validation.examples.length < 8) {
      summary.validation.examples.push({
        character: entry && entry.character ? String(entry.character) : 'Unknown',
        owner: ownerName || null,
        reason: validationIssue.reason || 'invalid',
        ovr: Number(entry && entry.ovr) || 0,
        source: scoreMeta.resolvedSource || null
      });
    }
    if (ownerName) {
      const ownerBucket = ensureQualityBucket(summary.ownerDiagnostics, ownerName);
      ownerBucket.total += 1;
      ownerBucket.images[imageStatus] += 1;
      ownerBucket.sums.infoConfidence += infoConfidence;
      ownerBucket.sums.resolverConfidence += resolverConfidence;
      ownerBucket.sums.contextFitConfidence += contextFitConfidence;
      ownerBucket.sums.ovr += Number(entry && entry.ovr) || 0;
      ownerBucket.sums.score += Number(entry && entry.score) || 0;
      ownerBucket.sums.scenarioFit += Number(rawSubscores.currentScenarioFit) || 0;
      ownerBucket.sums.twistFit += Number(rawSubscores.currentTwistFit) || 0;
      ownerBucket.sums.baseAbility += Number(rawSubscores.baseAbility) || 0;
      if (riskFlags.includes('title_differs_from_input')) ownerBucket.counts.titleDiffers += 1;
      if (riskFlags.includes('fast_round_timeout_fallback')) ownerBucket.counts.fastFallback += 1;
      if (riskFlags.includes('synthetic_image')) ownerBucket.counts.syntheticImage += 1;
      if (infoConfidence < 0.6) ownerBucket.counts.lowConfidence += 1;
      if (resolverConfidence < 0.7) ownerBucket.counts.lowResolve += 1;
    }

    const suspiciousScore =
      (synthetic ? 3 : 0) +
      (riskFlags.includes('title_differs_from_input')
        ? (titleDiffClass === 'dangerous' ? 3 : titleDiffClass === 'safe' ? 0 : 1)
        : 0) +
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

  const sortedOvr = ovrValues.slice().sort((a, b) => a - b);
  summary.scaling.percentiles = {
    p10: percentileFromSortedNumbers(sortedOvr, 0.10),
    p50: percentileFromSortedNumbers(sortedOvr, 0.50),
    p90: percentileFromSortedNumbers(sortedOvr, 0.90)
  };
  Object.values(summary.scaling.buckets || {}).forEach((bucket) => {
    if (!bucket || typeof bucket !== 'object') return;
    const total = Number(bucket.total) || 0;
    bucket.avgOvr = total ? Number(((Number(bucket.sumOvr) || 0) / total).toFixed(1)) : 0;
    delete bucket.sumOvr;
  });

  summary.rates = {
    syntheticImagePct: Number(((summary.counts.syntheticImage / div) * 100).toFixed(1)),
    titleDiffPct: Number(((summary.counts.titleDiffers / div) * 100).toFixed(1)),
    titleDiffSafePct: Number(((summary.counts.titleDiffSafe / div) * 100).toFixed(1)),
    titleDiffAmbiguousPct: Number(((summary.counts.titleDiffAmbiguous / div) * 100).toFixed(1)),
    titleDiffDangerousPct: Number(((summary.counts.titleDiffDangerous / div) * 100).toFixed(1)),
    lowConfidencePct: Number(((summary.counts.lowConfidence / div) * 100).toFixed(1)),
    lowResolvePct: Number(((summary.counts.lowResolve / div) * 100).toFixed(1)),
    fastFallbackPct: Number(((summary.counts.fastFallback / div) * 100).toFixed(1))
  };

  summary.qualityGates = {
    syntheticImageRateHigh: summary.rates.syntheticImagePct >= 35,
    titleDiffRateHigh: summary.rates.titleDiffPct >= 20,
    dangerousTitleDiffRateHigh: summary.rates.titleDiffDangerousPct >= 12,
    lowConfidenceRateHigh: summary.rates.lowConfidencePct >= 25,
    lowResolveRateHigh: summary.rates.lowResolvePct >= 25,
    fastFallbackRateHigh: summary.rates.fastFallbackPct >= 20,
    invalidInputRateHigh: Number((((summary.validation.rejected || 0) / div) * 100).toFixed(1)) >= 10
  };
  summary.validation.rejectedPct = Number((((summary.validation.rejected || 0) / div) * 100).toFixed(1));
  summary.titleDiffDiagnostics.safePct = Number(((summary.titleDiffDiagnostics.safe / div) * 100).toFixed(1));
  summary.titleDiffDiagnostics.ambiguousPct = Number(((summary.titleDiffDiagnostics.ambiguous / div) * 100).toFixed(1));
  summary.titleDiffDiagnostics.dangerousPct = Number(((summary.titleDiffDiagnostics.dangerous / div) * 100).toFixed(1));

  finalizeQualityBuckets(summary.sourceDiagnostics);
  finalizeQualityBuckets(summary.ownerDiagnostics);

  return summary;
}

module.exports = {
  summarizeEvaluationPaths,
  summarizeContextDiagnostics,
  formatTopCounts,
  formatSourceDiagnostics,
  formatOwnerDiagnostics,
  formatTitleDiffDiagnostics,
  formatQualityGates,
  formatValidationDiagnostics,
  formatScalingDiagnostics
};
