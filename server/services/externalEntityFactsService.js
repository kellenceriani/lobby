const FACT_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6h
const FACT_CACHE = new Map();
const FACT_INFLIGHT = new Map();
const SOURCE_PROBE_CACHE_TTL_MS = 1000 * 60 * 30; // 30m
const SOURCE_PROBE_CACHE = new Map();

const DEFAULT_SOURCE_TIMEOUT_MS = Object.freeze({
  wikidata: 700,
  dbpedia: 1200,
  fandom: 500
});

const DBPEDIA_PENALTY_TOKENS = new Set([
  'list', 'episode', 'season', 'film', 'movie', 'soundtrack', 'album', 'song', 'series'
]);

const WIKIDATA_BAD_DESC_HINTS = [
  /\bprovince\b/i, /\bdistrict\b/i, /\bmunicipality\b/i, /\bsettlement\b/i,
  /\bgiven name\b/i, /\bfamily name\b/i, /\bWikimedia\b/i
];

function nowIso() {
  return new Date().toISOString();
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeSlug(text = '') {
  let normalized = String(text || '').trim();
  if (!normalized) return '';
  try {
    normalized = normalized.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  } catch (_error) {
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

function dedupeStrings(values = [], limit = 16) {
  const seen = new Set();
  const out = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out.slice(0, limit);
}

function normalizeMeta(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    character: String(src.character || src.name || '').replace(/\s+/g, ' ').trim(),
    resolvedTitle: String(src.resolvedTitle || '').replace(/\s+/g, ' ').trim(),
    aliases: dedupeStrings(Array.isArray(src.aliases) ? src.aliases : [], 16),
    description: String(src.description || '').replace(/\s+/g, ' ').trim().slice(0, 700),
    resolvedSource: String(src.resolvedSource || src.source || '').trim(),
    infoConfidence: clamp(src.infoConfidence, 0, 1, 0),
    resolverConfidence: clamp(src.resolverConfidence, 0, 1, 0),
    imageSynthetic: src.imageSynthetic === true
  };
}

function buildMetaKey(meta = {}) {
  const safe = normalizeMeta(meta);
  return [
    safe.character,
    safe.resolvedTitle,
    safe.aliases.join('|'),
    safe.resolvedSource,
    safe.infoConfidence,
    safe.resolverConfidence,
    safe.imageSynthetic ? 'img:syn' : 'img:real'
  ].join('||');
}

function stripParenthetical(text = '') {
  return String(text || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildQueryVariants(meta = {}, limit = 8) {
  const safe = normalizeMeta(meta);
  const raw = [
    safe.resolvedTitle,
    stripParenthetical(safe.resolvedTitle),
    safe.character,
    stripParenthetical(safe.character),
    ...safe.aliases
  ];
  const out = [];
  const seen = new Set();
  for (const value of raw) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const trimmed = text.replace(/\b(character|fictional character)\b/i, '').replace(/\s+/g, ' ').trim();
    [text, trimmed].forEach((variant) => {
      const clean = String(variant || '').trim();
      if (!clean) return;
      const key = sanitizeSlug(clean);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(clean);
    });
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

function titleMatchScore(meta = {}, candidateTitle = '') {
  const title = String(candidateTitle || '').trim();
  if (!title) return 0;
  const titleSlug = sanitizeSlug(title);
  const titleTokens = new Set(tokenize(title));
  const candidates = dedupeStrings([
    meta.resolvedTitle,
    meta.character,
    ...(Array.isArray(meta.aliases) ? meta.aliases : [])
  ], 20);
  let score = 0;
  for (const text of candidates) {
    const slug = sanitizeSlug(text);
    if (!slug) continue;
    if (slug === titleSlug) score += 180;
    else if (titleSlug.startsWith(`${slug}-`) || slug.startsWith(`${titleSlug}-`)) score += 70;
    else if (titleSlug.includes(slug) || slug.includes(titleSlug)) score += 32;
    tokenize(text).forEach((token) => {
      if (titleTokens.has(token)) score += 8;
    });
  }
  return score;
}

function stripHtml(text = '') {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreDescriptionQuality(text = '') {
  const clean = stripHtml(text);
  if (!clean) return 0;
  const words = clean.split(/\s+/).filter(Boolean);
  let score = 0;
  if (words.length >= 6 && words.length <= 28) score += 18;
  else if (words.length <= 40) score += 10;
  if (/\b(is|was|are|were|fictional|character|actor|actress|singer|rapper|scientist|superhero|villain|player|athlete|series)\b/i.test(clean)) score += 12;
  if (/disambiguation|may refer to/i.test(clean)) score -= 30;
  return score;
}

function hasSpeechLikeVerb(text = '') {
  return /\b(is|are|was|were|has|have|can|will|would|should|must|did|does|do|said|says|known|fights?|leads?|rules?|works?|lives?|builds?|creates?|appears?)\b/i.test(String(text || ''));
}

function descriptionToSentence(title = '', description = '') {
  const cleanTitle = String(title || '').replace(/\s+/g, ' ').trim();
  let clean = stripHtml(description).replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (/disambiguation|may refer to/i.test(clean)) return clean;
  if (!hasSpeechLikeVerb(clean)) {
    if (/^(an?|the)\b/i.test(clean)) clean = `${cleanTitle || 'It'} is ${clean}`;
    else clean = `${cleanTitle || 'It'} is a ${clean}`;
  } else if (cleanTitle && /^(he|she|they|it)\b/i.test(clean)) {
    clean = `${cleanTitle}. ${clean}`;
  }
  if (!/[.!?]$/.test(clean)) clean = `${clean}.`;
  return clean;
}

async function fetchJsonWithTimeout(url, {
  timeoutMs = 1000,
  headers = {},
  accept = 'application/json'
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(200, Number(timeoutMs) || 1000));
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: accept,
        'User-Agent': 'LobbyWARS/1.0 external-entity-facts',
        ...headers
      }
    });
    if (!response || !response.ok) {
      const error = new Error(`http_${response ? response.status : 'fail'}`);
      error.statusCode = Number(response && response.status) || 0;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function getCachedFact(key) {
  const row = FACT_CACHE.get(key);
  if (!row) return null;
  if ((Number(row.expiresAt) || 0) <= Date.now()) {
    FACT_CACHE.delete(key);
    return null;
  }
  return row.value;
}

function setCachedFact(key, value, ttlMs = FACT_CACHE_TTL_MS) {
  FACT_CACHE.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1000, Number(ttlMs) || FACT_CACHE_TTL_MS)
  });
  return value;
}

function getCachedProbe(key) {
  const row = SOURCE_PROBE_CACHE.get(key);
  if (!row) return null;
  if ((Number(row.expiresAt) || 0) <= Date.now()) {
    SOURCE_PROBE_CACHE.delete(key);
    return null;
  }
  return row.value;
}

function setCachedProbe(key, value, ttlMs = SOURCE_PROBE_CACHE_TTL_MS) {
  SOURCE_PROBE_CACHE.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1000, Number(ttlMs) || SOURCE_PROBE_CACHE_TTL_MS)
  });
  return value;
}

