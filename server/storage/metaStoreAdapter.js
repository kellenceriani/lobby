const fs = require('fs');
const path = require('path');

const META_SCHEMA_VERSION = 2;
const DEFAULT_META_STORE_PATH = path.join(__dirname, '..', '.runtime', 'meta', 'meta.store.json');

function nowIso() {
  return new Date().toISOString();
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeText(value, maxLen = 160) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  return text.slice(0, Math.max(1, Number(maxLen) || 160));
}

function normalizeNameKey(value = '') {
  return sanitizeText(value, 120).toLowerCase();
}

function createDefaultMetaState() {
  const createdAt = nowIso();
  return {
    schemaVersion: META_SCHEMA_VERSION,
    createdAt,
    updatedAt: createdAt,
    counters: {
      nextUserSeq: 1
    },
    users: {},
    profiles: {},
    playerProgression: {},
    achievementDefinitions: {},
    achievementUnlocksByUser: {},
    xpLedgerByGrantId: {},
    dailyChallenges: {},
    dailyAttempts: {},
    soloRuns: {},
    leaderboardSnapshots: {},
    localAuthByHandle: {},
    authSessionsByTokenHash: {},
    seasonSchemaVersion: 0,
    seasonDefinitions: {},
    seasonRuntime: {
      schemaVersion: 1,
      activeSeasonId: '',
      seasonsById: {},
      snapshotsBySeasonId: {},
      actionLog: []
    },
    indexes: {
      providerAccountToUserId: {},
      guestAliasToUserId: {},
      legacyNameToUserId: {},
      scoredSoloRunByUserModeDate: {}
    }
  };
}

