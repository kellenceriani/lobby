const {
  sanitizeText,
  normalizeNameKey
} = require('../storage/metaStoreAdapter');

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
    resolveOrCreateLegacyGuest
  };
}

module.exports = {
  buildIdentityService
};
