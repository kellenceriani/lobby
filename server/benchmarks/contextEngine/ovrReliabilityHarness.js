const fs = require('fs');
const path = require('path');
const { evaluateCharacter } = require('../../services/entryEvaluationService');
const {
  summarizeContextDiagnostics,
  formatQualityGates
} = require('../../services/evaluation/diagnostics/telemetry');

const SUBJECTS = [
  'Ishigami Senku',
  'Megan Fox',
  'Tony Stark',
  'Sherlock Holmes',
  'Naruto Uzumaki',
  'Gordon Ramsay',
  'Laptop',
  'Golden Retriever'
];

const CONTEXTS = [
  { scenario: 'CONTAIN A GLOBAL CYBER PANIC', twist: 'WITH ANALOG BACKUPS ONLY' },
  { scenario: 'REMEDIATE A QUANTUM NET FAILURE', twist: 'UNDER CONSTANT AFTERSHOCKS' },
  { scenario: 'EVACUATE A FLOATING CITY', twist: 'AS FUEL IS CAPPED PER PHASE' },
  { scenario: 'HOLD A FRACTURING ALLIANCE TOGETHER', twist: 'WITHOUT DIRECT FORCE' }
];

const CATEGORY_CHECKS = [
  { enabled: false, id: null, name: 'none', version: 'v1' },
  { enabled: true, id: 'scientists-inventors', name: 'Scientists & Inventors', version: 'v1' },
  { enabled: true, id: 'actors-entertainers', name: 'Actors & Entertainers', version: 'v1' },
  { enabled: true, id: 'cybersecurity', name: 'Cybersecurity', version: 'v1' }
];

function percentile(sortedValues, p) {
  const safe = Array.isArray(sortedValues) ? sortedValues : [];
  if (!safe.length) return 0;
  const idx = Math.min(safe.length - 1, Math.max(0, Math.round((safe.length - 1) * p)));
  return safe[idx];
}