function buildSourceResult({
  source,
  ok = false,
  unavailable = false,
  title = '',
  description = '',
  aliases = [],
  sourceUrl = null,
  confidence = 0,
  matchScore = 0,
  latencyMs = 0,
  details = null,
  error = null
} = {}) {
  return {
    source: String(source || '').trim(),
    ok: Boolean(ok),
    unavailable: Boolean(unavailable),
    title: String(title || '').replace(/\s+/g, ' ').trim(),
    description: stripHtml(description).slice(0, 700),
    aliases: dedupeStrings(aliases, 20),
    sourceUrl: sourceUrl ? String(sourceUrl) : null,
    confidence: clamp(confidence, 0, 1, 0),
    matchScore: Number.isFinite(Number(matchScore)) ? Number(matchScore) : 0,
    latencyMs: Math.max(0, Number(latencyMs) || 0),
    details: details && typeof details === 'object' ? details : null,
    error: error ? String(error) : null
  };
}

async function probeFandomGlobalSearch({ timeoutMs = DEFAULT_SOURCE_TIMEOUT_MS.fandom } = {}) {
  const cacheKey = 'fandom-global-search';
  const cached = getCachedProbe(cacheKey);
  if (cached) return cached;
  const startedAt = Date.now();
  try {
    const url = 'https://services.fandom.com/universal-fandom/v1/Search/List?query=Batman&limit=1';
    const response = await fetch(url, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(Math.max(200, timeoutMs)) : undefined,
      headers: { 'User-Agent': 'LobbyWARS/1.0 external-entity-facts' }
    });
    const probe = {
      ok: Boolean(response && response.ok),
      statusCode: Number(response && response.status) || 0,
      latencyMs: Math.max(0, Date.now() - startedAt)
    };
    return setCachedProbe(cacheKey, probe);
  } catch (error) {
    return setCachedProbe(cacheKey, {
      ok: false,
      statusCode: 0,
      latencyMs: Math.max(0, Date.now() - startedAt),
      error: String(error && error.message || 'probe_failed')
    });
  }
}

