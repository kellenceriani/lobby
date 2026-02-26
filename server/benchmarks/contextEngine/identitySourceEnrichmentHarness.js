const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { resolveEntryIdentity } = require('../../services/evaluation/resolver/resolveEntryIdentity');
const { resetExternalEntityFactsCaches } = require('../../services/externalEntityFactsService');

const OUTPUT_DIR = path.join(__dirname, 'output');
const SEEDED_MINI_FIXTURE = path.join(__dirname, 'fixtures', 'seeded-mini.json');
const ENTRY_SAMPLE_FIXTURE = path.join(__dirname, '..', 'ttsEntryQuality', 'fixtures', 'entry-samples.json');
const HARD_CASE_ROWS = [
  { id: 'hard_spongebob', character: 'Spongebob', scenario: 'REPAIR A MOON BASE', twist: 'AS A HOLOGRAM' },
  { id: 'hard_flash', character: 'The Flash', scenario: 'WIN A IMPROV COMPETITION', twist: 'AS A SHADOW' },
  { id: 'hard_lebron', character: 'Lebron James', scenario: 'TEACH GRAVITY TO LOVE', twist: 'NO MODERN TECH | CLOCK NEVER STOPS' },
  { id: 'hard_ishigami', character: 'Ishigami Senky', scenario: 'STABILIZE A SPECIES ESCAPE', twist: 'WITH ONLY ANALOG BACKUPS' },
  { id: 'hard_lavagirl', character: 'Lava Girl', scenario: 'DIRECT A MUSIC VIDEO', twist: 'ON THE MOON' },
  { id: 'hard_sharknado4', character: 'Sharknado 4', scenario: 'DIRECT A MUSIC VIDEO', twist: 'ON THE MOON' },
  { id: 'hard_masterchief', character: 'Master Chief', scenario: 'OUTSMART ZOMBIE APOCALYPSE', twist: 'USING ONLY EMOJIS' },
  { id: 'hard_tonystark', character: 'Tony Stark', scenario: 'SALVAGE AN AUGMENTATION CRISIS', twist: 'UNDER CONSTANT AFTERSHOCKS' },
  { id: 'hard_arthurmorgan', character: 'Arthur Morgan', scenario: 'SALVAGE AN AUGMENTATION CRISIS', twist: 'UNDER CONSTANT AFTERSHOCKS' },
  { id: 'hard_queen', character: 'Queen', scenario: 'DIRECT A MUSIC VIDEO', twist: 'ON THE MOON' },
  { id: 'hard_jesus', character: 'Jesus Christ', scenario: 'TEACH CRICKET TO BEGINNERS', twist: 'THROUGH A KALEIDOSCOPE' },
  { id: 'hard_superman', character: 'Superman', scenario: 'WIN A IMPROV COMPETITION', twist: 'AS A SHADOW' }
];

