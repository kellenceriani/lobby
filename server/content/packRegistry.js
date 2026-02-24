const fs = require('fs');
const path = require('path');
const { validatePackManifest } = require('./packSchema');

const PACKS_DIR = path.join(__dirname, 'packs');

const DEFAULT_PACK = Object.freeze({
  schemaVersion: 1,
  id: 'default',
  label: 'Default',
  description: 'Core LobbyWARS prompt pool (base themes and twist generation).',
  themeTags: ['core', 'default'],
  visuals: {
    chipLabel: 'CORE',
    accentColor: '#4cc9f0',
    tone: 'default'
  },
  availability: {
    tier: 'free',
    featuredEligible: false,
    unlockedByDefault: true
  },
  gameplay: {
    allowedThemes: [],
    scenarioCards: [],
    twistAdds: { easy: [], normal: [], hard: [] },
    final: {
      scenarioPool: [],
      twistPool: { easy: [], normal: [], hard: [] }
    }
  }
});

const state = {
  packsById: new Map([['default', DEFAULT_PACK]]),
  catalog: [],
  featuredPackId: 'default',
  loadedAt: Date.now(),
  loadErrors: [],
  loadWarnings: [],
  metrics: {}
};

function shallowClone(value) {
  if (!value || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function summarizePackContent(pack) {
  const gameplay = pack && pack.gameplay ? pack.gameplay : {};
  const twistAdds = gameplay.twistAdds || {};
  const finalCfg = gameplay.final || {};
  const finalTwistPool = finalCfg.twistPool || {};
  return {
    allowedThemes: Array.isArray(gameplay.allowedThemes) ? gameplay.allowedThemes.length : 0,
    scenarioCards: Array.isArray(gameplay.scenarioCards) ? gameplay.scenarioCards.length : 0,
    twistAdds: ['easy', 'normal', 'hard'].reduce((sum, key) => sum + (Array.isArray(twistAdds[key]) ? twistAdds[key].length : 0), 0),
    finalScenarios: Array.isArray(finalCfg.scenarioPool) ? finalCfg.scenarioPool.length : 0,
    finalTwists: ['easy', 'normal', 'hard'].reduce((sum, key) => sum + (Array.isArray(finalTwistPool[key]) ? finalTwistPool[key].length : 0), 0)
  };
}

function buildCatalogEntry(pack) {
  return {
    id: pack.id,
    label: pack.label,
    description: pack.description,
    themeTags: Array.isArray(pack.themeTags) ? pack.themeTags.slice(0, 12) : [],
    visuals: pack.visuals ? { ...pack.visuals } : {},
    availability: {
      tier: pack.availability && pack.availability.tier ? pack.availability.tier : 'free',
      unlocked: true,
      featuredEligible: Boolean(pack.availability && pack.availability.featuredEligible)
    },
    contentSummary: summarizePackContent(pack)
  };
}

function getFeaturedPool() {
  return state.catalog.filter((entry) => entry.id !== 'default' && entry.availability && entry.availability.featuredEligible);
}

function computeFeaturedPackId(now = new Date()) {
  const featuredPool = getFeaturedPool();
  if (!featuredPool.length) return 'default';

  const d = now instanceof Date ? now : new Date(now);
  const daySeed = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
  const index = Math.abs(daySeed) % featuredPool.length;
  return featuredPool[index].id;
}

function ensureMetricsBucket(packId) {
  const key = String(packId || 'default');
  if (!state.metrics[key]) {
    state.metrics[key] = {
      packId: key,
      matchStarts: 0,
      matchCompletions: 0,
      rematches: 0,
      lastMatchStartedAt: null,
      lastMatchCompletedAt: null,
      lastRematchAt: null
    };
  }
  return state.metrics[key];
}

function incrementMetric(packId, metricKey) {
  const bucket = ensureMetricsBucket(packId);
  const now = Date.now();
  if (metricKey === 'matchStarts') {
    bucket.matchStarts += 1;
    bucket.lastMatchStartedAt = now;
  }
  if (metricKey === 'matchCompletions') {
    bucket.matchCompletions += 1;
    bucket.lastMatchCompletedAt = now;
  }
  if (metricKey === 'rematches') {
    bucket.rematches += 1;
    bucket.lastRematchAt = now;
  }
}

function loadPackRegistry() {
  const packsById = new Map([['default', DEFAULT_PACK]]);
  const loadErrors = [];
  const loadWarnings = [];

  if (!fs.existsSync(PACKS_DIR)) {
    state.packsById = packsById;
    state.catalog = [buildCatalogEntry(DEFAULT_PACK)];
    state.featuredPackId = 'default';
    state.loadedAt = Date.now();
    state.loadErrors = [];
    state.loadWarnings = [];
    return;
  }

  const files = fs.readdirSync(PACKS_DIR)
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));

  for (const fileName of files) {
    const fullPath = path.join(PACKS_DIR, fileName);
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (error) {
      loadErrors.push(`${fileName}: failed to parse JSON (${error.message})`);
      continue;
    }

    const validation = validatePackManifest(raw, { source: fileName });
    if (!validation.ok || !validation.pack) {
      loadErrors.push(...validation.errors);
      loadWarnings.push(...validation.warnings);
      continue;
    }

    if (packsById.has(validation.pack.id)) {
      loadErrors.push(`${fileName}: duplicate pack id "${validation.pack.id}"`);
      continue;
    }

    packsById.set(validation.pack.id, Object.freeze(validation.pack));
    loadWarnings.push(...validation.warnings);
  }

  const catalog = Array.from(packsById.values())
    .map(buildCatalogEntry)
    .sort((a, b) => {
      if (a.id === 'default') return -1;
      if (b.id === 'default') return 1;
      return String(a.label).localeCompare(String(b.label));
    });

  state.packsById = packsById;
  state.catalog = catalog;
  state.featuredPackId = computeFeaturedPackId();
  state.loadedAt = Date.now();
  state.loadErrors = loadErrors;
  state.loadWarnings = loadWarnings;

  if (loadErrors.length) {
    console.warn(`[PackRegistry] Loaded with ${loadErrors.length} error(s). Invalid packs were skipped.`);
    loadErrors.forEach((msg) => console.warn(`[PackRegistry] ${msg}`));
  }
  if (loadWarnings.length) {
    console.log(`[PackRegistry] ${loadWarnings.length} warning(s) while loading packs.`);
  }
  console.log(`[PackRegistry] Ready with ${catalog.length} pack(s) including default.`);
}

