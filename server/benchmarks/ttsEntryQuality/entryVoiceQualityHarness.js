const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const {
  synthesizeAdaptiveTts,
  getAdaptiveTtsCatalogPayload
} = require('../../services/adaptiveTtsService');

const {
  buildCandidateMatrixForSample,
  scoreCandidateProxy,
  suggestSubsetAddition,
  loadLatencyTargets,
  scoreLatencyBand
} = require('./variantProfiles.cjs');

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'entry-samples.json');
const OUTPUT_DIR = path.join(__dirname, 'output');

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) out[arg.slice(2)] = 'true';
    else out[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return out;
}

function parseBool(value, fallback = false) {
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function clamp(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function round3(value) {
  return Number(Number(value || 0).toFixed(3));
}

function mean(values) {
  const nums = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
  if (!nums.length) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function percentile(values, p) {
  const nums = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return null;
  const idx = clamp((nums.length - 1) * p, 0, nums.length - 1, 0);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return nums[lo];
  const t = idx - lo;
  return nums[lo] + ((nums[hi] - nums[lo]) * t);
}

function median(values) {
  return percentile(values, 0.5);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  const limit = Math.max(1, Math.min(list.length, Number(concurrency) || 1));
  const out = new Array(list.length);
  let cursor = 0;
  async function worker() {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await mapper(list[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return out;
}

function safeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

function getConfiguredProviders() {
  const catalog = getAdaptiveTtsCatalogPayload();
  const providers = Array.isArray(catalog && catalog.providers) ? catalog.providers : [];
  return {
    catalog,
    providers,
    configured: providers.filter((p) => p && p.configured === true)
  };
}

function loadEntrySamples(fixturePath = FIXTURE_PATH) {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const samples = Array.isArray(raw && raw.samples) ? raw.samples : [];
  return samples.map((sample) => ({
    id: String(sample.id || ''),
    character: String(sample.character || '').trim(),
    text: String(sample.text || '').trim(),
    archetype: String(sample.archetype || '').trim().toUpperCase(),
    genderHint: String(sample.genderHint || 'neutral').trim().toLowerCase(),
    anchorProfile: String(sample.anchorProfile || '').trim()
  })).filter((sample) => sample.id && sample.text && sample.archetype);
}

async function ensureOutputDirs({ writeAudio = true } = {}) {
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  if (!writeAudio) return { baseDir: OUTPUT_DIR, audioDir: null };
  const audioDir = path.join(OUTPUT_DIR, 'audio-sweeps');
  await fsp.mkdir(audioDir, { recursive: true });
  return { baseDir: OUTPUT_DIR, audioDir };
}

async function synthesizeMeasured(spec, options = {}) {
  const {
    voiceId,
    speed,
    pitch,
    text
  } = spec;

  const startedCold = Date.now();
  const first = await synthesizeAdaptiveTts({ voiceId, speed, pitch, text });
  const firstGenerateMs = Date.now() - startedCold;

  const startedWarm = Date.now();
  const second = await synthesizeAdaptiveTts({ voiceId, speed, pitch, text });
  const cacheHitMs = Date.now() - startedWarm;

  return {
    firstGenerateMs,
    cacheHitMs,
    firstCacheHit: Boolean(first && first.cacheHit),
    warmCacheHit: Boolean(second && second.cacheHit),
    providerId: String((first && first.providerId) || ''),
    providerLabel: String((first && first.providerLabel) || ''),
    ext: String((first && first.ext) || 'mp3'),
    mimeType: String((first && first.mimeType) || ''),
    bytes: first && first.buffer ? Number(first.buffer.length) : 0,
    providerAttempts: Array.isArray(first && first.providerAttempts)
      ? first.providerAttempts.slice(0, 6).map((row) => ({
        providerId: String(row.providerId || ''),
        ok: Boolean(row.ok),
        ms: Number(row.ms) || 0,
        error: row.error ? String(row.error) : undefined
      }))
      : [],
    buffer: first && first.buffer ? first.buffer : null
  };
}

async function maybeWriteCandidateAudio(measured, candidate, sample, outputDirs, options = {}) {
  if (!options.writeAudio || !outputDirs || !outputDirs.audioDir) return null;
  if (!measured || !measured.buffer) return null;
  const ext = String(measured.ext || 'mp3');
  const filename = [
    safeSlug(sample.id),
    safeSlug(candidate.voiceId),
    safeSlug(candidate.subsetId)
  ].join('__') + `.${ext}`;
  const fullPath = path.join(outputDirs.audioDir, filename);
  await fsp.writeFile(fullPath, measured.buffer);
  return fullPath;
}

function rankCandidatesWithScores(sample, candidateResults, latencyTargets) {
  const ranked = candidateResults.map((row) => {
    const proxy = scoreCandidateProxy(sample, row, row.latency || null, latencyTargets);
    return {
      ...row,
      finalScore: round3(proxy.total),
      scoreComponents: Object.fromEntries(
        Object.entries(proxy.components || {}).map(([k, v]) => [k, round3(v)])
      )
    };
  }).sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    if (a.isCurrentPick !== b.isCurrentPick) return a.isCurrentPick ? -1 : 1;
    const aWarm = Number(a.latency && a.latency.cacheHitMs) || Number.MAX_SAFE_INTEGER;
    const bWarm = Number(b.latency && b.latency.cacheHitMs) || Number.MAX_SAFE_INTEGER;
    return aWarm - bWarm;
  });

  ranked.forEach((row, index) => { row.rank = index + 1; });
  return ranked;
}

async function evaluateSample(sample, options, shared) {
  const candidates = buildCandidateMatrixForSample(sample, {
    maxCandidates: Number(options.preselectCandidates) || 10
  });
  const candidateLimit = Math.max(1, Number(options.candidateLimit) || 6);
  const toMeasure = candidates.slice(0, candidateLimit);

  const measuredRows = await mapWithConcurrency(toMeasure, Number(options.candidateConcurrency) || 1, async (candidate) => {
    let latency = null;
    let audioPath = null;
    let synthError = null;

    if (!options.noSynth) {
      try {
        const measured = await synthesizeMeasured(candidate, options);
        latency = {
          firstGenerateMs: measured.firstGenerateMs,
          cacheHitMs: measured.cacheHitMs,
          firstCacheHit: measured.firstCacheHit,
          warmCacheHit: measured.warmCacheHit,
          providerId: measured.providerId,
          providerLabel: measured.providerLabel,
          ext: measured.ext,
          mimeType: measured.mimeType,
          bytes: measured.bytes,
          providerAttempts: measured.providerAttempts
        };
        audioPath = await maybeWriteCandidateAudio(measured, candidate, sample, shared.outputDirs, options);
      } catch (error) {
        synthError = String(error && error.message || 'synth_failed');
      }
    }

    return {
      ...candidate,
      latency,
      audioPath,
      synthError
    };
  });

  const ranked = rankCandidatesWithScores(sample, measuredRows, shared.latencyTargets);
  const best = ranked[0] || null;
  const current = ranked.find((row) => row.isCurrentPick) || null;
  const suggestion = suggestSubsetAddition(sample, ranked);

  return {
    sample: {
      id: sample.id,
      character: sample.character,
      archetype: sample.archetype,
      genderHint: sample.genderHint,
      anchorProfile: sample.anchorProfile
    },
    bestPick: best ? {
      rank: best.rank,
      voiceId: best.voiceId,
      voiceLabel: best.voiceLabel,
      subsetId: best.subsetId,
      variantLabel: best.variant && best.variant.label,
      speed: best.speed,
      pitch: best.pitch,
      finalScore: best.finalScore,
      scoreComponents: best.scoreComponents,
      latency: best.latency,
      audioPath: best.audioPath || null
    } : null,
    currentPick: current ? {
      rank: current.rank,
      voiceId: current.voiceId,
      voiceLabel: current.voiceLabel,
      subsetId: current.subsetId,
      variantLabel: current.variant && current.variant.label,
      speed: current.speed,
      pitch: current.pitch,
      finalScore: current.finalScore,
      scoreComponents: current.scoreComponents,
      latency: current.latency,
      audioPath: current.audioPath || null
    } : null,
    deltaVsCurrent: (best && current) ? round3(best.finalScore - current.finalScore) : null,
    recommendedSubsetAddition: suggestion,
    candidates: ranked.map((row) => ({
      rank: row.rank,
      voiceId: row.voiceId,
      voiceLabel: row.voiceLabel,
      subsetId: row.subsetId,
      variantLabel: row.variant && row.variant.label,
      variantTags: Array.isArray(row.variant && row.variant.tags) ? row.variant.tags : [],
      speed: round3(row.speed),
      pitch: round3(row.pitch),
      isCurrentPick: row.isCurrentPick === true,
      preScore: round3(row.preScore),
      finalScore: row.finalScore,
      scoreComponents: row.scoreComponents,
      latency: row.latency,
      synthError: row.synthError || null,
      text: row.text,
      audioPath: row.audioPath || null
    }))
  };
}

function summarizeLatency(reportRows, latencyTargets) {
  const coldGenerated = [];
  const firstCalls = [];
  const warm = [];
  const cacheWarmHitFailures = [];
  let firstCallCacheHits = 0;

  for (const row of reportRows) {
    for (const candidate of row.candidates || []) {
      if (candidate.latency && Number.isFinite(Number(candidate.latency.firstGenerateMs))) {
        firstCalls.push(Number(candidate.latency.firstGenerateMs));
        if (candidate.latency.firstCacheHit === true) {
          firstCallCacheHits += 1;
        } else {
          coldGenerated.push(Number(candidate.latency.firstGenerateMs));
        }
      }
      if (candidate.latency && Number.isFinite(Number(candidate.latency.cacheHitMs))) {
        warm.push(Number(candidate.latency.cacheHitMs));
        if (candidate.latency.warmCacheHit !== true) {
          cacheWarmHitFailures.push({
            sampleId: row.sample.id,
            voiceId: candidate.voiceId,
            subsetId: candidate.subsetId
          });
        }
      }
    }
  }

  const summary = {
    firstCall: {
      count: firstCalls.length,
      cacheHitCount: firstCallCacheHits,
      meanMs: firstCalls.length ? Math.round(mean(firstCalls)) : null,
      p50Ms: firstCalls.length ? Math.round(median(firstCalls)) : null,
      p95Ms: firstCalls.length ? Math.round(percentile(firstCalls, 0.95)) : null
    },
    coldGenerated: {
      count: coldGenerated.length,
      meanMs: coldGenerated.length ? Math.round(mean(coldGenerated)) : null,
      p50Ms: coldGenerated.length ? Math.round(median(coldGenerated)) : null,
      p95Ms: coldGenerated.length ? Math.round(percentile(coldGenerated, 0.95)) : null
    },
    warm: {
      count: warm.length,
      meanMs: warm.length ? Math.round(mean(warm)) : null,
      p50Ms: warm.length ? Math.round(median(warm)) : null,
      p95Ms: warm.length ? Math.round(percentile(warm, 0.95)) : null
    },
    cacheWarmHitFailures,
    targetAssessment: {
      coldGeneratedP50: coldGenerated.length ? round3(scoreLatencyBand(median(coldGenerated), latencyTargets.firstGenerateMs)) : null,
      coldGeneratedP95: coldGenerated.length ? round3(scoreLatencyBand(percentile(coldGenerated, 0.95), latencyTargets.firstGenerateMs)) : null,
      warmP50: warm.length ? round3(scoreLatencyBand(median(warm), latencyTargets.cacheHitMs)) : null,
      warmP95: warm.length ? round3(scoreLatencyBand(percentile(warm, 0.95), latencyTargets.cacheHitMs)) : null
    }
  };

  return summary;
}

function scoreRateTarget(value, targetBand = {}) {
  const v = clamp(Number(value), 0, 1, 0);
  const good = clamp(Number(targetBand.good), 0, 1, 0.95);
  const acceptable = clamp(Number(targetBand.acceptable), 0, 1, 0.8);
  const fail = clamp(Number(targetBand.fail), 0, 1, 0.5);

  if (v >= good) return 1;
  if (v >= acceptable) {
    const t = (v - acceptable) / Math.max(0.0001, good - acceptable);
    return 0.65 + (t * 0.35);
  }
  if (v >= fail) {
    const t = (v - fail) / Math.max(0.0001, acceptable - fail);
    return 0.15 + (t * 0.5);
  }
  return 0.05;
}

function summarizeQuality(reportRows) {
  const improvements = [];
  const suggestions = [];
  const archetypeWinners = {};
  const voiceWinners = {};

  for (const row of reportRows) {
    if (Number.isFinite(Number(row.deltaVsCurrent))) improvements.push(Number(row.deltaVsCurrent));
    if (row.recommendedSubsetAddition && row.recommendedSubsetAddition.recommended) suggestions.push(row.recommendedSubsetAddition);
    const best = row.bestPick;
    if (!best) continue;
    const arch = String(row.sample && row.sample.archetype || 'UNKNOWN');
    if (!archetypeWinners[arch]) archetypeWinners[arch] = [];
    archetypeWinners[arch].push(best);
    voiceWinners[best.voiceId] = (voiceWinners[best.voiceId] || 0) + 1;
  }

  const byArchetype = Object.fromEntries(
    Object.entries(archetypeWinners).map(([arch, rows]) => {
      const avg = mean(rows.map((r) => Number(r.finalScore) || 0));
      const topVoiceCounts = rows.reduce((acc, r) => {
        acc[r.voiceId] = (acc[r.voiceId] || 0) + 1;
        return acc;
      }, {});
      const dominantVoice = Object.entries(topVoiceCounts).sort((a, b) => b[1] - a[1])[0] || null;
      return [arch, {
        sampleCount: rows.length,
        averageBestScore: avg != null ? round3(avg) : null,
        dominantVoiceId: dominantVoice ? dominantVoice[0] : null,
        dominantVoiceCount: dominantVoice ? dominantVoice[1] : 0
      }];
    })
  );

  return {
    avgDeltaVsCurrent: improvements.length ? round3(mean(improvements)) : null,
    medianDeltaVsCurrent: improvements.length ? round3(median(improvements)) : null,
    improvedSamples: improvements.filter((n) => n > 0.03).length,
    totalComparedSamples: improvements.length,
    recommendedSubsetAdditions: suggestions,
    bestVoiceWins: voiceWinners,
    byArchetype
  };
}

function estimatePrejoinBatchFromBestPicks(reportRows, latencyTargets) {
  const firstGenerate = reportRows
    .map((row) => {
      const latency = row.bestPick && row.bestPick.latency ? row.bestPick.latency : null;
      if (!latency || latency.firstCacheHit === true) return null;
      return Number(latency.firstGenerateMs);
    })
    .filter(Number.isFinite);
  const assumedConcurrency = Math.max(1, Number(latencyTargets.estimatedPrejoinBatchMs && latencyTargets.estimatedPrejoinBatchMs.assumedConcurrency) || 3);
  if (!firstGenerate.length) {
    return {
      estimatedBatchMs: null,
      assumedConcurrency,
      targetScore: null
    };
  }
  const total = firstGenerate.reduce((sum, n) => sum + n, 0);
  const estimatedBatchMs = Math.round(total / assumedConcurrency);
  return {
    estimatedBatchMs,
    assumedConcurrency,
    targetScore: round3(scoreLatencyBand(estimatedBatchMs, latencyTargets.estimatedPrejoinBatchMs))
  };
}

function collectBestPickSpecs(reportRows) {
  const specs = [];
  const seen = new Set();
  for (const row of reportRows) {
    const best = row.bestPick;
    if (!best) continue;
    const sig = `${best.voiceId}|${best.speed}|${best.pitch}|${safeSlug(row.sample.id)}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    const candidate = row.candidates.find((c) => c.rank === best.rank);
    if (!candidate) continue;
    specs.push({
      sampleId: String(row.sample && row.sample.id || ''),
      voiceId: best.voiceId,
      speed: Number(best.speed) || 1,
      pitch: Number(best.pitch) || 1,
      text: String(candidate.text || '')
    });
  }
  return specs;
}

async function simulateWarmPlaybackTopoff(reportRows, options) {
  const specs = collectBestPickSpecs(reportRows);
  if (!specs.length) return null;

  const startedAt = Date.now();
  const results = await mapWithConcurrency(specs, Number(options.prejoinSimConcurrency) || 3, async (spec) => {
    try {
      const res = await synthesizeAdaptiveTts(spec);
      return { ok: true, cacheHit: res && res.cacheHit === true, providerId: String(res && res.providerId || '') };
    } catch (error) {
      return { ok: false, error: String(error && error.message || 'failed') };
    }
  });
  const elapsedMs = Date.now() - startedAt;
  return {
    clips: specs.length,
    elapsedMs,
    success: results.filter((r) => r.ok).length,
    cacheHits: results.filter((r) => r.ok && r.cacheHit).length,
    failures: results.filter((r) => !r.ok).slice(0, 5)
  };
}

async function measurePostTopoffInstantReplay(reportRows, options) {
  const specs = collectBestPickSpecs(reportRows);
  if (!specs.length) return null;

  const results = await mapWithConcurrency(specs, Number(options.prejoinSimConcurrency) || 3, async (spec) => {
    const startedAt = Date.now();
    try {
      const res = await synthesizeAdaptiveTts(spec);
      return {
        ok: true,
        sampleId: spec.sampleId,
        ms: Date.now() - startedAt,
        cacheHit: res && res.cacheHit === true,
        providerId: String(res && res.providerId || '')
      };
    } catch (error) {
      return {
        ok: false,
        sampleId: spec.sampleId,
        ms: Date.now() - startedAt,
        error: String(error && error.message || 'failed')
      };
    }
  });

  const okRows = results.filter((r) => r && r.ok);
  const msValues = okRows.map((r) => Number(r.ms)).filter(Number.isFinite);
  const cacheHits = okRows.filter((r) => r.cacheHit === true).length;
  return {
    clips: specs.length,
    success: okRows.length,
    failures: results.filter((r) => !r.ok).slice(0, 5),
    cacheHitCount: cacheHits,
    cacheHitRate: specs.length ? round3(cacheHits / specs.length) : null,
    p50Ms: msValues.length ? Math.round(median(msValues)) : null,
    p95Ms: msValues.length ? Math.round(percentile(msValues, 0.95)) : null,
    meanMs: msValues.length ? Math.round(mean(msValues)) : null
  };
}

function buildInstantaneousReadiness({
  latency,
  prejoinEstimate,
  prejoinWarmTopoff,
  postTopoffReplay,
  latencyTargets
} = {}) {
  const firstCallCount = Number(latency && latency.firstCall && latency.firstCall.count) || 0;
  const firstCallCacheHitCount = Number(latency && latency.firstCall && latency.firstCall.cacheHitCount) || 0;
  const warmCount = Number(latency && latency.warm && latency.warm.count) || 0;
  const warmFailureCount = Array.isArray(latency && latency.cacheWarmHitFailures) ? latency.cacheWarmHitFailures.length : 0;

  const firstCallCacheHitRate = firstCallCount > 0 ? (firstCallCacheHitCount / firstCallCount) : null;
  const warmCacheHitRate = warmCount > 0 ? ((warmCount - warmFailureCount) / warmCount) : null;
  const postTopoffHasP95 = Boolean(postTopoffReplay) && postTopoffReplay.p95Ms != null && Number.isFinite(Number(postTopoffReplay.p95Ms));
  const warmHasP95 = Boolean(latency && latency.warm) && latency.warm.p95Ms != null && Number.isFinite(Number(latency.warm.p95Ms));
  const instantMsMeasured = postTopoffHasP95
    ? Number(postTopoffReplay.p95Ms)
    : (warmHasP95 ? Number(latency.warm.p95Ms) : null);

  const instantScore = Number.isFinite(instantMsMeasured)
    ? scoreLatencyBand(instantMsMeasured, latencyTargets && (latencyTargets.instantaneousAppliedMs || latencyTargets.cacheHitMs))
    : null;
  const firstCallRateScore = Number.isFinite(firstCallCacheHitRate)
    ? scoreRateTarget(firstCallCacheHitRate, latencyTargets && latencyTargets.firstCallCacheHitRate)
    : null;
  const warmRateScore = Number.isFinite(warmCacheHitRate)
    ? scoreRateTarget(warmCacheHitRate, latencyTargets && latencyTargets.warmCacheHitRate)
    : null;
  const postTopoffScore = (prejoinWarmTopoff && Number.isFinite(Number(prejoinWarmTopoff.elapsedMs)))
    ? scoreLatencyBand(prejoinWarmTopoff.elapsedMs, latencyTargets && latencyTargets.prejoinWarmTopoffMs)
    : null;
  const prejoinBatchScore = (prejoinEstimate && prejoinEstimate.targetScore != null && Number.isFinite(Number(prejoinEstimate.targetScore)))
    ? Number(prejoinEstimate.targetScore)
    : null;

  const components = [
    ['instantMs', instantScore, 0.42],
    ['firstCallCacheHitRate', firstCallRateScore, 0.22],
    ['warmCacheHitRate', warmRateScore, 0.16],
    ['prejoinWarmTopoff', postTopoffScore, 0.1],
    ['prejoinBatch', prejoinBatchScore, 0.1]
  ];
  let weighted = 0;
  let weights = 0;
  for (const [, score, weight] of components) {
    if (!Number.isFinite(score)) continue;
    weighted += score * weight;
    weights += weight;
  }
  const composite = weights > 0 ? round3(weighted / weights) : null;

  let grade = 'unknown';
  if (composite != null) {
    if (composite >= 0.9) grade = 'instant-ready';
    else if (composite >= 0.75) grade = 'near-instant';
    else if (composite >= 0.55) grade = 'playable-but-not-instant';
    else grade = 'needs-prewarm-work';
  } else {
    grade = 'analysis-only';
  }

  return {
    compositeScore: composite,
    grade,
    measured: {
      instantaneousAppliedP95Ms: instantMsMeasured,
      firstCallCacheHitRate: Number.isFinite(firstCallCacheHitRate) ? round3(firstCallCacheHitRate) : null,
      warmCacheHitRate: Number.isFinite(warmCacheHitRate) ? round3(warmCacheHitRate) : null,
      postTopoffReplay: postTopoffReplay || null
    },
    componentScores: {
      instantMs: instantScore != null ? round3(instantScore) : null,
      firstCallCacheHitRate: firstCallRateScore != null ? round3(firstCallRateScore) : null,
      warmCacheHitRate: warmRateScore != null ? round3(warmRateScore) : null,
      prejoinWarmTopoff: postTopoffScore != null ? round3(postTopoffScore) : null,
      prejoinBatch: prejoinBatchScore != null ? round3(prejoinBatchScore) : null
    },
    targetsUsed: {
      instantaneousAppliedMs: latencyTargets && latencyTargets.instantaneousAppliedMs ? latencyTargets.instantaneousAppliedMs : null,
      firstCallCacheHitRate: latencyTargets && latencyTargets.firstCallCacheHitRate ? latencyTargets.firstCallCacheHitRate : null,
      warmCacheHitRate: latencyTargets && latencyTargets.warmCacheHitRate ? latencyTargets.warmCacheHitRate : null,
      prejoinWarmTopoffMs: latencyTargets && latencyTargets.prejoinWarmTopoffMs ? latencyTargets.prejoinWarmTopoffMs : null
    }
  };
}

function buildConsoleSummary(report) {
  const lines = [];
  lines.push(`Entry TTS harness: ${report.summary.sampleCount} sample(s), providerMode=${report.summary.providerMode}`);
  lines.push(`Compared vs current: improved=${report.quality.improvedSamples}/${report.quality.totalComparedSamples}, avgDelta=${report.quality.avgDeltaVsCurrent}`);
  if (report.latency && report.latency.coldGenerated && report.latency.coldGenerated.count) {
    lines.push(`Latency cold-gen p50/p95=${report.latency.coldGenerated.p50Ms}/${report.latency.coldGenerated.p95Ms}ms warm p50/p95=${report.latency.warm.p50Ms}/${report.latency.warm.p95Ms}ms`);
  } else if (report.latency && report.latency.firstCall && report.latency.firstCall.count) {
    lines.push(`Latency cold-gen n/a (all first calls cached or prewarmed); first-call p50/p95=${report.latency.firstCall.p50Ms}/${report.latency.firstCall.p95Ms}ms warm p50/p95=${report.latency.warm.p50Ms}/${report.latency.warm.p95Ms}ms`);
  } else {
    lines.push('Latency synth disabled or unavailable.');
  }
  if (report.prejoinEstimate && report.prejoinEstimate.estimatedBatchMs != null) {
    lines.push(`Estimated prejoin batch (${report.prejoinEstimate.assumedConcurrency}x): ${report.prejoinEstimate.estimatedBatchMs}ms`);
  }
  if (report.instantaneousReadiness) {
    const ir = report.instantaneousReadiness;
    lines.push(`Instant readiness: ${ir.grade} score=${ir.compositeScore} instant-p95=${ir.measured.instantaneousAppliedP95Ms}ms first-hit=${ir.measured.firstCallCacheHitRate} warm-hit=${ir.measured.warmCacheHitRate}`);
    if (ir.measured.postTopoffReplay) {
      lines.push(`Post-topoff replay: p50/p95=${ir.measured.postTopoffReplay.p50Ms}/${ir.measured.postTopoffReplay.p95Ms}ms cacheHitRate=${ir.measured.postTopoffReplay.cacheHitRate}`);
    }
  }
  for (const row of report.samples) {
    const best = row.bestPick;
    const current = row.currentPick;
    lines.push(`- ${row.sample.id}: best=${best ? `${best.voiceId}/${best.subsetId}@${best.finalScore}` : 'n/a'} current=${current ? `${current.voiceId}/${current.subsetId}@${current.finalScore}` : 'n/a'} delta=${row.deltaVsCurrent}`);
  }
  return lines.join('\n');
}

async function writeOutputs(report, options = {}) {
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(OUTPUT_DIR, `entry-voice-quality-${stamp}.json`);
  await fsp.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  let mdPath = null;
  if (!parseBool(options.noMarkdown, false)) {
    const md = [];
    md.push('# Entry Voice Quality Harness');
    md.push('');
    md.push(`Generated: ${new Date(report.generatedAt).toISOString()}`);
    md.push(`Samples: ${report.summary.sampleCount}`);
    md.push(`Provider mode: ${report.summary.providerMode}`);
    md.push('');
    if (report.latency) {
      md.push('## Latency Summary');
      md.push('');
      md.push(`- First-call p50/p95: ${report.latency.firstCall.p50Ms} / ${report.latency.firstCall.p95Ms} ms (${report.latency.firstCall.cacheHitCount} cache-hit first calls)`);
      md.push(`- Cold generated p50/p95: ${report.latency.coldGenerated.p50Ms} / ${report.latency.coldGenerated.p95Ms} ms`);
      md.push(`- Warm p50/p95: ${report.latency.warm.p50Ms} / ${report.latency.warm.p95Ms} ms`);
      md.push(`- Estimated prejoin batch (${report.prejoinEstimate.assumedConcurrency}x): ${report.prejoinEstimate.estimatedBatchMs} ms`);
      if (report.prejoinWarmTopoff) {
        md.push(`- Simulated warm topoff: ${report.prejoinWarmTopoff.elapsedMs} ms (${report.prejoinWarmTopoff.cacheHits}/${report.prejoinWarmTopoff.clips} cache hits)`);
      }
      if (report.instantaneousReadiness) {
        md.push(`- Instant readiness: ${report.instantaneousReadiness.grade} (score ${report.instantaneousReadiness.compositeScore})`);
        md.push(`- Instantaneous applied p95: ${report.instantaneousReadiness.measured.instantaneousAppliedP95Ms} ms`);
        md.push(`- First-call cache-hit rate: ${report.instantaneousReadiness.measured.firstCallCacheHitRate}`);
        md.push(`- Warm cache-hit rate: ${report.instantaneousReadiness.measured.warmCacheHitRate}`);
        if (report.instantaneousReadiness.measured.postTopoffReplay) {
          const replay = report.instantaneousReadiness.measured.postTopoffReplay;
          md.push(`- Post-topoff replay p50/p95: ${replay.p50Ms} / ${replay.p95Ms} ms (cache-hit rate ${replay.cacheHitRate})`);
        }
      }
      md.push('');
    }
    md.push('## Samples');
    md.push('');
    for (const row of report.samples) {
      md.push(`### ${row.sample.id} (${row.sample.archetype})`);
      md.push(`- Current: ${row.currentPick ? `${row.currentPick.voiceId}/${row.currentPick.subsetId} score=${row.currentPick.finalScore}` : 'n/a'}`);
      md.push(`- Best: ${row.bestPick ? `${row.bestPick.voiceId}/${row.bestPick.subsetId} score=${row.bestPick.finalScore}` : 'n/a'}`);
      md.push(`- Delta vs current: ${row.deltaVsCurrent}`);
      if (row.recommendedSubsetAddition && row.recommendedSubsetAddition.recommended) {
        md.push(`- Subset suggestion: ${row.recommendedSubsetAddition.reason} -> ${row.recommendedSubsetAddition.subsetCandidate.subsetId}`);
      }
      md.push('');
      md.push('| Rank | Voice | Subset | Score | Cold ms | Warm ms |');
      md.push('| ---: | --- | --- | ---: | ---: | ---: |');
      for (const c of row.candidates) {
        md.push(`| ${c.rank} | ${c.voiceId} | ${c.subsetId} | ${c.finalScore} | ${c.latency ? c.latency.firstGenerateMs : '-'} | ${c.latency ? c.latency.cacheHitMs : '-'} |`);
      }
      md.push('');
    }
    mdPath = path.join(OUTPUT_DIR, `entry-voice-quality-${stamp}.md`);
    await fsp.writeFile(mdPath, md.join('\n'), 'utf8');
  }

  return { jsonPath, mdPath };
}

async function runEntryVoiceQualityHarness(options = {}) {
  const fixtures = loadEntrySamples(options.fixturePath || FIXTURE_PATH);
  const ids = options.sampleIds ? String(options.sampleIds).split(',').map((s) => s.trim()).filter(Boolean) : null;
  let samples = fixtures;
  if (ids && ids.length) {
    const set = new Set(ids);
    samples = fixtures.filter((s) => set.has(s.id));
  }
  const limit = Math.max(1, Number(options.limit) || samples.length || 1);
  samples = samples.slice(0, limit);

  const providerInfo = getConfiguredProviders();
  const noSynth = Boolean(options.noSynth) || providerInfo.configured.length === 0;
  const latencyTargets = loadLatencyTargets();
  const outputDirs = await ensureOutputDirs({ writeAudio: !noSynth && options.writeAudio !== false });

  const shared = { latencyTargets, outputDirs };
  const sampleReports = [];

  for (const sample of samples) {
    sampleReports.push(await evaluateSample(sample, { ...options, noSynth }, shared));
  }

  const latency = summarizeLatency(sampleReports, latencyTargets);
  const quality = summarizeQuality(sampleReports);
  const prejoinEstimate = estimatePrejoinBatchFromBestPicks(sampleReports, latencyTargets);
  const prejoinWarmTopoff = noSynth ? null : await simulateWarmPlaybackTopoff(sampleReports, options);
  const postTopoffReplay = noSynth ? null : await measurePostTopoffInstantReplay(sampleReports, options);
  const instantaneousReadiness = buildInstantaneousReadiness({
    latency,
    prejoinEstimate,
    prejoinWarmTopoff,
    postTopoffReplay,
    latencyTargets
  });

  const report = {
    ok: true,
    generatedAt: Date.now(),
    fixturePath: options.fixturePath || FIXTURE_PATH,
    options: {
      noSynth,
      candidateLimit: Math.max(1, Number(options.candidateLimit) || 6),
      preselectCandidates: Math.max(1, Number(options.preselectCandidates) || 10),
      candidateConcurrency: Math.max(1, Number(options.candidateConcurrency) || 1),
      prejoinSimConcurrency: Math.max(1, Number(options.prejoinSimConcurrency) || 3),
      writeAudio: !noSynth && options.writeAudio !== false
    },
    summary: {
      sampleCount: sampleReports.length,
      providerMode: noSynth ? 'analysis_only_no_synth' : (providerInfo.configured.map((p) => p.id).join(',') || 'unknown'),
      configuredProviders: providerInfo.configured.map((p) => ({
        id: p.id,
        label: p.label,
        grade: p.grade,
        score: p.score
      }))
    },
    latencyTargets,
    latency,
    prejoinEstimate,
    prejoinWarmTopoff,
    postTopoffReplay,
    instantaneousReadiness,
    quality,
    samples: sampleReports
  };

  const files = await writeOutputs(report, options);
  return { report, files };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  runEntryVoiceQualityHarness({
    fixturePath: args.fixture || FIXTURE_PATH,
    limit: Number(args.limit) || undefined,
    sampleIds: args.sampleIds || '',
    noSynth: parseBool(args.noSynth, false),
    candidateLimit: Number(args.candidateLimit) || 6,
    preselectCandidates: Number(args.preselectCandidates) || 10,
    candidateConcurrency: Number(args.candidateConcurrency) || 1,
    prejoinSimConcurrency: Number(args.prejoinSimConcurrency) || 3,
    writeAudio: !parseBool(args.noAudio, false),
    noMarkdown: parseBool(args.noMarkdown, false)
  })
    .then(({ report, files }) => {
      console.log(buildConsoleSummary(report));
      console.log(`JSON: ${files.jsonPath}`);
      if (files.mdPath) console.log(`MD:   ${files.mdPath}`);
    })
    .catch((error) => {
      console.error('[tts-entry-harness] failed:', error && error.stack ? error.stack : error);
      process.exitCode = 1;
    });
}

module.exports = {
  runEntryVoiceQualityHarness
};