async function lookupWikidataFact(meta = {}, options = {}) {
  const safeMeta = normalizeMeta(meta);
  const startedAt = Date.now();
  const timeoutMs = clamp(options.timeoutMs, 200, 3000, DEFAULT_SOURCE_TIMEOUT_MS.wikidata);
  const queries = buildQueryVariants(safeMeta, 6);
  if (!queries.length) {
    return buildSourceResult({ source: 'wikidata', ok: false, error: 'empty_query', latencyMs: 0 });
  }

  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < queries.length; i += 1) {
    const query = queries[i];
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&limit=6&format=json&origin=*`;
    let data = null;
    try {
      data = await fetchJsonWithTimeout(url, { timeoutMs });
    } catch (error) {
      if (i === queries.length - 1 && !best) {
        return buildSourceResult({
          source: 'wikidata',
          ok: false,
          error: error && error.message ? error.message : 'wikidata_search_failed',
          latencyMs: Date.now() - startedAt
        });
      }
      continue;
    }
    const rows = Array.isArray(data && data.search) ? data.search : [];
    rows.forEach((row) => {
      const label = String(row && row.label || '').trim();
      const description = String(row && row.description || '').trim();
      const matchScore = titleMatchScore(safeMeta, label);
      let score = matchScore + scoreDescriptionQuality(description);
      if (String(row && row.match && row.match.type || '').toLowerCase() === 'label') score += 6;
      WIKIDATA_BAD_DESC_HINTS.forEach((re) => { if (re.test(description)) score -= 24; });
      if (/\bfictional character\b/i.test(description)) score += 12;
      if (/\bsuperhero|villain|comic books?\b/i.test(description)) score += 8;
      if (String(safeMeta.character || '').toLowerCase().includes('doctor') && /^doctor who$/i.test(label)) score -= 16;
      if (score > bestScore) {
        bestScore = score;
        best = { row, label, description, score, query };
      }
    });
    if (bestScore >= 170) break;
  }

  if (!best || bestScore < 28) {
    return buildSourceResult({
      source: 'wikidata',
      ok: false,
      error: 'no_match',
      latencyMs: Date.now() - startedAt,
      matchScore: Math.max(0, Number(bestScore) || 0)
    });
  }

  let aliases = [];
  let sourceUrl = null;
  let title = best.label;
  let description = best.description;
  let details = { query: best.query, id: String(best.row && best.row.id || '') };

  const needDetail = Boolean(options.includeAliases) || !description || description.length < 30;
  const entityId = String(best.row && best.row.id || '').trim();
  if (entityId && needDetail) {
    try {
      const detailUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(entityId)}&languages=en&props=labels|descriptions|aliases|sitelinks&format=json&origin=*`;
      const detail = await fetchJsonWithTimeout(detailUrl, { timeoutMs: Math.min(timeoutMs + 150, 1800) });
      const entity = detail && detail.entities && detail.entities[entityId] ? detail.entities[entityId] : null;
      const enLabel = entity && entity.labels && entity.labels.en && entity.labels.en.value ? String(entity.labels.en.value) : '';
      const enDesc = entity && entity.descriptions && entity.descriptions.en && entity.descriptions.en.value ? String(entity.descriptions.en.value) : '';
      const enAliases = Array.isArray(entity && entity.aliases && entity.aliases.en)
        ? entity.aliases.en.map((item) => item && item.value ? String(item.value) : '').filter(Boolean)
        : [];
      const enwikiTitle = entity && entity.sitelinks && entity.sitelinks.enwiki && entity.sitelinks.enwiki.title
        ? String(entity.sitelinks.enwiki.title)
        : '';
      if (enLabel) title = enLabel;
      if (enDesc) description = enDesc;
      if (enAliases.length) aliases = enAliases;
      if (enwikiTitle) {
        sourceUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(enwikiTitle.replace(/ /g, '_'))}`;
      } else if (entityId) {
        sourceUrl = `https://www.wikidata.org/wiki/${encodeURIComponent(entityId)}`;
      }
      details = { ...details, entityFetched: true, enwikiTitle: enwikiTitle || null };
    } catch (_error) {
      if (entityId) sourceUrl = `https://www.wikidata.org/wiki/${encodeURIComponent(entityId)}`;
    }
  } else {
    sourceUrl = String(best.row && best.row.concepturi || '').trim() || null;
  }

  const confidence = clamp(((bestScore - 20) / 220), 0.2, 0.92, 0.45);
  const normalizedDescription = descriptionToSentence(title || safeMeta.resolvedTitle || safeMeta.character || '', description || '');
  return buildSourceResult({
    source: 'wikidata',
    ok: true,
    title,
    description: normalizedDescription || description,
    aliases,
    sourceUrl,
    confidence,
    matchScore: bestScore,
    latencyMs: Date.now() - startedAt,
    details
  });
}

