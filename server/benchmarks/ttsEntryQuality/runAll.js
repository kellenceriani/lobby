const path = require('path');
const { runAnchorAudit } = require('./anchorAuditHarness');
const { runEntryVoiceQualityHarness } = require('./entryVoiceQualityHarness');
const { runExternalSourceReliabilityHarness } = require('./externalSourceReliabilityHarness');
const { runAudioCalloutBatchHarness } = require('./audioCalloutBatchHarness');
const { runIdentitySourceEnrichmentHarness } = require('../contextEngine/identitySourceEnrichmentHarness');

async function main() {
  const argv = process.argv.slice(2);
  const noSynth = argv.includes('--noSynth') || argv.includes('--noSynth=true');
  const verifyUrls = argv.includes('--verifyUrls') || argv.includes('--verifyUrls=true');

  console.log('[tts-bench] running anchor audit...');
  const anchor = await runAnchorAudit({
    verifyUrls,
    writeMarkdown: true
  });
  console.log(`[tts-bench] anchor audit complete -> ${anchor.files.jsonPath}`);

  console.log('[tts-bench] running entry voice quality harness...');
  const entry = await runEntryVoiceQualityHarness({
    noSynth,
    writeAudio: !noSynth
  });
  console.log(`[tts-bench] entry harness complete -> ${entry.files.jsonPath}`);

  console.log('[tts-bench] running external source reliability harness...');
  const sources = await runExternalSourceReliabilityHarness({
    noMarkdown: true,
    limit: 18
  });
  console.log(`[tts-bench] external source harness complete -> ${sources.files.jsonPath}`);

  console.log('[tts-bench] running audio callout batch harness...');
  const callouts = await runAudioCalloutBatchHarness({
    noMarkdown: true,
    limit: 18
  });
  console.log(`[tts-bench] callout harness complete -> ${callouts.files.jsonPath}`);

  console.log('[tts-bench] running identity source enrichment harness...');
  const identitySources = await runIdentitySourceEnrichmentHarness({
    noMarkdown: true,
    limit: 24
  });
  console.log(`[tts-bench] identity source harness complete -> ${identitySources.files.jsonPath}`);

  console.log('[tts-bench] summary');
  console.log(`  anchors: upgrade=${anchor.report.summary.upgradeAvailable} weak=${anchor.report.summary.weakCurrent}`);
  console.log(`  entry samples: ${entry.report.summary.sampleCount}`);
  console.log(`  provider mode: ${entry.report.summary.providerMode}`);
  console.log(`  latency cold-gen p50/p95: ${entry.report.latency.coldGenerated.p50Ms}/${entry.report.latency.coldGenerated.p95Ms}`);
  console.log(`  latency warm p50/p95: ${entry.report.latency.warm.p50Ms}/${entry.report.latency.warm.p95Ms}`);
  console.log(`  estimated prejoin batch: ${entry.report.prejoinEstimate.estimatedBatchMs} ms`);
  if (entry.report.instantaneousReadiness) {
    console.log(`  instant readiness: ${entry.report.instantaneousReadiness.grade} score=${entry.report.instantaneousReadiness.compositeScore}`);
    if (entry.report.postTopoffReplay) {
      console.log(`  post-topoff replay p95: ${entry.report.postTopoffReplay.p95Ms} ms (cacheHitRate=${entry.report.postTopoffReplay.cacheHitRate})`);
    }
  }
  console.log(`  ext sources combined hit/useful/titleGood: ${sources.report.combined.hitRate}/${sources.report.combined.usableFactRate}/${sources.report.combined.titleGoodRate}`);
  console.log(`  ext sources combined cold p50/p95: ${sources.report.combined.coldLatencyMs.p50}/${sources.report.combined.coldLatencyMs.p95} ms`);
  console.log(`  ext sources combined warm p50/p95: ${sources.report.combined.warmLatencyMs.p50}/${sources.report.combined.warmLatencyMs.p95} ms`);
  console.log(`  callout cold/warm: ${callouts.report.cold.elapsedMs}/${callouts.report.warm.elapsedMs} ms`);
  console.log(`  callout replay p95: ${callouts.report.replay.p95Ms} ms (cacheHitRate=${callouts.report.replay.cacheHitRate})`);
  console.log(`  callout association rate: ${callouts.report.cold.stats ? (callouts.report.cold.stats.speechAssociation || 0) : 0}/${callouts.report.input.sampleCount}`);
  console.log(`  callout speech source top: ${Object.entries(callouts.report.speechSources || {}).slice(0, 1).map(([k, v]) => `${k}:${v}`).join(',') || 'none'}`);
  if (callouts.report.accuracyProbe) {
    console.log(`  callout accuracy class/style: ${callouts.report.accuracyProbe.classAccuracy}/${callouts.report.accuracyProbe.styleAccuracy} robotFalse+=${callouts.report.accuracyProbe.robotFalsePositives}`);
  }
  console.log(`  identity desc improved (all/external-driven): ${identitySources.report.summary.descImprovedRate}/${identitySources.report.summary.descImprovedExternalDrivenRate}`);
  console.log(`  identity source upgrades/external hits: ${identitySources.report.summary.sourceUpgradedRate}/${identitySources.report.summary.externalFactHitRate} drift=${identitySources.report.summary.descImprovedNonExternalDriftRate}`);
  console.log(`  identity cold p50/p95 base->enriched: ${identitySources.report.summary.latencyMs.baselineP50}/${identitySources.report.summary.latencyMs.baselineP95} -> ${identitySources.report.summary.latencyMs.enrichedP50}/${identitySources.report.summary.latencyMs.enrichedP95} ms`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[tts-bench] failed:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}
