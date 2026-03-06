const fs = require('fs');
const path = require('path');
const { createMetaStoreAdapter } = require('../storage/metaStoreAdapter');
const { buildIdentityService } = require('../services/identityService');
const { buildMetaService } = require('../services/metaService');

const ROOM_SNAPSHOT_PATH = path.join(__dirname, '..', '.runtime', 'rooms.snapshot.json');
const REPORT_MD_PATH = path.join(process.cwd(), 'md', 'overhaul', 'reports', 'PHASE_1_MIGRATION_REPORT.md');
const REPORT_JSON_PATH = path.join(process.cwd(), 'md', 'overhaul', 'reports', 'PHASE_1_MIGRATION_REPORT.json');

function readLegacyNamesFromSnapshot(snapshotPath) {
  if (!fs.existsSync(snapshotPath)) return [];
  try {
    const raw = fs.readFileSync(snapshotPath, 'utf8');
    const parsed = JSON.parse(raw);
    const rooms = parsed && parsed.rooms && typeof parsed.rooms === 'object' ? parsed.rooms : {};
    const names = new Set();
    Object.values(rooms).forEach((room) => {
      if (!room || typeof room !== 'object') return;
      const host = String(room.host || '').trim();
      if (host) names.add(host);
      const messages = Array.isArray(room.messages) ? room.messages : [];
      messages.forEach((message) => {
        const playerName = String(message && message.player || '').trim();
        if (playerName) names.add(playerName);
      });
    });
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
  } catch (error) {
    console.warn(`[Phase1 migration] failed to parse room snapshot: ${String(error && error.message || 'unknown')}`);
    return [];
  }
}

function renderMarkdown(summary) {
  const lines = [
    '# Phase 1 Migration Report',
    '',
    `Generated at: ${summary.generatedAtIso}`,
    `Meta store path: \`${summary.metaStorePath}\``,
    '',
    '## Summary',
    '',
    `- Schema version: ${summary.schemaVersion}`,
    `- Achievement definitions present: ${summary.achievementDefinitionCount}`,
    `- Legacy names discovered: ${summary.legacyNamesFound}`,
    `- Legacy users created: ${summary.legacyUsersCreated}`,
    `- Legacy users already mapped: ${summary.legacyUsersExisting}`,
    '',
    '## Legacy Names Processed',
    ''
  ];
  if (!summary.legacyNameRows.length) {
    lines.push('- None');
  } else {
    summary.legacyNameRows.forEach((row) => {
      lines.push(`- ${row.name}: ${row.status}${row.userId ? ` (${row.userId})` : ''}`);
    });
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- Migration is idempotent and safe to rerun.');
  lines.push('- Existing guest/linked records are preserved.');
  lines.push('- This migration supports compatibility for legacy guest-name flows.');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const adapter = createMetaStoreAdapter();
  const identityService = buildIdentityService({ adapter });
  const metaService = buildMetaService({ adapter });
  const migration = metaService.runStartupMigrations();
  const legacyNames = readLegacyNamesFromSnapshot(ROOM_SNAPSHOT_PATH);

  let created = 0;
  let existing = 0;
  const legacyRows = [];
  legacyNames.forEach((name) => {
    const result = identityService.resolveOrCreateLegacyGuest(name);
    if (!result || result.ok !== true) {
      legacyRows.push({ name, status: 'failed', userId: null });
      return;
    }
    if (result.created === true) created += 1;
    else existing += 1;
    legacyRows.push({
      name,
      status: result.created === true ? 'created' : 'existing',
      userId: result.user && result.user.userId ? result.user.userId : null
    });
  });

  const achievementDefinitions = metaService.ensureAchievementDefinitions();
  const summary = {
    generatedAtIso: new Date().toISOString(),
    metaStorePath: adapter.filePath,
    schemaVersion: migration.schemaVersion || 1,
    achievementDefinitionCount: Object.keys(achievementDefinitions || {}).length,
    legacyNamesFound: legacyNames.length,
    legacyUsersCreated: created,
    legacyUsersExisting: existing,
    legacyNameRows: legacyRows
  };

  fs.mkdirSync(path.dirname(REPORT_MD_PATH), { recursive: true });
  fs.writeFileSync(REPORT_MD_PATH, renderMarkdown(summary), 'utf8');
  fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(summary, null, 2), 'utf8');

  console.log(
    `[Phase1 migration] schema=v${summary.schemaVersion} legacyFound=${summary.legacyNamesFound}` +
    ` created=${summary.legacyUsersCreated} existing=${summary.legacyUsersExisting}`
  );
  console.log(`[Phase1 migration] report=${REPORT_MD_PATH}`);
}

main();
