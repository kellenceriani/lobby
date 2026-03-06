const fs = require('fs');
const path = require('path');
const { createMetaStoreAdapter } = require('../storage/metaStoreAdapter');
const { buildMetaService } = require('../services/metaService');
const { buildSeasonService } = require('../services/seasonService');

const REPORT_MD_PATH = path.join(process.cwd(), 'md', 'overhaul', 'reports', 'PHASE_4_MIGRATION_REPORT.md');
const REPORT_JSON_PATH = path.join(process.cwd(), 'md', 'overhaul', 'reports', 'PHASE_4_MIGRATION_REPORT.json');

function renderMarkdown(summary) {
  const lines = [
    '# Phase 4 Migration Report',
    '',
    `Generated at: ${summary.generatedAtIso}`,
    `Meta store path: \`${summary.metaStorePath}\``,
    '',
    '## Summary',
    '',
    `- Meta schema version: ${summary.metaSchemaVersion}`,
    `- Season schema version: ${summary.seasonSchemaVersion}`,
    `- Season layer enabled: ${summary.seasonEnabled ? 'yes' : 'no'}`,
    `- Season definitions: ${summary.seasonDefinitionCount}`,
    `- Active season: ${summary.activeSeasonId || 'none'}`,
    `- Runtime season rows: ${summary.runtimeSeasonCount}`,
    `- Closed snapshots: ${summary.snapshotCount}`,
    `- Open seasons: ${summary.openSeasonCount}`,
    `- Closed seasons: ${summary.closedSeasonCount}`,
    '',
    '## Notes',
    '',
    '- Migration is idempotent and safe to rerun.',
    '- Phase 1-3 entities remain unchanged.',
    '- Seasonal runtime rows are bootstrapped for each known season definition.',
    ''
  ];
  return lines.join('\n');
}

function main() {
  const adapter = createMetaStoreAdapter();
  const metaService = buildMetaService({ adapter });
  metaService.runStartupMigrations();
  const seasonService = buildSeasonService({
    adapter,
    metaService,
    featureFlags: {
      seasonEnabled: true,
      autoOpenDefaultSeason: true
    }
  });
  const startup = seasonService.runStartupMigrations();
  const state = adapter.readState();
  const definitions = state.seasonDefinitions && typeof state.seasonDefinitions === 'object'
    ? state.seasonDefinitions
    : {};
  const runtime = state.seasonRuntime && typeof state.seasonRuntime === 'object'
    ? state.seasonRuntime
    : {};
  const snapshots = runtime.snapshotsBySeasonId && typeof runtime.snapshotsBySeasonId === 'object'
    ? runtime.snapshotsBySeasonId
    : {};
  const rows = runtime.seasonsById && typeof runtime.seasonsById === 'object'
    ? runtime.seasonsById
    : {};
  const defRows = Object.values(definitions);

  const summary = {
    generatedAtIso: new Date().toISOString(),
    metaStorePath: adapter.filePath,
    metaSchemaVersion: Number(state.schemaVersion) || 0,
    seasonSchemaVersion: Number(state.seasonSchemaVersion) || 0,
    seasonEnabled: startup && startup.seasonEnabled === true,
    seasonDefinitionCount: Object.keys(definitions).length,
    activeSeasonId: String(runtime.activeSeasonId || ''),
    runtimeSeasonCount: Object.keys(rows).length,
    snapshotCount: Object.keys(snapshots).length,
    openSeasonCount: defRows.filter((row) => row && row.status === 'open').length,
    closedSeasonCount: defRows.filter((row) => row && row.status === 'closed').length
  };

  fs.mkdirSync(path.dirname(REPORT_MD_PATH), { recursive: true });
  fs.writeFileSync(REPORT_MD_PATH, renderMarkdown(summary), 'utf8');
  fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(summary, null, 2), 'utf8');

  console.log(
    `[Phase4 migration] defs=${summary.seasonDefinitionCount}` +
    ` active=${summary.activeSeasonId || 'none'}` +
    ` snapshots=${summary.snapshotCount}`
  );
  console.log(`[Phase4 migration] report=${REPORT_MD_PATH}`);
}

main();
