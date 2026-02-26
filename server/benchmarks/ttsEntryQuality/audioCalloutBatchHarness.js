const { runAudioBlurbFetchHarness } = require('./audioBlurbFetchHarness');

async function runAudioCalloutBatchHarness(options = {}) {
  return runAudioBlurbFetchHarness(options);
}

async function main() {
  const argv = process.argv.slice(2);
  const options = {};
  argv.forEach((arg) => {
    const raw = String(arg || '').trim();
    if (!raw) return;
    if (raw === '--noMarkdown' || raw === '--noMarkdown=true') options.noMarkdown = true;
    if (raw === '--includeLogExamples=false') options.includeLogExamples = false;
    if (raw.startsWith('--limit=')) {
      const n = Number(raw.split('=')[1]);
      if (Number.isFinite(n)) options.limit = n;
    }
  });
  const result = await runAudioCalloutBatchHarness(options);
  const report = result.report;
  console.log('[callout-bench] complete');
  console.log(`  output: ${result.files.jsonPath}`);
  console.log(`  cold/warm: ${report.cold.elapsedMs}/${report.warm.elapsedMs} ms (warmCacheHit=${report.warm.cacheHit})`);
  console.log(`  replay p50/p95: ${report.replay.p50Ms}/${report.replay.p95Ms} ms cacheHitRate=${report.replay.cacheHitRate}`);
  console.log(`  association rows: ${Number(report.cold && report.cold.stats && (report.cold.stats.speechAssociation || report.cold.stats.speechFact) || 0)}/${report.input.sampleCount}`);
  if (report.accuracyProbe) {
    console.log(`  accuracy class/style: ${report.accuracyProbe.classAccuracy}/${report.accuracyProbe.styleAccuracy} robotFalse+=${report.accuracyProbe.robotFalsePositives}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[callout-bench] failed:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = {
  runAudioCalloutBatchHarness
};
