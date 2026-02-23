const fs = require('fs');
const path = require('path');
const { evaluateCharacter, evaluateCharactersBatch } = require('../../services/entryEvaluationService');

const DEFAULT_FIXTURES = [
  {
    id: 'r1-batman',
    character: 'Batman',
    scenario: 'DEFEND A CITY FROM CHAOS',
    twist: 'AT NIGHT DURING A BLACKOUT',
    options: { evaluationMode: 'round', originalScenario: 'DEFEND A CITY FROM CHAOS', originalTwist: 'AT NIGHT DURING A BLACKOUT' }
  },
  {
    id: 'r1-spongebob',
    character: 'SpongeBob',
    scenario: 'RUN AN EMERGENCY KITCHEN',
    twist: 'WITH NO ELECTRICITY',
    options: { evaluationMode: 'round' }
  },
  {
    id: 'r1-firetruck',
    character: 'Firetruck',
    scenario: 'EVACUATE A FLOODED DISTRICT',
    twist: 'UNDER HEAVY TRAFFIC',
    options: { evaluationMode: 'round' }
  },
  {
    id: 'r1-sherlock',
    character: 'Sherlock Holmes',
    scenario: 'INVESTIGATE A SYSTEM FAILURE',
    twist: 'WITH CONFUSING WITNESS REPORTS',
    options: { evaluationMode: 'round' }
  },
  {
    id: 'f-batman',
    character: 'Batman',
    scenario: 'DECODE A GRID CRASH',
    twist: 'WITH ONE SHARED POWER SOURCE',
    options: {
      evaluationMode: 'final',
      originalScenario: 'DEFEND A CITY FROM CHAOS',
      originalTwist: 'AT NIGHT DURING A BLACKOUT',
      teamPool: ['Batman', 'Oracle', 'Alfred', 'The Flash', 'Superman', 'Aquaman'],
      roundPool: ['Batman', 'Oracle', 'Alfred', 'The Flash', 'Superman', 'Aquaman', 'Spider-Man', 'Hulk', 'Thor', 'Iron Man', 'Hawkeye', 'Black Widow']
    }
  },
  {
    id: 'f-aquaman',
    character: 'Aquaman',
    scenario: 'DECODE A GRID CRASH',
    twist: 'WITH ONE SHARED POWER SOURCE',
    options: {
      evaluationMode: 'final',
      originalScenario: 'SURVIVE AN OCEAN STORM',
      originalTwist: 'WITH NO COMMUNICATION',
      teamPool: ['Batman', 'Oracle', 'Alfred', 'The Flash', 'Superman', 'Aquaman'],
      roundPool: ['Batman', 'Oracle', 'Alfred', 'The Flash', 'Superman', 'Aquaman', 'Spider-Man', 'Hulk', 'Thor', 'Iron Man', 'Hawkeye', 'Black Widow']
    }
  },
  {
    id: 'f-spiderman',
    character: 'Spider-Man',
    scenario: 'DECODE A GRID CRASH',
    twist: 'WITH ONE SHARED POWER SOURCE',
    options: {
      evaluationMode: 'final',
      originalScenario: 'STOP A TRAIN DISASTER',
      originalTwist: 'IN RUSH HOUR',
      teamPool: ['Spider-Man', 'Hulk', 'Thor', 'Iron Man', 'Hawkeye', 'Black Widow'],
      roundPool: ['Batman', 'Oracle', 'Alfred', 'The Flash', 'Superman', 'Aquaman', 'Spider-Man', 'Hulk', 'Thor', 'Iron Man', 'Hawkeye', 'Black Widow']
    }
  },
  {
    id: 'f-rubberduck',
    character: 'A Rubber Duck',
    scenario: 'DECODE A GRID CRASH',
    twist: 'WITH ONE SHARED POWER SOURCE',
    options: {
      evaluationMode: 'final',
      originalScenario: 'MAKE A CHILD LAUGH',
      originalTwist: 'ON LIVE TV',
      teamPool: ['A Rubber Duck', 'A Cheeseburger', 'Batman', 'Johnny Test', 'Jack Black', 'God'],
      roundPool: ['A Rubber Duck', 'A Cheeseburger', 'Batman', 'Johnny Test', 'Jack Black', 'God', 'Aquaman', 'Poseidon', 'Peter Griffin', 'A Shark', 'A Cow', 'David Goggins']
    }
  }
];

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const [key, rawValue] = token.slice(2).split('=');
    args[key] = rawValue == null ? 'true' : rawValue;
  }
  return args;
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function percentile(values, p) {
  const safe = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!safe.length) return 0;
  if (safe.length === 1) return safe[0];
  const idx = Math.min(safe.length - 1, Math.max(0, Math.ceil((p / 100) * safe.length) - 1));
  return safe[idx];
}

