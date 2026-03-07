const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createMetaStoreAdapter } = require('../storage/metaStoreAdapter');
const { buildIdentityService } = require('../services/identityService');
const { buildMetaService } = require('../services/metaService');
const { buildSoloEngineService } = require('../services/soloEngineService');

function makeTempStorePath() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lobby-phase2-'));
  return path.join(tempDir, 'meta.store.json');
}

async function main() {
  const storePath = makeTempStorePath();
  const adapter = createMetaStoreAdapter({ filePath: storePath });
  const identityService = buildIdentityService({ adapter });
  const metaService = buildMetaService({
    adapter,
    featureFlags: { progressionEnabled: true, achievementsEnabled: true }
  });
  const soloService = buildSoloEngineService({
    adapter,
    metaService,
    featureFlags: { soloEnabled: true, exposeSolution: true }
  });
  metaService.runStartupMigrations();
  soloService.runStartupMigrations();

  const guest = identityService.createGuestSession({
    displayName: 'Solo Integration',
    guestAlias: 'dev:solo-integration'
  });
  const userId = String(guest.user.userId);

  const start = soloService.startRun({ userId, modeId: 'daily_cipher_clash' });
  assert.strictEqual(Boolean(start.ok), true, 'run start should succeed');
  const runId = String(start.run.runId || '');
  const solution = start.challenge.debugSolutionBySlot;
  assert.strictEqual(Boolean(solution && solution.lead), true, 'solution should be exposed for test mode');
  const delayedNowMs = Date.now() + 2500;

  const submit = await Promise.resolve(soloService.submitAttempt({
    userId,
    runId,
    idempotencyKey: 'submit-1',
    picksBySlot: solution,
    clientSubmittedAtMs: delayedNowMs,
    nowMs: delayedNowMs
  }));
  assert.strictEqual(Boolean(submit.ok), true, 'submit should succeed');
  assert.strictEqual(Boolean(submit.attempt.solved), true, 'attempt should solve challenge');

  const finalize = soloService.finalizeRun({
    userId,
    runId,
    idempotencyKey: 'finalize-1',
    clientFinalizedAtMs: delayedNowMs + 1000,
    nowMs: delayedNowMs + 1000
  });
  assert.strictEqual(Boolean(finalize.ok), true, 'finalize should succeed');
  assert.strictEqual(Boolean(finalize.summary.scored), true, 'first run should be scored');

  const finalizeDuplicate = soloService.finalizeRun({
    userId,
    runId,
    idempotencyKey: 'finalize-1',
    clientFinalizedAtMs: Date.now(),
    nowMs: Date.now()
  });
  assert.strictEqual(Boolean(finalizeDuplicate.ok), true, 'duplicate finalize should still succeed');
  assert.strictEqual(Boolean(finalizeDuplicate.idempotent), true, 'duplicate finalize should be idempotent');

  const secondRun = soloService.startRun({ userId, modeId: 'daily_cipher_clash' });
  assert.strictEqual(Boolean(secondRun.ok), true, 'second run start should succeed');
  assert.strictEqual(Boolean(secondRun.idempotent), true, 'second same-day daily start should be idempotent');
  assert.strictEqual(Boolean(secondRun.run.practice), false, 'second same-day daily start should remain scored run');
  assert.strictEqual(String(secondRun.run.runId), runId, 'second daily start should return original run');
  assert.strictEqual(Boolean(secondRun.summary && Number(secondRun.summary.finalScore) > 0), true, 'second daily start should return locked summary');

  const practiceRun = soloService.startRun({ userId, modeId: 'daily_cipher_clash', practice: true });
  assert.strictEqual(Boolean(practiceRun.ok), true, 'explicit practice start should succeed');
  assert.strictEqual(Boolean(practiceRun.run.practice), true, 'explicit practice should remain practice');
  assert.notStrictEqual(String(practiceRun.run.runId), runId, 'practice run should be a new run');

  const leaderboard = soloService.getDailyLeaderboard({
    modeId: 'daily_cipher_clash',
    userId
  });
  assert.strictEqual(Boolean(leaderboard.ok), true, 'leaderboard query should succeed');
  assert.strictEqual(Number(leaderboard.totalEntries) >= 1, true, 'leaderboard should include scored run');

  console.log('[Phase2 integration] passed');
}

main().catch((error) => {
  console.error(`[Phase2 integration] failed: ${String(error && error.message || error)}`);
  process.exit(1);
});
