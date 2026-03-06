const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createMetaStoreAdapter } = require('../storage/metaStoreAdapter');
const { buildIdentityService } = require('../services/identityService');
const { buildMetaService } = require('../services/metaService');
const { buildSeasonService } = require('../services/seasonService');
const { buildSoloEngineService } = require('../services/soloEngineService');

function makeTempStorePath() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lobby-phase4-'));
  return path.join(tempDir, 'meta.store.json');
}

function main() {
  const storePath = makeTempStorePath();
  const adapter = createMetaStoreAdapter({ filePath: storePath });
  const identityService = buildIdentityService({ adapter });
  const metaService = buildMetaService({
    adapter,
    featureFlags: { progressionEnabled: true, achievementsEnabled: true }
  });
  const seasonService = buildSeasonService({
    adapter,
    metaService,
    featureFlags: { seasonEnabled: true, autoOpenDefaultSeason: true }
  });
  const soloService = buildSoloEngineService({
    adapter,
    metaService,
    seasonService,
    featureFlags: { soloEnabled: true, exposeSolution: true }
  });

  metaService.runStartupMigrations();
  seasonService.runStartupMigrations();
  soloService.runStartupMigrations();

  const a = identityService.createGuestSession({ displayName: 'Season A', guestAlias: 'dev:season-a' });
  const b = identityService.createGuestSession({ displayName: 'Season B', guestAlias: 'dev:season-b' });
  const userA = String(a.user.userId);
  const userB = String(b.user.userId);

  const started = soloService.startRun({ userId: userA, modeId: 'daily_cipher_clash', nowMs: Date.now() });
  assert.strictEqual(Boolean(started.ok), true, 'solo start should succeed');
  const runId = String(started.run.runId || '');
  const solution = started.challenge.debugSolutionBySlot;
  const solvedAt = Date.now() + 2500;

  const submit = soloService.submitAttempt({
    userId: userA,
    runId,
    idempotencyKey: 'phase4-submit-1',
    picksBySlot: solution,
    clientSubmittedAtMs: solvedAt,
    nowMs: solvedAt
  });
  assert.strictEqual(Boolean(submit.ok), true, 'solo submit should succeed');

  const finalized = soloService.finalizeRun({
    userId: userA,
    runId,
    idempotencyKey: 'phase4-finalize-1',
    clientFinalizedAtMs: solvedAt + 500,
    nowMs: solvedAt + 500
  });
  assert.strictEqual(Boolean(finalized.ok), true, 'solo finalize should succeed');
  assert.strictEqual(Boolean(finalized.summary.scored), true, 'solo run should be scored');

  const partyResult = seasonService.recordPartyMatchResult({
    eventId: 'party-phase4-match-1',
    matchId: 'phase4-match-1',
    participants: [
      { userId: userA, placement: 1, teamworkScore: 8, sportsmanshipScore: 4, won: true },
      { userId: userB, placement: 2, teamworkScore: 7, sportsmanshipScore: 4, won: false }
    ],
    nowMs: Date.now()
  });
  assert.strictEqual(Boolean(partyResult.ok), true, 'party result should record');
  assert.strictEqual(Array.isArray(partyResult.rows), true, 'party rows should exist');

  const soloBoard = seasonService.getSeasonLeaderboard({ trackId: 'solo', limit: 20, userId: userA });
  assert.strictEqual(Boolean(soloBoard.ok), true, 'solo seasonal leaderboard should load');
  assert.strictEqual(Number(soloBoard.totalEntries) >= 1, true, 'solo seasonal leaderboard should include row');

  const partyBoard = seasonService.getSeasonLeaderboard({ trackId: 'party', limit: 20, userId: userA });
  assert.strictEqual(Boolean(partyBoard.ok), true, 'party seasonal leaderboard should load');
  assert.strictEqual(Number(partyBoard.totalEntries) >= 2, true, 'party seasonal leaderboard should include both users');

  const profile = seasonService.getSeasonProfile({ userId: userA, includeHistory: true });
  assert.strictEqual(Boolean(profile.ok), true, 'season profile should load');
  assert.strictEqual(Number(profile.profile && profile.profile.questPoints) >= 20, true, 'quest points should accumulate');

  const claim = seasonService.claimMilestoneReward({
    userId: userA,
    milestoneId: 'milestone_20',
    idempotencyKey: 'phase4-claim-1',
    nowMs: Date.now()
  });
  assert.strictEqual(Boolean(claim.ok), true, 'milestone claim should succeed');
  assert.strictEqual(Number(claim.claim && claim.claim.rewardXpGranted) >= 0, true, 'milestone claim should produce reward record');

  const claimDuplicate = seasonService.claimMilestoneReward({
    userId: userA,
    milestoneId: 'milestone_20',
    idempotencyKey: 'phase4-claim-1',
    nowMs: Date.now()
  });
  assert.strictEqual(Boolean(claimDuplicate.ok), true, 'duplicate claim should return success');
  assert.strictEqual(Boolean(claimDuplicate.idempotent), true, 'duplicate claim should be idempotent');

  const closed = seasonService.closeSeason({
    adminActor: 'phase4.integration',
    nowMs: Date.now()
  });
  assert.strictEqual(Boolean(closed.ok), true, 'close season should succeed');
  assert.strictEqual(Boolean(closed.idempotent), false, 'first close should not be idempotent');

  const closeAgain = seasonService.closeSeason({
    adminActor: 'phase4.integration',
    nowMs: Date.now()
  });
  assert.strictEqual(Boolean(closeAgain.ok), true, 'second close should still succeed');
  assert.strictEqual(Boolean(closeAgain.idempotent), true, 'second close should be idempotent');

  console.log('[Phase4 integration] passed');
}

main();