function dbpediaLabelToPlain(label = '') {
  return stripHtml(String(label || '')).replace(/\s+/g, ' ').trim();
}

function dbpediaResourceTitle(resource = '') {
  const raw = String(resource || '').trim();
  if (!raw) return '';
  const stem = raw.split('/').pop() || raw;
  return decodeURIComponent(stem).replace(/_/g, ' ').trim();
}

async function lookupDbpediaFact(meta = {}, options = {}) {
  const safeMeta = normalizeMeta(meta);
  const startedAt = Date.now();
  const timeoutMs = clamp(options.timeoutMs, 250, 4000, DEFAULT_SOURCE_TIMEOUT_MS.dbpedia);
  const queries = buildQueryVariants(safeMeta, 5);
  if (!queries.length) {
    return buildSourceResult({ source: 'dbpedia', ok: false, error: 'empty_query', latencyMs: 0 });
  }

  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < queries.length; i += 1) {
    const query = queries[i];
    const url = `https://lookup.dbpedia.org/api/search?query=${encodeURIComponent(query)}&maxResults=6&format=json`;
    let data = null;
    try {
      data = await fetchJsonWithTimeout(url, {
        timeoutMs,
        headers: { Accept: 'application/json' }
      });
    } catch (error) {
      if (i === queries.length - 1 && !best) {
        return buildSourceResult({
          source: 'dbpedia',
          ok: false,
          error: error && error.message ? error.message : 'dbpedia_lookup_failed',
          latencyMs: Date.now() - startedAt
        });
      }
      continue;
    }
    const docs = Array.isArray(data && data.docs) ? data.docs : [];
    docs.forEach((doc) => {
      const label = dbpediaLabelToPlain(doc && doc.label && doc.label[0]);
      const resource = String(doc && doc.resource && doc.resource[0] || '').trim();
      const title = label || dbpediaResourceTitle(resource);
      const comment = stripHtml(doc && doc.comment && doc.comment[0] || '');
      const resourceTitle = dbpediaResourceTitle(resource);
      let score = Math.max(
        titleMatchScore(safeMeta, title),
        titleMatchScore(safeMeta, resourceTitle)
      );
      score += scoreDescriptionQuality(comment);
      const titleTokens = tokenize(title);
      if (titleTokens.some((token) => DBPEDIA_PENALTY_TOKENS.has(token))) score -= 18;
      if (/^list of\b/i.test(title)) score -= 26;
      if (/in other media/i.test(title)) score -= 18;
      if (/\bfictional\b/i.test(comment)) score += 8;
      if (/\bamerican comic books\b/i.test(comment)) score += 4;
      if (score > bestScore) {
        bestScore = score;
        best = { query, title, comment, resource, score };
      }
    });
    if (bestScore >= 165) break;
  }

  if (!best || bestScore < 24) {
    return buildSourceResult({
      source: 'dbpedia',
      ok: false,
      error: 'no_match',
      latencyMs: Date.now() - startedAt,
      matchScore: Math.max(0, Number(bestScore) || 0)
    });
  }

  return buildSourceResult({
    source: 'dbpedia',
    ok: true,
    title: best.title,
    description: descriptionToSentence(best.title, best.comment) || best.comment,
    sourceUrl: best.resource || null,
    confidence: clamp(((bestScore - 18) / 220), 0.15, 0.72, 0.38),
    matchScore: bestScore,
    latencyMs: Date.now() - startedAt,
    details: { query: best.query }
  });
}