function clamp(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function percentile(values = [], p = 0.5) {
  const nums = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return 0;
  if (nums.length === 1) return nums[0];
  const idx = clamp((nums.length - 1) * p, 0, nums.length - 1, 0);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return nums[lo];
  const t = idx - lo;
  return Math.round((nums[lo] + ((nums[hi] - nums[lo]) * t)) * 1000) / 1000;
}

function mean(values = []) {
  const nums = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
  if (!nums.length) return 0;
  return Math.round((nums.reduce((sum, n) => sum + n, 0) / nums.length) * 1000) / 1000;
}

function parseArgs(argv = []) {
  const out = { limit: 16, noMarkdown: false, jsonStdout: false, singleExternal: null };
  argv.forEach((arg) => {
    const raw = String(arg || '').trim();
    if (!raw) return;
    if (raw === '--noMarkdown' || raw === '--noMarkdown=true') out.noMarkdown = true;
    if (raw === '--jsonStdout' || raw === '--jsonStdout=true') out.jsonStdout = true;
    if (raw.startsWith('--limit=')) out.limit = clamp(raw.split('=')[1], 1, 48, 16);
    if (raw.startsWith('--singleExternal=')) {
      const v = raw.split('=')[1];
      out.singleExternal = (v === '1' || /^true$/i.test(String(v))) ? true : (v === '0' || /^false$/i.test(String(v)) ? false : null);
    }
  });
  return out;
}

function hasSpeechLikeVerb(text = '') {
  return /\b(is|are|was|were|has|have|can|will|would|should|must|did|does|do|known|fights?|leads?|rules?|works?|lives?|builds?|creates?|appears?)\b/i.test(String(text || ''));
}

function summarizeDescription(text = '') {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  const words = value ? value.split(/\s+/).filter(Boolean).length : 0;
  return {
    text: value,
    chars: value.length,
    words,
    saySomething: words >= 5 && hasSpeechLikeVerb(value)
  };
}

async function loadHarnessRows(limit = 16) {
  const seededRaw = JSON.parse(String(await fs.readFile(SEEDED_MINI_FIXTURE, 'utf8')).replace(/^\uFEFF/, ''));
  const seeded = (Array.isArray(seededRaw) ? seededRaw : [])
    .map((row, idx) => ({
      id: String(row && row.id || `seeded_${idx + 1}`),
      character: String(row && row.character || '').trim(),
      scenario: String(row && row.scenario || ''),
      twist: String(row && row.twist || ''),
      options: row && row.options && typeof row.options === 'object' ? row.options : {}
    }))
    .filter((row) => row.character);

  const entrySampleRaw = JSON.parse(String(await fs.readFile(ENTRY_SAMPLE_FIXTURE, 'utf8')).replace(/^\uFEFF/, ''));
  const entrySamples = (Array.isArray(entrySampleRaw && entrySampleRaw.samples) ? entrySampleRaw.samples : [])
    .slice(0, 12)
    .map((row, idx) => ({
      id: `tts_${String(row && row.id || idx + 1)}`,
      character: String(row && row.character || '').trim(),
      scenario: 'IMPROVISE A TEAM RESCUE',
      twist: 'WITH ONLY ANALOG TOOLS',
      options: { evaluationMode: 'round' }
    }))
    .filter((row) => row.character);

  const hardCases = HARD_CASE_ROWS.map((row) => ({
    ...row,
    options: { evaluationMode: 'round' }
  }));

  const deduped = [];
  const seen = new Set();
  hardCases.concat(seeded, entrySamples).forEach((row) => {
    const key = `${row.character.toLowerCase()}|${String(row.scenario || '').toLowerCase()}|${String(row.twist || '').toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(row);
  });
  return deduped.slice(0, limit);
}

async function resolveOne(row, { externalEnabled }) {
  const startedAt = Date.now();
  const result = await resolveEntryIdentity({
    character: row.character,
    scenario: row.scenario,
    twist: row.twist,
    options: {
      ...(row.options || {}),
      // Keep image work out of the benchmark so we measure identity/info effects.
      skipImageBackfill: true,
      skipSyntheticImageUpgrade: true,
      skipExternalFactEnrichment: externalEnabled === false
    }
  });
  return {
    elapsedMs: Math.max(0, Date.now() - startedAt),
    result
  };
}

function compareRows(row, baseline, enriched) {
  const baseInfo = baseline && baseline.result && baseline.result.scoringInfo ? baseline.result.scoringInfo : null;
  const nextInfo = enriched && enriched.result && enriched.result.scoringInfo ? enriched.result.scoringInfo : null;
  const baseDesc = summarizeDescription(baseInfo && baseInfo.description);
  const nextDesc = summarizeDescription(nextInfo && nextInfo.description);
  const baseSource = String(baseInfo && baseInfo.source || '');
  const nextSource = String(nextInfo && nextInfo.source || '');
  const upgradedSource = nextSource.includes('+wikidata') || nextSource.includes('+dbpedia');
  const descImproved = nextDesc.chars >= (baseDesc.chars + 20) || (!baseDesc.saySomething && nextDesc.saySomething);
  const confidenceDelta = Number((Number(enriched && enriched.result && enriched.result.infoConfidence || 0) - Number(baseline && baseline.result && baseline.result.infoConfidence || 0)).toFixed(3));
  return {
    id: row.id,
    character: row.character,
    baselineMs: baseline.elapsedMs,
    enrichedMs: enriched.elapsedMs,
    latencyDeltaMs: enriched.elapsedMs - baseline.elapsedMs,
    baselineSource: baseSource,
    enrichedSource: nextSource,
    upgradedSource,
    baselineConfidence: Number(baseline && baseline.result && baseline.result.infoConfidence || 0),
    enrichedConfidence: Number(enriched && enriched.result && enriched.result.infoConfidence || 0),
    confidenceDelta,
    baselineDesc: { chars: baseDesc.chars, words: baseDesc.words, saySomething: baseDesc.saySomething },
    enrichedDesc: { chars: nextDesc.chars, words: nextDesc.words, saySomething: nextDesc.saySomething },
    descImproved,
    titleChanged: String(baseInfo && (baseInfo.title || baseInfo.name) || '') !== String(nextInfo && (nextInfo.title || nextInfo.name) || ''),
    resolutionStatusChanged: String(baseline && baseline.result && baseline.result.resolutionStatus || '') !== String(enriched && enriched.result && enriched.result.resolutionStatus || ''),
    externalEnrichmentMeta: nextInfo && nextInfo.lookupMeta && nextInfo.lookupMeta.externalFactEnrichment ? nextInfo.lookupMeta.externalFactEnrichment : null
  };
}

async function runSinglePass(rows = [], externalEnabled = false) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    try {
      resetExternalEntityFactsCaches();
    } catch (_) {
      // best effort; resolver has other caches we intentionally leave intact for realistic immediate replay
    }
    const first = await resolveOne(row, { externalEnabled });
    const warm = await resolveOne(row, { externalEnabled });
    out.push({
      id: row.id,
      character: row.character,
      scenario: row.scenario,
      twist: row.twist,
      externalEnabled,
      firstMs: first.elapsedMs,
      warmMs: warm.elapsedMs,
      result: first.result
    });
  }
  return out;
}

function runChildPass(limit, externalEnabled) {
  return new Promise((resolve, reject) => {
    const args = [
      __filename,
      `--limit=${limit}`,
      `--singleExternal=${externalEnabled ? '1' : '0'}`,
      '--jsonStdout=true',
      '--noMarkdown=true'
    ];
    execFile(process.execPath, args, { cwd: process.cwd(), timeout: 20 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`child_pass_failed external=${externalEnabled ? 1 : 0} ${error.message}\n${stderr || ''}`.trim()));
      }
      try {
        const parsed = JSON.parse(String(stdout || '').trim());
        return resolve(parsed);
      } catch (parseError) {
        return reject(new Error(`child_pass_parse_failed external=${externalEnabled ? 1 : 0} ${parseError.message}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
      }
    });
  });
}

