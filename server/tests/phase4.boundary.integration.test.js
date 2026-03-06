const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createMetaStoreAdapter } = require('../storage/metaStoreAdapter');
const { buildIdentityService } = require('../services/identityService');
const { buildMetaService } = require('../services/metaService');
const { buildSeasonService } = require('../services/seasonService');

function makeTempStorePath() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lobby-phase4-boundary-'));
  return path.join(tempDir, 'meta.store.json');
}

function countCloseRewardGrants(metaService, userId) {
  return metaService
    .listXpLedgerForUser(userId, { limit: 500 })
    .filter((row) => String(row.source || '') === 'season_close_reward')
    .length;
}

function main() {
  const adapter = createMetaStoreAdapter({ filePath: makeTempStorePath() });
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

  metaService.runStartupMigrations();
  seasonService.runStartupMigrations();

  const a = identityService.createGuestSession({ displayName: 'Boundary A', guestAlias: 'dev:boundary-a' });
  const b = identityService.createGuestSession({ displayName: 'Boundary B', guestAlias: 'dev:boundary-b' });
  const userA = String(a.user.userId);
  const userB = String(b.user.userId);

  const soloA = seasonService.recordSoloRunFinalized({
    userId: userA,
    runId: 'boundary-run-a',
    summary: { scored: true, outcome: 'solved', finalScore: 118, streak: { currentStreak: 3 }, antiCheat: { suspicious: false } },
    nowMs: Date.now()
  });
  const soloB = seasonService.recordSoloRunFinalized({
    userId: userB,
    runId: 'boundary-run-b',
    summary: { scored: true, outcome: 'failed', finalScore: 74, streak: { currentStreak: 1 }, antiCheat: { suspicious: false } },
    nowMs: Date.now()
  });
  assert.strictEqual(Boolean(soloA.ok), true, 'solo event A should apply');
  assert.strictEqual(Boolean(soloB.ok), true, 'solo event B should apply');

  const party = seasonService.recordPartyMatchResult({
    eventId: 'boundary-party-1',
    matchId: 'boundary-party-1',
    participants: [
      { userId: userA, placement: 1, teamworkScore: 8, sportsmanshipScore: 5, won: true },
      { userId: userB, placement: 2, teamworkScore: 7, sportsmanshipScore: 4, won: false }
    ],
    nowMs: Date.now()
  });
  assert.strictEqual(Boolean(party.ok), true, 'party event should apply');

  const firstClose = seasonService.closeSeason({
    adminActor: 'phase4.boundary',
    nowMs: Date.now()
  });
  assert.strictEqual(Boolean(firstClose.ok), true, 'first close should pass');
  assert.strictEqual(Boolean(firstClose.idempotent), false, 'first close should not be idempotent');

  const closeRewardCountA1 = countCloseRewardGrants(metaService, userA);
  const closeRewardCountB1 = countCloseRewardGrants(metaService, userB);
  assert.strictEqual(closeRewardCountA1 > 0, true, 'userA should receive close rewards');
  assert.strictEqual(closeRewardCountB1 > 0, true, 'userB should receive close rewards');

  const secondClose = seasonService.closeSeason({
    adminActor: 'phase4.boundary',
    nowMs: Date.now()
  });
  assert.strictEqual(Boolean(secondClose.ok), true, 'second close should pass');
  assert.strictEqual(Boolean(secondClose.idempotent), true, 'second close should be idempotent');

  const closeRewardCountA2 = countCloseRewardGrants(metaService, userA);
  const closeRewardCountB2 = countCloseRewardGrants(metaService, userB);
  assert.strictEqual(closeRewardCountA2, closeRewardCountA1, 'close rewards must not duplicate for userA');
  assert.strictEqual(closeRewardCountB2, closeRewardCountB1, 'close rewards must not duplicate for userB');

  const openedNew = seasonService.openSeason({
    seasonId: 'season_2099_q1',
    name: 'Boundary Future',
    startsAtMs: Date.now(),
    endsAtMs: Date.now() + (90 * 24 * 60 * 60 * 1000),
    adminActor: 'phase4.boundary',
    nowMs: Date.now()
  });
  assert.strictEqual(Boolean(openedNew.ok), true, 'new season open should pass');
  assert.strictEqual(Boolean(openedNew.idempotent), false, 'new season open should create active season');

  const nextSeasonSoloBoard = seasonService.getSeasonLeaderboard({
    seasonId: 'season_2099_q1',
    trackId: 'solo',
    limit: 20
  });
  assert.strictEqual(Boolean(nextSeasonSoloBoard.ok), true, 'new season solo board should load');
  assert.strictEqual(Number(nextSeasonSoloBoard.totalEntries), 0, 'new season should not carry over old entries');

  const profileHistory = seasonService.getSeasonProfile({
    seasonId: 'season_2099_q1',
    userId: userA,
    includeHistory: true,
    historyLimit: 10
  });
  assert.strictEqual(Boolean(profileHistory.ok), true, 'season profile should load with history');
  assert.strictEqual(Array.isArray(profileHistory.history), true, 'history should be array');
  assert.strictEqual(profileHistory.history.length >= 1, true, 'history should include closed season snapshot');

  console.log('[Phase4 boundary integration] passed');
}

main();