async function lookupFandomInfoboxFact(meta = {}, options = {}) {
  const startedAt = Date.now();
  const probe = await probeFandomGlobalSearch({ timeoutMs: clamp(options.timeoutMs, 200, 2000, DEFAULT_SOURCE_TIMEOUT_MS.fandom) });
  if (!probe || probe.ok !== true) {
    return buildSourceResult({
      source: 'fandom',
      ok: false,
      unavailable: true,
      error: probe && probe.statusCode ? `unavailable_http_${probe.statusCode}` : (probe && probe.error ? probe.error : 'unavailable'),
      latencyMs: Math.max(0, Date.now() - startedAt),
      details: probe && typeof probe === 'object' ? probe : null
    });
  }
  return buildSourceResult({
    source: 'fandom',
    ok: false,
    error: 'global_search_not_implemented_due_reliability',
    latencyMs: Math.max(0, Date.now() - startedAt),
    details: probe
  });
}

async function lookupExternalEntityFactBySource(source, meta = {}, options = {}) {
  const sourceId = String(source || '').trim().toLowerCase();
  if (!sourceId) return buildSourceResult({ source: 'unknown', ok: false, error: 'missing_source' });
  const safeMeta = normalizeMeta(meta);
  const cacheKey = `src:${sourceId}|${buildMetaKey(safeMeta)}`;
  const cached = getCachedFact(cacheKey);
  if (cached) return { ...cached, cacheHit: true };
  if (FACT_INFLIGHT.has(cacheKey)) {
    const inflight = await FACT_INFLIGHT.get(cacheKey);
    return { ...inflight, cacheHit: true };
  }

  const task = (async () => {
    let result = null;
    if (sourceId === 'wikidata') result = await lookupWikidataFact(safeMeta, options);
    else if (sourceId === 'dbpedia') result = await lookupDbpediaFact(safeMeta, options);
    else if (sourceId === 'fandom') result = await lookupFandomInfoboxFact(safeMeta, options);
    else result = buildSourceResult({ source: sourceId, ok: false, error: 'unsupported_source' });
    return setCachedFact(cacheKey, result);
  })();

  FACT_INFLIGHT.set(cacheKey, task);
  try {
    const result = await task;
    return { ...result, cacheHit: false };
  } finally {
    FACT_INFLIGHT.delete(cacheKey);
  }
}

function defaultSourceOrder(meta = {}, options = {}) {
  if (Array.isArray(options.sources) && options.sources.length) {
    return options.sources.map((s) => String(s || '').toLowerCase()).filter(Boolean);
  }
  const safeMeta = normalizeMeta(meta);
  const trust = Math.max(Number(safeMeta.infoConfidence) || 0, Number(safeMeta.resolverConfidence) || 0);
  const fastOnly = options.fastOnly === true || (options.fastOnly == null && trust < 0.7);
  return fastOnly ? ['wikidata'] : ['wikidata', 'dbpedia'];
}

