const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createMetaStoreAdapter } = require('../storage/metaStoreAdapter');
const { buildIdentityService } = require('../services/identityService');
const { buildMetaService } = require('../services/metaService');

function makeTempStorePath() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lobby-phase1-'));
  return path.join(tempDir, 'meta.store.json');
}

function runAccountLinkingAssertions() {
  const storePath = makeTempStorePath();
  const adapter = createMetaStoreAdapter({ filePath: storePath });
  const identityService = buildIdentityService({ adapter });
  const metaService = buildMetaService({
    adapter,
    featureFlags: { progressionEnabled: true, achievementsEnabled: true },
    xpConfig: { maxXpPerDay: 200, maxXpPerGrant: 150, maxGrantsPerDay: 5 }
  });
  metaService.runStartupMigrations();

  const guest = identityService.createGuestSession({
    displayName: 'Tester One',
    guestAlias: 'dev:tester-one'
  });
  assert.strictEqual(Boolean(guest.created), true, 'guest session should be created');
  assert.strictEqual(String(guest.user.kind), 'guest', 'new session should be guest user');

  const link = identityService.linkGuestToAccount({
    userId: guest.user.userId,
    provider: 'discord',
    providerAccountId: 'acct_12345',
    email: 'tester@example.com',
    displayName: 'Tester Prime'
  });
  assert.strictEqual(Boolean(link.ok), true, 'account link should succeed');
  assert.strictEqual(String(link.user.kind), 'linked', 'user kind should upgrade to linked');
  assert.strictEqual(String(link.profile.displayName), 'Tester Prime', 'profile display name should update on link');

  const relink = identityService.linkGuestToAccount({
    userId: guest.user.userId,
    provider: 'discord',
    providerAccountId: 'acct_12345',
    email: 'tester@example.com',
    displayName: 'Tester Prime'
  });
  assert.strictEqual(Boolean(relink.ok), true, 'idempotent relink should succeed');
  assert.strictEqual(Boolean(relink.idempotent), true, 'relink should be idempotent');

  const linkedAchievementEval = metaService.evaluateAchievementsForUser(guest.user.userId);
  assert.strictEqual(Boolean(linkedAchievementEval.ok), true, 'achievement evaluation should succeed after link');

  const xpGrant1 = metaService.grantXp({
    userId: guest.user.userId,
    grantId: 'grant_account_link_flow_1',
    source: 'party_participation',
    amount: 120,
    reason: 'integration_test_round'
  });
  assert.strictEqual(Boolean(xpGrant1.ok), true, 'xp grant should succeed');
  assert.strictEqual(Boolean(xpGrant1.idempotent), false, 'first xp grant should not be idempotent');
  assert.strictEqual(Number(xpGrant1.grant.amountGranted), 120, 'first grant should apply full amount');

  const xpGrantDuplicate = metaService.grantXp({
    userId: guest.user.userId,
    grantId: 'grant_account_link_flow_1',
    source: 'party_participation',
    amount: 120,
    reason: 'integration_test_round_duplicate'
  });
  assert.strictEqual(Boolean(xpGrantDuplicate.ok), true, 'duplicate xp grant should return success');
  assert.strictEqual(Boolean(xpGrantDuplicate.idempotent), true, 'duplicate xp grant must be idempotent');
  assert.strictEqual(Number(xpGrantDuplicate.progression.totalXp), Number(xpGrant1.progression.totalXp), 'duplicate grant must not change XP');

  const xpGrantCap = metaService.grantXp({
    userId: guest.user.userId,
    grantId: 'grant_account_link_flow_2',
    source: 'party_completion',
    amount: 150,
    reason: 'integration_test_daily_cap'
  });
  assert.strictEqual(Boolean(xpGrantCap.ok), true, 'second xp grant should succeed');
  assert.strictEqual(Number(xpGrantCap.grant.amountGranted), 80, 'daily cap should clamp awarded XP');
  assert.strictEqual(String(xpGrantCap.grant.status), 'daily_xp_cap_applied', 'capped grant should be marked');

  const ledger = metaService.listXpLedgerForUser(guest.user.userId, { limit: 10 });
  assert.strictEqual(ledger.length >= 2, true, 'xp ledger should keep auditable records');

  const achievements = metaService.listAchievements(guest.user.userId);
  const unlockedIds = new Set((achievements.unlocks || []).map((entry) => String(entry.achievementId)));
  assert.strictEqual(unlockedIds.has('ach_linked_account'), true, 'linked-account achievement should unlock');
  assert.strictEqual(unlockedIds.has('ach_xp_first_grant'), true, 'first grant achievement should unlock');
  assert.strictEqual(unlockedIds.has('ach_xp_100'), true, 'total xp achievement should unlock');

  const profilePatch = metaService.updateProfile(guest.user.userId, { bio: 'Phase 1 integration test.' });
  assert.strictEqual(Boolean(profilePatch.ok), true, 'profile patch should succeed');
  assert.strictEqual(String(profilePatch.profile.bio), 'Phase 1 integration test.', 'profile bio should persist');

  const compatibility = identityService.resolveOrCreateLegacyGuest('Legacy Host');
  assert.strictEqual(Boolean(compatibility.ok), true, 'legacy guest compatibility flow should succeed');
}

function runFeatureFlagGuardAssertions() {
  const storePath = makeTempStorePath();
  const adapter = createMetaStoreAdapter({ filePath: storePath });
  const identityService = buildIdentityService({ adapter });
  const metaService = buildMetaService({
    adapter,
    featureFlags: { progressionEnabled: false, achievementsEnabled: false }
  });
  metaService.runStartupMigrations();

  const guest = identityService.createGuestSession({
    displayName: 'Flag Guard',
    guestAlias: 'dev:flag-guard'
  });
  const result = metaService.grantXp({
    userId: guest.user.userId,
    grantId: 'grant_flag_off_1',
    source: 'party_participation',
    amount: 50,
    reason: 'flag_guard'
  });
  assert.strictEqual(Boolean(result.ok), false, 'xp grant should be blocked when progression flag is off');
  assert.strictEqual(String(result.code), 'meta_progression_disabled', 'xp grant should return feature-flag code');
}

function main() {
  runAccountLinkingAssertions();
  runFeatureFlagGuardAssertions();
  console.log('[Phase1 integration] passed');
}

main();
