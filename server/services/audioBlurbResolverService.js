const { resolveAudioClipBatch } = require('./audioClipResolverService');

const QUOTE_ENTITY_CACHE_TTL_MS = 1000 * 60 * 60 * 8; // 8h
const QUOTE_SEARCH_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6h
const QUOTE_PAGE_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6h
const BLURB_BATCH_CACHE_TTL_MS = 1000 * 30; // 30s
const QUOTE_FETCH_TIMEOUT_MS = 1800;
const MAX_QUOTE_FETCH_CONCURRENCY = 2;
const MAX_BATCH_ENTRIES = 72;

const quoteEntityCache = new Map();
const quoteSearchCache = new Map();
const quotePageCache = new Map();
const blurbBatchCache = new Map();

let quoteFetchActive = 0;
const quoteFetchQueue = [];

const AUDIO_SEARCH_PENALTY_TOKENS = new Set([
  'film', 'movie', 'series', 'tv', 'television', 'episode', 'season', 'soundtrack',
  'adventure', 'adventures', 'builder', 'builders', 'book', 'novel', 'album', 'song'
]);

function nowIso() {
  return new Date().toISOString();
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

function normalizeMeta(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const aliases = Array.isArray(src.aliases) ? src.aliases : [];
  const riskFlags = Array.isArray(src.riskFlags) ? src.riskFlags : [];
  return {
    character: String(src.character || src.name || '').trim(),
    resolvedTitle: String(src.resolvedTitle || '').trim(),
    aliases: aliases.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 16),
    description: String(src.description || src.resolvedDescriptionSnippet || '').replace(/\s+/g, ' ').trim().slice(0, 700),
    resolvedSource: String(src.resolvedSource || src.source || '').trim(),
    riskFlags: riskFlags.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 16),
    imageSynthetic: Boolean(src.imageSynthetic),
    infoConfidence: clamp(src.infoConfidence, 0, 1, 0),
    resolverConfidence: clamp(src.resolverConfidence, 0, 1, 0),
    ovr: clamp(src.ovr, 0, 99, 0)
  };
}

function shortHash(value = '') {
  const text = String(value || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
}

function buildMetaSignature(meta = {}) {
  const safeMeta = normalizeMeta(meta);
  return [
    safeMeta.character || '',
    safeMeta.resolvedTitle || '',
    (safeMeta.aliases || []).join('|'),
    safeMeta.resolvedSource || '',
    shortHash((safeMeta.description || '').slice(0, 240)),
    (safeMeta.riskFlags || []).slice(0, 6).join('|'),
    safeMeta.imageSynthetic ? 'img:syn' : 'img:real-or-none',
    String(safeMeta.infoConfidence || 0),
    String(safeMeta.resolverConfidence || 0)
  ].join('||');
}

function getCached(cache, key) {
  const row = cache.get(key);
  if (!row) return null;
  if ((Number(row.expiresAt) || 0) <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return row.value;
}

function setCached(cache, key, value, ttlMs) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1000, Number(ttlMs) || 1000)
  });
  return value;
}

function pruneCache(cache) {
  const now = Date.now();
  for (const [key, row] of cache.entries()) {
    if (!row || (Number(row.expiresAt) || 0) <= now) cache.delete(key);
  }
}

function enqueueQuoteFetch(taskFn) {
  return new Promise((resolve, reject) => {
    quoteFetchQueue.push({ taskFn, resolve, reject });
    drainQuoteFetchQueue();
  });
}

function drainQuoteFetchQueue() {
  while (quoteFetchActive < MAX_QUOTE_FETCH_CONCURRENCY && quoteFetchQueue.length) {
    const next = quoteFetchQueue.shift();
    if (!next) continue;
    quoteFetchActive += 1;
    Promise.resolve()
      .then(() => next.taskFn())
      .then((result) => next.resolve(result))
      .catch((error) => next.reject(error))
      .finally(() => {
        quoteFetchActive = Math.max(0, quoteFetchActive - 1);
        drainQuoteFetchQueue();
      });
  }
}

