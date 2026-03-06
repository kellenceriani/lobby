const fs = require('fs');
const path = require('path');
const { createMetaStoreAdapter } = require('../storage/metaStoreAdapter');
const { buildMetaService } = require('../services/metaService');
const {
  buildSoloEngineService,
  recalcLeaderboardSnapshotInPlace
} = require('../services/soloEngineService');

const REPORT_MD_PATH = path.join(process.cwd(), 'md', 'overhaul', 'reports', 'PHASE_2_MIGRATION_REPORT.md');
const REPORT_JSON_PATH = path.join(process.cwd(), 'md', 'overhaul', 'reports', 'PHASE_2_MIGRATION_REPORT.json');

function ensureProgressionSoloShape(state) {
  const progression = state.playerProgression && typeof state.playerProgression === 'object'
    ? state.playerProgression
    : {};
  let patched = 0;
  Object.values(progression).forEach((row) => {
    if (!row || typeof row !== 'object') return;
    if (!row.solo || typeof row.solo !== 'object') {
      row.solo = { modes: {} };
      patched += 1;
      return;
    }
    if (!row.solo.modes || typeof row.solo.modes !== 'object') {
      row.solo.modes = {};
      patched += 1;
    }
  });
  return patched;
}

function renderMarkdown(summary) {
  const lines = [
    '# Phase 2 Migration Report',
    '',
    `Generated at: ${summary.generatedAtIso}`,
    `Meta store path: \`${summary.metaStorePath}\``,
    '',
    '## Summary',
    '',
    `- Solo schema version: ${summary.soloSchemaVersion}`,
    `- Solo feature flag: ${summary.soloEnabled ? 'enabled' : 'disabled'}`,
    `- Existing solo runs: ${summary.existingSoloRuns}`,
    `- Existing daily challenges: ${summary.existingChallenges}`,
    `- Progression rows patched with solo shape: ${summary.progressionRowsPatched}`,
    `- Leaderboard snapshots rebuilt: ${summary.rebuiltSnapshots}`,
    '',
    '## Notes',
    '',
    '- Migration is idempotent and safe to rerun.',
    '- Existing Party and Meta records are preserved.',
    '- Snapshot rebuild only touches finalized scored Solo runs.',
    ''
  ];
  return lines.join('\n');
}

function main() {
  const adapter = createMetaStoreAdapter();
  const metaService = buildMetaService({ adapter });
  metaService.runStartupMigrations();
  const soloEngineService = buildSoloEngineService({
    adapter,
    metaService,
    featureFlags: {
      soloEnabled: true
    }
  });
  const startup = soloEngineService.runStartupMigrations();

  let rebuiltSnapshots = 0;
  let progressionRowsPatched = 0;
  let existingSoloRuns = 0;
  let existingChallenges = 0;
  adapter.writeState((state) => {
    progressionRowsPatched = ensureProgressionSoloShape(state);
    const soloRuns = state.soloRuns && typeof state.soloRuns === 'object' ? state.soloRuns : {};
    const challengeRows = state.dailyChallenges && typeof state.dailyChallenges === 'object' ? state.dailyChallenges : {};
    existingSoloRuns = Object.keys(soloRuns).length;
    existingChallenges = Object.keys(challengeRows).length;

    const rebuiltKeys = new Set();
    Object.values(soloRuns).forEach((run) => {
      if (!run || run.finalized !== true || run.scoredResult !== true) return;
      const key = `${String(run.modeId || '')}:${String(run.dateKey || '')}`;
      if (!run.modeId || !run.dateKey || rebuiltKeys.has(key)) return;
      rebuiltKeys.add(key);
      recalcLeaderboardSnapshotInPlace(state, {
        modeId: run.modeId,
        dateKey: run.dateKey
      });
    });
    rebuiltSnapshots = rebuiltKeys.size;
  });

  const summary = {
    generatedAtIso: new Date().toISOString(),
    metaStorePath: adapter.filePath,
    soloSchemaVersion: startup.soloSchemaVersion || 1,
    soloEnabled: startup.soloEnabled === true,
    existingSoloRuns,
    existingChallenges,
    progressionRowsPatched,
    rebuiltSnapshots
  };

  fs.mkdirSync(path.dirname(REPORT_MD_PATH), { recursive: true });
  fs.writeFileSync(REPORT_MD_PATH, renderMarkdown(summary), 'utf8');
  fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(summary, null, 2), 'utf8');

  console.log(
    `[Phase2 migration] soloSchema=v${summary.soloSchemaVersion} runs=${summary.existingSoloRuns}` +
    ` challenges=${summary.existingChallenges} rebuiltSnapshots=${summary.rebuiltSnapshots}`
  );
  console.log(`[Phase2 migration] report=${REPORT_MD_PATH}`);
}

main();