function migrateMetaState(raw) {
  const state = raw && typeof raw === 'object' ? deepClone(raw) : {};
  const base = createDefaultMetaState();

  if (state.schemaVersion == null) {
    state.schemaVersion = 0;
  }

  // v0 -> v1 bootstrap.
  if (Number(state.schemaVersion) < 1) {
    state.users = state.users && typeof state.users === 'object' ? state.users : {};
    state.profiles = state.profiles && typeof state.profiles === 'object' ? state.profiles : {};
    state.playerProgression = state.playerProgression && typeof state.playerProgression === 'object'
      ? state.playerProgression
      : (state.player_progression && typeof state.player_progression === 'object' ? state.player_progression : {});
    state.achievementDefinitions = state.achievementDefinitions && typeof state.achievementDefinitions === 'object'
      ? state.achievementDefinitions
      : (state.achievement_definitions && typeof state.achievement_definitions === 'object' ? state.achievement_definitions : {});
    state.achievementUnlocksByUser = state.achievementUnlocksByUser && typeof state.achievementUnlocksByUser === 'object'
      ? state.achievementUnlocksByUser
      : (state.achievement_unlocks && typeof state.achievement_unlocks === 'object' ? state.achievement_unlocks : {});
    state.xpLedgerByGrantId = state.xpLedgerByGrantId && typeof state.xpLedgerByGrantId === 'object'
      ? state.xpLedgerByGrantId
      : (state.xp_ledger && typeof state.xp_ledger === 'object' ? state.xp_ledger : {});
    state.dailyChallenges = state.dailyChallenges && typeof state.dailyChallenges === 'object'
      ? state.dailyChallenges
      : (state.daily_challenges && typeof state.daily_challenges === 'object' ? state.daily_challenges : {});
    state.dailyAttempts = state.dailyAttempts && typeof state.dailyAttempts === 'object'
      ? state.dailyAttempts
      : (state.daily_attempts && typeof state.daily_attempts === 'object' ? state.daily_attempts : {});
    state.soloRuns = state.soloRuns && typeof state.soloRuns === 'object'
      ? state.soloRuns
      : (state.solo_runs && typeof state.solo_runs === 'object' ? state.solo_runs : {});
    state.leaderboardSnapshots = state.leaderboardSnapshots && typeof state.leaderboardSnapshots === 'object'
      ? state.leaderboardSnapshots
      : (state.leaderboard_snapshots && typeof state.leaderboard_snapshots === 'object' ? state.leaderboard_snapshots : {});
    state.localAuthByHandle = state.localAuthByHandle && typeof state.localAuthByHandle === 'object'
      ? state.localAuthByHandle
      : (state.local_auth_by_handle && typeof state.local_auth_by_handle === 'object' ? state.local_auth_by_handle : {});
    state.authSessionsByTokenHash = state.authSessionsByTokenHash && typeof state.authSessionsByTokenHash === 'object'
      ? state.authSessionsByTokenHash
      : (state.auth_sessions_by_token_hash && typeof state.auth_sessions_by_token_hash === 'object' ? state.auth_sessions_by_token_hash : {});
    state.indexes = state.indexes && typeof state.indexes === 'object' ? state.indexes : {};
    state.indexes.providerAccountToUserId = state.indexes.providerAccountToUserId && typeof state.indexes.providerAccountToUserId === 'object'
      ? state.indexes.providerAccountToUserId
      : {};
    state.indexes.guestAliasToUserId = state.indexes.guestAliasToUserId && typeof state.indexes.guestAliasToUserId === 'object'
      ? state.indexes.guestAliasToUserId
      : {};
    state.indexes.legacyNameToUserId = state.indexes.legacyNameToUserId && typeof state.indexes.legacyNameToUserId === 'object'
      ? state.indexes.legacyNameToUserId
      : {};
    state.indexes.scoredSoloRunByUserModeDate = state.indexes.scoredSoloRunByUserModeDate && typeof state.indexes.scoredSoloRunByUserModeDate === 'object'
      ? state.indexes.scoredSoloRunByUserModeDate
      : {};
    state.counters = state.counters && typeof state.counters === 'object' ? state.counters : {};
    state.counters.nextUserSeq = Math.max(1, Number(state.counters.nextUserSeq) || 1);
    state.schemaVersion = 1;
  }

  // v1 -> v2 seasonal layer bootstrap.
  if (Number(state.schemaVersion) < 2) {
    state.seasonSchemaVersion = Math.max(0, Number(state.seasonSchemaVersion) || 0);
    state.seasonDefinitions = state.seasonDefinitions && typeof state.seasonDefinitions === 'object'
      ? state.seasonDefinitions
      : (state.season_definitions && typeof state.season_definitions === 'object' ? state.season_definitions : {});
    state.seasonRuntime = state.seasonRuntime && typeof state.seasonRuntime === 'object'
      ? state.seasonRuntime
      : (state.season_runtime && typeof state.season_runtime === 'object' ? state.season_runtime : {});
    state.seasonRuntime.schemaVersion = Math.max(1, Number(state.seasonRuntime.schemaVersion) || 1);
    state.seasonRuntime.activeSeasonId = sanitizeText(state.seasonRuntime.activeSeasonId || '', 80);
    state.seasonRuntime.seasonsById = state.seasonRuntime.seasonsById && typeof state.seasonRuntime.seasonsById === 'object'
      ? state.seasonRuntime.seasonsById
      : {};
    state.seasonRuntime.snapshotsBySeasonId = state.seasonRuntime.snapshotsBySeasonId && typeof state.seasonRuntime.snapshotsBySeasonId === 'object'
      ? state.seasonRuntime.snapshotsBySeasonId
      : {};
    state.seasonRuntime.actionLog = Array.isArray(state.seasonRuntime.actionLog) ? state.seasonRuntime.actionLog : [];
    state.schemaVersion = 2;
  }

  const merged = {
    ...base,
    ...state,
    counters: {
      ...base.counters,
      ...(state.counters && typeof state.counters === 'object' ? state.counters : {})
    },
    users: state.users && typeof state.users === 'object' ? state.users : {},
    profiles: state.profiles && typeof state.profiles === 'object' ? state.profiles : {},
    playerProgression: state.playerProgression && typeof state.playerProgression === 'object' ? state.playerProgression : {},
    achievementDefinitions: state.achievementDefinitions && typeof state.achievementDefinitions === 'object' ? state.achievementDefinitions : {},
    achievementUnlocksByUser: state.achievementUnlocksByUser && typeof state.achievementUnlocksByUser === 'object' ? state.achievementUnlocksByUser : {},
    xpLedgerByGrantId: state.xpLedgerByGrantId && typeof state.xpLedgerByGrantId === 'object' ? state.xpLedgerByGrantId : {},
    dailyChallenges: state.dailyChallenges && typeof state.dailyChallenges === 'object' ? state.dailyChallenges : {},
    dailyAttempts: state.dailyAttempts && typeof state.dailyAttempts === 'object' ? state.dailyAttempts : {},
    soloRuns: state.soloRuns && typeof state.soloRuns === 'object' ? state.soloRuns : {},
    leaderboardSnapshots: state.leaderboardSnapshots && typeof state.leaderboardSnapshots === 'object' ? state.leaderboardSnapshots : {},
    localAuthByHandle: state.localAuthByHandle && typeof state.localAuthByHandle === 'object' ? state.localAuthByHandle : {},
    authSessionsByTokenHash: state.authSessionsByTokenHash && typeof state.authSessionsByTokenHash === 'object'
      ? state.authSessionsByTokenHash
      : {},
    seasonSchemaVersion: Math.max(0, Number(state.seasonSchemaVersion) || 0),
    seasonDefinitions: state.seasonDefinitions && typeof state.seasonDefinitions === 'object' ? state.seasonDefinitions : {},
    seasonRuntime: state.seasonRuntime && typeof state.seasonRuntime === 'object'
      ? {
        schemaVersion: Math.max(1, Number(state.seasonRuntime.schemaVersion) || 1),
        activeSeasonId: sanitizeText(state.seasonRuntime.activeSeasonId || '', 80),
        seasonsById: state.seasonRuntime.seasonsById && typeof state.seasonRuntime.seasonsById === 'object'
          ? state.seasonRuntime.seasonsById
          : {},
        snapshotsBySeasonId: state.seasonRuntime.snapshotsBySeasonId && typeof state.seasonRuntime.snapshotsBySeasonId === 'object'
          ? state.seasonRuntime.snapshotsBySeasonId
          : {},
        actionLog: Array.isArray(state.seasonRuntime.actionLog) ? state.seasonRuntime.actionLog : []
      }
      : {
        schemaVersion: 1,
        activeSeasonId: '',
        seasonsById: {},
        snapshotsBySeasonId: {},
        actionLog: []
      },
    indexes: {
      ...base.indexes,
      ...(state.indexes && typeof state.indexes === 'object' ? state.indexes : {}),
      providerAccountToUserId: state.indexes && state.indexes.providerAccountToUserId && typeof state.indexes.providerAccountToUserId === 'object'
        ? state.indexes.providerAccountToUserId
        : {},
      guestAliasToUserId: state.indexes && state.indexes.guestAliasToUserId && typeof state.indexes.guestAliasToUserId === 'object'
        ? state.indexes.guestAliasToUserId
        : {},
      legacyNameToUserId: state.indexes && state.indexes.legacyNameToUserId && typeof state.indexes.legacyNameToUserId === 'object'
        ? state.indexes.legacyNameToUserId
        : {},
      scoredSoloRunByUserModeDate: state.indexes && state.indexes.scoredSoloRunByUserModeDate && typeof state.indexes.scoredSoloRunByUserModeDate === 'object'
        ? state.indexes.scoredSoloRunByUserModeDate
        : {}
    }
  };

  if (!merged.createdAt) merged.createdAt = nowIso();
  if (!merged.updatedAt) merged.updatedAt = merged.createdAt;
  merged.schemaVersion = META_SCHEMA_VERSION;
  return merged;
}

