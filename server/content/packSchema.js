const PACK_SCHEMA_VERSION = 1;

const ALLOWED_THEMES = new Set([
  'all',
  'food',
  'action',
  'adventure',
  'building',
  'social',
  'mystery',
  'sports',
  'performance',
  'absurd'
]);

const ALLOWED_DIFFICULTIES = ['easy', 'normal', 'hard'];

function normalizeText(value, maxLen = 160) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function dedupeStrings(values) {
  const seen = new Set();
  const out = [];
  for (const raw of values || []) {
    const text = normalizeText(raw, 200);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function normalizeScenarioCards(cards) {
  const seen = new Set();
  const out = [];
  const warnings = [];
  const errors = [];

  for (const raw of Array.isArray(cards) ? cards : []) {
    const text = normalizeText(typeof raw === 'string' ? raw : raw && raw.text, 96);
    const category = normalizeText(raw && raw.category, 24).toLowerCase() || 'pack';
    if (!text) continue;

    if (category !== 'pack' && !ALLOWED_THEMES.has(category)) {
      errors.push(`Scenario card category "${category}" is not a supported theme`);
      continue;
    }

    const key = `${text.toLowerCase()}|${category}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const words = text.split(/\s+/).filter(Boolean).length;
    if (words > 12) {
      warnings.push(`Scenario card is long (${words} words): "${text}"`);
    }

    out.push({ text, category });
  }

  return { value: out, warnings, errors };
}

function normalizeTwistPool(rawTwists) {
  const result = { easy: [], normal: [], hard: [] };
  const warnings = [];
  const source = rawTwists && typeof rawTwists === 'object' ? rawTwists : {};

  ALLOWED_DIFFICULTIES.forEach((difficulty) => {
    const pool = dedupeStrings(source[difficulty]);
    pool.forEach((line) => {
      const words = line.split(/\s+/).filter(Boolean).length;
      if (words > 10) {
        warnings.push(`Twist line is long (${words} words) in ${difficulty}: "${line}"`);
      }
    });
    result[difficulty] = pool;
  });

  return { value: result, warnings };
}

function validatePackManifest(rawManifest, options = {}) {
  const errors = [];
  const warnings = [];
  const source = options && options.source ? String(options.source) : 'unknown';
  const raw = rawManifest && typeof rawManifest === 'object' ? rawManifest : null;

  if (!raw) {
    return { ok: false, errors: [`${source}: manifest must be an object`], warnings, pack: null };
  }

  const schemaVersion = Number(raw.schemaVersion || raw.version || 0);
  if (schemaVersion !== PACK_SCHEMA_VERSION) {
    errors.push(`${source}: unsupported schemaVersion ${schemaVersion} (expected ${PACK_SCHEMA_VERSION})`);
  }

  const id = normalizeText(raw.id, 48).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(id)) {
    errors.push(`${source}: invalid id "${raw.id || ''}" (use lowercase slug, 3-48 chars)`);
  }

  const label = normalizeText(raw.label, 48);
  if (!label || label.length < 2) {
    errors.push(`${source}: label is required`);
  }

  const description = normalizeText(raw.description, 180);
  if (!description) {
    errors.push(`${source}: description is required`);
  }

  const themeTags = dedupeStrings(raw.themeTags).slice(0, 12);
  const visuals = raw.visuals && typeof raw.visuals === 'object' ? raw.visuals : {};
  const availability = raw.availability && typeof raw.availability === 'object' ? raw.availability : {};
  const gameplay = raw.gameplay && typeof raw.gameplay === 'object' ? raw.gameplay : {};

  const allowedThemes = dedupeStrings(gameplay.allowedThemes)
    .map((value) => value.toLowerCase())
    .filter(Boolean);
  allowedThemes.forEach((theme) => {
    if (!ALLOWED_THEMES.has(theme)) {
      errors.push(`${source}: gameplay.allowedThemes contains unsupported theme "${theme}"`);
    }
  });

  const normalizedCards = normalizeScenarioCards(gameplay.scenarioCards);
  errors.push(...normalizedCards.errors.map((msg) => `${source}: ${msg}`));
  warnings.push(...normalizedCards.warnings.map((msg) => `${source}: ${msg}`));

  const normalizedTwistAdds = normalizeTwistPool(gameplay.twistAdds);
  warnings.push(...normalizedTwistAdds.warnings.map((msg) => `${source}: ${msg}`));

  const finalConfig = gameplay.final && typeof gameplay.final === 'object' ? gameplay.final : {};
  const finalScenarioPool = dedupeStrings(finalConfig.scenarioPool).slice(0, 120);
  const normalizedFinalTwists = normalizeTwistPool(finalConfig.twistPool);
  warnings.push(...normalizedFinalTwists.warnings.map((msg) => `${source}: ${msg}`));

  if (!allowedThemes.length && !normalizedCards.value.length) {
    errors.push(`${source}: pack must define gameplay.allowedThemes and/or gameplay.scenarioCards`);
  }

  const totalTwistAdds = ALLOWED_DIFFICULTIES.reduce((sum, key) => sum + normalizedTwistAdds.value[key].length, 0);
  if (totalTwistAdds === 0) {
    warnings.push(`${source}: no gameplay.twistAdds provided (pack will rely on base twist pools only)`);
  }

  if (themeTags.some((tag) => /copyright|licensed|tm|trademark/i.test(tag))) {
    warnings.push(`${source}: themeTags should not carry legal status text; document legal notes in docs instead`);
  }

  const pack = {
    schemaVersion: PACK_SCHEMA_VERSION,
    id,
    label,
    description,
    themeTags,
    visuals: {
      chipLabel: normalizeText(visuals.chipLabel, 12) || label.slice(0, 12).toUpperCase(),
      accentColor: normalizeText(visuals.accentColor, 16) || '',
      tone: normalizeText(visuals.tone, 32) || ''
    },
    availability: {
      tier: ['free', 'premium', 'event'].includes(String(availability.tier || '').toLowerCase())
        ? String(availability.tier).toLowerCase()
        : 'free',
      featuredEligible: availability.featuredEligible !== false,
      unlockedByDefault: availability.unlockedByDefault !== false
    },
    gameplay: {
      allowedThemes,
      scenarioCards: normalizedCards.value,
      twistAdds: normalizedTwistAdds.value,
      final: {
        scenarioPool: finalScenarioPool,
        twistPool: normalizedFinalTwists.value
      }
    }
  };

  if (!pack.visuals.accentColor) {
    warnings.push(`${source}: visuals.accentColor missing (UI will use default chip styling)`);
  } else if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(pack.visuals.accentColor)) {
    errors.push(`${source}: visuals.accentColor must be a hex color`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    pack: errors.length === 0 ? pack : null
  };
}

module.exports = {
  PACK_SCHEMA_VERSION,
  ALLOWED_THEMES: Array.from(ALLOWED_THEMES),
  ALLOWED_DIFFICULTIES,
  validatePackManifest
};
