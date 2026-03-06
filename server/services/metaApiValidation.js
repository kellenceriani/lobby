function sanitizeText(value, maxLen = 160) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  return text.slice(0, Math.max(1, Number(maxLen) || 160));
}

function sanitizeName(value, maxLen = 32) {
  const cleaned = sanitizeText(value, maxLen).replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (!/^[A-Za-z0-9 _'\-.]{2,32}$/.test(cleaned)) return '';
  return cleaned;
}

function sanitizeGuestAlias(value) {
  const alias = sanitizeText(value, 120).toLowerCase();
  if (!alias) return '';
  if (!/^[a-z0-9:_\-/.]{3,120}$/.test(alias)) return '';
  return alias;
}

function sanitizeProvider(value) {
  const provider = sanitizeText(value, 40).toLowerCase();
  if (!provider || !/^[a-z0-9_-]{2,40}$/.test(provider)) return '';
  return provider;
}

function sanitizeProviderAccountId(value) {
  const accountId = sanitizeText(value, 120);
  if (!accountId || !/^[A-Za-z0-9._:@-]{2,120}$/.test(accountId)) return '';
  return accountId;
}

function sanitizeEmail(value) {
  const email = sanitizeText(value, 160).toLowerCase();
  if (!email) return '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return '';
  return email;
}

function sanitizeUserId(value) {
  const userId = sanitizeText(value, 120);
  if (!userId) return '';
  if (!/^[A-Za-z0-9_-]{6,120}$/.test(userId)) return '';
  return userId;
}

function sanitizeGrantId(value) {
  const grantId = sanitizeText(value, 160);
  if (!grantId) return '';
  if (!/^[A-Za-z0-9:_\-/.]{4,160}$/.test(grantId)) return '';
  return grantId;
}

function sanitizeSource(value) {
  const source = sanitizeText(value, 64).toLowerCase();
  if (!source) return '';
  if (!/^[a-z0-9_:-]{3,64}$/.test(source)) return '';
  return source;
}

function sanitizeAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > 5000) return null;
  return Math.round(parsed);
}

function sanitizeMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed <= 0) return null;
  return Math.round(parsed);
}

function validateGuestSessionCreate(body = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  return {
    displayName: sanitizeName(payload.displayName || '') || 'Guest',
    guestAlias: sanitizeGuestAlias(payload.guestAlias || ''),
    legacyName: sanitizeText(payload.legacyName || '', 80)
  };
}

function validateAccountLink(body = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  const userId = sanitizeUserId(payload.userId);
  const provider = sanitizeProvider(payload.provider);
  const providerAccountId = sanitizeProviderAccountId(payload.providerAccountId);
  if (!userId || !provider || !providerAccountId) {
    return { ok: false, code: 'invalid_account_link_payload' };
  }
  return {
    ok: true,
    value: {
      userId,
      provider,
      providerAccountId,
      email: sanitizeEmail(payload.email || ''),
      displayName: sanitizeName(payload.displayName || '')
    }
  };
}

function validateProfilePatch(body = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(payload, 'displayName')) {
    patch.displayName = sanitizeName(payload.displayName || '');
    if (!patch.displayName) return { ok: false, code: 'invalid_display_name' };
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'bio')) {
    patch.bio = sanitizeText(payload.bio || '', 240);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'avatarId')) {
    patch.avatarId = sanitizeText(payload.avatarId || '', 80);
  }
  if (!Object.keys(patch).length) return { ok: false, code: 'empty_profile_patch' };
  return { ok: true, value: patch };
}

function validateXpGrant(body = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  const userId = sanitizeUserId(payload.userId || '');
  const legacyGuestName = sanitizeText(payload.legacyGuestName || '', 80);
  const grantId = sanitizeGrantId(payload.grantId || '');
  const source = sanitizeSource(payload.source || '');
  const amount = sanitizeAmount(payload.amount);
  const occurredAtMs = sanitizeMs(payload.occurredAtMs);
  if ((!userId && !legacyGuestName) || !grantId || !source || amount == null) {
    return { ok: false, code: 'invalid_xp_grant_payload' };
  }
  return {
    ok: true,
    value: {
      userId,
      legacyGuestName,
      grantId,
      source,
      amount,
      reason: sanitizeText(payload.reason || '', 180),
      metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
      occurredAtMs: occurredAtMs || Date.now()
    }
  };
}

module.exports = {
  sanitizeUserId,
  validateGuestSessionCreate,
  validateAccountLink,
  validateProfilePatch,
  validateXpGrant
};