function avg(values, digits = 2) {
  const safe = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
  if (!safe.length) return 0;
  return Number((safe.reduce((sum, n) => sum + n, 0) / safe.length).toFixed(digits));
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function loadFixtures(args) {
  const explicitPath = args.fixture ? path.resolve(process.cwd(), String(args.fixture)) : null;
  if (explicitPath) {
    const stat = fs.existsSync(explicitPath) ? fs.statSync(explicitPath) : null;
    if (!stat) {
      throw new Error(`Fixture path not found: ${explicitPath}`);
    }
    if (stat.isDirectory()) {
      const files = fs.readdirSync(explicitPath)
        .filter((name) => name.toLowerCase().endsWith('.json'))
        .sort();
      const rows = files.flatMap((name) => {
        const data = safeReadJson(path.join(explicitPath, name));
        if (!data) return [];
        return Array.isArray(data) ? data : [data];
      });
      if (rows.length) return rows;
    } else if (stat.isFile()) {
      const data = safeReadJson(explicitPath);
      const rows = Array.isArray(data) ? data : (data ? [data] : []);
      if (rows.length) return rows;
    }
    throw new Error(`No valid fixtures loaded from ${explicitPath}`);
  }

  const defaultFixturePath = path.join(__dirname, 'fixtures', 'seeded-mini.json');
  const fromDisk = safeReadJson(defaultFixturePath);
  if (Array.isArray(fromDisk) && fromDisk.length) return fromDisk;
  return DEFAULT_FIXTURES;
}

function normalizeFixtureRow(row, index) {
  const safe = row && typeof row === 'object' ? row : {};
  return {
    id: safe.id || `fixture_${index + 1}`,
    character: String(safe.character || '').trim(),
    scenario: String(safe.scenario || ''),
    twist: String(safe.twist || 'NO PLOT TWIST'),
    options: safe.options && typeof safe.options === 'object' ? safe.options : { evaluationMode: 'round' }
  };
}

async function runMode(mode, fixtures, { repeats = 1, useBatch = false, batchConcurrency = 3 }) {
  const runRows = [];
  const latencies = [];
  const confidences = [];
  let trustedCount = 0;
  let failed = 0;
  const engineModes = {};
  const engineNames = {};

  const startedTotal = Date.now();
  process.env.EVAL_ENGINE_MODE = mode;

  for (let repeat = 0; repeat < repeats; repeat += 1) {
    if (useBatch) {
      const batchRows = fixtures.map((fixture) => ({
        character: fixture.character,
        scenario: fixture.scenario,
        twist: fixture.twist,
        options: fixture.options || {}
      }));
      const batchStart = Date.now();
      const batchResults = await evaluateCharactersBatch(batchRows, { concurrency: batchConcurrency });
      const batchElapsed = Date.now() - batchStart;
      const perItemApprox = fixtures.length ? (batchElapsed / fixtures.length) : 0;

      batchResults.forEach((result, index) => {
        const fixture = fixtures[index];
        const meta = result && result.scoreMeta ? result.scoreMeta : {};
        const confidence = Number(meta.infoConfidence) || 0;
        const trusted = Boolean(meta.trustedInfo);
        const ok = Boolean(result && typeof result === 'object' && result.character);
        if (!ok) failed += 1;
        if (trusted) trustedCount += 1;
        confidences.push(confidence);
        latencies.push(perItemApprox);
        const engineMode = String(meta.evaluationEngineMode || 'unknown');
        const engineName = String(meta.evaluationEngine || 'unknown');
        engineModes[engineMode] = (engineModes[engineMode] || 0) + 1;
        engineNames[engineName] = (engineNames[engineName] || 0) + 1;
        runRows.push({
          id: fixture.id,
          repeat: repeat + 1,
          character: fixture.character,
          mode,
          ok,
          score: Number(result && result.score) || 0,
          ovr: Number(result && result.ovr) || 0,
          confidence: confidence,
          trusted,
          engineMode,
          engineName,
          evalPath: result && result.evaluationPath ? result.evaluationPath : 'n/a',
          traceStatus: meta.contextExplainability && meta.contextExplainability.status
            ? meta.contextExplainability.status
            : (meta.contextShadow && meta.contextShadow.status ? meta.contextShadow.status : null)
        });
      });
      continue;
    }

    for (const fixture of fixtures) {
      const start = Date.now();
      try {
        const result = await evaluateCharacter(fixture.character, fixture.scenario, fixture.twist, fixture.options || {});
        const elapsed = Date.now() - start;
        const meta = result && result.scoreMeta ? result.scoreMeta : {};
        const confidence = Number(meta.infoConfidence) || 0;
        const trusted = Boolean(meta.trustedInfo);
        if (trusted) trustedCount += 1;
        latencies.push(elapsed);
        confidences.push(confidence);
        const engineMode = String(meta.evaluationEngineMode || 'unknown');
        const engineName = String(meta.evaluationEngine || 'unknown');
        engineModes[engineMode] = (engineModes[engineMode] || 0) + 1;
        engineNames[engineName] = (engineNames[engineName] || 0) + 1;
        runRows.push({
          id: fixture.id,
          repeat: repeat + 1,
          character: fixture.character,
          mode,
          ok: true,
          score: Number(result && result.score) || 0,
          ovr: Number(result && result.ovr) || 0,
          confidence,
          trusted,
          engineMode,
          engineName,
          evalPath: result && result.evaluationPath ? result.evaluationPath : 'n/a',
          traceStatus: meta.contextExplainability && meta.contextExplainability.status
            ? meta.contextExplainability.status
            : (meta.contextShadow && meta.contextShadow.status ? meta.contextShadow.status : null),
          latencyMs: elapsed
        });
      } catch (error) {
        const elapsed = Date.now() - start;
        failed += 1;
        latencies.push(elapsed);
        runRows.push({
          id: fixture.id,
          repeat: repeat + 1,
          character: fixture.character,
          mode,
          ok: false,
          error: error && error.message ? error.message : 'unknown error',
          latencyMs: elapsed
        });
      }
    }
  }

  const totalRows = runRows.length;
  return {
    mode,
    repeats,
    useBatch,
    batchConcurrency,
    fixtureCount: fixtures.length,
    totalEvaluations: totalRows,
    failed,
    successRate: totalRows ? Number((((totalRows - failed) / totalRows) * 100).toFixed(2)) : 0,
    totalElapsedMs: Date.now() - startedTotal,
    latency: {
      p50: Number(percentile(latencies, 50).toFixed(1)),
      p95: Number(percentile(latencies, 95).toFixed(1)),
      avg: avg(latencies, 1)
    },
    confidence: {
      avg: avg(confidences, 3),
      trustedCount,
      trustedRatio: totalRows ? Number((trustedCount / totalRows).toFixed(3)) : 0
    },
    engines: {
      modes: engineModes,
      names: engineNames
    },
    rows: runRows
  };
}

function buildComparisons(results) {
  const byMode = Object.fromEntries(results.map((r) => [r.mode, r]));
  const baseline = byMode.legacy;
  if (!baseline) return {};

  const baselineByFixture = {};
  for (const row of baseline.rows) {
    const key = `${row.id}::${row.repeat}`;
    baselineByFixture[key] = row;
  }

  const comparisons = {};
  for (const result of results) {
    if (result.mode === 'legacy') continue;
    const deltas = [];
    for (const row of result.rows) {
      const key = `${row.id}::${row.repeat}`;
      const base = baselineByFixture[key];
      if (!row.ok || !base || !base.ok) continue;
      deltas.push({
        scoreDelta: (Number(row.score) || 0) - (Number(base.score) || 0),
        ovrDelta: (Number(row.ovr) || 0) - (Number(base.ovr) || 0)
      });
    }
    comparisons[result.mode] = {
      comparedRows: deltas.length,
      avgScoreDeltaVsLegacy: avg(deltas.map((d) => d.scoreDelta), 2),
      avgOvrDeltaVsLegacy: avg(deltas.map((d) => d.ovrDelta), 2),
      maxAbsScoreDeltaVsLegacy: deltas.length ? Math.max(...deltas.map((d) => Math.abs(d.scoreDelta))) : 0,
      maxAbsOvrDeltaVsLegacy: deltas.length ? Math.max(...deltas.map((d) => Math.abs(d.ovrDelta))) : 0
    };
  }

  return comparisons;
}

function printHumanSummary(results, comparisons) {
  console.log('');
  console.log('[Context Engine Replay Harness] Summary');
  console.log('--------------------------------------');
  for (const result of results) {
    console.log(
      `${result.mode.padEnd(14)} total=${String(result.totalEvaluations).padStart(3)} ok=${String(result.totalEvaluations - result.failed).padStart(3)} `
      + `p50=${String(result.latency.p50).padStart(6)}ms p95=${String(result.latency.p95).padStart(6)}ms avgConf=${Math.round(result.confidence.avg * 100)}% `
      + `trusted=${result.confidence.trustedCount}/${result.totalEvaluations}`
    );
  }
  if (Object.keys(comparisons).length) {
    console.log('');
    console.log('Comparisons vs legacy');
    Object.entries(comparisons).forEach(([mode, cmp]) => {
      console.log(
        `${mode.padEnd(14)} rows=${cmp.comparedRows} avgScoreΔ=${cmp.avgScoreDeltaVsLegacy >= 0 ? '+' : ''}${cmp.avgScoreDeltaVsLegacy} `
        + `avgOVRΔ=${cmp.avgOvrDeltaVsLegacy >= 0 ? '+' : ''}${cmp.avgOvrDeltaVsLegacy} `
        + `max|ScoreΔ|=${cmp.maxAbsScoreDeltaVsLegacy} max|OVRΔ|=${cmp.maxAbsOvrDeltaVsLegacy}`
      );
    });
  }
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const compareModes = String(args.modes || 'legacy,context_shadow,context')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  const repeats = clamp(args.repeats, 1, 20, 1);
  const limit = clamp(args.limit, 1, 500, 32);
  const useBatch = ['1', 'true', 'yes', 'on'].includes(String(args.batch || 'false').toLowerCase());
  const batchConcurrency = clamp(args.batchConcurrency || args.concurrency, 1, 8, 3);
  const jsonOut = ['1', 'true', 'yes', 'on'].includes(String(args.json || 'false').toLowerCase());

  const fixtures = loadFixtures(args)
    .map(normalizeFixtureRow)
    .filter((row) => row.character)
    .slice(0, limit);

  if (!fixtures.length) {
    throw new Error('No valid fixtures to benchmark');
  }

  console.log(`[Context Engine Replay Harness] fixtures=${fixtures.length} repeats=${repeats} modes=${compareModes.join(',')} batch=${useBatch ? `on(concurrency=${batchConcurrency})` : 'off'}`);

  const results = [];
  for (const mode of compareModes) {
    const result = await runMode(mode, fixtures, { repeats, useBatch, batchConcurrency });
    results.push(result);
  }

  const comparisons = buildComparisons(results);
  printHumanSummary(results, comparisons);

  const output = {
    generatedAt: new Date().toISOString(),
    fixtures: fixtures.map((f) => ({ id: f.id, character: f.character, evaluationMode: f.options && f.options.evaluationMode ? f.options.evaluationMode : 'round' })),
    config: { repeats, modes: compareModes, batch: useBatch, batchConcurrency },
    results: results.map((r) => ({ ...r, rows: jsonOut ? r.rows : undefined })),
    comparisons
  };

  if (jsonOut) {
    console.log('');
    console.log(JSON.stringify(output, null, 2));
  }
})().catch((error) => {
  console.error('[Context Engine Replay Harness] Failed:', error && error.message ? error.message : error);
  process.exit(1);
});
