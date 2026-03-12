const crypto = require('crypto');
const {
  sanitizeText,
  normalizeNameKey
} = require('../storage/metaStoreAdapter');

const LOCAL_AUTH_MAX_FAILURES = Math.max(3, Number(process.env.LOCAL_AUTH_MAX_FAILURES) || 5);
const LOCAL_AUTH_LOCK_MS = Math.max(60000, Number(process.env.LOCAL_AUTH_LOCK_MS) || 300000);
const GOOGLE_ID_TOKEN_MAX_LEN = 5000;
const GOOGLE_TOKEN_VERIFY_TIMEOUT_MS = Math.max(1000, Number(process.env.GOOGLE_TOKEN_VERIFY_TIMEOUT_MS) || 8000);

function normalizeDisplayName(value = '') {
  const cleaned = sanitizeText(value, 32).replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Guest';
  return cleaned.slice(0, 32);
}

function normalizeGuestAlias(value = '') {
  return sanitizeText(value, 120).toLowerCase();
}

function normalizeProvider(value = '') {
  const provider = sanitizeText(value, 40).toLowerCase();
  if (!provider) return '';
  if (!/^[a-z0-9_-]{2,40}$/.test(provider)) return '';
  return provider;
}

function normalizeProviderAccountId(value = '') {
  const accountId = sanitizeText(value, 120);
  if (!accountId) return '';
  if (!/^[A-Za-z0-9._:@-]{2,120}$/.test(accountId)) return '';
  return accountId;
}

function normalizeEmail(value = '') {
  const email = sanitizeText(value, 160).toLowerCase();
  if (!email) return '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return '';
  return email;
}

function normalizeLocalHandle(value = '') {
  const handle = sanitizeText(value, 48).toLowerCase();
  if (!handle) return '';
  if (!/^[a-z0-9._-]{3,48}$/.test(handle)) return '';
  return handle;
}

function normalizeLocalPassword(value = '') {
  const candidate = String(value == null ? '' : value).trim();
  if (!candidate) return '';
  if (candidate.length < 8 || candidate.length > 72) return '';
  return candidate;
}

function hashPassword(password = '', salt = '') {
  const secret = String(password || '');
  const safeSalt = String(salt || '');
  if (!secret || !safeSalt) return '';
  try {
    return crypto.scryptSync(secret, safeSalt, 64).toString('hex');
  } catch (_error) {
    return '';
  }
}