function buildProviderAccountKey(provider = '', providerAccountId = '') {
  const p = sanitizeText(provider, 40).toLowerCase();
  const id = sanitizeText(providerAccountId, 120).toLowerCase();
  return p && id ? `${p}:${id}` : '';
}

function makeUserId(nextUserSeq = 1) {
  const seq = Math.max(1, Number(nextUserSeq) || 1);
  return `usr_${Date.now().toString(36)}_${seq.toString(36)}`;
}

class FileMetaStoreAdapter {
  constructor({ filePath = '', autosave = true } = {}) {
    const configuredPath = sanitizeText(filePath, 400);
    const envPath = sanitizeText(process.env.META_STORE_PATH || '', 400);
    this.filePath = configuredPath
      || envPath
      || DEFAULT_META_STORE_PATH;
    this.autosave = autosave !== false;
    this.state = null;
  }

  ensureLoaded() {
    if (this.state) return this.state;
    if (!fs.existsSync(this.filePath)) {
      this.state = createDefaultMetaState();
      this.save(this.state);
      return this.state;
    }
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.state = migrateMetaState(parsed);
      if (this.autosave) this.save(this.state);
      return this.state;
    } catch (error) {
      console.warn(`[MetaStore] Failed to read store, resetting: ${String(error && error.message || 'unknown')}`);
      this.state = createDefaultMetaState();
      this.save(this.state);
      return this.state;
    }
  }

  save(nextState) {
    const state = migrateMetaState(nextState);
    state.updatedAt = nowIso();
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
    this.state = state;
    return this.state;
  }

  readState() {
    return deepClone(this.ensureLoaded());
  }

  writeState(mutator) {
    const current = this.ensureLoaded();
    const draft = deepClone(current);
    const result = typeof mutator === 'function' ? mutator(draft) : null;
    this.save(draft);
    return result;
  }

  getUserById(userId = '') {
    const key = sanitizeText(userId, 120);
    if (!key) return null;
    const state = this.ensureLoaded();
    return state.users[key] ? deepClone(state.users[key]) : null;
  }

  getProfileByUserId(userId = '') {
    const key = sanitizeText(userId, 120);
    if (!key) return null;
    const state = this.ensureLoaded();
    return state.profiles[key] ? deepClone(state.profiles[key]) : null;
  }

  getProgressionByUserId(userId = '') {
    const key = sanitizeText(userId, 120);
    if (!key) return null;
    const state = this.ensureLoaded();
    return state.playerProgression[key] ? deepClone(state.playerProgression[key]) : null;
  }

  getUserIdByProviderAccount(provider = '', providerAccountId = '') {
    const key = buildProviderAccountKey(provider, providerAccountId);
    if (!key) return null;
    const state = this.ensureLoaded();
    return String(
      state
      && state.indexes
      && state.indexes.providerAccountToUserId
      && state.indexes.providerAccountToUserId[key]
      || ''
    ).trim() || null;
  }

  createUserSession({
    displayName = '',
    guestAlias = '',
    legacyName = ''
  } = {}) {
    const safeDisplayName = sanitizeText(displayName, 32) || 'Guest';
    const safeGuestAlias = sanitizeText(guestAlias, 120);
    const safeLegacyName = sanitizeText(legacyName, 80);
    return this.writeState((state) => {
      if (safeGuestAlias && state.indexes.guestAliasToUserId[safeGuestAlias]) {
        const existingUserId = state.indexes.guestAliasToUserId[safeGuestAlias];
        return {
          created: false,
          user: deepClone(state.users[existingUserId] || null),
          profile: deepClone(state.profiles[existingUserId] || null),
          progression: deepClone(state.playerProgression[existingUserId] || null)
        };
      }

      const userId = makeUserId(state.counters.nextUserSeq);
      state.counters.nextUserSeq += 1;
      const createdAt = nowIso();

      const user = {
        userId,
        kind: 'guest',
        status: 'active',
        guestAlias: safeGuestAlias || null,
        linkedAccount: null,
        createdAt,
        updatedAt: createdAt
      };
      const profile = {
        userId,
        displayName: safeDisplayName,
        bio: '',
        avatarId: null,
        createdAt,
        updatedAt: createdAt
      };
      const progression = {
        userId,
        totalXp: 0,
        level: 1,
        xpIntoLevel: 0,
        xpForNextLevel: 100,
        dailyXp: {},
        createdAt,
        updatedAt: createdAt
      };

      state.users[userId] = user;
      state.profiles[userId] = profile;
      state.playerProgression[userId] = progression;
      if (safeGuestAlias) {
        state.indexes.guestAliasToUserId[safeGuestAlias] = userId;
      }
      if (safeLegacyName) {
        state.indexes.legacyNameToUserId[normalizeNameKey(safeLegacyName)] = userId;
      }

      return {
        created: true,
        user: deepClone(user),
        profile: deepClone(profile),
        progression: deepClone(progression)
      };
    });
  }

  linkAccount({
    userId = '',
    provider = '',
    providerAccountId = '',
    email = '',
    displayName = ''
  } = {}) {
    const safeUserId = sanitizeText(userId, 120);
    const safeProvider = sanitizeText(provider, 40).toLowerCase();
    const safeProviderAccountId = sanitizeText(providerAccountId, 120);
    const safeEmail = sanitizeText(email, 160).toLowerCase();
    const safeDisplayName = sanitizeText(displayName, 32);
    const providerKey = buildProviderAccountKey(safeProvider, safeProviderAccountId);

    if (!safeUserId || !safeProvider || !safeProviderAccountId || !providerKey) {
      return { ok: false, code: 'invalid_link_payload' };
    }

    return this.writeState((state) => {
      const user = state.users[safeUserId];
      if (!user) return { ok: false, code: 'user_not_found' };

      const mappedUserId = state.indexes.providerAccountToUserId[providerKey];
      if (mappedUserId && mappedUserId !== safeUserId) {
        return { ok: false, code: 'provider_account_already_linked' };
      }

      const wasLinked = user.kind === 'linked'
        && user.linkedAccount
        && buildProviderAccountKey(user.linkedAccount.provider, user.linkedAccount.providerAccountId) === providerKey;
      const now = nowIso();

      user.kind = 'linked';
      user.linkedAccount = {
        provider: safeProvider,
        providerAccountId: safeProviderAccountId,
        email: safeEmail || null
      };
      user.updatedAt = now;
      state.indexes.providerAccountToUserId[providerKey] = safeUserId;

      const profile = state.profiles[safeUserId] || null;
      if (profile && safeDisplayName) {
        profile.displayName = safeDisplayName;
        profile.updatedAt = now;
      }

      return {
        ok: true,
        linked: true,
        idempotent: wasLinked,
        user: deepClone(user),
        profile: profile ? deepClone(profile) : null
      };
    });
  }

  getLocalAuthRecord(handle = '') {
    const safeHandle = sanitizeText(handle, 64).toLowerCase();
    if (!safeHandle) return null;
    const state = this.ensureLoaded();
    const record = state.localAuthByHandle && state.localAuthByHandle[safeHandle]
      ? state.localAuthByHandle[safeHandle]
      : null;
    return record ? deepClone(record) : null;
  }

  registerLocalAccount({
    userId = '',
    handle = '',
    passwordHash = '',
    passwordSalt = '',
    displayName = '',
    guestAlias = ''
  } = {}) {
    const safeUserId = sanitizeText(userId, 120);
    const safeHandle = sanitizeText(handle, 64).toLowerCase();
    const safePasswordHash = sanitizeText(passwordHash, 320);
    const safePasswordSalt = sanitizeText(passwordSalt, 320);
    const safeDisplayName = sanitizeText(displayName, 32);
    const safeGuestAlias = sanitizeText(guestAlias, 120);
    const providerKey = buildProviderAccountKey('local', safeHandle);

    if (!safeHandle || !safePasswordHash || !safePasswordSalt || !providerKey) {
      return { ok: false, code: 'invalid_local_register_payload' };
    }

    return this.writeState((state) => {
      state.localAuthByHandle = state.localAuthByHandle && typeof state.localAuthByHandle === 'object'
        ? state.localAuthByHandle
        : {};

      const existingAuth = state.localAuthByHandle[safeHandle];
      if (existingAuth) {
        return { ok: false, code: 'local_handle_taken' };
      }

      let targetUserId = safeUserId;
      let createdNewUser = false;
      const createdAt = nowIso();

      if (targetUserId) {
        if (!state.users[targetUserId]) {
          return { ok: false, code: 'user_not_found' };
        }
      } else {
        targetUserId = makeUserId(state.counters.nextUserSeq);
        state.counters.nextUserSeq += 1;
        createdNewUser = true;

        const user = {
          userId: targetUserId,
          kind: 'guest',
          status: 'active',
          guestAlias: safeGuestAlias || null,
          linkedAccount: null,
          createdAt,
          updatedAt: createdAt
        };
        const profile = {
          userId: targetUserId,
          displayName: safeDisplayName || 'Player',
          bio: '',
          avatarId: null,
          createdAt,
          updatedAt: createdAt
        };
        const progression = {
          userId: targetUserId,
          totalXp: 0,
          level: 1,
          xpIntoLevel: 0,
          xpForNextLevel: 100,
          dailyXp: {},
          createdAt,
          updatedAt: createdAt
        };
        state.users[targetUserId] = user;
        state.profiles[targetUserId] = profile;
        state.playerProgression[targetUserId] = progression;
        if (safeGuestAlias) {
          state.indexes.guestAliasToUserId[safeGuestAlias] = targetUserId;
        }
      }

      const mappedUserId = state.indexes.providerAccountToUserId[providerKey];
      if (mappedUserId && mappedUserId !== targetUserId) {
        return { ok: false, code: 'provider_account_already_linked' };
      }

      const user = state.users[targetUserId];
      if (!user) return { ok: false, code: 'user_not_found' };
      const profile = state.profiles[targetUserId];
      const progression = state.playerProgression[targetUserId];
      const now = nowIso();

      user.kind = 'linked';
      user.linkedAccount = {
        provider: 'local',
        providerAccountId: safeHandle,
        email: null
      };
      user.updatedAt = now;

      if (profile && safeDisplayName) {
        profile.displayName = safeDisplayName;
        profile.updatedAt = now;
      }

      state.localAuthByHandle[safeHandle] = {
        handle: safeHandle,
        userId: targetUserId,
        passwordHash: safePasswordHash,
        passwordSalt: safePasswordSalt,
        failedAttempts: 0,
        lockUntilMs: 0,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now
      };
      state.indexes.providerAccountToUserId[providerKey] = targetUserId;

      return {
        ok: true,
        createdUser: createdNewUser,
        user: deepClone(user),
        profile: profile ? deepClone(profile) : null,
        progression: progression ? deepClone(progression) : null
      };
    });
  }

  authenticateLocalAccount({
    handle = '',
    passwordHash = '',
    maxFailures = 5,
    lockWindowMs = 300000
  } = {}) {
    const safeHandle = sanitizeText(handle, 64).toLowerCase();
    const safePasswordHash = sanitizeText(passwordHash, 320);
    const safeMaxFailures = Math.max(1, Number(maxFailures) || 5);
    const safeLockWindowMs = Math.max(1000, Number(lockWindowMs) || 300000);
    if (!safeHandle || !safePasswordHash) {
      return { ok: false, code: 'invalid_local_login_payload' };
    }

    return this.writeState((state) => {
      state.localAuthByHandle = state.localAuthByHandle && typeof state.localAuthByHandle === 'object'
        ? state.localAuthByHandle
        : {};
      const record = state.localAuthByHandle[safeHandle];
      if (!record || !record.userId) {
        return { ok: false, code: 'invalid_credentials' };
      }

      const nowMs = Date.now();
      const lockUntilMs = Math.max(0, Number(record.lockUntilMs) || 0);
      if (lockUntilMs > nowMs) {
        return {
          ok: false,
          code: 'account_locked',
          retryAfterMs: lockUntilMs - nowMs
        };
      }

      const matches = String(record.passwordHash || '') === safePasswordHash;
      if (!matches) {
        const failures = Math.max(0, Number(record.failedAttempts) || 0) + 1;
        record.failedAttempts = failures;
        if (failures >= safeMaxFailures) {
          record.failedAttempts = 0;
          record.lockUntilMs = nowMs + safeLockWindowMs;
        }
        record.updatedAt = nowIso();
        return {
          ok: false,
          code: record.lockUntilMs > nowMs ? 'account_locked' : 'invalid_credentials',
          retryAfterMs: record.lockUntilMs > nowMs ? (record.lockUntilMs - nowMs) : 0
        };
      }

      record.failedAttempts = 0;
      record.lockUntilMs = 0;
      record.lastLoginAt = nowIso();
      record.updatedAt = record.lastLoginAt;

      const user = state.users[record.userId] || null;
      const profile = state.profiles[record.userId] || null;
      const progression = state.playerProgression[record.userId] || null;
      if (!user) {
        return { ok: false, code: 'user_not_found' };
      }
      return {
        ok: true,
        user: deepClone(user),
        profile: profile ? deepClone(profile) : null,
        progression: progression ? deepClone(progression) : null
      };
    });
  }

  resolveUserIdByLegacyName(legacyName = '') {
    const key = normalizeNameKey(legacyName);
    if (!key) return null;
    const state = this.ensureLoaded();
    return state.indexes.legacyNameToUserId[key] || null;
  }

  assignLegacyName(userId = '', legacyName = '') {
    const safeUserId = sanitizeText(userId, 120);
    const key = normalizeNameKey(legacyName);
    if (!safeUserId || !key) return false;
    return this.writeState((state) => {
      if (!state.users[safeUserId]) return false;
      state.indexes.legacyNameToUserId[key] = safeUserId;
      return true;
    });
  }
}

function createMetaStoreAdapter(options = {}) {
  return new FileMetaStoreAdapter(options);
}

module.exports = {
  META_SCHEMA_VERSION,
  DEFAULT_META_STORE_PATH,
  createDefaultMetaState,
  migrateMetaState,
  sanitizeText,
  normalizeNameKey,
  buildProviderAccountKey,
  createMetaStoreAdapter
};