async function run() {
  const startedAt = Date.now();
  const rows = [];
  const evaluationRows = [];

  for (const subject of SUBJECTS) {
    for (const context of CONTEXTS) {
      for (const category of CATEGORY_CHECKS) {
        const result = await evaluateCharacter(subject, context.scenario, context.twist, {
          evaluationMode: 'final',
          categoryContext: category,
          fetchContext: {
            scenario: context.scenario,
            twist: context.twist,
            originalScenario: context.scenario,
            originalTwist: context.twist
          }
        });
        rows.push({
          subject,
          scenario: context.scenario,
          twist: context.twist,
          category: category.id || 'none',
          ovr: Number(result && result.ovr) || 0,
          score: Number(result && result.score) || 0,
          infoConfidence: Number(result && result.scoreMeta && result.scoreMeta.infoConfidence) || 0,
          resolverConfidence: Number(result && result.scoreMeta && result.scoreMeta.resolverConfidence) || 0,
          categoryFit: Number(result && result.scoreMeta && result.scoreMeta.categoryContext && result.scoreMeta.categoryContext.categoryFit) || 0,
          categoryImpact: Number(result && result.scoreMeta && result.scoreMeta.categoryContext && result.scoreMeta.categoryContext.netImpact) || 0,
          riskFlags: Array.isArray(result && result.scoreMeta && result.scoreMeta.contextSignals && result.scoreMeta.contextSignals.riskFlags)
            ? result.scoreMeta.contextSignals.riskFlags
            : []
        });
        evaluationRows.push({
          character: subject,
          ovr: Number(result && result.ovr) || 0,
          score: Number(result && result.score) || 0,
          scoreMeta: result && result.scoreMeta ? { ...result.scoreMeta } : {}
        });
      }
    }
  }

  const bySubject = new Map();
  rows.forEach((row) => {
    const existing = bySubject.get(row.subject) || [];
    existing.push(row);
    bySubject.set(row.subject, existing);
  });

  const summary = Array.from(bySubject.entries()).map(([subject, sampleRows]) => {
    const ovrs = sampleRows.map((row) => row.ovr).sort((a, b) => a - b);
    const categoryRows = sampleRows.filter((row) => row.category !== 'none');
    const p95 = percentile(ovrs, 0.95);
    const highCount = sampleRows.filter((row) => row.ovr >= 97).length;
    const avg = sampleRows.reduce((sum, row) => sum + row.ovr, 0) / Math.max(1, sampleRows.length);
    const min = ovrs[0] || 0;
    const max = ovrs[ovrs.length - 1] || 0;
    const avgCategoryImpact = categoryRows.length
      ? categoryRows.reduce((sum, row) => sum + row.categoryImpact, 0) / categoryRows.length
      : 0;
    return {
      subject,
      samples: sampleRows.length,
      avgOVR: Number(avg.toFixed(2)),
      minOVR: min,
      maxOVR: max,
      p95OVR: p95,
      high97Rate: Number((highCount / Math.max(1, sampleRows.length)).toFixed(3)),
      avgCategoryImpact: Number(avgCategoryImpact.toFixed(2))
    };
  }).sort((a, b) => b.p95OVR - a.p95OVR || b.avgOVR - a.avgOVR);

  const suspicious = summary.filter((row) => row.high97Rate >= 0.45 || row.p95OVR >= 97);
  const qualitySummary = summarizeContextDiagnostics(evaluationRows, { suspiciousLimit: 12 });
  const scalingOutliers = qualitySummary && qualitySummary.scaling && qualitySummary.scaling.outliers
    ? qualitySummary.scaling.outliers
    : {};
  const risky60 = scalingOutliers.riskyHighOvr && typeof scalingOutliers.riskyHighOvr === 'object'
    ? scalingOutliers.riskyHighOvr
    : { count: 0, threshold: 60, examples: [] };
  const lowConf80 = scalingOutliers.lowConfidenceElite && typeof scalingOutliers.lowConfidenceElite === 'object'
    ? scalingOutliers.lowConfidenceElite
    : { count: 0, threshold: 80, examples: [] };
  const output = {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    sampleCount: rows.length,
    summary,
    suspicious,
    resolverQuality: {
      rates: qualitySummary && qualitySummary.rates ? qualitySummary.rates : {},
      qualityGates: qualitySummary && qualitySummary.qualityGates ? qualitySummary.qualityGates : {},
      risky60Plus: {
        threshold: Number(risky60.threshold) || 60,
        count: Number(risky60.count) || 0,
        examples: Array.isArray(risky60.examples) ? risky60.examples : []
      },
      lowConf80Plus: {
        threshold: Number(lowConf80.threshold) || 80,
        count: Number(lowConf80.count) || 0,
        examples: Array.isArray(lowConf80.examples) ? lowConf80.examples : []
      }
    },
    rows
  };

  const outDir = path.join(__dirname, '..', '..', '..', 'test-results');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `ovr-reliability-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`OVR reliability harness complete. samples=${rows.length} suspicious=${suspicious.length}`);
  summary.forEach((row) => {
    console.log(
      `${row.subject.padEnd(18)} avg=${row.avgOVR.toFixed(2)} p95=${String(row.p95OVR).padEnd(2)} ` +
      `min=${String(row.minOVR).padEnd(2)} max=${String(row.maxOVR).padEnd(2)} high97=${row.high97Rate}`
    );
  });
  console.log(
    `Resolver/Image quality syn=${Number(qualitySummary && qualitySummary.rates && qualitySummary.rates.syntheticImagePct) || 0}%` +
    ` titleDiffDanger=${Number(qualitySummary && qualitySummary.rates && qualitySummary.rates.titleDiffDangerousPct) || 0}%` +
    ` risky60+=${Number(risky60.count) || 0}` +
    ` lowConf80+=${Number(lowConf80.count) || 0}` +
    ` gates=[${formatQualityGates(qualitySummary && qualitySummary.qualityGates ? qualitySummary.qualityGates : {}) || 'none'}]`
  );
  console.log(`Saved: ${outPath}`);
}

run().catch((error) => {
  console.error(`OVR reliability harness failed: ${error && error.message ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});