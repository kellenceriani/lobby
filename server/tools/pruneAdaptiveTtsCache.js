const { pruneAdaptiveTtsCache } = require('../services/adaptiveTtsService');

function formatMb(bytes = 0) {
  return `${(Math.max(0, Number(bytes) || 0) / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  const args = new Set(process.argv.slice(2).map((arg) => String(arg || '').trim().toLowerCase()));
  const dryRun = args.has('--dry-run') || args.has('-n');
  const force = args.has('--force');

  const summary = await pruneAdaptiveTtsCache({
    dryRun,
    force,
    reason: dryRun ? 'manual_dry_run' : 'manual'
  });

  if (!summary || summary.ok !== true) {
    console.error('[TTS cache prune] failed to produce summary');
    process.exitCode = 1;
    return;
  }

  if (summary.skipped) {
    console.log(`[TTS cache prune] skipped (${summary.reason})`);
    console.log('Configure limits with any of: LOBBY_TTS_CACHE_MAX_MB, LOBBY_TTS_CACHE_MAX_CLIPS, LOBBY_TTS_CACHE_MAX_AGE_DAYS');
    console.log('Optional auto-prune: LOBBY_TTS_CACHE_AUTO_PRUNE=1 (plus limits)');
    return;
  }

  console.log(
    `[TTS cache prune] ${dryRun ? 'dry-run ' : ''}done` +
    ` deletedClips=${summary.deletedClips}` +
    ` deletedFiles=${summary.deletedFiles}` +
    ` freed=${formatMb(summary.deletedBytes)}` +
    ` keptClips=${summary.keptClips}` +
    ` kept=${formatMb(summary.keptBytes)}`
  );
  const causeText = Object.entries(summary.causes || {})
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([cause, count]) => `${cause}:${count}`)
    .join(', ');
  if (causeText) {
    console.log(`[TTS cache prune] causes ${causeText}`);
  }
}

main().catch((error) => {
  console.error(`[TTS cache prune] error: ${String(error && error.message || error || 'unknown')}`);
  process.exitCode = 1;
});