function chooseBestResult(results = [], meta = {}) {
  const safeMeta = normalizeMeta(meta);
  let best = null;
  let bestScore = -Infinity;
  for (const row of Array.isArray(results) ? results : []) {
    if (!row || row.ok !== true) continue;
    const titleScore = titleMatchScore(safeMeta, row.title || '');
    const descText = String(row.description || '');
    let score = titleScore + scoreDescriptionQuality(descText);
    if (hasSpeechLikeVerb(descText)) score += 12;
    else score -= 4;
    score += Math.round((Number(row.confidence) || 0) * 18);
    if (String(row.source || '') === 'wikidata') score += 4;
    if (String(row.source || '') === 'dbpedia') score += hasSpeechLikeVerb(descText) ? 6 : -2;
    if (/\bdisambiguation|may refer to\b/i.test(String(row.description || ''))) score -= 40;
    if (score > bestScore) {
      bestScore = score;
      best = { ...row, aggregateScore: score };
    }
  }
  return best ? { ...best, aggregateScore: bestScore } : null;
}

async function lookupExternalEntityFact(meta = {}, options = {}) {
  const safeMeta = normalizeMeta(meta);
  const sources = defaultSourceOrder(safeMeta, options);
  const attempts = [];
  const startedAt = Date.now();
  const totalTimeoutMs = clamp(options.totalTimeoutMs, 250, 6000, 1800);
  const deadlineAt = Date.now() + totalTimeoutMs;

  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    if (Date.now() >= deadlineAt) break;
    const perSourceTimeout = clamp(
      options[`${source}TimeoutMs`],
      150,
      4000,
      DEFAULT_SOURCE_TIMEOUT_MS[source] || 900
    );
    let result = null;
    try {
      result = await lookupExternalEntityFactBySource(source, safeMeta, {
        ...options,
        timeoutMs: Math.min(perSourceTimeout, Math.max(200, deadlineAt - Date.now()))
      });
    } catch (error) {
      result = buildSourceResult({
        source,
        ok: false,
        error: error && error.message ? error.message : 'source_failed',
        latencyMs: 0
      });
    }
    attempts.push(result);
    if (result && result.ok === true && chooseBestResult([result], safeMeta)) {
      if (String(source) === 'wikidata' && (Number(result.matchScore) || 0) >= 150) {
        break;
      }
      if (options.stopOnFirstHit === true) break;
    }
  }

  const best = chooseBestResult(attempts, safeMeta);
  return {
    generatedAt: nowIso(),
    elapsedMs: Math.max(0, Date.now() - startedAt),
    best: best ? {
      source: best.source,
      title: best.title,
      description: best.description,
      aliases: best.aliases || [],
      sourceUrl: best.sourceUrl || null,
      confidence: best.confidence,
      matchScore: best.matchScore,
      aggregateScore: best.aggregateScore,
      details: best.details || null,
      cacheHit: best.cacheHit === true
    } : null,
    attempts: attempts.map((row) => ({
      source: row.source,
      ok: row.ok === true,
      unavailable: row.unavailable === true,
      title: row.title || '',
      description: row.description || '',
      confidence: Number(row.confidence) || 0,
      matchScore: Number(row.matchScore) || 0,
      latencyMs: Number(row.latencyMs) || 0,
      error: row.error || null,
      cacheHit: row.cacheHit === true
    }))
  };
}

function shouldTryExternalFactEnrichment(character, info = {}, fetchOptions = {}) {
  const safeInfo = info && typeof info === 'object' ? info : null;
  if (!safeInfo) return false;
  if (fetchOptions && fetchOptions.skipExternalFactEnrichment === true) return false;
  const source = String(safeInfo.source || '').toLowerCase();
  const confidence = Number(safeInfo.confidence) || 0;
  const description = String(safeInfo.description || '').replace(/\s+/g, ' ').trim();
  const isFastRound = Boolean(fetchOptions && fetchOptions.fastRoundMode);

  if (/round-fast-fallback|name-only/.test(source)) return false;
  if (safeInfo.genericAmbiguityFallback) return false;
  if (safeInfo.timeoutFallback && isFastRound) return false;
  if (/wikidata/.test(source) && description.length >= 70 && confidence >= 0.6) return false;
  if (/wikipedia/.test(source) && description.length >= 120 && confidence >= 0.7 && !/may refer to|disambiguation/i.test(description)) return false;
  if (isFastRound && confidence >= 0.65 && description.length >= 80) return false;
  if (isFastRound && description.length < 32) return false; // protect round latency on very weak names

  const compact = sanitizeSlug(character || safeInfo.title || safeInfo.name || '');
  if (!compact) return false;
  return true;
}

