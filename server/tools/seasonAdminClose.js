const { createMetaStoreAdapter } = require('../storage/metaStoreAdapter');
const { buildMetaService } = require('../services/metaService');
const { buildSeasonService } = require('../services/seasonService');

function parseArgs(argv = []) {
  const args = {
    seasonId: '',
    dryRun: true
  };
  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i += 1) {
    const token = String(list[i] || '');
    if (token === '--seasonId') args.seasonId = String(list[i + 1] || '');
    if (token === '--apply') args.dryRun = false;
    if (token === '--dry-run') args.dryRun = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const adapter = createMetaStoreAdapter();
  const metaService = buildMetaService({ adapter });
  metaService.runStartupMigrations();
  const seasonService = buildSeasonService({
    adapter,
    metaService,
    featureFlags: { seasonEnabled: true, autoOpenDefaultSeason: true }
  });
  seasonService.runStartupMigrations();

  const closed = seasonService.closeSeason({
    seasonId: args.seasonId,
    dryRun: args.dryRun,
    adminActor: 'tool:seasonAdminClose',
    nowMs: Date.now()
  });

  if (!closed || closed.ok !== true) {
    console.error(`[Season close] failed code=${closed && closed.code ? closed.code : 'unknown'}`);
    process.exit(1);
  }

  console.log(
    `[Season close] ok season=${closed.seasonId || (closed.season && closed.season.seasonId) || 'unknown'}` +
    ` idempotent=${closed.idempotent === true ? 'yes' : 'no'}` +
    ` dryRun=${closed.dryRun === true ? 'yes' : 'no'}` +
    ` payouts=${Array.isArray(closed.payouts) ? closed.payouts.length : Number(closed.payoutRequestCount) || 0}`
  );
  console.log(JSON.stringify(closed, null, 2));
}

main();