async function fetchJsonWithTimeout(url, { timeoutMs = QUOTE_FETCH_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(300, Number(timeoutMs) || QUOTE_FETCH_TIMEOUT_MS));
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'LobbyWARS/1.0 (audio blurb resolver)'
      }
    });
    if (!response || !response.ok) {
      throw new Error(`http_${response ? response.status : 'fail'}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function mediaWikiApiUrl(host, params = {}) {
  const sp = new URLSearchParams({ format: 'json', origin: '*', ...params });
  return `https://${host}/w/api.php?${sp.toString()}`;
}

async function wikiOpenSearch(host, queryText = '', limit = 5) {
  const query = String(queryText || '').trim();
  if (!query) return [];
  const cacheKey = `${host}|opensearch|${query.toLowerCase()}|${limit}`;
  const cached = getCached(quoteSearchCache, cacheKey);
  if (cached) return cached;

  const url = mediaWikiApiUrl(host, {
    action: 'opensearch',
    search: query,
    limit: String(Math.max(1, Math.min(10, Number(limit) || 5))),
    namespace: '0'
  });
  const data = await enqueueQuoteFetch(() => fetchJsonWithTimeout(url));
  const titles = Array.isArray(data && data[1]) ? data[1] : [];
  const links = Array.isArray(data && data[3]) ? data[3] : [];
  const rows = titles.map((title, index) => ({
    title: String(title || '').trim(),
    url: String(links[index] || '').trim()
  })).filter((row) => row.title);
  return setCached(quoteSearchCache, cacheKey, rows, QUOTE_SEARCH_CACHE_TTL_MS);
}

async function wikiParseWikitext(host, pageTitle = '') {
  const title = String(pageTitle || '').trim();
  if (!title) return '';
  const cacheKey = `${host}|parse|${title.toLowerCase()}`;
  const cached = getCached(quotePageCache, cacheKey);
  if (cached && typeof cached.wikitext === 'string') return cached.wikitext;

  const url = mediaWikiApiUrl(host, {
    action: 'parse',
    page: title,
    prop: 'wikitext'
  });
  const data = await enqueueQuoteFetch(() => fetchJsonWithTimeout(url));
  let wikitext = String(data && data.parse && data.parse.wikitext && data.parse.wikitext['*'] || '');
  const redirectMatch = wikitext.match(/^\s*#redirect\s*\[\[([^\]]+)]]/i);
  if (redirectMatch && redirectMatch[1]) {
    const redirectTarget = String(redirectMatch[1]).split('|')[0].trim();
    if (redirectTarget && redirectTarget.toLowerCase() !== title.toLowerCase()) {
      const redirected = await wikiParseWikitext(host, redirectTarget).catch(() => '');
      if (redirected) wikitext = redirected;
    }
  }
  setCached(quotePageCache, cacheKey, { wikitext }, QUOTE_PAGE_CACHE_TTL_MS);
  return wikitext;
}

async function wikiIntroExtract(host, titleText = '') {
  const title = String(titleText || '').trim();
  if (!title) return '';
  const cacheKey = `${host}|extract|${title.toLowerCase()}`;
  const cached = getCached(quotePageCache, cacheKey);
  if (cached && typeof cached.extract === 'string') return cached.extract;

  const url = mediaWikiApiUrl(host, {
    action: 'query',
    titles: title,
    prop: 'extracts',
    explaintext: '1',
    exintro: '1'
  });
  const data = await enqueueQuoteFetch(() => fetchJsonWithTimeout(url));
  const pages = data && data.query && data.query.pages && typeof data.query.pages === 'object'
    ? Object.values(data.query.pages)
    : [];
  const extract = String((pages[0] && pages[0].extract) || '');
  setCached(quotePageCache, cacheKey, { extract }, QUOTE_PAGE_CACHE_TTL_MS);
  return extract;
}

function canonicalizeLoose(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripParentheticalSuffix(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.replace(/\s*\([^)]*\)\s*$/g, '').trim();
}

function buildQuoteQueryVariants(meta = {}) {
  const raw = [
    meta.resolvedTitle,
    stripParentheticalSuffix(meta.resolvedTitle),
    meta.character,
    stripParentheticalSuffix(meta.character),
    ...(Array.isArray(meta.aliases) ? meta.aliases : [])
  ];
  const out = [];
  const seen = new Set();
  for (const value of raw) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    const key = sanitizeSlug(normalized);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= 10) break;
  }
  return out;
}

