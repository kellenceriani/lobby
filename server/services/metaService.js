const { sanitizeText } = require('../storage/metaStoreAdapter');

const DEFAULT_XP_CONFIG = Object.freeze({
  maxXpPerGrant: Math.max(1, Number(process.env.META_MAX_XP_PER_GRANT) || 500),
  maxXpPerDay: Math.max(50, Number(process.env.META_MAX_XP_PER_DAY) || 3000),
  maxGrantsPerDay: Math.max(1, Number(process.env.META_MAX_GRANTS_PER_DAY) || 200)
});

function boolEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const normalized = String(raw).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function createDefaultAchievementDefinitions() {
  return {
    ach_xp_first_grant: {
      id: 'ach_xp_first_grant',
      title: 'First Steps',
      category: 'Milestone / Legacy',
      trigger: { type: 'xp_grants_at_least', value: 1 },
      retroactiveEligibility: true,
      rewardType: 'badge',
      visibility: 'public',
      enabled: true
    },
    ach_xp_100: {
      id: 'ach_xp_100',
      title: 'Century XP',
      category: 'Milestone / Legacy',
      trigger: { type: 'total_xp_at_least', value: 100 },
      retroactiveEligibility: true,
      rewardType: 'title',
      visibility: 'public',
      enabled: true
    },
    ach_level_5: {
      id: 'ach_level_5',
      title: 'Level Five',
      category: 'Milestone / Legacy',
      trigger: { type: 'level_at_least', value: 5 },
      retroactiveEligibility: true,
      rewardType: 'badge',
      visibility: 'public',
      enabled: true
    },
    ach_linked_account: {
      id: 'ach_linked_account',
      title: 'Account Linked',
      category: 'Social / Community',
      trigger: { type: 'account_linked', value: 1 },
      retroactiveEligibility: true,
      rewardType: 'badge',
      visibility: 'private',
      enabled: true
    }
  };
}