function mergeExternalFactIntoInfo(info = {}, fact = null, character = '') {
  const safeInfo = info && typeof info === 'object' ? info : null;
  const best = fact && typeof fact === 'object' ? fact : null;
  if (!safeInfo || !best || !best.title || !best.description) return safeInfo;

  const currentDescription = String(safeInfo.description || '').replace(/\s+/g, ' ').trim();
  const currentTitle = String(safeInfo.title || safeInfo.name || '').trim();
  const externalTitle = String(best.title || '').trim();
  const externalDescription = descriptionToSentence(externalTitle || currentTitle || character, best.description || '');
  const currentSource = String(safeInfo.source || '').trim();
  const currentConfidence = clamp(safeInfo.confidence, 0, 1, 0);
  const bestConfidence = clamp(best.confidence, 0, 1, 0);

  const replaceDescription = (
    !currentDescription
    || currentDescription.length < 80
    || /may refer to|disambiguation|no verified external record|lexical profile fallback/i.test(currentDescription)
  ) && externalDescription.length >= 36;

  const titleLooksWeak = (
    !currentTitle
    || /\b(disambiguation|season|episode|list of)\b/i.test(currentTitle)
  );
  const replaceTitle = titleLooksWeak || (sanitizeSlug(currentTitle) === sanitizeSlug(character) && sanitizeSlug(externalTitle) !== sanitizeSlug(currentTitle));

  if (!replaceDescription && !replaceTitle) return safeInfo;

  const next = {
    ...safeInfo,
    title: replaceTitle ? externalTitle : (safeInfo.title || safeInfo.name || externalTitle),
    name: replaceTitle ? externalTitle : (safeInfo.name || safeInfo.title || externalTitle),
    description: replaceDescription ? externalDescription : currentDescription,
    source: currentSource ? `${currentSource}+${best.source}` : String(best.source || 'external'),
    confidence: clamp(Math.max(currentConfidence, Math.min(0.88, currentConfidence + (bestConfidence * 0.08))), 0, 1, currentConfidence || bestConfidence),
    confidenceBand: String(safeInfo.confidenceBand || '').trim() || (currentConfidence >= 0.75 ? 'high' : currentConfidence >= 0.55 ? 'medium' : 'low'),
    aliases: dedupeStrings([...(Array.isArray(safeInfo.aliases) ? safeInfo.aliases : []), ...(Array.isArray(best.aliases) ? best.aliases : [])], 20),
    lookupMeta: {
      ...(safeInfo.lookupMeta && typeof safeInfo.lookupMeta === 'object' ? safeInfo.lookupMeta : {}),
      externalFactEnrichment: {
        source: best.source,
        title: externalTitle,
        confidence: bestConfidence,
        matchScore: Number(best.matchScore) || 0,
        sourceUrl: best.sourceUrl || null
      }
    }
  };

  if (!next.sourceUrl && best.sourceUrl) next.sourceUrl = best.sourceUrl;
  return next;
}

function resetExternalEntityFactsCaches() {
  FACT_CACHE.clear();
  FACT_INFLIGHT.clear();
  SOURCE_PROBE_CACHE.clear();
}

module.exports = {
  lookupExternalEntityFactBySource,
  lookupExternalEntityFact,
  probeFandomGlobalSearch,
  shouldTryExternalFactEnrichment,
  mergeExternalFactIntoInfo,
  resetExternalEntityFactsCaches,
  _internal: {
    descriptionToSentence
  }
};