function refreshPackRegistry() {
  loadPackRegistry();
  return getPackCatalog();
}

function coercePackId(value) {
  const id = String(value || '').trim().toLowerCase();
  return state.packsById.has(id) ? id : 'default';
}

function resolveContentPack(value) {
  const id = coercePackId(value);
  const pack = state.packsById.get(id) || DEFAULT_PACK;
  return pack;
}

function getPackCatalog() {
  state.featuredPackId = computeFeaturedPackId();
  return {
    packs: state.catalog.map((entry) => shallowClone(entry)),
    featuredPackId: state.featuredPackId,
    loadedAt: state.loadedAt,
    loadWarnings: state.loadWarnings.slice(0, 50),
    loadErrors: state.loadErrors.slice(0, 50)
  };
}

function getPublicPackMeta(value) {
  const pack = resolveContentPack(value);
  return {
    id: pack.id,
    label: pack.label,
    description: pack.description,
    themeTags: Array.isArray(pack.themeTags) ? pack.themeTags.slice(0, 8) : [],
    visuals: pack.visuals ? { ...pack.visuals } : {},
    availability: {
      tier: pack.availability && pack.availability.tier ? pack.availability.tier : 'free',
      unlocked: true
    }
  };
}

function getPackMetricsSnapshot() {
  const out = {};
  Object.entries(state.metrics).forEach(([id, bucket]) => {
    out[id] = { ...bucket };
  });
  return {
    updatedAt: Date.now(),
    metrics: out
  };
}

function recordPackMatchStart(packId) {
  incrementMetric(coercePackId(packId), 'matchStarts');
}

function recordPackMatchCompletion(packId) {
  incrementMetric(coercePackId(packId), 'matchCompletions');
}

function recordPackRematch(packId) {
  incrementMetric(coercePackId(packId), 'rematches');
}

loadPackRegistry();

module.exports = {
  PACKS_DIR,
  DEFAULT_PACK,
  refreshPackRegistry,
  getPackCatalog,
  getPublicPackMeta,
  resolveContentPack,
  coercePackId,
  getPackMetricsSnapshot,
  recordPackMatchStart,
  recordPackMatchCompletion,
  recordPackRematch
};
