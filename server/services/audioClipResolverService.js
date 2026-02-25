const fs = require('fs');
const path = require('path');

const INDEX_TTL_MS = 10000;
const RESOLVE_CACHE_TTL_MS = 15000;

const AUDIO_CARD_NAME_ALIASES = {
  '007': ['007', 'james-bond'],
  spongebob: ['spongebob', 'spongebob-squarepants'],
  'the-flash': ['the-flash', 'flash'],
  'john-wick': ['john-wick', 'wick'],
  'kim-jung-un': ['kim-jung-un', 'kim-jong-un']
};

const libraryCache = {
  dir: '',
  dirMtimeMs: 0,
  manifestMtimeMs: 0,
  expiresAt: 0,
  payload: null
};

const resolveCache = new Map();

function nowIso() {
  return new Date().toISOString();
}

function safeStatMtimeMs(filePath) {
  try {
    return Number(fs.statSync(filePath).mtimeMs) || 0;
  } catch (error) {
    return 0;
  }
}

function normalizeSlashes(value = '') {
  return String(value || '').replace(/\\/g, '/');
}

function sanitizeSlug(text = '') {
  let normalized = String(text || '').trim();
  if (!normalized) return '';
  try {
    normalized = normalized.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  } catch (error) {
  }
  return normalized
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function tokenize(value = '') {
  const slug = sanitizeSlug(value);
  if (!slug) return [];
  return slug.split('-').filter((token) => token && token.length >= 2);
}

function clamp(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function clampSnippetDurationSeconds(seconds, fallback = 1.35) {
  return clamp(seconds, 0.85, 2.2, fallback);
}

function clampPlaybackRate(rate, fallback = 1) {
  return clamp(rate, 0.5, 2.5, fallback);
}

function encodeAudioPathPath(relPath = '') {
  return normalizeSlashes(relPath)
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function normalizeSnippetSpec(rawSpec = {}, defaults = {}) {
  const raw = rawSpec && typeof rawSpec === 'object' ? rawSpec : {};
  const url = String(raw.url || defaults.url || '').trim();
  if (!url) return null;

  const startSec = Math.max(0, Number.isFinite(Number(raw.startSec)) ? Number(raw.startSec)
    : Number.isFinite(Number(raw.startMs)) ? Number(raw.startMs) / 1000
      : Number.isFinite(Number(defaults.startSec)) ? Number(defaults.startSec) : 0);

  const endSec = Number.isFinite(Number(raw.endSec)) ? Number(raw.endSec)
    : Number.isFinite(Number(raw.endMs)) ? Number(raw.endMs) / 1000 : null;

  const rawDuration = Number.isFinite(Number(raw.durationSec)) ? Number(raw.durationSec)
    : Number.isFinite(Number(raw.durationMs)) ? Number(raw.durationMs) / 1000
      : (endSec != null ? Math.max(0.25, endSec - startSec) : (Number(defaults.durationSec) || 1.35));

  return {
    url,
    startSec,
    durationSec: clampSnippetDurationSeconds(rawDuration, Number(defaults.durationSec) || 1.35),
    playbackRate: clampPlaybackRate(raw.playbackRate != null ? raw.playbackRate : defaults.playbackRate, 1),
    gain: clamp(raw.gain != null ? raw.gain : defaults.gain, 0, 1.25, 1),
    id: String(raw.id || defaults.id || '').trim(),
    source: String(raw.source || defaults.source || 'manifest').trim() || 'manifest'
  };
}

function buildAudioClipIndex(rootDir, relPrefix = '') {
  let dirEntries = [];
  try {
    dirEntries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch (error) {
    return [];
  }

  const items = [];
  dirEntries.forEach((entry) => {
    if (!entry) return;
    const name = String(entry.name || '');
    if (!name) return;
    const absPath = path.join(rootDir, name);
    const relPath = relPrefix ? `${relPrefix}/${name}` : name;
    if (entry.isDirectory()) {
      items.push(...buildAudioClipIndex(absPath, relPath));
      return;
    }
    if (!entry.isFile()) return;
    if (!/\.(mp3|m4a|wav|ogg)$/i.test(name)) return;
    if (/^manifest\.json$/i.test(name)) return;

    const normalizedRel = normalizeSlashes(relPath);
    const stem = normalizedRel.replace(/\.[^.]+$/i, '');
    const pathParts = normalizedRel.split('/').filter(Boolean);
    const stemParts = stem.split('/').filter(Boolean);
    const folderHints = stemParts.slice(0, -1);
    const slug = sanitizeSlug(stem);
    const baseName = path.basename(stem);

    const splitHint = (() => {
      if (baseName.includes('__')) return baseName.split('__');
      if (baseName.includes('~~')) return baseName.split('~~');
      if (baseName.includes(' - ')) {
        const parts = baseName.split(' - ').map((part) => String(part || '').trim()).filter(Boolean);
        if (parts.length >= 2) return parts;
      }
      return [baseName];
    })();

    let characterHint = String(splitHint[0] || '').trim();
    if (splitHint.length === 1 && folderHints.length) {
      characterHint = String(folderHints[folderHints.length - 1] || characterHint).trim() || characterHint;
    }
    const quoteHint = splitHint.length > 1 ? splitHint.slice(1).join(' ').trim() : '';
    const sourceLabel = baseName.replace(/[_-]+/g, ' ').trim();
    const tokens = Array.from(new Set([
      ...tokenize(sourceLabel),
      ...tokenize(characterHint),
      ...tokenize(quoteHint),
      ...folderHints.flatMap((part) => tokenize(part))
    ]));

    items.push({
      file: normalizedRel,
      url: `/audio/clips/${encodeAudioPathPath(normalizedRel)}`,
      slug,
      label: sourceLabel,
      characterHint,
      quoteHint,
      folderHints,
      pathParts,
      tokens
    });
  });

  return items;
}

function normalizeManifestClipUrl(entry = {}) {
  const explicitUrl = String(entry && entry.url || '').trim();
  if (explicitUrl) {
    if (/^https?:\/\//i.test(explicitUrl) || explicitUrl.startsWith('/')) return explicitUrl;
    return `/audio/clips/${encodeAudioPathPath(explicitUrl)}`;
  }
  const file = String(entry && entry.file || '').trim();
  if (!file) return '';
  return `/audio/clips/${encodeAudioPathPath(file)}`;
}

function loadClipManifestEntries(clipsDir) {
  const manifestPath = path.join(clipsDir, 'manifest.json');
  let parsed = null;
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    parsed = JSON.parse(raw);
  } catch (error) {
    return [];
  }
  const clips = Array.isArray(parsed && parsed.clips) ? parsed.clips : [];
  return clips
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const url = normalizeManifestClipUrl(entry);
      if (!url) return null;
      const rawValues = []
        .concat(entry.id || '')
        .concat(entry.character || '')
        .concat(entry.name || '')
        .concat(entry.title || '')
        .concat(Array.isArray(entry.keys) ? entry.keys : [])
        .concat(Array.isArray(entry.aliases) ? entry.aliases : [])
        .concat(Array.isArray(entry.characters) ? entry.characters : [])
        .concat(Array.isArray(entry.titles) ? entry.titles : [])
        .concat(Array.isArray(entry.resolvedTitles) ? entry.resolvedTitles : []);
      const slugs = Array.from(new Set(rawValues.map((value) => sanitizeSlug(value)).filter(Boolean)));
      const tokens = Array.from(new Set(rawValues.flatMap((value) => tokenize(value))));
      return {
        ...entry,
        url,
        slugs,
        tokens
      };
    })
    .filter(Boolean);
}

function getCardAudioCandidateSlugs(meta = {}) {
  const rawCandidates = []
    .concat(meta.character || '')
    .concat(meta.resolvedTitle || '')
    .concat(Array.isArray(meta.aliases) ? meta.aliases : []);
  const slugs = new Set();
  const aliasHits = new Set();

  rawCandidates.filter(Boolean).forEach((candidate) => {
    const text = String(candidate).trim();
    if (!text) return;
    const base = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    const noArticle = base.replace(/^(a|an|the)\s+/i, '').trim();
    [text, base, noArticle].forEach((variantText) => {
      const slug = sanitizeSlug(variantText);
      if (!slug) return;
      slugs.add(slug);
      const aliases = AUDIO_CARD_NAME_ALIASES[slug] || [];
      aliases.forEach((alias) => aliasHits.add(sanitizeSlug(alias)));
    });
  });

  aliasHits.forEach((slug) => {
    if (slug) slugs.add(slug);
  });
  return Array.from(slugs);
}

function getCardAudioCandidateTokens(meta = {}) {
  const values = []
    .concat(meta.character || '')
    .concat(meta.resolvedTitle || '')
    .concat(Array.isArray(meta.aliases) ? meta.aliases : []);
  const tokenSet = new Set();
  values.forEach((value) => tokenize(value).forEach((token) => tokenSet.add(token)));
  return Array.from(tokenSet);
}

function quickSlugDistance(a = '', b = '') {
  const x = String(a || '');
  const y = String(b || '');
  if (!x || !y) return 99;
  if (x === y) return 0;
  if (Math.abs(x.length - y.length) > 3) return 99;
  const rows = y.length + 1;
  const cols = x.length + 1;
  const dp = Array.from({ length: rows }, (_, r) => {
    const row = new Array(cols).fill(0);
    row[0] = r;
    return row;
  });
  for (let c = 0; c < cols; c += 1) dp[0][c] = c;
  for (let r = 1; r < rows; r += 1) {
    let rowMin = dp[r][0];
    for (let c = 1; c < cols; c += 1) {
      const cost = y[r - 1] === x[c - 1] ? 0 : 1;
      dp[r][c] = Math.min(dp[r - 1][c] + 1, dp[r][c - 1] + 1, dp[r - 1][c - 1] + cost);
      if (dp[r][c] < rowMin) rowMin = dp[r][c];
    }
    if (rowMin > 3) return 99;
  }
  return dp[rows - 1][cols - 1];
}

function scoreManifestClipCandidate(entry = {}, meta = {}) {
  const clipSlugs = new Set(Array.isArray(entry.slugs) ? entry.slugs : []);
  if (!clipSlugs.size) return 0;
  const metaSlugs = getCardAudioCandidateSlugs(meta);
  if (!metaSlugs.length) return 0;
  const resolvedSlug = sanitizeSlug(meta.resolvedTitle || '');
  const characterSlug = sanitizeSlug(meta.character || '');
  let score = 0;

  metaSlugs.forEach((slug) => {
    if (!slug) return;
    if (clipSlugs.has(slug)) {
      if (resolvedSlug && slug === resolvedSlug) score += 220;
      else if (characterSlug && slug === characterSlug) score += 180;
      else score += 120;
      return;
    }
    clipSlugs.forEach((clipSlug) => {
      if (!clipSlug) return;
      if (clipSlug.includes(slug) || slug.includes(clipSlug)) score += 28;
    });
  });

  const minConfidence = Number(entry.minInfoConfidence);
  if (Number.isFinite(minConfidence) && (Number(meta.infoConfidence) || 0) < minConfidence) {
    score -= 200;
  }
  if ((Number(meta.infoConfidence) || 0) >= 0.75 && resolvedSlug && clipSlugs.has(resolvedSlug)) {
    score += 40;
  }
  return score;
}

function scoreIndexedClipCandidate(entry = {}, meta = {}) {
  const entrySlug = sanitizeSlug(entry.slug || entry.file || entry.label || '');
  if (!entrySlug) return 0;
  const metaSlugs = getCardAudioCandidateSlugs(meta);
  if (!metaSlugs.length) return 0;

  const resolvedSlug = sanitizeSlug(meta.resolvedTitle || '');
  const characterSlug = sanitizeSlug(meta.character || '');
  const entryCharacterHintSlug = sanitizeSlug(entry.characterHint || '');
  const entryFolderHintSlugs = Array.isArray(entry.folderHints)
    ? entry.folderHints.map((value) => sanitizeSlug(value)).filter(Boolean)
    : [];
  const entryTokens = new Set(Array.isArray(entry.tokens) ? entry.tokens : tokenize(entrySlug));
  const metaTokens = getCardAudioCandidateTokens(meta);

  let score = 0;
  metaSlugs.forEach((slug) => {
    if (!slug) return;
    if (entryCharacterHintSlug && slug === entryCharacterHintSlug) {
      score += (resolvedSlug && slug === resolvedSlug) ? 180 : 150;
    }
    if (entryFolderHintSlugs.includes(slug)) {
      score += (resolvedSlug && slug === resolvedSlug) ? 140 : 110;
    }
    if (slug === entrySlug) {
      score += (resolvedSlug && slug === resolvedSlug) ? 240 : (characterSlug && slug === characterSlug) ? 210 : 175;
      return;
    }
    if (entrySlug.startsWith(`${slug}-`)) {
      score += (resolvedSlug && slug === resolvedSlug) ? 120 : 90;
    }
    if (entrySlug.includes(slug) || slug.includes(entrySlug)) {
      score += 50;
    }
    slug.split('-').filter(Boolean).forEach((part) => {
      if (part.length >= 3 && entryTokens.has(part)) score += 14;
    });
  });

  metaTokens.forEach((token) => {
    if (token && entryTokens.has(token)) score += 12;
  });

  if ((Number(meta.infoConfidence) || 0) >= 0.75 && resolvedSlug && entrySlug === resolvedSlug) score += 50;
  if ((Number(meta.infoConfidence) || 0) >= 0.75 && characterSlug && entrySlug.startsWith(`${characterSlug}-`)) score += 30;
  if ((Number(meta.infoConfidence) || 0) >= 0.75 && (Number(meta.resolverConfidence) || 0) >= 0.75) score += 20;

  if (entryCharacterHintSlug && metaSlugs.length) {
    const bestDistance = metaSlugs.reduce((best, slug) => Math.min(best, quickSlugDistance(entryCharacterHintSlug, slug)), 99);
    if (bestDistance === 1) score += 34;
    if (bestDistance === 2) score += 16;
  }

  return score;
}

function normalizeRequestMeta(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const aliases = Array.isArray(source.aliases) ? source.aliases : [];
  return {
    character: String(source.character || source.name || '').trim(),
    resolvedTitle: String(source.resolvedTitle || '').trim(),
    aliases: aliases.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 16),
    infoConfidence: clamp(source.infoConfidence, 0, 1, 0),
    resolverConfidence: clamp(source.resolverConfidence, 0, 1, 0),
    ovr: clamp(source.ovr, 0, 99, 0)
  };
}

function buildMetaSignature(meta = {}) {
  return [
    meta.character || '',
    meta.resolvedTitle || '',
    Array.isArray(meta.aliases) ? meta.aliases.join('|') : '',
    String(meta.infoConfidence || 0),
    String(meta.resolverConfidence || 0)
  ].join('||');
}

function buildLibraryPayload(clipsDir) {
  const manifestPath = path.join(clipsDir, 'manifest.json');
  const dirMtimeMs = safeStatMtimeMs(clipsDir);
  const manifestMtimeMs = safeStatMtimeMs(manifestPath);
  const generatedAt = nowIso();

  const indexClips = buildAudioClipIndex(clipsDir);
  const manifestClips = loadClipManifestEntries(clipsDir);
  const librarySignature = `${dirMtimeMs}:${manifestMtimeMs}:${indexClips.length}:${manifestClips.length}`;

  const payload = {
    generatedAt,
    dirMtimeMs,
    manifestMtimeMs,
    librarySignature,
    index: {
      version: 2,
      generatedAt,
      total: indexClips.length,
      clips: indexClips
    },
    manifest: {
      version: 1,
      generatedAt,
      total: manifestClips.length,
      clips: manifestClips
    },
    stats: {
      version: 1,
      generatedAt,
      librarySignature,
      indexedClipCount: indexClips.length,
      manifestClipCount: manifestClips.length,
      totalResolvableSources: indexClips.length + manifestClips.length,
      libraryEmpty: (indexClips.length + manifestClips.length) === 0
    }
  };
  return payload;
}

function getLibrary(clipsDir) {
  const now = Date.now();
  const dirMtimeMs = safeStatMtimeMs(clipsDir);
  const manifestMtimeMs = safeStatMtimeMs(path.join(clipsDir, 'manifest.json'));
  if (
    libraryCache.payload
    && libraryCache.dir === clipsDir
    && libraryCache.dirMtimeMs === dirMtimeMs
    && libraryCache.manifestMtimeMs === manifestMtimeMs
    && libraryCache.expiresAt > now
  ) {
    return libraryCache.payload;
  }

  const payload = buildLibraryPayload(clipsDir);
  libraryCache.dir = clipsDir;
  libraryCache.dirMtimeMs = payload.dirMtimeMs;
  libraryCache.manifestMtimeMs = payload.manifestMtimeMs;
  libraryCache.expiresAt = now + INDEX_TTL_MS;
  libraryCache.payload = payload;
  return payload;
}

function pruneResolveCache() {
  const now = Date.now();
  for (const [key, value] of resolveCache.entries()) {
    if (!value || value.expiresAt <= now) resolveCache.delete(key);
  }
}

function resolveSingleAudioClip(meta = {}, library) {
  const safeMeta = normalizeRequestMeta(meta);
  const manifestClips = Array.isArray(library && library.manifest && library.manifest.clips) ? library.manifest.clips : [];
  const indexClips = Array.isArray(library && library.index && library.index.clips) ? library.index.clips : [];
  const libraryEmpty = !manifestClips.length && !indexClips.length;

  if (libraryEmpty) {
    return {
      mode: 'library-empty',
      snippet: null,
      matchScore: 0,
      matchSource: 'none'
    };
  }

  let bestManifest = null;
  let bestManifestScore = 0;
  for (let i = 0; i < manifestClips.length; i += 1) {
    const entry = manifestClips[i];
    const score = scoreManifestClipCandidate(entry, safeMeta);
    if (score > bestManifestScore) {
      bestManifest = entry;
      bestManifestScore = score;
    }
  }

  if (bestManifest && bestManifestScore >= 36) {
    const snippet = normalizeSnippetSpec({
      ...bestManifest,
      url: bestManifest.url,
      source: 'manifest'
    }, { durationSec: 1.35, playbackRate: 1, gain: 1 });
    if (snippet) {
      return {
        mode: 'manifest',
        snippet,
        matchScore: bestManifestScore,
        matchSource: 'manifest'
      };
    }
  }

  let bestIndex = null;
  let bestIndexScore = 0;
  for (let i = 0; i < indexClips.length; i += 1) {
    const entry = indexClips[i];
    const score = scoreIndexedClipCandidate(entry, safeMeta);
    if (score > bestIndexScore) {
      bestIndex = entry;
      bestIndexScore = score;
    }
  }

  if (bestIndex && bestIndexScore >= 42) {
    const snippet = normalizeSnippetSpec({
      ...bestIndex,
      url: bestIndex.url,
      source: 'indexed-file',
      startSec: Number.isFinite(Number(bestIndex.startSec)) ? Number(bestIndex.startSec) : 0.16,
      durationSec: Number.isFinite(Number(bestIndex.durationSec)) ? Number(bestIndex.durationSec) : 1.35,
      gain: Number.isFinite(Number(bestIndex.gain)) ? Number(bestIndex.gain) : 1
    }, { durationSec: 1.35, playbackRate: 1, gain: 1 });
    if (snippet) {
      return {
        mode: 'indexed-file',
        snippet,
        matchScore: bestIndexScore,
        matchSource: 'index'
      };
    }
  }

  return {
    mode: 'miss',
    snippet: null,
    matchScore: Math.max(bestManifestScore, bestIndexScore),
    matchSource: bestIndexScore >= bestManifestScore ? 'index' : 'manifest'
  };
}

function getCachedAudioClipIndexPayload(clipsDir) {
  const library = getLibrary(clipsDir);
  return library.index;
}

function getAudioClipStatsPayload(clipsDir) {
  const library = getLibrary(clipsDir);
  return library.stats;
}

function resolveAudioClipBatch(clipsDir, entries = []) {
  pruneResolveCache();
  const startedAt = Date.now();
  const library = getLibrary(clipsDir);
  const list = Array.isArray(entries) ? entries.slice(0, 72) : [];
  const normalizedEntries = list.map((entry) => normalizeRequestMeta(entry));
  const batchKey = `${library.librarySignature}|${normalizedEntries.map((meta) => buildMetaSignature(meta)).join('~')}`;
  const cached = resolveCache.get(batchKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.payload, cacheHit: true };
  }

  const results = normalizedEntries.map((meta, index) => {
    const resolved = resolveSingleAudioClip(meta, library);
    const signature = buildMetaSignature(meta);
    return {
      index,
      signature,
      character: meta.character || '',
      resolvedTitle: meta.resolvedTitle || '',
      mode: resolved.mode,
      snippet: resolved.snippet,
      matchScore: resolved.matchScore || 0,
      matchSource: resolved.matchSource || 'none'
    };
  });

  const stats = {
    requested: normalizedEntries.length,
    resolved: results.filter((row) => row && row.snippet).length,
    manifest: results.filter((row) => row.mode === 'manifest').length,
    indexed: results.filter((row) => row.mode === 'indexed-file').length,
    libraryEmpty: results.filter((row) => row.mode === 'library-empty').length,
    misses: results.filter((row) => row.mode === 'miss').length
  };

  const payload = {
    version: 1,
    generatedAt: nowIso(),
    cacheHit: false,
    library: library.stats,
    results,
    stats: {
      ...stats,
      elapsedMs: Math.max(0, Date.now() - startedAt)
    }
  };

  resolveCache.set(batchKey, {
    expiresAt: Date.now() + RESOLVE_CACHE_TTL_MS,
    payload
  });

  return payload;
}

module.exports = {
  getCachedAudioClipIndexPayload,
  getAudioClipStatsPayload,
  resolveAudioClipBatch
};