function parseGoogleClientIds() {
  const rawList = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  if (!rawList) return [];
  return rawList
    .split(',')
    .map((item) => sanitizeText(item, 220))
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeGoogleIdToken(value = '') {
  const token = sanitizeText(value, GOOGLE_ID_TOKEN_MAX_LEN);
  if (!token || token.length < 80) return '';
  if (!/^[A-Za-z0-9._-]+$/.test(token)) return '';
  return token;
}

async function verifyGoogleIdentityToken(idToken = '') {
  const safeToken = normalizeGoogleIdToken(idToken);
  if (!safeToken) return { ok: false, code: 'invalid_google_token' };

  const expectedClientIds = parseGoogleClientIds();
  if (!expectedClientIds.length) {
    return { ok: false, code: 'google_auth_not_configured' };
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, GOOGLE_TOKEN_VERIFY_TIMEOUT_MS);

  let payload = null;
  let response = null;
  try {
    response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(safeToken)}`, {
      method: 'GET',
      signal: abortController.signal
    });
    payload = await response.json();
  } catch (_error) {
    return { ok: false, code: 'google_verify_unreachable' };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response || !response.ok || !payload || payload.error) {
    return { ok: false, code: 'invalid_google_token' };
  }

  const sub = sanitizeText(payload.sub, 160);
  const aud = sanitizeText(payload.aud, 220);
  const expMs = (Number(payload.exp) || 0) * 1000;
  const email = normalizeEmail(payload.email || '');
  const emailVerified = payload.email_verified === true || String(payload.email_verified || '').toLowerCase() === 'true';
  const name = normalizeDisplayName(payload.name || email.split('@')[0] || 'Player');
  const picture = sanitizeText(payload.picture || '', 600);

  if (!sub || !aud || !expMs) return { ok: false, code: 'invalid_google_token' };
  if (!expectedClientIds.includes(aud)) return { ok: false, code: 'invalid_google_audience' };
  if (expMs <= Date.now()) return { ok: false, code: 'google_token_expired' };
  if (!email || emailVerified !== true) return { ok: false, code: 'google_email_not_verified' };

  return {
    ok: true,
    value: {
      provider: 'google',
      providerAccountId: sub,
      email,
      displayName: name,
      picture
    }
  };
}

function buildIdentityService({ adapter }) {
  if (!adapter) throw new Error('identity_service_adapter_required');

  function createGuestSession({ displayName = '', guestAlias = '', legacyName = '' } = {}) {
    const safeDisplayName = normalizeDisplayName(displayName);
    const safeGuestAlias = normalizeGuestAlias(guestAlias);
    const safeLegacyName = sanitizeText(legacyName, 80);
    return adapter.createUserSession({
      displayName: safeDisplayName,
      guestAlias: safeGuestAlias,
      legacyName: safeLegacyName
    });
  }

  function getIdentityBundle(userId = '') {
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

  function linkGuestToAccount({
    userId = '',
    provider = '',
    providerAccountId = '',
    email = '',
    displayName = ''
  } = {}) {
    const safeUserId = sanitizeText(userId, 120);
    const safeProvider = normalizeProvider(provider);
    const safeProviderAccountId = normalizeProviderAccountId(providerAccountId);
    const safeEmail = normalizeEmail(email);
    const safeDisplayName = normalizeDisplayName(displayName || '');

    if (!safeUserId || !safeProvider || !safeProviderAccountId) {
      return { ok: false, code: 'invalid_link_payload' };
    }

    return adapter.linkAccount({
      userId: safeUserId,
      provider: safeProvider,
      providerAccountId: safeProviderAccountId,
      email: safeEmail,
      displayName: safeDisplayName
    });
  }

  function createLocalAccount({
    userId = '',
    handle = '',
    password = '',
    displayName = '',
    guestAlias = ''
  } = {}) {
    const safeUserId = sanitizeText(userId, 120);
    const safeHandle = normalizeLocalHandle(handle);
    const safePassword = normalizeLocalPassword(password);
    const safeDisplayName = normalizeDisplayName(displayName || handle || 'Player');
    const safeGuestAlias = normalizeGuestAlias(guestAlias);

    if (!safeHandle || !safePassword) {
      return { ok: false, code: 'invalid_local_register_payload' };
    }

    if (safeUserId) {
      const existingUser = adapter.getUserById(safeUserId);
      if (!existingUser) {
        return { ok: false, code: 'user_not_found' };
      }
      const provider = String(existingUser && existingUser.linkedAccount && existingUser.linkedAccount.provider || '').trim().toLowerCase();
      if (existingUser.kind === 'linked' && provider && provider !== 'local') {
        return { ok: false, code: 'user_already_linked' };
      }
      if (existingUser.kind === 'linked' && provider === 'local') {
        return { ok: false, code: 'local_account_exists' };
      }
    }

    const passwordSalt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(safePassword, passwordSalt);
    if (!passwordHash) {
      return { ok: false, code: 'password_hash_failed' };
    }

    const created = adapter.registerLocalAccount({
      userId: safeUserId,
      handle: safeHandle,
      passwordHash,
      passwordSalt,
      displayName: safeDisplayName,
      guestAlias: safeGuestAlias
    });
    if (!created || created.ok !== true) {
      return created || { ok: false, code: 'local_register_failed' };
    }
    return {
      ...created,
      auth: {
        provider: 'local',
        handle: safeHandle
      }
    };
  }

  function loginLocalAccount({ handle = '', password = '' } = {}) {
    const safeHandle = normalizeLocalHandle(handle);
    const safePassword = normalizeLocalPassword(password);
    if (!safeHandle || !safePassword) {
      return { ok: false, code: 'invalid_local_login_payload' };
    }

    const authRecord = adapter.getLocalAuthRecord(safeHandle);
    if (!authRecord) {
      return { ok: false, code: 'invalid_credentials' };
    }

    const passwordHash = hashPassword(safePassword, authRecord.passwordSalt || '');
    if (!passwordHash) {
      return { ok: false, code: 'password_hash_failed' };
    }

    const result = adapter.authenticateLocalAccount({
      handle: safeHandle,
      passwordHash,
      maxFailures: LOCAL_AUTH_MAX_FAILURES,
      lockWindowMs: LOCAL_AUTH_LOCK_MS
    });
    if (!result || result.ok !== true) {
      return result || { ok: false, code: 'local_login_failed' };
    }
    return {
      ...result,
      auth: {
        provider: 'local',
        handle: safeHandle
      }
    };
  }

  async function signInWithGoogle({
    idToken = '',
    existingUserId = '',
    desiredUsername = '',
    guestAlias = ''
  } = {}) {
    const verified = await verifyGoogleIdentityToken(idToken);
    if (!verified || verified.ok !== true) {
      return verified || { ok: false, code: 'invalid_google_token' };
    }

    const account = verified.value || {};
    const provider = 'google';
    const providerAccountId = sanitizeText(account.providerAccountId, 160);
    const email = normalizeEmail(account.email || '');
    const googleDisplayName = normalizeDisplayName(account.displayName || '');
    const preferredDisplayName = normalizeDisplayName(desiredUsername || googleDisplayName || email.split('@')[0] || 'Player');
    const safeExistingUserId = sanitizeText(existingUserId, 120);
    const safeGuestAlias = normalizeGuestAlias(guestAlias || `google:${providerAccountId}`.slice(0, 120));

    const linkedUserId = adapter.getUserIdByProviderAccount(provider, providerAccountId);
    if (linkedUserId) {
      const bundle = getIdentityBundle(linkedUserId);
      if (!bundle) return { ok: false, code: 'user_not_found' };
      return {
        ok: true,
        created: false,
        ...bundle,
        auth: {
          provider,
          email,
          providerAccountId
        }
      };
    }

    if (safeExistingUserId) {
      const linked = linkGuestToAccount({
        userId: safeExistingUserId,
        provider,
        providerAccountId,
        email,
        displayName: preferredDisplayName
      });
      if (!linked || linked.ok !== true) {
        return linked || { ok: false, code: 'google_link_failed' };
      }
      const bundle = getIdentityBundle(safeExistingUserId);
      if (!bundle) return { ok: false, code: 'user_not_found' };
      return {
        ok: true,
        created: false,
        ...bundle,
        auth: {
          provider,
          email,
          providerAccountId
        }
      };
    }

    const createdGuest = createGuestSession({
      displayName: preferredDisplayName,
      guestAlias: safeGuestAlias
    });
    if (!createdGuest || !createdGuest.user || !createdGuest.user.userId) {
      return { ok: false, code: 'google_session_create_failed' };
    }
    const linked = linkGuestToAccount({
      userId: createdGuest.user.userId,
      provider,
      providerAccountId,
      email,
      displayName: preferredDisplayName
    });
    if (!linked || linked.ok !== true) {
      return linked || { ok: false, code: 'google_link_failed' };
    }
    const bundle = getIdentityBundle(createdGuest.user.userId);
    if (!bundle) return { ok: false, code: 'user_not_found' };
    return {
      ok: true,
      created: true,
      ...bundle,
      auth: {
        provider,
        email,
        providerAccountId
      }
    };
  }

  function resolveOrCreateLegacyGuest(legacyGuestName = '') {
    const safeLegacyName = sanitizeText(legacyGuestName, 80);
    if (!safeLegacyName) {
      return { ok: false, code: 'legacy_guest_name_required' };
    }

    const existingUserId = adapter.resolveUserIdByLegacyName(safeLegacyName);
    if (existingUserId) {
      const bundle = getIdentityBundle(existingUserId);
      if (bundle) return { ok: true, created: false, ...bundle };
    }

    const guestAlias = `legacy:${normalizeNameKey(safeLegacyName)}`;
    const created = createGuestSession({
      displayName: safeLegacyName,
      guestAlias,
      legacyName: safeLegacyName
    });
    if (created && created.user && created.user.userId) {
      adapter.assignLegacyName(created.user.userId, safeLegacyName);
      return { ok: true, created: true, ...created };
    }
    return { ok: false, code: 'legacy_guest_create_failed' };
  }

  return {
    createGuestSession,
    getIdentityBundle,
    linkGuestToAccount,
    createLocalAccount,
    loginLocalAccount,
    signInWithGoogle,
    resolveOrCreateLegacyGuest
  };
}

module.exports = {
  buildIdentityService
};