async function runIdentitySourceEnrichmentHarness(options = {}) {
  const startedAt = Date.now();
  const rows = await loadHarnessRows(options.limit);
  const [baselinePass, enrichedPass] = await Promise.all([
    runChildPass(rows.length, false),
    runChildPass(rows.length, true)
  ]);

  const baselineRows = Array.isArray(baselinePass && baselinePass.rows) ? baselinePass.rows : [];
  const enrichedRows = Array.isArray(enrichedPass && enrichedPass.rows) ? enrichedPass.rows : [];
  const baselineById = new Map(baselineRows.map((r) => [String(r && r.id || ''), r]));
  const enrichedById = new Map(enrichedRows.map((r) => [String(r && r.id || ''), r]));
  const comparisons = [];
  rows.forEach((row) => {
    const base = baselineById.get(String(row.id));
    const next = enrichedById.get(String(row.id));
    if (!base || !next) return;
    const baseline = { elapsedMs: Number(base.firstMs) || 0, result: base.result };
    const enriched = { elapsedMs: Number(next.firstMs) || 0, result: next.result };
    const comparison = compareRows(row, baseline, enriched);
    comparison.latency = {
      baselineColdMs: Number(base.firstMs) || 0,
      enrichedColdMs: Number(next.firstMs) || 0,
      baselineWarmMs: Number(base.warmMs) || 0,
      enrichedWarmMs: Number(next.warmMs) || 0,
      coldDeltaMs: (Number(next.firstMs) || 0) - (Number(base.firstMs) || 0),
      warmDeltaMs: (Number(next.warmMs) || 0) - (Number(base.warmMs) || 0)
    };
    comparison.baselineMs = comparison.latency.baselineColdMs;
    comparison.enrichedMs = comparison.latency.enrichedColdMs;
    comparison.latencyDeltaMs = comparison.latency.coldDeltaMs;
    comparisons.push(comparison);
  });

  const latencyBase = comparisons.map((r) => Number(r.latency && r.latency.baselineColdMs) || 0);
  const latencyEnriched = comparisons.map((r) => Number(r.latency && r.latency.enrichedColdMs) || 0);
  const latencyDelta = comparisons.map((r) => Number(r.latency && r.latency.coldDeltaMs) || 0);
  const latencyWarmBase = comparisons.map((r) => Number(r.latency && r.latency.baselineWarmMs) || 0);
  const latencyWarmEnriched = comparisons.map((r) => Number(r.latency && r.latency.enrichedWarmMs) || 0);
  const latencyWarmDelta = comparisons.map((r) => Number(r.latency && r.latency.warmDeltaMs) || 0);
  const descImprovedRows = comparisons.filter((r) => r.descImproved);
  const sourceUpgradedRows = comparisons.filter((r) => r.upgradedSource);
  const saySomethingGainRows = comparisons.filter((r) => !r.baselineDesc.saySomething && r.enrichedDesc.saySomething);
  const externalFactHitRows = comparisons.filter((r) => r.externalEnrichmentMeta && typeof r.externalEnrichmentMeta === 'object');
  const externalDrivenDescImprovedRows = comparisons.filter((r) => r.descImproved && (r.upgradedSource || (r.externalEnrichmentMeta && typeof r.externalEnrichmentMeta === 'object')));
  const nonExternalDriftImprovedRows = comparisons.filter((r) => r.descImproved && !externalDrivenDescImprovedRows.includes(r));

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    input: { sampleCount: rows.length },
    passInfo: {
      baseline: {
        externalEnabled: false,
        elapsedMs: Number(baselinePass && baselinePass.elapsedMs) || 0
      },
      enriched: {
        externalEnabled: true,
        elapsedMs: Number(enrichedPass && enrichedPass.elapsedMs) || 0
      }
    },
    summary: {
      descImproved: descImprovedRows.length,
      descImprovedRate: rows.length ? Number((descImprovedRows.length / rows.length).toFixed(3)) : 0,
      descImprovedExternalDriven: externalDrivenDescImprovedRows.length,
      descImprovedExternalDrivenRate: rows.length ? Number((externalDrivenDescImprovedRows.length / rows.length).toFixed(3)) : 0,
      descImprovedNonExternalDrift: nonExternalDriftImprovedRows.length,
      descImprovedNonExternalDriftRate: rows.length ? Number((nonExternalDriftImprovedRows.length / rows.length).toFixed(3)) : 0,
      sourceUpgraded: sourceUpgradedRows.length,
      sourceUpgradedRate: rows.length ? Number((sourceUpgradedRows.length / rows.length).toFixed(3)) : 0,
      saySomethingGains: saySomethingGainRows.length,
      saySomethingGainRate: rows.length ? Number((saySomethingGainRows.length / rows.length).toFixed(3)) : 0,
      externalFactHits: externalFactHitRows.length,
      externalFactHitRate: rows.length ? Number((externalFactHitRows.length / rows.length).toFixed(3)) : 0,
      latencyMs: {
        baselineP50: percentile(latencyBase, 0.5),
        baselineP95: percentile(latencyBase, 0.95),
        enrichedP50: percentile(latencyEnriched, 0.5),
        enrichedP95: percentile(latencyEnriched, 0.95),
        deltaAvg: mean(latencyDelta),
        deltaP50: percentile(latencyDelta, 0.5),
        deltaP95: percentile(latencyDelta, 0.95),
        warmBaselineP50: percentile(latencyWarmBase, 0.5),
        warmBaselineP95: percentile(latencyWarmBase, 0.95),
        warmEnrichedP50: percentile(latencyWarmEnriched, 0.5),
        warmEnrichedP95: percentile(latencyWarmEnriched, 0.95),
        warmDeltaAvg: mean(latencyWarmDelta),
        warmDeltaP50: percentile(latencyWarmDelta, 0.5),
        warmDeltaP95: percentile(latencyWarmDelta, 0.95)
      }
    },
    examples: {
      improved: descImprovedRows.slice(0, 8),
      externalDrivenImproved: externalDrivenDescImprovedRows.slice(0, 8),
      nonExternalDriftImproved: nonExternalDriftImprovedRows.slice(0, 8),
      sourceUpgraded: sourceUpgradedRows.slice(0, 8),
      externalFactHits: externalFactHitRows.slice(0, 8)
    },
    rows: comparisons,
    elapsedMs: Date.now() - startedAt
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(OUTPUT_DIR, `identity-source-enrichment-${stamp}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  let mdPath = null;
  if (!options.noMarkdown) {
    mdPath = path.join(OUTPUT_DIR, `identity-source-enrichment-${stamp}.md`);
    const lines = [
      '# Identity Source Enrichment Harness',
      '',
      `- Samples: ${report.input.sampleCount}`,
      `- Description improved: ${report.summary.descImproved}/${report.input.sampleCount} (${report.summary.descImprovedRate})`,
      `- External-driven description improved: ${report.summary.descImprovedExternalDriven}/${report.input.sampleCount} (${report.summary.descImprovedExternalDrivenRate})`,
      `- Non-external drift description improved: ${report.summary.descImprovedNonExternalDrift}/${report.input.sampleCount} (${report.summary.descImprovedNonExternalDriftRate})`,
      `- Source upgraded (+wikidata/+dbpedia): ${report.summary.sourceUpgraded}/${report.input.sampleCount} (${report.summary.sourceUpgradedRate})`,
      `- Say-something gains: ${report.summary.saySomethingGains}/${report.input.sampleCount} (${report.summary.saySomethingGainRate})`,
      `- External fact hits: ${report.summary.externalFactHits}/${report.input.sampleCount} (${report.summary.externalFactHitRate})`,
      `- Latency baseline p50/p95: ${report.summary.latencyMs.baselineP50}/${report.summary.latencyMs.baselineP95} ms`,
      `- Latency enriched p50/p95: ${report.summary.latencyMs.enrichedP50}/${report.summary.latencyMs.enrichedP95} ms`,
      `- Latency delta avg/p50/p95: ${report.summary.latencyMs.deltaAvg}/${report.summary.latencyMs.deltaP50}/${report.summary.latencyMs.deltaP95} ms`,
      `- Warm latency baseline p50/p95: ${report.summary.latencyMs.warmBaselineP50}/${report.summary.latencyMs.warmBaselineP95} ms`,
      `- Warm latency enriched p50/p95: ${report.summary.latencyMs.warmEnrichedP50}/${report.summary.latencyMs.warmEnrichedP95} ms`,
      `- Warm latency delta avg/p50/p95: ${report.summary.latencyMs.warmDeltaAvg}/${report.summary.latencyMs.warmDeltaP50}/${report.summary.latencyMs.warmDeltaP95} ms`
    ];
    await fs.writeFile(mdPath, `${lines.join('\n')}\n`, 'utf8');
  }

  return { report, files: mdPath ? { jsonPath, mdPath } : { jsonPath } };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (typeof options.singleExternal === 'boolean') {
    const startedAt = Date.now();
    const rows = await loadHarnessRows(options.limit);
    const passRows = await runSinglePass(rows, options.singleExternal);
    const payload = {
      mode: 'single-pass',
      externalEnabled: options.singleExternal,
      input: { sampleCount: rows.length },
      rows: passRows,
      elapsedMs: Date.now() - startedAt
    };
    if (options.jsonStdout) {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      return;
    }
    console.log('[identity-source-bench] single-pass complete');
    console.log(`  externalEnabled=${options.singleExternal ? 1 : 0} samples=${rows.length} elapsedMs=${payload.elapsedMs}`);
    return;
  }
  const result = await runIdentitySourceEnrichmentHarness(options);
  const s = result.report.summary;
  const passInfo = result.report.passInfo || {};
  console.log('[identity-source-bench] complete');
  console.log(`  output: ${result.files.jsonPath}`);
  console.log(`  desc improved: ${s.descImprovedRate} (${s.descImproved}/${result.report.input.sampleCount})`);
  console.log(`  external-driven desc improved: ${s.descImprovedExternalDrivenRate} drift=${s.descImprovedNonExternalDriftRate}`);
  console.log(`  source upgraded: ${s.sourceUpgradedRate} saySomething gains=${s.saySomethingGainRate} external hits=${s.externalFactHitRate}`);
  console.log(`  pass elapsed baseline/enriched=${passInfo.baseline && passInfo.baseline.elapsedMs || 0}/${passInfo.enriched && passInfo.enriched.elapsedMs || 0}ms`);
  console.log(`  cold latency p50/p95 base=${s.latencyMs.baselineP50}/${s.latencyMs.baselineP95}ms enriched=${s.latencyMs.enrichedP50}/${s.latencyMs.enrichedP95}ms delta avg/p95=${s.latencyMs.deltaAvg}/${s.latencyMs.deltaP95}ms`);
  console.log(`  warm latency p50/p95 base=${s.latencyMs.warmBaselineP50}/${s.latencyMs.warmBaselineP95}ms enriched=${s.latencyMs.warmEnrichedP50}/${s.latencyMs.warmEnrichedP95}ms delta avg/p95=${s.latencyMs.warmDeltaAvg}/${s.latencyMs.warmDeltaP95}ms`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[identity-source-bench] failed:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = {
  runIdentitySourceEnrichmentHarness
};