function titleMatchScore(meta = {}, candidateTitle = '') {
  const title = String(candidateTitle || '').trim();
  if (!title) return 0;
  const titleSlug = sanitizeSlug(title);
  const titleTokens = new Set(tokenize(title));
  const candidates = []
    .concat(meta.resolvedTitle || '')
    .concat(meta.character || '')
    .concat(Array.isArray(meta.aliases) ? meta.aliases : [])
    .filter(Boolean);
  let score = 0;
  candidates.forEach((text) => {
    const slug = sanitizeSlug(text);
    if (!slug) return;
    if (slug === titleSlug) score += 180;
    if (titleSlug.startsWith(`${slug}-`) || slug.startsWith(`${titleSlug}-`)) score += 70;
    if (titleSlug.includes(slug) || slug.includes(titleSlug)) score += 36;
    tokenize(text).forEach((token) => {
      if (titleTokens.has(token)) score += 8;
    });
  });
  if ((Number(meta.infoConfidence) || 0) >= 0.75 && meta.resolvedTitle) {
    const resolvedSlug = sanitizeSlug(meta.resolvedTitle);
    if (resolvedSlug && (resolvedSlug === titleSlug || titleSlug.startsWith(`${resolvedSlug}-`))) score += 35;
  }

  const titleTokenList = tokenize(title);
  const titleTokenSet = new Set(titleTokenList);
  const inputTokens = tokenize(meta.character || '');
  const hasPenaltyToken = titleTokenList.some((token) => AUDIO_SEARCH_PENALTY_TOKENS.has(token) || /^\d{4}$/.test(token));
  if (hasPenaltyToken) {
    if (titleTokenSet.has('character') || titleTokenSet.has('comic') || titleTokenSet.has('comics')) score -= 8;
    else score -= 22;
  }
  if (inputTokens.length === 1) {
    const overlap = inputTokens.filter((token) => titleTokenSet.has(token)).length;
    if (overlap >= 1 && titleTokenList.length >= 4 && !titleTokenSet.has('character')) score -= 10;
  }
  return score;
}

function isDangerousQuotePageMatch(meta = {}, candidateTitle = '') {
  const candidateSlug = sanitizeSlug(candidateTitle);
  if (candidateSlug) {
    const safeVariants = buildQuoteQueryVariants(meta);
    for (const variant of safeVariants) {
      const variantSlug = sanitizeSlug(variant);
      if (!variantSlug) continue;
      if (variantSlug === candidateSlug) return false;
      if (candidateSlug === `${variantSlug}-character`) return false;
      if (
        candidateSlug.startsWith(`${variantSlug}-`)
        && /\b(character|comics|mythology|folklore)\b/i.test(String(candidateTitle || ''))
      ) {
        return false;
      }
    }
  }
  const titleTokens = new Set(tokenize(candidateTitle));
  if (!titleTokens.size) return true;
  const anchors = []
    .concat(meta.resolvedTitle || '')
    .concat(meta.character || '')
    .filter(Boolean)
    .map((value) => tokenize(value))
    .filter((tokens) => tokens.length >= 2);
  if (!anchors.length) return false;

  for (let i = 0; i < anchors.length; i += 1) {
    const anchorTokens = anchors[i];
    let overlap = 0;
    anchorTokens.forEach((token) => {
      if (titleTokens.has(token)) overlap += 1;
    });
    const coverage = overlap / Math.max(1, anchorTokens.length);
    if (coverage >= 0.6) return false;
  }
  return true;
}