function clampInt(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function toUtcDayKey(inputMs = Date.now()) {
  const date = new Date(Number(inputMs) || Date.now());
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function xpForLevel(level = 1) {
  const safeLevel = Math.max(1, Number(level) || 1);
  return 100 + ((safeLevel - 1) * 25);
}

function computeLevelState(totalXp = 0) {
  let xp = Math.max(0, Number(totalXp) || 0);
  let level = 1;
  let requirement = xpForLevel(level);
  while (xp >= requirement && level < 200) {
    xp -= requirement;
    level += 1;
    requirement = xpForLevel(level);
  }
  return {
    totalXp: Math.max(0, Number(totalXp) || 0),
    level,
    xpIntoLevel: xp,
    xpForNextLevel: requirement
  };
}

function matchesAchievementTrigger(definition, context = {}) {
  const trigger = definition && definition.trigger && typeof definition.trigger === 'object'
    ? definition.trigger
    : null;
  if (!trigger) return false;
  const triggerType = String(trigger.type || '');
  const value = Number(trigger.value) || 0;

  if (triggerType === 'xp_grants_at_least') {
    return (Number(context.xpGrantCount) || 0) >= value;
  }
  if (triggerType === 'total_xp_at_least') {
    return (Number(context.totalXp) || 0) >= value;
  }
  if (triggerType === 'level_at_least') {
    return (Number(context.level) || 0) >= value;
  }
  if (triggerType === 'account_linked') {
    return context.isAccountLinked === true;
  }
  return false;
}

function buildMetaService({
  adapter,
  featureFlags = {},
  xpConfig = {}
} = {}) {
  if (!adapter) throw new Error('meta_service_adapter_required');

  const flags = {
    progressionEnabled: featureFlags.progressionEnabled === true || boolEnv('META_PROGRESS_ENABLED', false),
    achievementsEnabled: featureFlags.achievementsEnabled === true || boolEnv('META_ACHIEVEMENTS_ENABLED', false)
  };
  const config = {
    ...DEFAULT_XP_CONFIG,
    ...(xpConfig && typeof xpConfig === 'object' ? xpConfig : {})
  };

  function ensureAchievementDefinitions() {
    const defaults = createDefaultAchievementDefinitions();
    adapter.writeState((state) => {
      if (!state.achievementDefinitions || typeof state.achievementDefinitions !== 'object') {
        state.achievementDefinitions = {};
      }
      Object.values(defaults).forEach((definition) => {
        if (!definition || !definition.id) return;
        if (!state.achievementDefinitions[definition.id]) {
          state.achievementDefinitions[definition.id] = definition;
        }
      });
    });
    return defaults;
  }

  function getProfileBundle(userId = '') {
    const safeUserId = sanitizeText(userId, 120);
    if (!safeUserId) return null;
    const user = adapter.getUserById(safeUserId);
    if (!user) return null;
    return {
      user,
      profile: adapter.getProfileByUserId(safeUserId),
      progression: adapter.getProgressionByUserId(safeUserId)
    };
  }

  function updateProfile(userId = '', patch = {}) {
    const safeUserId = sanitizeText(userId, 120);
    if (!safeUserId) return { ok: false, code: 'invalid_user_id' };
    const safePatch = patch && typeof patch === 'object' ? patch : {};
    const displayName = sanitizeText(safePatch.displayName, 32);
    const bio = sanitizeText(safePatch.bio, 240);
    const avatarId = sanitizeText(safePatch.avatarId, 80);

    return adapter.writeState((state) => {
      if (!state.users[safeUserId]) return { ok: false, code: 'user_not_found' };
      const profile = state.profiles[safeUserId];
      if (!profile) return { ok: false, code: 'profile_not_found' };
      const now = new Date().toISOString();
      if (displayName) profile.displayName = displayName;
      if (Object.prototype.hasOwnProperty.call(safePatch, 'bio')) profile.bio = bio || '';
      if (Object.prototype.hasOwnProperty.call(safePatch, 'avatarId')) profile.avatarId = avatarId || null;
      profile.updatedAt = now;
      return {
        ok: true,
        profile: JSON.parse(JSON.stringify(profile))
      };
    });
  }

  function listXpLedgerForUser(userId = '', { limit = 50 } = {}) {
    const safeUserId = sanitizeText(userId, 120);
    if (!safeUserId) return [];
    const maxRows = clampInt(limit, 1, 500);
    const state = adapter.readState();
    return Object.values(state.xpLedgerByGrantId || {})
      .filter((row) => row && row.userId === safeUserId)
      .sort((a, b) => (Number(b.createdAtMs) || 0) - (Number(a.createdAtMs) || 0))
      .slice(0, maxRows);
  }

  function evaluateAndUnlockAchievementsInPlace(state, userId = '') {
    if (flags.achievementsEnabled !== true) {
      return { unlocked: [], skipped: true };
    }
    const user = state.users[userId];
    const progression = state.playerProgression[userId];
    if (!user || !progression) return { unlocked: [] };

    const unlocks = state.achievementUnlocksByUser[userId] && typeof state.achievementUnlocksByUser[userId] === 'object'
      ? state.achievementUnlocksByUser[userId]
      : {};
    state.achievementUnlocksByUser[userId] = unlocks;

    const xpGrantCount = Object.values(state.xpLedgerByGrantId || {})
      .filter((row) => row && row.userId === userId && Number(row.amountGranted) > 0)
      .length;
    const context = {
      xpGrantCount,
      totalXp: Number(progression.totalXp) || 0,
      level: Number(progression.level) || 1,
      isAccountLinked: user.kind === 'linked'
    };

    const unlocked = [];
    Object.values(state.achievementDefinitions || {}).forEach((definition) => {
      if (!definition || !definition.id || definition.enabled !== true) return;
      if (unlocks[definition.id]) return;
      if (!matchesAchievementTrigger(definition, context)) return;
      const unlockedAt = new Date().toISOString();
      const entry = {
        achievementId: definition.id,
        userId,
        unlockedAt,
        trigger: definition.trigger
      };
      unlocks[definition.id] = entry;
      unlocked.push(entry);
    });

    return { unlocked };
  }

  function listAchievements(userId = '') {
    const safeUserId = sanitizeText(userId, 120);
    if (!safeUserId) return { definitions: [], unlocks: [] };
    const state = adapter.readState();
    const definitions = Object.values(state.achievementDefinitions || {});
    const unlocksMap = state.achievementUnlocksByUser[safeUserId] && typeof state.achievementUnlocksByUser[safeUserId] === 'object'
      ? state.achievementUnlocksByUser[safeUserId]
      : {};
    return {
      definitions,
      unlocks: Object.values(unlocksMap).sort((a, b) => String(a.unlockedAt || '').localeCompare(String(b.unlockedAt || '')))
    };
  }

  function evaluateAchievementsForUser(userId = '') {
    const safeUserId = sanitizeText(userId, 120);
    if (!safeUserId) return { ok: false, code: 'invalid_user_id', unlocked: [] };
    return adapter.writeState((state) => {
      if (!state.users[safeUserId]) return { ok: false, code: 'user_not_found', unlocked: [] };
      const result = evaluateAndUnlockAchievementsInPlace(state, safeUserId);
      return { ok: true, unlocked: result.unlocked || [] };
    });
  }

  function grantXp({
    userId = '',
    grantId = '',
    source = '',
    amount = 0,
    reason = '',
    metadata = {},
    occurredAtMs = Date.now()
  } = {}) {
    const safeUserId = sanitizeText(userId, 120);
    const safeGrantId = sanitizeText(grantId, 160);
    const safeSource = sanitizeText(source, 64).toLowerCase();
    const safeReason = sanitizeText(reason, 180);
    const safeOccurredAtMs = Number(occurredAtMs) > 0 ? Number(occurredAtMs) : Date.now();
    const requested = clampInt(amount, 0, Math.max(0, config.maxXpPerGrant));

    if (!safeUserId || !safeGrantId || !safeSource) {
      return { ok: false, code: 'invalid_xp_grant_payload' };
    }

    if (flags.progressionEnabled !== true) {
      return { ok: false, code: 'meta_progression_disabled' };
    }

    return adapter.writeState((state) => {
      const user = state.users[safeUserId];
      const progression = state.playerProgression[safeUserId];
      if (!user || !progression) return { ok: false, code: 'user_not_found' };

      const existingGrant = state.xpLedgerByGrantId[safeGrantId];
      if (existingGrant) {
        const levelState = computeLevelState(progression.totalXp);
        progression.level = levelState.level;
        progression.xpIntoLevel = levelState.xpIntoLevel;
        progression.xpForNextLevel = levelState.xpForNextLevel;
        return {
          ok: true,
          idempotent: true,
          grant: existingGrant,
          progression: JSON.parse(JSON.stringify(progression)),
          achievements: evaluateAndUnlockAchievementsInPlace(state, safeUserId).unlocked
        };
      }

      const dayKey = toUtcDayKey(safeOccurredAtMs);
      progression.dailyXp = progression.dailyXp && typeof progression.dailyXp === 'object' ? progression.dailyXp : {};
      progression.dailyXp[dayKey] = progression.dailyXp[dayKey] && typeof progression.dailyXp[dayKey] === 'object'
        ? progression.dailyXp[dayKey]
        : { xpGranted: 0, grantCount: 0 };
      const daily = progression.dailyXp[dayKey];

      const currentDailyXp = Math.max(0, Number(daily.xpGranted) || 0);
      const currentGrantCount = Math.max(0, Number(daily.grantCount) || 0);
      const remainingXp = Math.max(0, config.maxXpPerDay - currentDailyXp);
      const grantCountLimitReached = currentGrantCount >= config.maxGrantsPerDay;
      const amountGranted = grantCountLimitReached ? 0 : Math.max(0, Math.min(requested, remainingXp));
      const now = Date.now();

      const grantRecord = {
        grantId: safeGrantId,
        userId: safeUserId,
        source: safeSource,
        reason: safeReason || null,
        amountRequested: requested,
        amountGranted,
        occurredAtMs: safeOccurredAtMs,
        dayKey,
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
        status: grantCountLimitReached
          ? 'daily_grant_limit'
          : (amountGranted < requested ? 'daily_xp_cap_applied' : 'applied'),
        createdAtMs: now
      };
      state.xpLedgerByGrantId[safeGrantId] = grantRecord;

      daily.xpGranted = currentDailyXp + amountGranted;
      daily.grantCount = currentGrantCount + 1;

      progression.totalXp = Math.max(0, Number(progression.totalXp) || 0) + amountGranted;
      const levelState = computeLevelState(progression.totalXp);
      progression.level = levelState.level;
      progression.xpIntoLevel = levelState.xpIntoLevel;
      progression.xpForNextLevel = levelState.xpForNextLevel;
      progression.updatedAt = new Date(now).toISOString();

      const achievementResult = evaluateAndUnlockAchievementsInPlace(state, safeUserId);
      return {
        ok: true,
        idempotent: false,
        grant: grantRecord,
        progression: JSON.parse(JSON.stringify(progression)),
        achievements: achievementResult.unlocked
      };
    });
  }

  function runStartupMigrations() {
    ensureAchievementDefinitions();
    return {
      ok: true,
      schemaVersion: 1,
      flags,
      xpConfig: config
    };
  }

  return {
    flags,
    xpConfig: config,
    runStartupMigrations,
    getProfileBundle,
    updateProfile,
    grantXp,
    listXpLedgerForUser,
    listAchievements,
    evaluateAchievementsForUser,
    ensureAchievementDefinitions
  };
}

module.exports = {
  buildMetaService,
  computeLevelState,
  toUtcDayKey,
  createDefaultAchievementDefinitions
};
