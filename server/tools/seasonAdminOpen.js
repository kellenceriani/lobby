const { createMetaStoreAdapter } = require('../storage/metaStoreAdapter');
const { buildMetaService } = require('../services/metaService');
const { buildSeasonService } = require('../services/seasonService');

function parseArgs(argv = []) {
  const args = {
    seasonId: '',
    name: '',
    startsAtMs: null,
    endsAtMs: null,
    dryRun: true
  };
  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i += 1) {
    const token = String(list[i] || '');
    if (token === '--seasonId') args.seasonId = String(list[i + 1] || '');
    if (token === '--name') args.name = String(list[i + 1] || '');
    if (token === '--startsAtMs') args.startsAtMs = Number(list[i + 1]);
    if (token === '--endsAtMs') args.endsAtMs = Number(list[i + 1]);
    if (token === '--apply') args.dryRun = false;
    if (token === '--dry-run') args.dryRun = true;
  }
  if (!Number.isFinite(args.startsAtMs) || args.startsAtMs <= 0) args.startsAtMs = null;
  if (!Number.isFinite(args.endsAtMs) || args.endsAtMs <= 0) args.endsAtMs = null;
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

  const opened = seasonService.openSeason({
    seasonId: args.seasonId,
    name: args.name,
    startsAtMs: args.startsAtMs,
    endsAtMs: args.endsAtMs,
    dryRun: args.dryRun,
    adminActor: 'tool:seasonAdminOpen',
    nowMs: Date.now()
  });

  if (!opened || opened.ok !== true) {
    console.error(`[Season open] failed code=${opened && opened.code ? opened.code : 'unknown'}`);
    process.exit(1);
  }

  console.log(
    `[Season open] ok season=${opened.season && opened.season.seasonId ? opened.season.seasonId : 'unknown'}` +
    ` idempotent=${opened.idempotent === true ? 'yes' : 'no'}` +
    ` dryRun=${opened.dryRun === true ? 'yes' : 'no'}`
  );
  console.log(JSON.stringify(opened, null, 2));
}

main();
