const fs = require('fs');
const path = require('path');
const { resolveEntryIdentity } = require('../../services/evaluation/resolver/resolveEntryIdentity');
const { evaluateEntryContext } = require('../../services/evaluation/pipeline/evaluateEntryContext');

const CASES = [
  'Tony Stark',
  'Megan Fox',
  'Ishigami Senky',
  'Sherlok Holmes',
  'Narutoo Uzumaki',
  'the rock',
  'mr beast',
  'dr strange',
  'cap',
  'cap shield',
  'Bob',
  'Sam',
  'Max',
  'Joe',
  'asdf',
  'qwerty',
  'zzzzzz',
  'A',
  'X',
  'CRT',
  'N64',
  'TV',
  'Laptop',
  'Hammer',
  'Pizza',
  'Mt Olympus',
  'Mount Olympus',
  'Wakko',
  'Toothless',
  'Black Widow',
  'Spider Man',
  'Spider-Man',
  'Björk',
  'Łukasz',
  'Saoirse Ronan',
  '東京',
  'Супермен',
  'مرحبا',
  'G0ku',
  'T0ny Stark',
  'The GOAT',
  'winter is coming',
  'say my name',
  '12345',
  '!!!!',
  '???',
  'xXx_ghost_1337_xXx',
  'very very very very very long name',
  'ThisInputHasNoClearEntityButLooksValid'
];

const CONTEXTS = [
  { scenario: 'CONTAIN A GLOBAL CYBER PANIC', twist: 'WITH ANALOG BACKUPS ONLY' },
  { scenario: 'HOLD A FRACTURING ALLIANCE TOGETHER', twist: 'WITHOUT DIRECT FORCE' }
];

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function run() {
  const startedAt = Date.now();
  const rows = [];

  for (const character of CASES) {
    for (const ctx of CONTEXTS) {
      const row = {
        character,
        scenario: ctx.scenario,
        twist: ctx.twist,
        resolver: null,
        evaluation: null,
        error: null
      };

      try {
        const resolver = await resolveEntryIdentity({
          character,
          scenario: ctx.scenario,
          twist: ctx.twist,
          options: { evaluationMode: 'final' }
        });

        const evaluated = await evaluateEntryContext({
          character,
          scenario: ctx.scenario,
          twist: ctx.twist,
          options: { evaluationMode: 'final' }
        });

        const publicResult = evaluated && evaluated.publicResult ? evaluated.publicResult : null;
        const scoreMeta = publicResult && publicResult.scoreMeta ? publicResult.scoreMeta : {};
        const riskFlags = Array.isArray(scoreMeta && scoreMeta.contextSignals && scoreMeta.contextSignals.riskFlags)
          ? scoreMeta.contextSignals.riskFlags
          : (Array.isArray(resolver && resolver.riskFlags) ? resolver.riskFlags : []);

        row.resolver = {
          status: resolver && resolver.resolutionStatus ? resolver.resolutionStatus : 'unknown',
          confidence: toNum(resolver && resolver.infoConfidence),
          source: resolver && resolver.source ? String(resolver.source) : '',
          title: resolver && resolver.scoringInfo && (resolver.scoringInfo.title || resolver.scoringInfo.name)
            ? String(resolver.scoringInfo.title || resolver.scoringInfo.name)
            : '',
          riskFlags: Array.isArray(resolver && resolver.riskFlags) ? resolver.riskFlags : []
        };

        row.evaluation = {
          engineStatus: evaluated && evaluated.engine && evaluated.engine.status ? String(evaluated.engine.status) : 'unknown',
          score: toNum(publicResult && publicResult.score),
          ovr: toNum(publicResult && publicResult.ovr),
          infoConfidence: toNum(scoreMeta && scoreMeta.infoConfidence),
          resolverConfidence: toNum(scoreMeta && scoreMeta.resolverConfidence),
          riskFlags
        };
      } catch (error) {
        row.error = error && error.message ? String(error.message) : 'unknown_error';
      }

      rows.push(row);
    }
  }

  const total = rows.length;
  const failures = rows.filter((row) => row.error);
  const resolverRows = rows.filter((row) => row.resolver && !row.error);
  const evalRows = rows.filter((row) => row.evaluation && !row.error);

  const summary = {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    sampleCount: total,
    failures: failures.length,
    resolver: {
      unknownStatusCount: resolverRows.filter((row) => row.resolver.status === 'unknown').length,
      lowConfidenceCount: resolverRows.filter((row) => row.resolver.confidence < 0.55).length,
      searchSourceCount: resolverRows.filter((row) => String(row.resolver.source).toLowerCase().includes('search')).length,
      lowSignalAmbiguityCount: resolverRows.filter((row) => row.resolver.riskFlags.includes('low_signal_ambiguity')).length,
      genericAmbiguityCount: resolverRows.filter((row) => row.resolver.riskFlags.includes('generic_name_ambiguity')).length,
      dangerousTitleDiffCount: resolverRows.filter((row) => row.resolver.riskFlags.includes('dangerous_title_diff_suspected')).length
    },
    evaluation: {
      invalidInputCount: evalRows.filter((row) => row.evaluation.engineStatus === 'invalid_input').length,
      highRiskHighOvrCount: evalRows.filter((row) => {
        const flags = row.evaluation.riskFlags;
        const highRisk = flags.includes('dangerous_title_diff_suspected')
          || flags.includes('high_candidate_ambiguity')
          || flags.includes('low_signal_ambiguity')
          || flags.includes('generic_name_ambiguity')
          || flags.includes('fast_round_timeout_fallback');
        return highRisk && row.evaluation.ovr >= 70;
      }).length,
      lowConfidenceHighOvrCount: evalRows.filter((row) => row.evaluation.infoConfidence < 0.65 && row.evaluation.ovr >= 75).length,
      syntheticImageCount: evalRows.filter((row) => row.evaluation.riskFlags.includes('synthetic_image')).length
    }
  };

  const output = {
    summary,
    failures: failures.slice(0, 20),
    rows
  };

  const outDir = path.join(__dirname, '..', '..', '..', 'test-results');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `input-reliability-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(
    `Input reliability harness complete. samples=${summary.sampleCount} failures=${summary.failures}` +
    ` lowSignal=${summary.resolver.lowSignalAmbiguityCount}` +
    ` highRiskHighOvr=${summary.evaluation.highRiskHighOvrCount}`
  );
  console.log(
    `Resolver: unknown=${summary.resolver.unknownStatusCount} lowConf=${summary.resolver.lowConfidenceCount}` +
    ` dangerousTitleDiff=${summary.resolver.dangerousTitleDiffCount}`
  );
  console.log(
    `Evaluation: invalidInput=${summary.evaluation.invalidInputCount}` +
    ` lowConfHighOvr=${summary.evaluation.lowConfidenceHighOvrCount}`
  );
  console.log(`Saved: ${outPath}`);
}

run().catch((error) => {
  console.error(`Input reliability harness failed: ${error && error.message ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