function stripWikiMarkup(text = '') {
  let value = String(text || '');
  if (!value) return '';
  value = value.replace(/<!--[\s\S]*?-->/g, ' ');
  value = value.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ' ');
  value = value.replace(/<[^>]+>/g, ' ');
  value = value.replace(/\{\{\s*(?:cquote|quote|quotation|quotebox|blockquote)\s*\|([^{}]+)\}\}/gi, (_, body) => {
    const src = String(body || '');
    const textParam = src.match(/(?:^|\|)\s*(?:text|quote|quotation)\s*=\s*([^|]+)/i);
    if (textParam && textParam[1]) return ` ${textParam[1]} `;
    const firstParam = src.split('|').map((part) => String(part || '').trim()).find(Boolean);
    return firstParam ? ` ${firstParam} ` : ' ';
  });
  value = value.replace(/\{\{\s*quote2\s*\|([^{}]+)\}\}/gi, (_, body) => {
    const src = String(body || '');
    const firstParam = src.split('|').map((part) => String(part || '').trim()).find(Boolean);
    return firstParam ? ` ${firstParam} ` : ' ';
  });
  value = value.replace(/\{\{[^{}]*\}\}/g, ' ');
  value = value.replace(/\[\[(?:File|Image):[^\]]+\]\]/gi, ' ');
  value = value.replace(/\[\[(?:[^|\]]+\|)?([^\]]+)\]\]/g, '$1');
  value = value.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1');
  value = value.replace(/\[https?:\/\/[^\s\]]+\]/g, ' ');
  value = value.replace(/'''?/g, '');
  value = value.replace(/&nbsp;/gi, ' ');
  value = value.replace(/{{\s*lang\|[^|]+\|([^}]+)}}/gi, '$1');
  value = value.replace(/\s+/g, ' ').trim();
  return value;
}

function parseWikiquoteWikitextQuotes(wikitext = '') {
  const text = String(wikitext || '');
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const quotes = [];
  for (let i = 0; i < lines.length; i += 1) {
    let line = String(lines[i] || '').trim();
    if (!line) continue;
    if (!/^[*#:;]+/.test(line)) continue;
    if (/^\s*[:;]+\s*$/.test(line)) continue;
    if (/^\s*#\s*redirect\b/i.test(line)) continue;
    line = line.replace(/^[*#:;]+\s*/, '');
    if (!line) continue;
    if (/^(See also|External links|References|Quotes about|Gallery)\b/i.test(line)) continue;
    const hasAttribution = /(?:\s~\s|—|--|–|-)\s*\[\[/.test(line) || /\s~\s/.test(line);
    const cleaned = stripWikiMarkup(line);
    if (!cleaned) continue;
    let candidate = cleaned.replace(/\s*~\s*.+$/, '').trim();
    candidate = candidate.replace(/\s+[—–-]\s+.+$/, '').trim();
    candidate = candidate.replace(/^\(?\s*quote\s*:?\s*/i, '').trim();
    if (/^\s*redirect\b/i.test(candidate)) continue;
    if (!candidate) continue;
    if (candidate.length < 12 || candidate.length > 220) continue;
    if (!/[a-z]/i.test(candidate)) continue;
    const wordCount = candidate.split(/\s+/).filter(Boolean).length;
    if (wordCount < 3 || wordCount > 32) continue;
    quotes.push({
      text: candidate,
      wordCount,
      hasAttribution
    });
  }
  return quotes;
}

function splitSentences(text = '') {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function toMicroSpeechLine(text = '', { maxWords = 8, hardMaxWords = 12 } = {}) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source) return '';
  const sentence = splitSentences(source)[0] || source;
  let cleaned = sentence
    .replace(/^[“"'`]+/, '')
    .replace(/[”"'`]+$/, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';

  const words = cleaned.split(/\s+/).filter(Boolean);
  let truncated = false;
  if (words.length > hardMaxWords) {
    cleaned = words.slice(0, maxWords).join(' ');
    truncated = true;
  }
  cleaned = cleaned.replace(/[,:;]+$/g, '').trim();
  if (truncated && cleaned && !/[.!?]$/.test(cleaned)) {
    cleaned += '.';
  }
  return cleaned;
}

function pickBestQuoteLine(lines = [], meta = {}) {
  if (!Array.isArray(lines) || !lines.length) return null;
  const targetTokens = new Set([
    ...tokenize(meta.character || ''),
    ...tokenize(meta.resolvedTitle || ''),
    ...(Array.isArray(meta.aliases) ? meta.aliases.flatMap((a) => tokenize(a)) : [])
  ]);
  let best = null;
  let bestScore = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || !line.text) continue;
    const micro = toMicroSpeechLine(line.text, { maxWords: 8, hardMaxWords: 12 });
    if (!micro) continue;
    const words = micro.split(/\s+/).filter(Boolean);
    if (words.length < 3) continue;
    const lastWord = String(words[words.length - 1] || '').replace(/[^a-z']/gi, '');
    const likelyTruncated = !/[.!?]$/.test(micro)
      && /^(a|an|and|or|but|the|to|of|for|with|on|in|at|from|by|no|not|my|your)$/i.test(lastWord);
    if (likelyTruncated) continue;
    let score = 0;
    if (line.hasAttribution) score += 12;
    if (words.length >= 4 && words.length <= 9) score += 18;
    if (words.length >= 10 && words.length <= 12) score += 8;
    const microTokens = new Set(tokenize(micro));
    targetTokens.forEach((token) => {
      if (microTokens.has(token)) score += 5;
    });
    if (/\b(i am|i'm|we are|you|never|always|now)\b/i.test(micro)) score += 8;
    if (/[!?]$/.test(micro)) score += 4;
    if (score > bestScore) {
      bestScore = score;
      best = {
        text: micro,
        sourceText: line.text,
        score
      };
    }
  }
  return best;
}

function buildFactSpeechLine(extract = '', meta = {}) {
  const firstSentence = splitSentences(extract)[0] || '';
  const micro = toMicroSpeechLine(firstSentence, { maxWords: 9, hardMaxWords: 13 });
  if (!micro) return '';
  const name = String(meta.character || meta.resolvedTitle || '').trim();
  if (!name) return micro;
  if (micro.toLowerCase().startsWith(name.toLowerCase())) return micro;
  return `${name}. ${micro}`;
}

function resolveLocalInfoSpeechForMeta(meta = {}) {
  const description = String(meta && meta.description || '').trim();
  if (!description || description.length < 32) return null;

  const source = String(meta && meta.resolvedSource || '').toLowerCase();
  const riskFlags = new Set(
    Array.isArray(meta && meta.riskFlags) ? meta.riskFlags.map((flag) => String(flag || '').toLowerCase()) : []
  );
  const infoConfidence = Number(meta && meta.infoConfidence) || 0;
  const resolverConfidence = Number(meta && meta.resolverConfidence) || 0;

  if (!source || source.includes('round-fast-fallback') || source.includes('name-only')) return null;
  if (riskFlags.has('dangerous_title_diff_suspected')) return null;
  if (riskFlags.has('generic_name_ambiguity')) return null;
  if ((infoConfidence < 0.55 && resolverConfidence < 0.6) || description.length < 48) return null;
  if (/may refer to|disambiguation|no verified external record|using lexical profile fallback/i.test(description)) return null;

  const line = buildFactSpeechLine(description, meta);
  if (!line) return null;
  const style = inferSpeechStyle(meta, line);
  return {
    mode: 'speech-fact',
    speech: {
      text: line,
      displayText: line,
      source: 'resolver-info',
      sourceTitle: String(meta.resolvedTitle || meta.character || '').trim(),
      sourceUrl: null,
      confidence: clamp(((infoConfidence * 0.65) + (resolverConfidence * 0.35)), 0.4, 0.92, 0.5),
      voiceStyle: style.preset,
      rate: clamp(style.rate + 0.03, 0.85, 1.65, 1.15),
      pitch: style.pitch,
      gain: 1
    }
  };
}

function resolveAliasIndexSpeechForMeta(meta = {}) {
  const safeMeta = normalizeMeta(meta);
  const source = String(safeMeta.resolvedSource || '').toLowerCase();
  if (!source.includes('local-index')) return null;
  const riskFlags = new Set((safeMeta.riskFlags || []).map((flag) => String(flag || '').toLowerCase()));
  if (riskFlags.has('dangerous_title_diff_suspected') || riskFlags.has('generic_name_ambiguity')) return null;
  const trust = Math.max(Number(safeMeta.infoConfidence) || 0, Number(safeMeta.resolverConfidence) || 0);
  if (trust < 0.62) return null;

  const resolvedTitle = String(safeMeta.resolvedTitle || safeMeta.character || '').trim();
  if (!resolvedTitle) return null;
  const aliasHint = (Array.isArray(safeMeta.aliases) ? safeMeta.aliases : [])
    .map((value) => String(value || '').trim())
    .find((value) => value && value.toLowerCase() !== resolvedTitle.toLowerCase());

  let line = `${resolvedTitle}.`;
  if (aliasHint && safeMeta.character && safeMeta.character.toLowerCase() !== resolvedTitle.toLowerCase()) {
    line = `${resolvedTitle}. Alias match for ${safeMeta.character}.`;
  } else if (safeMeta.character && safeMeta.character.toLowerCase() !== resolvedTitle.toLowerCase()) {
    line = `${resolvedTitle}. Resolved from ${safeMeta.character}.`;
  } else {
    line = `${resolvedTitle}. Alias match confirmed.`;
  }

  const style = inferSpeechStyle(safeMeta, line);
  return {
    mode: 'speech-fact',
    speech: {
      text: line,
      displayText: line,
      source: 'resolver-alias',
      sourceTitle: resolvedTitle,
      sourceUrl: null,
      confidence: clamp((trust * 0.82), 0.42, 0.86, 0.55),
      voiceStyle: style.preset,
      rate: clamp(style.rate + 0.04, 0.85, 1.6, 1.14),
      pitch: style.pitch,
      gain: 1
    }
  };
}

function inferSpeechStyle(meta = {}, text = '') {
  const base = `${meta.character || ''} ${meta.resolvedTitle || ''} ${text}`;
  const slug = sanitizeSlug(base);
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = ((hash << 5) - hash) + slug.charCodeAt(i);
    hash |= 0;
  }
  const info = Number(meta.infoConfidence) || 0;
  const resolver = Number(meta.resolverConfidence) || 0;
  const trust = (info + resolver) / 2;
  const ovr = Number(meta.ovr) || 0;
  const themeText = `${meta.character || ''} ${meta.resolvedTitle || ''}`.toLowerCase();

  let preset = 'cinematic';
  if (/\b(robot|android|cyborg|ai|computer|mecha)\b/.test(themeText)) preset = 'synthetic';
  else if (/\b(dr|doctor|doom|lord|king|queen|dark|vader|thanos|galactus)\b/.test(themeText)) preset = 'villain';
  else if (/\b(cat|dog|bear|dragon|dino|pokemon|stitch|animal)\b/.test(themeText)) preset = 'creature';
  else if (/\bflash|speed|sonic|dash\b/.test(themeText)) preset = 'fast';
  else if (/\bpresident|lincoln|obama|trump|leader|general\b/.test(themeText)) preset = 'command';

  const variant = Math.abs(hash) % 4;
  let rate = 1.18;
  let pitch = 1.02;
  if (preset === 'villain') { rate = 0.94; pitch = 0.86; }
  if (preset === 'synthetic') { rate = 1.12; pitch = 0.96; }
  if (preset === 'creature') { rate = 0.98; pitch = 1.18; }
  if (preset === 'fast') { rate = 1.38; pitch = 1.04; }
  if (preset === 'command') { rate = 1.0; pitch = 0.92; }
  if (preset === 'cinematic') { rate = 1.12; pitch = 1.0; }
  rate += (variant - 1.5) * 0.03;
  pitch += (((hash >> 2) & 3) - 1.5) * 0.03;
  if (ovr >= 90) rate = Math.max(0.85, rate - 0.04);
  if (trust < 0.45) rate = Math.min(1.45, rate + 0.07);

  return {
    preset,
    rate: clamp(rate, 0.82, 1.55, 1.1),
    pitch: clamp(pitch, 0.72, 1.35, 1.0)
  };
}

async function resolveWikiquoteSpeechForMeta(meta = {}) {
  const queries = buildQuoteQueryVariants(meta);
  if (!queries.length) return null;

  let bestTitle = null;
  let bestTitleScore = 0;
  for (let i = 0; i < Math.min(6, queries.length); i += 1) {
    const query = queries[i];
    const rows = await wikiOpenSearch('en.wikiquote.org', query, 6).catch(() => []);
    rows.forEach((row) => {
      const score = titleMatchScore(meta, row.title);
      const adjustedScore = isDangerousQuotePageMatch(meta, row.title) ? (score - 26) : score;
      if (adjustedScore > bestTitleScore) {
        bestTitleScore = adjustedScore;
        bestTitle = row;
      }
    });
    if (bestTitleScore >= 180) break;
  }
  if (!bestTitle || bestTitleScore < 30) return null;
  if (isDangerousQuotePageMatch(meta, bestTitle.title)) return null;

  const wikitext = await wikiParseWikitext('en.wikiquote.org', bestTitle.title).catch(() => '');
  if (!wikitext) return null;
  const quoteLines = parseWikiquoteWikitextQuotes(wikitext);
  const bestLine = pickBestQuoteLine(quoteLines, meta);
  if (!bestLine || !bestLine.text) return null;

  const style = inferSpeechStyle(meta, bestLine.text);
  return {
    mode: 'speech-quote',
    speech: {
      text: bestLine.text,
      displayText: bestLine.text,
      source: 'wikiquote',
      sourceTitle: bestTitle.title,
      sourceUrl: bestTitle.url || `https://en.wikiquote.org/wiki/${encodeURIComponent(bestTitle.title.replace(/ /g, '_'))}`,
      confidence: clamp((bestTitleScore / 240), 0, 1, 0.5),
      quoteScore: bestLine.score || 0,
      voiceStyle: style.preset,
      rate: style.rate,
      pitch: style.pitch,
      gain: 1
    }
  };
}

async function resolveWikipediaFactSpeechForMeta(meta = {}) {
  const queries = Array.from(new Set([
    meta.resolvedTitle,
    meta.character,
    ...(Array.isArray(meta.aliases) ? meta.aliases : [])
  ].map((value) => String(value || '').trim()).filter(Boolean)));
  if (!queries.length) return null;

  for (let i = 0; i < queries.length; i += 1) {
    const query = queries[i];
    const extract = await wikiIntroExtract('en.wikipedia.org', query).catch(() => '');
    const line = buildFactSpeechLine(extract, meta);
    if (!line) continue;
    const style = inferSpeechStyle(meta, line);
    return {
      mode: 'speech-fact',
      speech: {
        text: line,
        displayText: line,
        source: 'wikipedia',
        sourceTitle: query,
        sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(query.replace(/ /g, '_'))}`,
        confidence: 0.45,
        voiceStyle: style.preset,
        rate: clamp(style.rate + 0.05, 0.85, 1.65, 1.15),
        pitch: style.pitch,
        gain: 1
      }
    };
  }

  let bestTitle = null;
  let bestTitleScore = 0;
  for (let i = 0; i < Math.min(4, queries.length); i += 1) {
    const rows = await wikiOpenSearch('en.wikipedia.org', queries[i], 6).catch(() => []);
    rows.forEach((row) => {
      const score = titleMatchScore(meta, row.title);
      if (score > bestTitleScore) {
        bestTitleScore = score;
        bestTitle = row;
      }
    });
    if (bestTitleScore >= 180) break;
  }

  if (!bestTitle || bestTitleScore < 26) return null;
  if (isDangerousQuotePageMatch(meta, bestTitle.title) && bestTitleScore < 110) return null;

  const searchExtract = await wikiIntroExtract('en.wikipedia.org', bestTitle.title).catch(() => '');
  const searchLine = buildFactSpeechLine(searchExtract, {
    ...meta,
    resolvedTitle: meta.resolvedTitle || bestTitle.title
  });
  if (!searchLine) return null;

  const style = inferSpeechStyle(meta, searchLine);
  return {
    mode: 'speech-fact',
    speech: {
      text: searchLine,
      displayText: searchLine,
      source: 'wikipedia-search',
      sourceTitle: bestTitle.title,
      sourceUrl: bestTitle.url || `https://en.wikipedia.org/wiki/${encodeURIComponent(bestTitle.title.replace(/ /g, '_'))}`,
      confidence: clamp((bestTitleScore / 220), 0.35, 0.72, 0.45),
      voiceStyle: style.preset,
      rate: clamp(style.rate + 0.05, 0.85, 1.65, 1.15),
      pitch: style.pitch,
      gain: 1
    }
  };

  return null;
}

async function resolveSpeechFallbackForMeta(meta = {}) {
  const safeMeta = normalizeMeta(meta);
  const entityKey = `entity:${buildMetaSignature(safeMeta)}`;
  const cached = getCached(quoteEntityCache, entityKey);
  if (cached) return cached;

  const startedAt = Date.now();
  let resolved = await resolveWikiquoteSpeechForMeta(safeMeta).catch(() => null);
  if (!resolved) {
    resolved = resolveLocalInfoSpeechForMeta(safeMeta);
  }
  if (!resolved) {
    resolved = resolveAliasIndexSpeechForMeta(safeMeta);
  }
  if (!resolved) {
    resolved = await resolveWikipediaFactSpeechForMeta(safeMeta).catch(() => null);
  }
  if (!resolved) {
    resolved = { mode: 'speech-miss', speech: null };
  }
  const payload = {
    ...resolved,
    fetchMs: Math.max(0, Date.now() - startedAt)
  };
  return setCached(quoteEntityCache, entityKey, payload, QUOTE_ENTITY_CACHE_TTL_MS);
}

async function resolveAudioBlurbBatch(clipsDir, entries = []) {
  const startedAt = Date.now();
  pruneCache(quoteEntityCache);
  pruneCache(quoteSearchCache);
  pruneCache(quotePageCache);
  pruneCache(blurbBatchCache);

  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .slice(0, MAX_BATCH_ENTRIES)
    .map((entry) => normalizeMeta(entry));

  const clipBatch = resolveAudioClipBatch(clipsDir, normalizedEntries);
  const batchKey = `${clipBatch && clipBatch.library && clipBatch.library.librarySignature ? clipBatch.library.librarySignature : 'nosig'}|${normalizedEntries.map((meta) => buildMetaSignature(meta)).join('~')}`;
  const cachedBatch = getCached(blurbBatchCache, batchKey);
  if (cachedBatch) {
    return {
      ...cachedBatch,
      cacheHit: true
    };
  }

  const baseRows = Array.isArray(clipBatch && clipBatch.results) ? clipBatch.results : [];
  const finalRows = new Array(normalizedEntries.length).fill(null);

  const speechTasks = [];
  baseRows.forEach((row, index) => {
    const meta = normalizedEntries[index];
    if (!meta) return;
    if (row && row.snippet) {
      finalRows[index] = {
        index,
        signature: row.signature || buildMetaSignature(meta),
        character: meta.character || '',
        resolvedTitle: meta.resolvedTitle || '',
        mode: 'audio-clip',
        snippet: row.snippet,
        speech: null,
        matchScore: Number(row.matchScore) || 0,
        matchSource: String(row.matchSource || 'clip')
      };
      return;
    }
    if (row && row.mode === 'library-empty') {
      speechTasks.push({ index, meta, baseRow: row });
      return;
    }
    if (row && row.mode === 'miss') {
      speechTasks.push({ index, meta, baseRow: row });
      return;
    }
    speechTasks.push({ index, meta, baseRow: row || null });
  });

  await Promise.all(speechTasks.map(async (task) => {
    const speechResolved = await resolveSpeechFallbackForMeta(task.meta).catch(() => ({ mode: 'speech-miss', speech: null, fetchMs: 0 }));
    finalRows[task.index] = {
      index: task.index,
      signature: (task.baseRow && task.baseRow.signature) || buildMetaSignature(task.meta),
      character: task.meta.character || '',
      resolvedTitle: task.meta.resolvedTitle || '',
      mode: speechResolved && speechResolved.speech ? String(speechResolved.mode || 'speech-quote') : 'miss',
      snippet: null,
      speech: speechResolved && speechResolved.speech ? speechResolved.speech : null,
      matchScore: Number(task.baseRow && task.baseRow.matchScore) || 0,
      matchSource: String(task.baseRow && task.baseRow.matchSource || 'none'),
      quoteFetchMs: Number(speechResolved && speechResolved.fetchMs) || 0,
      clipLibraryEmpty: task.baseRow && task.baseRow.mode === 'library-empty'
    };
  }));

  for (let i = 0; i < finalRows.length; i += 1) {
    if (finalRows[i]) continue;
    const meta = normalizedEntries[i];
    finalRows[i] = {
      index: i,
      signature: buildMetaSignature(meta),
      character: meta && meta.character ? meta.character : '',
      resolvedTitle: meta && meta.resolvedTitle ? meta.resolvedTitle : '',
      mode: 'miss',
      snippet: null,
      speech: null,
      matchScore: 0,
      matchSource: 'none'
    };
  }

  const stats = {
    requested: normalizedEntries.length,
    audioClip: finalRows.filter((row) => row.mode === 'audio-clip').length,
    speechQuote: finalRows.filter((row) => row.mode === 'speech-quote').length,
    speechFact: finalRows.filter((row) => row.mode === 'speech-fact').length,
    libraryEmpty: finalRows.filter((row) => row.clipLibraryEmpty === true).length,
    misses: finalRows.filter((row) => row.mode === 'miss').length,
    quoteFetchMsAvg: (() => {
      const nums = finalRows.map((row) => Number(row.quoteFetchMs) || 0).filter((n) => n > 0);
      if (!nums.length) return 0;
      return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
    })(),
    elapsedMs: Math.max(0, Date.now() - startedAt)
  };

  const payload = {
    version: 1,
    generatedAt: nowIso(),
    cacheHit: false,
    library: clipBatch && clipBatch.library ? clipBatch.library : null,
    results: finalRows,
    stats
  };

  setCached(blurbBatchCache, batchKey, payload, BLURB_BATCH_CACHE_TTL_MS);
  return payload;
}

module.exports = {
  resolveAudioBlurbBatch
};
