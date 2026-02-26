const fs = require('fs/promises');
const path = require('path');

const {
  lookupExternalEntityFactBySource,
  lookupExternalEntityFact,
  probeFandomGlobalSearch,
  resetExternalEntityFactsCaches
} = require('../../services/externalEntityFactsService');

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'entry-samples.json');
const OUTPUT_DIR = path.join(__dirname, 'output');

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
  const out = {
    limit: 18,
    noMarkdown: false,
    noDbpedia: false,
    noFandom: false
  };
  argv.forEach((arg) => {
    const raw = String(arg || '').trim();
    if (!raw) return;
    if (raw === '--noMarkdown' || raw === '--noMarkdown=true') out.noMarkdown = true;
    if (raw === '--noDbpedia' || raw === '--noDbpedia=true') out.noDbpedia = true;
    if (raw === '--noFandom' || raw === '--noFandom=true') out.noFandom = true;
    if (raw.startsWith('--limit=')) out.limit = clamp(raw.split('=')[1], 1, 64, 18);
  });
  return out;
}

function sanitizeSlug(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function tokenize(value = '') {
  const slug = sanitizeSlug(value);
  if (!slug) return [];
  return slug.split('-').filter((token) => token && token.length >= 2);
}

function splitSentences(text = '') {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function hasSpeechLikeVerb(text = '') {
  return /\b(is|are|was|were|has|have|can|will|would|should|must|did|does|do|said|says|known|fights?|leads?|rules?|works?|lives?|builds?|creates?)\b/i.test(String(text || ''));
}

function isSaySomethingLine(text = '') {
  const line = String(text || '').replace(/\s+/g, ' ').trim();
  if (!line) return false;
  if (/disambiguation|may refer to/i.test(line)) return false;
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 5) return false;
  return hasSpeechLikeVerb(line);
}

function titleMatchScore(meta = {}, title = '') {
  const candidate = String(title || '').trim();
  if (!candidate) return 0;
  const titleTokens = new Set(tokenize(candidate));
  const values = []
    .concat(meta.character || '')
    .concat(meta.resolvedTitle || '')
    .concat(Array.isArray(meta.aliases) ? meta.aliases : [])
    .filter(Boolean);
  let score = 0;
  values.forEach((value) => {
    const slug = sanitizeSlug(value);
    const titleSlug = sanitizeSlug(candidate);
    if (!slug || !titleSlug) return;
    if (slug === titleSlug) score += 180;
    else if (titleSlug.includes(slug) || slug.includes(titleSlug)) score += 36;
    tokenize(value).forEach((token) => { if (titleTokens.has(token)) score += 8; });
  });
  return score;
}

async function loadEntries(limit = 18) {
  const raw = await fs.readFile(FIXTURE_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const samples = Array.isArray(parsed && parsed.samples) ? parsed.samples : [];
  const extras = [
    { id: 'extra_batman', character: 'Batman' },
    { id: 'extra_masterchief', character: 'Master Chief', resolvedTitle: 'Master Chief (Halo)' },
    { id: 'extra_tonystark', character: 'Tony Stark', resolvedTitle: 'Iron Man' },
    { id: 'extra_spongebob', character: 'Spongebob', resolvedTitle: 'SpongeBob SquarePants (character)' },
    { id: 'extra_lebron', character: 'Lebron James', resolvedTitle: 'Lebron James' },
    { id: 'extra_danny', character: 'Danny Phantom', resolvedTitle: 'Danny Phantom' }
  ];
  const rows = samples.map((sample) => ({
    id: String(sample.id || ''),
    character: String(sample.character || '').trim(),
    resolvedTitle: String(sample.character || '').trim(),
    aliases: [],
    infoConfidence: 0.84,
    resolverConfidence: 0.84,
    resolvedSource: 'harness-fixture'
  })).concat(extras);

  const deduped = [];
  const seen = new Set();
  rows.forEach((row) => {
    const key = `${String(row.character || '').toLowerCase()}|${String(row.resolvedTitle || '').toLowerCase()}`;
    if (!row.character || seen.has(key)) return;
    seen.add(key);
    deduped.push(row);
  });
  return deduped.slice(0, limit);
}

function summarizeAttempts(attempts = [], entries = []) {
  const bySource = {};
  attempts.forEach((row) => {
    const source = String(row && row.source || 'unknown');
    if (!bySource[source]) {
      bySource[source] = {
        source,
        attempts: 0,
        ok: 0,
        unavailable: 0,
        errors: 0,
        usableFacts: 0,
        titleGood: 0,
        descWords: [],
        latency: []
      };
    }
    const bucket = bySource[source];
    bucket.attempts += 1;
    if (row && row.ok === true) bucket.ok += 1;
    if (row && row.unavailable === true) bucket.unavailable += 1;
    if (row && row.error) bucket.errors += 1;
    if (row && row.ok === true && isSaySomethingLine(row.description)) bucket.usableFacts += 1;
    if (row && row.ok === true && titleMatchScore(entries[row.entryIndex] || {}, row.title) >= 60) bucket.titleGood += 1;
    if (row && row.ok === true) bucket.descWords.push(String(row.description || '').split(/\s+/).filter(Boolean).length);
    if (Number.isFinite(Number(row.latencyMs))) bucket.latency.push(Number(row.latencyMs));
  });

  return Object.fromEntries(
    Object.entries(bySource).map(([source, bucket]) => [source, {
      attempts: bucket.attempts,
      ok: bucket.ok,
      successRate: bucket.attempts ? Number((bucket.ok / bucket.attempts).toFixed(3)) : 0,
      unavailable: bucket.unavailable,
      errors: bucket.errors,
      usableFacts: bucket.usableFacts,
      usableFactRate: bucket.attempts ? Number((bucket.usableFacts / bucket.attempts).toFixed(3)) : 0,
      titleGoodRate: bucket.attempts ? Number((bucket.titleGood / bucket.attempts).toFixed(3)) : 0,
      latencyMs: {
        avg: mean(bucket.latency),
        p50: percentile(bucket.latency, 0.5),
        p95: percentile(bucket.latency, 0.95)
      },
      descWords: {
        avg: mean(bucket.descWords),
        p50: percentile(bucket.descWords, 0.5),
        p95: percentile(bucket.descWords, 0.95)
      }
    }])
  );
}

async function runExternalSourceReliabilityHarness(options = {}) {
  const startedAt = Date.now();
  const entries = await loadEntries(options.limit);
  const sources = ['wikidata']
    .concat(options.noDbpedia ? [] : ['dbpedia'])
    .concat(options.noFandom ? [] : ['fandom']);

  resetExternalEntityFactsCaches();

  const combinedColdRuns = [];
  for (let i = 0; i < entries.length; i += 1) {
    const result = await lookupExternalEntityFact(entries[i], {
      sources,
      totalTimeoutMs: 2200,
      fastOnly: false,
      stopOnFirstHit: false
    });
    combinedColdRuns.push({
      entryIndex: i,
      elapsedMs: Number(result && result.elapsedMs) || 0,
      best: result && result.best ? result.best : null,
      attempts: Array.isArray(result && result.attempts) ? result.attempts : []
    });
  }

  const combinedWarmRuns = [];
  for (let i = 0; i < entries.length; i += 1) {
    const result = await lookupExternalEntityFact(entries[i], {
      sources,
      totalTimeoutMs: 2200,
      fastOnly: false,
      stopOnFirstHit: false
    });
    combinedWarmRuns.push({
      entryIndex: i,
      elapsedMs: Number(result && result.elapsedMs) || 0,
      best: result && result.best ? result.best : null,
      attempts: Array.isArray(result && result.attempts) ? result.attempts : []
    });
  }

  resetExternalEntityFactsCaches();
  const sourceAttempts = [];
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    const entry = entries[entryIndex];
    for (const source of sources) {
      const result = await lookupExternalEntityFactBySource(source, entry, {
        includeAliases: true,
        timeoutMs: source === 'dbpedia' ? 1800 : source === 'wikidata' ? 900 : 500
      }).catch((error) => ({
        source,
        ok: false,
        error: error && error.message ? error.message : 'source_failed',
        latencyMs: 0
      }));
      sourceAttempts.push({
        entryIndex,
        source,
        ok: Boolean(result && result.ok),
        unavailable: Boolean(result && result.unavailable),
        title: String(result && result.title || ''),
        description: String(result && result.description || ''),
        confidence: Number(result && result.confidence) || 0,
        matchScore: Number(result && result.matchScore) || 0,
        latencyMs: Number(result && result.latencyMs) || 0,
        cacheHit: Boolean(result && result.cacheHit),
        error: result && result.error ? String(result.error) : null
      });
    }
  }

  const combinedColdLatency = combinedColdRuns.map((r) => r.elapsedMs);
  const combinedWarmLatency = combinedWarmRuns.map((r) => r.elapsedMs);
  const combinedHits = combinedColdRuns.filter((r) => r.best && r.best.description);
  const combinedUseful = combinedHits.filter((r) => isSaySomethingLine(r.best.description));
  const combinedTitleGood = combinedHits.filter((r) => titleMatchScore(entries[r.entryIndex], r.best.title) >= 60);
  const sourceSummary = summarizeAttempts(sourceAttempts, entries);
  const fandomProbe = options.noFandom ? null : await probeFandomGlobalSearch().catch(() => null);

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    input: {
      sampleCount: entries.length,
      sources
    },
    sourceSummary,
    combined: {
      runs: combinedColdRuns.length,
      hits: combinedHits.length,
      hitRate: combinedColdRuns.length ? Number((combinedHits.length / combinedColdRuns.length).toFixed(3)) : 0,
      usableFacts: combinedUseful.length,
      usableFactRate: combinedColdRuns.length ? Number((combinedUseful.length / combinedColdRuns.length).toFixed(3)) : 0,
      titleGoodRate: combinedColdRuns.length ? Number((combinedTitleGood.length / combinedColdRuns.length).toFixed(3)) : 0,
      coldLatencyMs: {
        avg: mean(combinedColdLatency),
        p50: percentile(combinedColdLatency, 0.5),
        p95: percentile(combinedColdLatency, 0.95)
      },
      warmLatencyMs: {
        avg: mean(combinedWarmLatency),
        p50: percentile(combinedWarmLatency, 0.5),
        p95: percentile(combinedWarmLatency, 0.95)
      }
    },
    fandomProbe,
    examples: {
      bestHits: combinedHits.slice(0, 8).map((r) => ({
        character: entries[r.entryIndex] && entries[r.entryIndex].character,
        source: r.best && r.best.source,
        title: r.best && r.best.title,
        description: String(r.best && r.best.description || '').slice(0, 180),
        elapsedMs: r.elapsedMs
      })),
      misses: combinedColdRuns.filter((r) => !r.best).slice(0, 8).map((r) => ({
        character: entries[r.entryIndex] && entries[r.entryIndex].character,
        elapsedMs: r.elapsedMs,
        attempts: (r.attempts || []).map((a) => `${a.source}:${a.ok ? 'ok' : (a.unavailable ? 'unavail' : 'fail')}`).join(',')
      }))
    },
    elapsedMs: Date.now() - startedAt
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(OUTPUT_DIR, `external-source-reliability-${stamp}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  let mdPath = null;
  if (!options.noMarkdown) {
    mdPath = path.join(OUTPUT_DIR, `external-source-reliability-${stamp}.md`);
    const lines = [
      '# External Source Reliability Harness',
      '',
      `- Samples: ${report.input.sampleCount}`,
      `- Sources: ${report.input.sources.join(', ')}`,
      `- Combined hit/useful/title-good: ${report.combined.hits}/${report.combined.usableFacts}/${Math.round(report.combined.titleGoodRate * report.combined.runs)} (${report.combined.hitRate}/${report.combined.usableFactRate}/${report.combined.titleGoodRate})`,
      `- Combined cold latency p50/p95: ${report.combined.coldLatencyMs.p50}/${report.combined.coldLatencyMs.p95} ms`,
      `- Combined warm latency p50/p95: ${report.combined.warmLatencyMs.p50}/${report.combined.warmLatencyMs.p95} ms`,
      '',
      '## Per Source',
      ...Object.entries(report.sourceSummary).map(([source, row]) =>
        `- ${source}: hit=${row.successRate}, useful=${row.usableFactRate}, titleGood=${row.titleGoodRate}, p50/p95=${row.latencyMs.p50}/${row.latencyMs.p95}ms, unavail=${row.unavailable}`
      )
    ];
    await fs.writeFile(mdPath, `${lines.join('\n')}\n`, 'utf8');
  }

  return {
    report,
    files: mdPath ? { jsonPath, mdPath } : { jsonPath }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runExternalSourceReliabilityHarness(options);
  const r = result.report;
  console.log('[ext-source-bench] complete');
  console.log(`  output: ${result.files.jsonPath}`);
  console.log(`  combined hit/useful/titleGood: ${r.combined.hitRate}/${r.combined.usableFactRate}/${r.combined.titleGoodRate}`);
  console.log(`  combined cold p50/p95: ${r.combined.coldLatencyMs.p50}/${r.combined.coldLatencyMs.p95} ms`);
  console.log(`  combined warm p50/p95: ${r.combined.warmLatencyMs.p50}/${r.combined.warmLatencyMs.p95} ms`);
  Object.entries(r.sourceSummary).forEach(([source, row]) => {
    console.log(`  ${source}: hit=${row.successRate} useful=${row.usableFactRate} titleGood=${row.titleGoodRate} p50/p95=${row.latencyMs.p50}/${row.latencyMs.p95}ms unavail=${row.unavailable}`);
  });
  if (r.fandomProbe) {
    console.log(`  fandom probe: ok=${r.fandomProbe.ok === true} status=${r.fandomProbe.statusCode || 0} ms=${r.fandomProbe.latencyMs || 0}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[ext-source-bench] failed:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = {
  runExternalSourceReliabilityHarness
};
