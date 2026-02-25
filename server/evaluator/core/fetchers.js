const https = require('https');
const { WIKI_SEARCH_HINTS, CHARACTER_NAME_ALIASES, FRANCHISE_DATABASE, RARITY_KEYWORDS, POWER_LEVELS, MIN_INFO_CONFIDENCE } = require('./constants');
const { normalizeName, canonicalizeName, getCharacterNameVariants, parseCharacterQuery, resolveLikelyTypo } = require('./textUtils');
const { normalizeInfoCandidate, extractProfessionFromWikipedia, pickBestInfoCandidate, scoreInfoCandidate } = require('./candidateScoring');

const FETCH_CACHE = new Map();
const INFLIGHT_FETCHES = new Map();
const CACHE_TTL = 60 * 60 * 1000;
const JSON_URL_CACHE = new Map();
const JSON_INFLIGHT = new Map();
const JSON_CACHE_TTL = 2 * 60 * 1000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function getCachedJson(url, ttlMs = JSON_CACHE_TTL) {
  const key = String(url || '');
  if (!key) return null;
  const cached = JSON_URL_CACHE.get(key);
  if (!cached) return null;
  const maxAge = Math.max(250, Number(ttlMs) || JSON_CACHE_TTL);
  if (Date.now() - cached.timestamp > maxAge) {
    JSON_URL_CACHE.delete(key);
    return null;
  }
  return cached.payload;
}

function setCachedJson(url, payload) {
  const key = String(url || '');
  if (!key || !payload) return;
  JSON_URL_CACHE.set(key, {
    payload,
    timestamp: Date.now()
  });
}

function isTransientStatus(statusCode) {
  if (!Number.isFinite(Number(statusCode))) return true;
  const status = Number(statusCode);
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function getJson(url, timeoutMs = 8000, retries = 2, options = {}) {
  const forceRefresh = Boolean(options && options.forceRefresh);
  const cacheTtlMs = Number(options && options.cacheTtlMs) || JSON_CACHE_TTL;
  const inflightKey = String(url || '');

  if (!forceRefresh) {
    const cached = getCachedJson(inflightKey, cacheTtlMs);
    if (cached) return cached;
    if (JSON_INFLIGHT.has(inflightKey)) return JSON_INFLIGHT.get(inflightKey);
  }

  const task = (async () => {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const result = await new Promise((resolve) => {
        const request = https.get(
          url,
          {
            headers: {
              'User-Agent': 'LobbyWARS/1.3',
              Accept: 'application/json'
            }
          },
          (response) => {
            let data = '';
            response.on('data', chunk => { data += chunk; });
            response.on('end', () => {
              const statusCode = Number(response && response.statusCode) || 0;
              if (statusCode >= 400) {
                resolve({ json: null, transient: isTransientStatus(statusCode) });
                return;
              }
              try {
                resolve({ json: JSON.parse(data), transient: false });
              } catch (error) {
                resolve({ json: null, transient: true });
              }
            });
          }
        );

        request.on('error', () => resolve({ json: null, transient: true }));
        request.setTimeout(timeoutMs, () => {
          request.destroy();
          resolve({ json: null, transient: true });
        });
      });

      if (result && result.json) {
        setCachedJson(inflightKey, result.json);
        return result.json;
      }

      if (!result || !result.transient || attempt >= retries) {
        break;
      }

      const backoffMs = Math.min(1200, 140 * (2 ** attempt)) + Math.floor(Math.random() * 90);
      await delay(backoffMs);
    }

    return null;
  })();

  if (!forceRefresh) {
    JSON_INFLIGHT.set(inflightKey, task);
  }

  try {
    return await task;
  } finally {
    if (!forceRefresh) {
      JSON_INFLIGHT.delete(inflightKey);
    }
  }
}

function getCachedCharacter(name) {
  const key = normalizeName(name).toLowerCase();
  const cached = FETCH_CACHE.get(key);
  if (!cached) return null;
  const ttl = typeof cached.ttl === 'number' ? cached.ttl : CACHE_TTL;
  if (Date.now() - cached.timestamp > ttl) {
    FETCH_CACHE.delete(key);
    return null;
  }
  return cached.data;
}

function setCachedCharacter(name, data, ttl = CACHE_TTL) {
  const key = normalizeName(name).toLowerCase();
  FETCH_CACHE.set(key, { data, timestamp: Date.now(), ttl });
}

function dedupeByKey(items, keySelector) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    if (!item) continue;
    const key = keySelector(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function normalizeImageUrl(url) {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;
  if (raw.startsWith('//')) return `https:${raw}`;
  return raw;
}

function upscaleWikipediaThumbnail(url, targetSize = 420) {
  const normalized = normalizeImageUrl(url);
  if (!normalized) return null;
  return normalized.replace(/\/(\d+)px-/i, `/${targetSize}px-`);
}

function classifyImageEntityPriority(candidate) {
  const title = String(candidate && candidate.title ? candidate.title : '').toLowerCase();
  const description = String(candidate && candidate.description ? candidate.description : '').toLowerCase();
  const categories = Array.isArray(candidate && candidate.categories)
    ? candidate.categories.map((item) => String(item || '').toLowerCase()).join(' ')
    : '';
  const corpus = `${title} ${description} ${categories}`;

  if (/fictional|fictional character|character in|protagonist|antagonist|superhero|villain|anime|manga|comic|cartoon|video game character/.test(corpus)) {
    return 'fictional';
  }

  if (/\b(?:film|movie|album|song|tv series|television series|video game|novel)\b/.test(corpus)) {
    return 'media';
  }

  if (/\b(?:is|was) an?\s+(?:american|british|japanese|korean|french|indian|canadian|australian)?\s*(?:actor|actress|athlete|footballer|musician|singer|rapper|composer|author|writer|scientist|historian|politician|philosopher|streamer|creator|youtuber)\b|biography|born|historical figure|public figure/.test(corpus)) {
    return 'real';
  }

  return 'other';
}

function buildImageTitlePriority(candidate) {
  const title = normalizeName(
    candidate && (
      candidate.title
      || candidate.enwikiTitle
      || candidate.wikidataLabel
      || ''
    )
  );
  if (!title) return [];

  const priority = classifyImageEntityPriority(candidate);
  const characterFirstTitles = [
    `${title} (character)`,
    `${title} (fictional character)`,
    `${title} (franchise character)`,
    `${title} (mythology)`
  ];

  const mediaTitles = [
    `${title} (film)`,
    `${title} (TV series)`,
    `${title} (video game)`
  ];

  const ordered = priority === 'fictional'
    ? [...characterFirstTitles, title, ...mediaTitles]
    : [title, ...characterFirstTitles, ...mediaTitles];

  return dedupeByKey(
    ordered.map((entry) => normalizeName(entry)).filter(Boolean),
    (entry) => entry.toLowerCase()
  ).slice(0, 6);
}

function createKnownCharacterRecords() {
  const records = new Map();

  const addRecord = (name, source, context = []) => {
    const normalized = normalizeName(name);
    const compact = canonicalizeName(normalized);
    if (!normalized || !compact) return;

    const existing = records.get(compact);
    const base = existing || {
      canonical: normalized,
      aliases: new Set(),
      sources: new Set(),
      context: new Set()
    };

    base.aliases.add(normalized);
    if (source) base.sources.add(source);
    (Array.isArray(context) ? context : []).forEach((hint) => {
      const cleanHint = normalizeName(hint);
      if (cleanHint) base.context.add(cleanHint);
    });

    records.set(compact, base);
  };

  Object.entries(CHARACTER_NAME_ALIASES).forEach(([canonical, aliases]) => {
    const canonicalName = normalizeName(canonical);
    addRecord(canonicalName, 'alias-index');
    (Array.isArray(aliases) ? aliases : []).forEach((alias) => {
      addRecord(alias, 'alias-index', [canonicalName]);
      const aliasCompact = canonicalizeName(alias);
      const canonicalCompact = canonicalizeName(canonicalName);
      const aliasRecord = records.get(aliasCompact);
      if (aliasRecord && canonicalCompact) aliasRecord.context.add(canonicalName);
    });
  });

  Object.entries(FRANCHISE_DATABASE).forEach(([franchise, data]) => {
    const members = Array.isArray(data) ? data : data.members;
    (Array.isArray(members) ? members : []).forEach((member) => addRecord(member, 'franchise-db', [franchise, `${franchise} character`]));
  });

  Object.entries(RARITY_KEYWORDS).forEach(([tier, names]) => {
    (Array.isArray(names) ? names : []).forEach((name) => addRecord(name, 'rarity-index', [tier]));
  });

  Object.entries(POWER_LEVELS).forEach(([tier, names]) => {
    (Array.isArray(names) ? names : []).forEach((name) => addRecord(name, 'power-index', [tier]));
  });

  return records;
}

const KNOWN_CHARACTER_RECORDS = createKnownCharacterRecords();

const REFERENCE_PATTERNS = [
  { regex: /^bats$/i, canonical: 'Batman', hints: ['dc', 'gotham'] },
  { regex: /^supes$/i, canonical: 'Superman', hints: ['dc', 'krypton'] },
  { regex: /^spidey$/i, canonical: 'Spider-Man', hints: ['marvel', 'web'] },
  { regex: /^tchalla$/i, canonical: 'TChalla', hints: ['marvel', 'wakanda'] },
  { regex: /dark knight/i, canonical: 'Batman', hints: ['dc', 'gotham'] },
  { regex: /wizard kid.*scar|boy who lived/i, canonical: 'Harry Potter', hints: ['hogwarts', 'harry potter'] },
  { regex: /pirate king.*straw hat|straw hat guy/i, canonical: 'Monkey D. Luffy', hints: ['one piece', 'pirate'] },
  { regex: /guy from spy x family/i, canonical: 'Loid Forger', hints: ['spy x family', 'twilight'] },
  { regex: /witcher.*monster hunter/i, canonical: 'Geralt of Rivia', hints: ['the witcher'] },
  { regex: /green ogre.*swamp/i, canonical: 'Shrek', hints: ['dreamworks'] },
  { regex: /blue alien cat.*pandora/i, canonical: 'Neytiri', hints: ['avatar film', 'pandora'] }
];

function tokensFromText(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token && token.length > 2);
}

function dedupeStrings(values, limit = 12) {
  return dedupeByKey(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeName(value))
      .filter(Boolean),
    (value) => value.toLowerCase()
  ).slice(0, limit);
}

function deriveContextProfile(options = {}) {
  const scenario = normalizeName(options.scenario || '');
  const twist = normalizeName(options.twist || '');
  const originalScenario = normalizeName(options.originalScenario || '');
  const originalTwist = normalizeName(options.originalTwist || '');
  const corpus = `${scenario} ${twist} ${originalScenario} ${originalTwist}`.toLowerCase();

  const contextHints = [];
  const entityHints = ['character', 'person'];

  const pushHints = (hints) => {
    (Array.isArray(hints) ? hints : []).forEach((hint) => contextHints.push(hint));
  };

  if (/mystery|detective|investigat|heist|secret|identity|clue|spy|conspiracy/.test(corpus)) {
    pushHints(['mystery', 'detective', 'fictional character']);
    entityHints.push('fictional character', 'nickname');
  }

  if (/rescue|surviv|evacuat|disaster|crisis|medical|triage/.test(corpus)) {
    pushHints(['rescue', 'survival', 'emergency']);
    entityHints.push('person', 'historical figure');
  }

  if (/space|galaxy|orbit|lunar|cosmic|astronaut/.test(corpus)) {
    pushHints(['space', 'cosmic']);
    entityHints.push('person', 'character');
  }

  if (/myth|legend|deity|folklore|arcane|wizard|magic/.test(corpus)) {
    pushHints(['mythology', 'legend']);
    entityHints.push('legend', 'character');
  }

  if (/sports|championship|league|tournament|match|coach/.test(corpus)) {
    pushHints(['athlete', 'sports']);
    entityHints.push('person', 'athlete');
  }

  if (/build|repair|engineer|robot|system|grid|infrastructure/.test(corpus)) {
    pushHints(['engineer', 'technology']);
    entityHints.push('person', 'object');
  }

  if (/fire|flame|inferno|lava|volcanic/.test(corpus)) {
    pushHints(['fire powers', 'elemental powers']);
    entityHints.push('character', 'person');
  }

  if (/lightning|thunder|electric|voltage|storm/.test(corpus)) {
    pushHints(['lightning powers', 'electric powers']);
    entityHints.push('character', 'person');
  }

  if (/wind|air|hurricane|tornado|gust/.test(corpus)) {
    pushHints(['wind powers', 'air powers']);
    entityHints.push('character', 'person');
  }

  if (/earth|rock|stone|seismic|quake|terrain/.test(corpus)) {
    pushHints(['earth powers', 'geokinesis']);
    entityHints.push('character', 'person');
  }

  if (/elemental|elements|alchemy|nature force/.test(corpus)) {
    pushHints(['elemental powers', 'magic']);
    entityHints.push('character', 'legend');
  }

  if (/iconic clothes|signature outfit|fashion|style|costume/.test(corpus)) {
    pushHints(['signature outfit', 'iconic costume', 'fashion icon']);
    entityHints.push('person', 'character');
  }

  return {
    contextHints: dedupeStrings(contextHints, 10),
    entityHints: dedupeStrings(entityHints, 10)
  };
}

function pickPreferredAliasCanonicalName(rawCanonical, aliases = []) {
  const canonicalName = normalizeName(rawCanonical);
  const aliasList = (Array.isArray(aliases) ? aliases : [])
    .map((alias) => normalizeName(alias))
    .filter(Boolean);
  if (!canonicalName || !aliasList.length) return canonicalName;

  const canonicalCompact = canonicalizeName(canonicalName);
  const typoFixed = resolveLikelyTypo(canonicalName);
  const typoCompact = canonicalizeName(typoFixed || '');

  const formattingUpgrade = aliasList.find((alias) => (
    canonicalizeName(alias) === canonicalCompact
    && alias.toLowerCase() !== canonicalName.toLowerCase()
    && (/\s|-|'|\./.test(alias) || alias !== alias.toLowerCase())
  ));
  if (formattingUpgrade) return formattingUpgrade;

  const typoUpgrade = aliasList.find((alias) => (
    typoCompact
    && canonicalizeName(alias) === typoCompact
    && typoCompact !== canonicalCompact
  ));
  if (typoUpgrade) return typoUpgrade;

  const compactDistance = (a, b) => {
    const s = canonicalizeName(a);
    const t = canonicalizeName(b);
    if (!s || !t) return 99;
    const dp = Array.from({ length: s.length + 1 }, () => Array(t.length + 1).fill(0));
    for (let i = 0; i <= s.length; i += 1) dp[i][0] = i;
    for (let j = 0; j <= t.length; j += 1) dp[0][j] = j;
    for (let i = 1; i <= s.length; i += 1) {
      for (let j = 1; j <= t.length; j += 1) {
        const cost = s[i - 1] === t[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[s.length][t.length];
  };
  const typoLikeAlias = aliasList.find((alias) => {
    const aliasCompact = canonicalizeName(alias);
    if (!aliasCompact || aliasCompact === canonicalCompact) return false;
    if (Math.abs(aliasCompact.length - canonicalCompact.length) > 2) return false;
    if ((canonicalCompact.length >= 7 || aliasCompact.length >= 7) && compactDistance(canonicalName, alias) <= 2) {
      return true;
    }
    return false;
  });
  if (typoLikeAlias) return typoLikeAlias;

  const shorthandExpansion = aliasList.find((alias) => {
    const aliasCompact = canonicalizeName(alias);
    if (!aliasCompact || aliasCompact === canonicalCompact) return false;
    return canonicalName.split(/\s+/).filter(Boolean).length === 1
      && (aliasCompact.startsWith(canonicalCompact) || canonicalCompact.startsWith(aliasCompact))
      && aliasCompact.length >= canonicalCompact.length + 2;
  });
  if (shorthandExpansion) return shorthandExpansion;

  return canonicalName;
}

function resolveCanonicalAlias(name) {
  const normalized = normalizeName(name);
  const compact = canonicalizeName(normalized);
  if (!normalized || !compact) return null;

  for (const [canonical, aliases] of Object.entries(CHARACTER_NAME_ALIASES)) {
    const canonicalName = pickPreferredAliasCanonicalName(canonical, aliases);
    const aliasList = dedupeStrings([canonical, ...(Array.isArray(aliases) ? aliases : []), canonicalName], 20);
    const compactAliases = aliasList.map(alias => canonicalizeName(alias));
    if (!compactAliases.includes(compact)) continue;

    const exactAlias = aliasList.find(alias => canonicalizeName(alias) === compact) || normalized;
    return {
      canonical: canonicalName,
      matchedAlias: exactAlias,
      source: 'alias-index',
      confidence: exactAlias.toLowerCase() === canonicalName.toLowerCase() ? 0.84 : 0.76
    };
  }

  const record = KNOWN_CHARACTER_RECORDS.get(compact);
  if (!record) return null;

  return {
    canonical: normalizeName(record.canonical),
    matchedAlias: normalized,
    source: Array.from(record.sources)[0] || 'known-index',
    confidence: 0.68,
    contextHints: Array.from(record.context)
  };
}

function resolveProxyReference(name) {
  const normalized = normalizeName(name);
  if (!normalized) return null;

  const patterned = REFERENCE_PATTERNS.find(entry => entry.regex.test(normalized));
  if (patterned) {
    return {
      canonical: patterned.canonical,
      matchedAlias: normalized,
      source: 'proxy-pattern',
      confidence: 0.72,
      contextHints: patterned.hints || []
    };
  }

  const queryTokens = tokensFromText(normalized);
  if (!queryTokens.length) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const record of KNOWN_CHARACTER_RECORDS.values()) {
    const aliases = Array.from(record.aliases);
    const aliasTokens = aliases.flatMap(alias => tokensFromText(alias));
    if (!aliasTokens.length) continue;

    const overlap = queryTokens.filter(token => aliasTokens.includes(token)).length;
    const score = overlap / Math.max(queryTokens.length, 1);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = record;
    }
  }

  if (!bestMatch || bestScore < 0.67) return null;

  return {
    canonical: normalizeName(bestMatch.canonical),
    matchedAlias: normalized,
    source: 'proxy-token-overlap',
    confidence: Math.min(0.74, 0.52 + (bestScore * 0.25)),
    contextHints: Array.from(bestMatch.context)
  };
}

function resolveCharacterSeed(character, profile) {
  const parsed = profile || parseCharacterQuery(character);
  const aliasMatch = resolveCanonicalAlias(parsed.baseName || character);
  const proxyMatch = aliasMatch ? null : resolveProxyReference(parsed.original || character);
  const resolved = aliasMatch || proxyMatch;

  const baseName = resolved ? normalizeName(resolved.canonical) : normalizeName(parsed.baseName || character);
  const variants = dedupeByKey(
    [
      baseName,
      ...(resolved && resolved.matchedAlias ? [resolved.matchedAlias] : []),
      ...getCharacterNameVariants(character),
      ...getCharacterNameVariants(baseName)
    ].map(name => normalizeName(name)).filter(Boolean),
    name => canonicalizeName(name)
  ).slice(0, 10);

  const contextHints = dedupeByKey(
    [
      ...(parsed.contextHints || []),
      ...(parsed.entityHints || []),
      ...((resolved && resolved.contextHints) || [])
    ].map(hint => normalizeName(hint)).filter(Boolean),
    hint => hint.toLowerCase()
  ).slice(0, 10);

  return {
    baseName,
    variants,
    contextHints,
    resolution: resolved ? {
      source: resolved.source,
      matchedAlias: normalizeName(resolved.matchedAlias),
      canonical: baseName,
      confidence: resolved.confidence
    } : null
  };
}

function buildSearchQueries(baseName, contextHints = [], entityHints = []) {
  const name = normalizeName(baseName);
  if (!name) return [];

  const hintQueries = (Array.isArray(contextHints) ? contextHints : [])
    .map(hint => normalizeName(hint))
    .filter(Boolean)
    .slice(0, 4);

  const broadEntityHints = [
    'fictional character',
    'character',
    'person',
    'historical figure',
    'character',
    'animal',
    'species',
    'mythological creature',
    'surname',
    'family name'
  ];

  const entityHintMap = {
    person: ['person', 'biography', 'historical figure', 'public figure', 'nickname'],
    character: ['fictional character', 'character', 'protagonist'],
    'fictional character': ['fictional character', 'character', 'franchise character'],
    nickname: ['nickname', 'alias', 'epithet'],
    object: ['object', 'artifact', 'device', 'vehicle'],
    species: ['animal', 'species', 'genus'],
    legend: ['legend', 'mythology', 'deity', 'folklore'],
    name: ['surname', 'family name', 'given name']
  };

  const expandedEntityHints = dedupeByKey(
    (Array.isArray(entityHints) ? entityHints : [])
      .flatMap(hint => entityHintMap[String(hint || '').toLowerCase()] || []),
    hint => String(hint || '').toLowerCase()
  );

  const prioritizedEntityHints = dedupeByKey(
    [
      ...expandedEntityHints,
      ...(Array.isArray(entityHints) ? entityHints : [])
    ],
    hint => String(hint || '').toLowerCase()
  ).slice(0, 6);

  const queries = [
    name,
    `"${name}"`,
    ...prioritizedEntityHints.map(hint => `${name} ${hint}`),
    ...broadEntityHints.map(hint => `${name} ${hint}`),
    ...WIKI_SEARCH_HINTS.map(hint => `${name} ${hint}`),
    ...hintQueries.flatMap(hint => [`${name} ${hint}`, `${hint} ${name}`, `"${name}" ${hint}`]),
    ...(name.includes(' ') ? [`${name} wiki`, `${name} wikipedia`] : []),
    ...(name.split(/\s+/).length === 1 ? [`${name} (character)`, `${name} (surname)`, `${name} (mythology)`, `${name} (nickname)`] : [])
  ];

  return dedupeByKey(queries.map(q => normalizeName(q)).filter(Boolean), q => q.toLowerCase()).slice(0, 24);
}

function isStrongTitleLink(character, title) {
  const query = normalizeName(character).toLowerCase();
  const pageTitle = normalizeName(title).toLowerCase();
  if (!query || !pageTitle) return false;

  const queryTokens = query.split(/\s+/).filter(Boolean);
  const titleTokens = pageTitle.split(/[^a-z0-9]+/).filter(Boolean);

  if (queryTokens.length === 1) {
    return titleTokens.includes(queryTokens[0]);
  }

  const queryCompact = canonicalizeName(query);
  const titleCompact = canonicalizeName(pageTitle);
  return !!queryCompact && !!titleCompact && (titleCompact.includes(queryCompact) || queryCompact.includes(titleCompact));
}

function fallbackFromAliasIndex(character) {
  const variants = getCharacterNameVariants(character).map(name => canonicalizeName(name));

  for (const [canonical, aliases] of Object.entries(CHARACTER_NAME_ALIASES)) {
    const preferredCanonical = pickPreferredAliasCanonicalName(canonical, aliases);
    const all = dedupeStrings([preferredCanonical, canonical, ...(Array.isArray(aliases) ? aliases : [])], 20);
    const allCanonical = all.map(name => canonicalizeName(name));
    if (!allCanonical.some(alias => variants.includes(alias))) continue;

    const title = preferredCanonical || all.find(name => name.includes(' ')) || all[0] || character;
    const directMatch = all.find(name => canonicalizeName(name) === canonicalizeName(character));
    return {
      source: 'local-index',
      title,
      description: `Resolved via local alias index for ${character}.`,
      aliases: all,
      categories: ['character/person name match'],
      confidence: directMatch ? 0.7 : 0.58,
      confidenceBand: directMatch ? 'high' : 'medium',
      confidenceSignals: {
        sourceReliability: directMatch ? 0.2 : 0.16,
        nameMatch: directMatch ? 0.28 : 0.22,
        aliasMatch: directMatch ? 0.22 : 0.2,
        contextMatch: 0,
        quality: 0,
        penalties: 0
      }
    };
  }

  return null;
}

function fallbackFromTypo(character) {
  const profile = parseCharacterQuery(character);
  const corrected = resolveLikelyTypo(profile.baseName || character);
  if (!corrected) return null;

  const base = normalizeName(profile.baseName || character).toLowerCase();
  if (normalizeName(corrected).toLowerCase() === base) return null;

  return {
    source: 'local-index',
    title: corrected,
    description: `Resolved via typo-correction fallback for ${character}.`,
    aliases: [profile.baseName || character, corrected],
    categories: ['character/person name match'],
    confidence: 0.54,
    confidenceBand: 'medium',
    confidenceSignals: {
      sourceReliability: 0.14,
      nameMatch: 0.24,
      aliasMatch: 0.16,
      contextMatch: 0,
      quality: 0,
      penalties: 0
    }
  };
}

function fallbackFromKnowledgeIndex(character) {
  const normalized = normalizeName(character).toLowerCase();
  const compact = canonicalizeName(character);
  if (!normalized || !compact) return null;

  const findInList = (names) => (Array.isArray(names) ? names : []).find((name) => {
    const target = normalizeName(name).toLowerCase();
    const targetCompact = canonicalizeName(name);
    return normalized === target || compact === targetCompact || normalized.includes(target) || target.includes(normalized);
  });

  for (const [franchise, data] of Object.entries(FRANCHISE_DATABASE)) {
    const members = Array.isArray(data) ? data : data.members;
    const matched = findInList(members);
    if (!matched) continue;

    return {
      source: 'local-index',
      title: normalizeName(matched),
      description: `Resolved via built-in franchise index (${franchise}).`,
      aliases: [normalizeName(matched)],
      categories: ['fictional characters', `${franchise} franchise`],
      confidence: 0.56,
      confidenceBand: 'medium',
      confidenceSignals: {
        sourceReliability: 0.14,
        nameMatch: 0.22,
        aliasMatch: 0.14,
        contextMatch: 0,
        quality: 0.06,
        penalties: 0
      }
    };
  }

  for (const [tier, names] of Object.entries(RARITY_KEYWORDS)) {
    const matched = findInList(names);
    if (!matched) continue;

    return {
      source: 'local-index',
      title: normalizeName(matched),
      description: `Resolved via built-in rarity index (${tier}).`,
      aliases: [normalizeName(matched)],
      categories: ['known character'],
      confidence: 0.52,
      confidenceBand: 'medium',
      confidenceSignals: {
        sourceReliability: 0.14,
        nameMatch: 0.2,
        aliasMatch: 0.12,
        contextMatch: 0,
        quality: 0.06,
        penalties: 0
      }
    };
  }

  for (const [className, names] of Object.entries(POWER_LEVELS)) {
    const matched = findInList(names);
    if (!matched) continue;

    return {
      source: 'local-index',
      title: normalizeName(matched),
      description: `Resolved via built-in power index (${className}).`,
      aliases: [normalizeName(matched)],
      categories: ['known character'],
      confidence: 0.5,
      confidenceBand: 'medium',
      confidenceSignals: {
        sourceReliability: 0.12,
        nameMatch: 0.2,
        aliasMatch: 0.1,
        contextMatch: 0,
        quality: 0.08,
        penalties: 0
      }
    };
  }

  return null;
}

function fallbackFromNameOnly(character) {
  const title = normalizeName(character);
  if (!title) return null;

  return {
    source: 'name-only',
    title,
    description: `${title} (no verified external record; using lexical profile fallback).`,
    aliases: [title],
    categories: ['unverified character'],
    confidence: 0.34,
    confidenceBand: 'low',
    confidenceSignals: {
      sourceReliability: 0.06,
      nameMatch: 0.18,
      aliasMatch: 0.1,
      contextMatch: 0,
      quality: 0,
      penalties: 0
    }
  };
}

function pickBestCandidate(character, candidates) {
  const bestScored = pickBestInfoCandidate(character, candidates);
  if (bestScored) return bestScored;

  const preScored = (Array.isArray(candidates) ? candidates : [])
    .filter(candidate => candidate && typeof candidate.confidence === 'number')
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  if (!preScored.length) return null;

  if (preScored[0].confidence >= MIN_INFO_CONFIDENCE) return preScored[0];

  const rescue = preScored.find((candidate) => {
    const source = String(candidate.source || '');
    if (!/wikipedia|wikidata/.test(source)) return false;
    const description = String(candidate.description || '').toLowerCase();
    const titleLinked = isStrongTitleLink(character, candidate.title || '');
    const contentLooksEntity = description.length >= 100 && !/(may refer to|disambiguation|list of)/i.test(description);
    return titleLinked && contentLooksEntity;
  });

  if (!rescue) return null;

  return {
    ...rescue,
    confidence: Math.max(rescue.confidence || 0, 0.38),
    confidenceBand: rescue.confidenceBand === 'low' ? 'medium' : rescue.confidenceBand
  };
}

function pickLooseSearchCandidate(character, candidates) {
  const queryTokens = tokensFromText(character);
  const scored = (Array.isArray(candidates) ? candidates : [])
    .map(candidate => scoreInfoCandidate(character, candidate))
    .filter(entry => entry && entry.candidate)
    .sort((a, b) => b.score - a.score);

  const loose = scored.find((entry) => {
    const candidate = entry.candidate;
    const source = String(candidate.source || '');
    if (!/wikipedia|wikidata/.test(source)) return false;

    const description = String(candidate.description || '').toLowerCase();
    const categories = Array.isArray(candidate.categories) ? candidate.categories.join(' ').toLowerCase() : '';
    const titleLinked = isStrongTitleLink(character, candidate.title || '');
    const titleTokens = tokensFromText(candidate.title || '');
    const titleTokenOverlap = queryTokens.length
      ? queryTokens.filter((token) => titleTokens.includes(token)).length / Math.max(1, queryTokens.length)
      : 0;
    const entityLike = /(fictional|character|person|historical|animal|species|surname|family name|given name|mythology|deity|folklore|artifact|object|vehicle|nickname|epithet)/.test(`${description} ${categories}`);

    if (queryTokens.length >= 2 && titleTokenOverlap < 0.5) return false;
    return titleLinked && entityLike && !/(may refer to|disambiguation)/.test(description);
  });

  if (!loose) return null;

  return {
    ...loose.candidate,
    confidence: Math.max(loose.candidate.confidence || 0, 0.37),
    confidenceBand: (loose.candidate.confidence || 0) >= 0.7
      ? loose.candidate.confidenceBand
      : 'medium'
  };
}

async function fetchWikidataMetadata(entityId) {
  if (!entityId) return null;

  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(entityId)}&languages=en&props=labels|descriptions|aliases|sitelinks|claims&format=json&origin=*`;
  const json = await getJson(url);
  const entity = json && json.entities ? json.entities[entityId] : null;
  if (!entity) return null;

  const aliases = entity.aliases && entity.aliases.en
    ? entity.aliases.en.map(entry => entry && entry.value).filter(Boolean).slice(0, 20)
    : [];

  const p18Claim = entity.claims && Array.isArray(entity.claims.P18) ? entity.claims.P18[0] : null;
  const p18File = p18Claim
    && p18Claim.mainsnak
    && p18Claim.mainsnak.datavalue
    && typeof p18Claim.mainsnak.datavalue.value === 'string'
    ? p18Claim.mainsnak.datavalue.value
    : null;
  const wikidataImageUrl = p18File
    ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p18File)}`
    : null;

  return {
    wikidataId: entityId,
    wikidataLabel: entity.labels && entity.labels.en ? entity.labels.en.value : null,
    wikidataDescription: entity.descriptions && entity.descriptions.en ? entity.descriptions.en.value : null,
    enwikiTitle: entity.sitelinks && entity.sitelinks.enwiki ? entity.sitelinks.enwiki.title : null,
    aliases,
    wikidataImageFile: p18File,
    wikidataImageUrl
  };
}

function mapWikipediaPageToCandidate(page, wikidataMeta = null) {
  if (!page || !page.extract) return null;
  if (/disambiguation|may refer to/i.test(page.extract)) return null;
  if (/^list of\b/i.test(String(page.title || '')) && !/(surname|given name|family name)/i.test(String(page.title || ''))) return null;

  const categories = Array.isArray(page.categories)
    ? page.categories.map(c => (c && c.title ? c.title.replace(/^Category:/, '') : '')).filter(Boolean).slice(0, 20)
    : [];

  return {
    source: 'wikipedia',
    title: page.title,
    description: String(page.extract).substring(0, 3200),
    imageUrl: upscaleWikipediaThumbnail(
      (page.original && page.original.source)
      || (page.thumbnail && page.thumbnail.source)
      || (wikidataMeta && wikidataMeta.wikidataImageUrl)
      || null
    ),
    profession: extractProfessionFromWikipedia(page.extract),
    pageprops: page.pageprops || {},
    categories,
    aliases: wikidataMeta && Array.isArray(wikidataMeta.aliases) ? wikidataMeta.aliases : [],
    wikidataDescription: wikidataMeta ? wikidataMeta.wikidataDescription : null,
    wikidataId: wikidataMeta ? wikidataMeta.wikidataId : null,
    wikidataImageFile: wikidataMeta ? wikidataMeta.wikidataImageFile : null
  };
}

async function fetchWikipediaDisambiguationLinks(title, limit = 14) {
  const normalized = normalizeName(title);
  if (!normalized) return [];

  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(normalized)}&prop=links&plnamespace=0&pllimit=${Math.max(5, Math.min(50, limit * 3))}&format=json&origin=*`;
  const json = await getJson(url);
  const pages = json && json.query && json.query.pages ? Object.values(json.query.pages) : [];
  const page = pages[0];
  const links = page && Array.isArray(page.links) ? page.links : [];

  return dedupeByKey(
    links
      .map(link => normalizeName(link && link.title))
      .filter(Boolean)
      .filter(linkTitle => !/(disambiguation|list of|surname|given name|may refer to)/i.test(linkTitle)),
    linkTitle => linkTitle.toLowerCase()
  ).slice(0, limit);
}

async function fetchFromWikipediaEnhanced(title) {
  const normalized = normalizeName(title);
  if (!normalized) return null;

  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(normalized)}&prop=extracts|pageprops|categories|pageimages&cllimit=24&exintro=false&exchars=4200&explaintext=true&piprop=thumbnail|name|original&pithumbsize=420&format=json&origin=*`;
  const json = await getJson(url);
  const pages = json && json.query && json.query.pages ? Object.values(json.query.pages) : [];
  const page = pages[0];
  if (!page || !page.extract) return null;

  if (/disambiguation|may refer to/i.test(String(page.extract))) {
    return null;
  }

  const wikidataId = page.pageprops && page.pageprops.wikibase_item;
  const wikidataMeta = await fetchWikidataMetadata(wikidataId);
  return mapWikipediaPageToCandidate(page, wikidataMeta);
}

async function fetchFromWikipediaContextualTitle(baseName, contextHints = []) {
  const normalizedBase = normalizeName(baseName);
  if (!normalizedBase) return null;

  const normalizedHints = dedupeByKey(
    (Array.isArray(contextHints) ? contextHints : [])
      .map(hint => normalizeName(hint))
      .filter(Boolean),
    hint => hint.toLowerCase()
  ).slice(0, 4);

  if (!normalizedHints.length) return null;

  const titleAttempts = dedupeByKey(
    normalizedHints.flatMap((hint) => [
      `${normalizedBase} (${hint})`,
      `${normalizedBase} (${hint} character)`,
      `${normalizedBase} (${hint} franchise)`
    ]),
    title => normalizeName(title).toLowerCase()
  ).slice(0, 8);

  for (const title of titleAttempts) {
    const candidate = await fetchFromWikipediaEnhanced(title).catch(() => null);
    if (candidate) return candidate;
  }

  for (const hint of normalizedHints) {
    const rows = await searchWikipediaTitlesWithIntitle(`${normalizedBase} ${hint}`, 8).catch(() => []);
    if (!rows.length) continue;
    const candidates = await Promise.all(rows.map(row => fetchFromWikipediaEnhanced(row.title).catch(() => null)));
    const best = pickBestInfoCandidate(`${normalizedBase} ${hint}`, candidates);
    if (best) return { ...best, source: 'wikipedia-search' };
  }

  return null;
}

async function fetchFromWikipediaSummary(character) {
  const normalized = normalizeName(character);
  if (!normalized) return null;

  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(normalized.replace(/\s+/g, '_'))}`;
  const json = await getJson(url);
  if (!json || !json.extract || json.type === 'disambiguation') return null;

  return {
    source: 'wikipedia',
    title: json.title || normalized,
    description: String(json.extract).substring(0, 1400),
    imageUrl: upscaleWikipediaThumbnail((json.thumbnail && json.thumbnail.source) || (json.originalimage && json.originalimage.source) || null),
    categories: [],
    aliases: []
  };
}

async function enrichCandidateImage(candidate) {
  if (!candidate) return candidate;
  const normalizedCandidate = normalizeInfoCandidate(candidate);
  if (!normalizedCandidate) return candidate;

  const imageUrl = upscaleWikipediaThumbnail(normalizedCandidate.imageUrl);
  if (imageUrl) {
    return {
      ...normalizedCandidate,
      imageUrl
    };
  }

  const titlePriority = buildImageTitlePriority(normalizedCandidate);
  if (!titlePriority.length) return normalizedCandidate;

  for (const title of titlePriority) {
    const wikiCandidate = await fetchFromWikipediaEnhanced(title).catch(() => null);
    if (wikiCandidate && wikiCandidate.imageUrl) {
      return {
        ...normalizedCandidate,
        imageUrl: upscaleWikipediaThumbnail(wikiCandidate.imageUrl)
      };
    }
  }

  const entityPriority = classifyImageEntityPriority(normalizedCandidate);
  if (entityPriority === 'fictional') {
    const searchCandidate = await fetchFromWikipediaSearchEnhanced(
      titlePriority[0],
      ['fictional character', 'character'],
      ['fictional character', 'character']
    ).catch(() => null);
    if (searchCandidate && searchCandidate.imageUrl) {
      return {
        ...normalizedCandidate,
        imageUrl: upscaleWikipediaThumbnail(searchCandidate.imageUrl)
      };
    }
  }

  const summary = await fetchFromWikipediaSummary(titlePriority[0]).catch(() => null);
  if (summary && summary.imageUrl) {
    return {
      ...normalizedCandidate,
      imageUrl: upscaleWikipediaThumbnail(summary.imageUrl)
    };
  }

  return normalizedCandidate;
}

async function searchWikipediaTitles(queryText, limit = 8) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(queryText)}&srlimit=${limit}&format=json&origin=*`;
  const json = await getJson(url);
  const rows = json && json.query && Array.isArray(json.query.search) ? json.query.search : [];
  return rows
    .map((row) => {
      if (!row || !row.title) return null;
      return {
        title: row.title,
        pageId: row.pageid || null,
        snippet: row.snippet ? String(row.snippet).replace(/<[^>]+>/g, ' ') : ''
      };
    })
    .filter(Boolean);
}

async function searchWikipediaTitlesWithIntitle(queryText, limit = 8) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`intitle:${queryText}`)}&srlimit=${limit}&format=json&origin=*`;
  const json = await getJson(url);
  const rows = json && json.query && Array.isArray(json.query.search) ? json.query.search : [];
  return rows
    .map((row) => {
      if (!row || !row.title) return null;
      return {
        title: row.title,
        pageId: row.pageid || null,
        snippet: row.snippet ? String(row.snippet).replace(/<[^>]+>/g, ' ') : ''
      };
    })
    .filter(Boolean);
}

function preScoreWikipediaSearchRow(character, row, contextHints = [], entityHints = []) {
  if (!row || !row.title) return -999;
  const profile = parseCharacterQuery(character);
  const baseName = normalizeName(profile.baseName || character);
  const baseCompact = canonicalizeName(baseName);
  const typoFixed = resolveLikelyTypo(baseName);
  const aliasVariants = []
    .concat(CHARACTER_NAME_ALIASES[String(baseName || '').toLowerCase()] || [])
    .concat(CHARACTER_NAME_ALIASES[baseCompact] || []);
  const rowTitle = normalizeName(row.title);
  const rowTitleLower = rowTitle.toLowerCase();
  const rowCompact = canonicalizeName(rowTitle);
  const rowTitleTokens = tokensFromText(rowTitle);
  const rowSnippetTokens = tokensFromText(row && row.snippet ? row.snippet : '');
  const queryVariants = dedupeStrings([
    baseName,
    typoFixed,
    ...aliasVariants,
    ...getCharacterNameVariants(baseName).slice(0, 6)
  ], 14);

  let score = 0;
  let bestTitleOverlap = 0;
  let bestQueryTokenCount = 0;

  queryVariants.forEach((variant) => {
    const variantName = normalizeName(variant);
    const variantCompact = canonicalizeName(variantName);
    if (!variantCompact) return;
    const qTokens = tokensFromText(variantName);
    if (qTokens.length >= 2) bestQueryTokenCount = Math.max(bestQueryTokenCount, qTokens.length);

    if (variantCompact === rowCompact) score += 180;
    if (rowCompact.startsWith(`${variantCompact}`) || rowCompact.includes(variantCompact)) score += 42;

    if (qTokens.length) {
      const titleOverlap = qTokens.filter((token) => rowTitleTokens.includes(token)).length;
      const snippetOverlap = qTokens.filter((token) => rowSnippetTokens.includes(token)).length;
      bestTitleOverlap = Math.max(bestTitleOverlap, titleOverlap / Math.max(1, qTokens.length));
      score += titleOverlap * 18;
      score += snippetOverlap * 5;
      if (qTokens.length >= 2 && titleOverlap === 0 && snippetOverlap === 0) score -= 34;
      else if (qTokens.length >= 2 && titleOverlap === 0) score -= 18;
    }
  });

  const mergedEntityHints = dedupeStrings([...(contextHints || []), ...(entityHints || [])], 8)
    .map((hint) => String(hint || '').toLowerCase());
  const queryLooksMedia = /(movie|film|show|tv|series|album|song|episode|game)/.test(`${baseName} ${mergedEntityHints.join(' ')}`.toLowerCase());
  const rowLooksMedia = /\((?:\d{4}\s+film|film|movie|album|song|tv series|television series|video game)\)/.test(rowTitleLower)
    || /\b(film|movie|album|song|television series|tv series|video game)\b/.test(String(row.snippet || '').toLowerCase());
  if (rowLooksMedia && !queryLooksMedia) score -= 18;
  if (/\((?:character|comics|mythology|folklore|surname|given name|nickname)\)/.test(rowTitleLower)) score += 12;
  if (/\bcharacter\b/.test(String(row.snippet || '').toLowerCase())) score += 8;
  if (bestQueryTokenCount >= 2 && bestTitleOverlap < 0.5 && rowTitleTokens.length <= 2) score -= 10;
  if ((/[:/]/.test(rowTitle) || /\s[-–]\s/.test(rowTitle)) && bestTitleOverlap < 0.5) score -= 16;
  if (bestQueryTokenCount >= 2 && rowTitleTokens.length >= (bestQueryTokenCount + 4) && bestTitleOverlap < 0.5) score -= 14;
  if (bestQueryTokenCount >= 2 && bestTitleOverlap === 0 && /\b(character|film|series|episode|album|song|book|novel)\b/.test(rowTitleLower)) {
    score -= 20;
  }

  return score;
}

async function fetchFromWikipediaOpenSearch(character, contextHints = []) {
  const normalized = normalizeName(character);
  if (!normalized) return null;

  const query = [normalized, ...contextHints.slice(0, 2)].join(' ').trim();
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=8&namespace=0&format=json&origin=*`;
  const json = await getJson(url);

  if (!Array.isArray(json) || !Array.isArray(json[1])) return null;
  const titles = json[1].slice(0, 8).map(title => normalizeName(title)).filter(Boolean);
  if (!titles.length) return null;

  const candidates = await Promise.all(titles.map(title => fetchFromWikipediaEnhanced(title).catch(() => null)));
  return pickBestInfoCandidate(character, candidates);
}

async function fetchFromWikipediaPrefixSearch(character) {
  const normalized = normalizeName(character);
  if (!normalized) return null;

  const token = normalized.split(/\s+/).filter(Boolean)[0] || normalized;
  const attempts = [normalized];
  if (token.length >= 8) {
    attempts.push(token.slice(0, Math.max(6, token.length - 2)));
    attempts.push(token.slice(0, 6));
  }

  for (const attempt of dedupeByKey(attempts, value => value.toLowerCase())) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=prefixsearch&pssearch=${encodeURIComponent(attempt)}&pslimit=10&format=json&origin=*`;
    const json = await getJson(url);
    const rows = json && json.query && Array.isArray(json.query.prefixsearch) ? json.query.prefixsearch : [];
    const titles = rows.map(row => normalizeName(row && row.title)).filter(Boolean);
    if (!titles.length) continue;

    const candidates = await Promise.all(titles.slice(0, 8).map(title => fetchFromWikipediaEnhanced(title).catch(() => null)));
    const best = pickBestInfoCandidate(character, candidates);
    if (best) return best;
  }

  return null;
}

async function fetchFromWikipediaFuzzyToken(character) {
  const normalized = normalizeName(character);
  if (!normalized) return null;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length !== 1) return null;

  const token = tokens[0];
  if (token.length < 6) return null;

  const stems = dedupeByKey([
    token.slice(0, 6),
    token.slice(0, 5),
    token.slice(0, 4)
  ].filter(Boolean), value => value.toLowerCase());

  const candidates = [];

  for (const stem of stems) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=prefixsearch&pssearch=${encodeURIComponent(stem)}&pslimit=8&format=json&origin=*`;
    const json = await getJson(url);
    const rows = json && json.query && Array.isArray(json.query.prefixsearch) ? json.query.prefixsearch : [];
    const titles = rows.map(row => normalizeName(row && row.title)).filter(Boolean);
    if (!titles.length) continue;

    const resolved = await Promise.all(titles.map(title => fetchFromWikipediaEnhanced(title).catch(() => null)));
    candidates.push(...resolved.filter(Boolean));
  }

  if (!candidates.length) return null;
  const best = pickBestCandidate(character, candidates);
  if (best) return best;

  const fallback = candidates.find((candidate) => {
    const title = String(candidate.title || '').toLowerCase();
    const description = String(candidate.description || '').toLowerCase();
    return stems.some(stem => title.includes(stem.toLowerCase())) && /(fictional|character|animal|mythology|species|deity|artifact|object|surname|nickname|historical)/.test(description);
  });

  if (!fallback) return null;
  return {
    ...fallback,
    source: 'wikipedia-search',
    confidence: Math.max(fallback.confidence || 0, 0.37),
    confidenceBand: 'medium'
  };
}

async function fetchFromWikipediaSearchEnhanced(character, contextHints = [], entityHints = []) {
  const normalized = normalizeName(character);
  if (!normalized) return null;

  const profile = parseCharacterQuery(character);
  const mergedEntityHints = dedupeByKey(
    [
      ...(profile.entityHints || []),
      ...(Array.isArray(entityHints) ? entityHints : [])
    ],
    hint => String(hint || '').toLowerCase()
  );
  const uniqueQueries = buildSearchQueries(normalized, contextHints, mergedEntityHints).slice(0, 10);

  const resultLists = await Promise.all(uniqueQueries.map(query => searchWikipediaTitles(query, 10).catch(() => [])));
  const intitleResults = await Promise.all(uniqueQueries.slice(0, 4).map(query => searchWikipediaTitlesWithIntitle(query, 6).catch(() => [])));
  const searchRows = dedupeByKey(
    [...resultLists.flat(), ...intitleResults.flat()].filter(Boolean),
    row => normalizeName(row.title).toLowerCase()
  );
  const rankedSearchRows = searchRows
    .map((row) => ({
      ...row,
      _preScore: preScoreWikipediaSearchRow(normalized, row, contextHints, mergedEntityHints)
    }))
    .sort((a, b) => (
      (Number(b._preScore) || 0) - (Number(a._preScore) || 0)
      || String(a.title || '').localeCompare(String(b.title || ''))
    ));
  const baseTokenCount = normalized.split(/\s+/).filter(Boolean).length;
  const topPreScore = Number(rankedSearchRows[0] && rankedSearchRows[0]._preScore) || 0;
  const dynamicCutoff = topPreScore - (baseTokenCount <= 1 ? 72 : 56);
  const selectedSearchRows = rankedSearchRows
    .filter((row, idx) => {
      if (idx < 4) return true;
      const pre = Number(row && row._preScore) || 0;
      return pre >= Math.max(-8, dynamicCutoff);
    })
    .slice(0, baseTokenCount <= 1 ? 12 : 10);

  const candidates = await Promise.all(selectedSearchRows.map(async (row) => {
    const candidate = await fetchFromWikipediaEnhanced(row.title).catch(() => null);
    if (!candidate) return null;
    return {
      ...candidate,
      source: 'wikipedia-search',
      searchSnippet: row.snippet || null
    };
  }));
  const best = pickBestInfoCandidate(character, candidates);
  if (best) return best;

  const looseBest = pickLooseSearchCandidate(character, candidates);
  if (looseBest) return looseBest;

  const topTitle = selectedSearchRows[0] && selectedSearchRows[0].title ? selectedSearchRows[0].title : normalized;
  const disambiguationTitles = await fetchWikipediaDisambiguationLinks(topTitle, 10);
  if (!disambiguationTitles.length) return null;

  const disambiguationCandidates = await Promise.all(disambiguationTitles.map(async (title) => {
    const candidate = await fetchFromWikipediaEnhanced(title).catch(() => null);
    if (!candidate) return null;
    return {
      ...candidate,
      source: 'wikipedia-search'
    };
  }));
  const strictDisambiguationBest = pickBestInfoCandidate(character, disambiguationCandidates);
  if (strictDisambiguationBest) return strictDisambiguationBest;

  return pickLooseSearchCandidate(character, disambiguationCandidates);
}

async function fetchWikipediaCandidateFromWikidataRow(row) {
  if (!row || !row.id) return null;

  const meta = await fetchWikidataMetadata(row.id);
  const enwikiTitle = meta && meta.enwikiTitle ? meta.enwikiTitle : null;
  if (!enwikiTitle) return null;

  const wikiCandidate = await fetchFromWikipediaEnhanced(enwikiTitle);
  if (!wikiCandidate) return null;

  return {
    ...wikiCandidate,
    source: 'wikidata+wiki',
    aliases: dedupeByKey([...(wikiCandidate.aliases || []), ...((meta && meta.aliases) || [])], alias => normalizeName(alias).toLowerCase()),
    wikidataDescription: (meta && meta.wikidataDescription) || row.description || null,
    wikidataId: row.id
  };
}

async function fetchFromWikidata(character, contextHints = [], entityHints = []) {
  const normalized = normalizeName(character);
  if (!normalized) return null;

  const queries = buildSearchQueries(normalized, contextHints, entityHints).slice(0, 10);
  const searchResults = await Promise.all(
    queries.map(async (query) => {
      const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&limit=8&type=item&origin=*`;
      const json = await getJson(url);
      return json && Array.isArray(json.search) ? json.search : [];
    })
  );

  const rankedRows = dedupeByKey(
    searchResults.flat().filter(Boolean),
    candidate => candidate.id
  ).slice(0, 12);

  if (!rankedRows.length) return null;

  const allCandidates = await Promise.all(rankedRows.map(async (row) => {
    const [meta, wikiCandidate] = await Promise.all([
      fetchWikidataMetadata(row.id),
      fetchWikipediaCandidateFromWikidataRow(row).catch(() => null)
    ]);

    const wikidataCandidate = {
      source: 'wikidata',
      title: row.label || normalized,
      description: row.description || (meta && meta.wikidataDescription) || 'Wikidata entity',
      profession: row.description || null,
      aliases: meta && Array.isArray(meta.aliases) ? meta.aliases : [],
      wikidataDescription: meta ? meta.wikidataDescription : row.description || null,
      wikidataId: row.id || null,
      categories: []
    };

    return [wikidataCandidate, wikiCandidate].filter(Boolean);
  }));

  const flattenedCandidates = allCandidates.flat();
  return pickBestInfoCandidate(character, flattenedCandidates);
}

async function fetchFromFandom(character, contextHints = []) {
  const normalized = normalizeName(character);
  if (!normalized) return null;

  const query = [normalized, ...contextHints.slice(0, 2)].join(' ').trim();
  const searchUrl = `https://community.fandom.com/api/v1/Search/List?query=${encodeURIComponent(query)}&limit=4&ns=0`;
  const searchJson = await getJson(searchUrl);
  const items = searchJson && Array.isArray(searchJson.items) ? searchJson.items : [];

  for (const item of items) {
    if (!item || !item.url) continue;
    try {
      const parsed = new URL(item.url);
      const wikiIndex = parsed.pathname.indexOf('/wiki/');
      if (wikiIndex < 0) continue;

      const articleTitle = decodeURIComponent(parsed.pathname.slice(wikiIndex + 6));
      const apiUrl = `https://${parsed.hostname}/api.php?action=query&titles=${encodeURIComponent(articleTitle)}&prop=extracts&explaintext=true&format=json&origin=*`;
      const pageJson = await getJson(apiUrl);
      const pages = pageJson && pageJson.query && pageJson.query.pages ? Object.values(pageJson.query.pages) : [];
      const page = pages[0];
      if (!page || !page.extract) continue;

      return {
        source: 'fandom',
        title: page.title || articleTitle,
        description: String(page.extract).substring(0, 1800),
        aliases: [],
        categories: ['fictional characters']
      };
    } catch (error) {
      continue;
    }
  }

  return null;
}

async function fetchFromOMDb(character) {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) return null;

  const query = encodeURIComponent(normalizeName(character));
  const url = `https://www.omdbapi.com/?apikey=${apiKey}&s=${query}`;
  const json = await getJson(url);

  if (!json || !Array.isArray(json.Search) || !json.Search.length) return null;
  const top = json.Search[0];

  return {
    source: 'omdb',
    title: top.Title,
    description: `${top.Type || 'title'}: ${top.Title} (${top.Year || 'n/a'})`,
    categories: [top.Type || 'title'],
    aliases: []
  };
}

async function fetchCharacterInfo(character, options = {}) {
  const forceRefresh = Boolean(options && options.forceRefresh);
  const mode = String(options.mode || 'default').toLowerCase();
  const fastRoundMode = mode === 'round' && options && options.fastRoundMode !== false;
  const skipImageEnrichment = Boolean(options && options.skipImageEnrichment);
  const cacheKey = normalizeName(character).toLowerCase();
  const inflightKey = `${cacheKey}:${mode}${forceRefresh ? ':refresh' : ''}`;

  if (!forceRefresh) {
    const cached = getCachedCharacter(character);
    if (cached) return cached;
    if (INFLIGHT_FETCHES.has(inflightKey)) return INFLIGHT_FETCHES.get(inflightKey);
  }

  const task = (async () => {
    const isRoundMode = mode === 'round';
    const stageOneTargetConfidence = isRoundMode ? (fastRoundMode ? 0.58 : 0.68) : 0.75;
    const preStageTwoTargetConfidence = isRoundMode ? (fastRoundMode ? 0.52 : 0.64) : 0.72;
    const profile = parseCharacterQuery(character);
    const seed = resolveCharacterSeed(character, profile);
    const variants = seed.variants;
    const derivedContext = deriveContextProfile(options);
    const contextHints = dedupeByKey(
      [
        ...seed.contextHints,
        ...(Array.isArray(options.contextHints) ? options.contextHints : []),
        ...derivedContext.contextHints
      ].map((hint) => normalizeName(hint)).filter(Boolean),
      (hint) => hint.toLowerCase()
    ).slice(0, 12);
    const entityHints = dedupeByKey(
      [
        ...derivedContext.entityHints,
        ...(Array.isArray(options.entityHints) ? options.entityHints : []),
        ...(Array.isArray(profile.entityHints) ? profile.entityHints : [])
      ],
      (hint) => String(hint || '').toLowerCase()
    ).slice(0, 10);

    const baseName = seed.baseName || profile.baseName || character;
    const stagedCandidates = [];

    if (seed.resolution && seed.resolution.canonical) {
      stagedCandidates.push(normalizeInfoCandidate({
        source: 'local-index',
        title: seed.resolution.canonical,
        description: `Resolved from alias/proxy mapping for ${character}.`,
        aliases: dedupeByKey([seed.resolution.matchedAlias, seed.resolution.canonical], alias => canonicalizeName(alias)),
        categories: ['character/person name match', 'alias/proxy resolution'],
        confidence: Math.max(0.7, Number(seed.resolution.confidence) || 0.7),
        confidenceBand: (Number(seed.resolution.confidence) || 0.7) >= 0.78 ? 'high' : 'medium',
        confidenceSignals: {
          sourceReliability: 0.2,
          nameMatch: 0.24,
          aliasMatch: 0.22,
          contextMatch: 0.08,
          quality: 0,
          penalties: 0
        }
      }));
    }

    const collectCandidates = (items) => {
      (Array.isArray(items) ? items : [items]).forEach((item) => {
        const normalizedCandidate = normalizeInfoCandidate(item);
        if (normalizedCandidate) stagedCandidates.push(normalizedCandidate);
      });
    };

    const toUniqueCandidates = () => dedupeByKey(
      stagedCandidates,
      (candidate) => {
        const source = String(candidate.source || 'unknown');
        const title = canonicalizeName(candidate.title || '');
        const desc = canonicalizeName(candidate.description || '').slice(0, 120);
        return `${source}|${title}|${desc}`;
      }
    );

    const maybePreferSeedCandidate = (candidateSet, picked) => {
      if (!seed.resolution || !picked) return picked;
      if (isStrongTitleLink(seed.resolution.canonical, picked.title || '')) return picked;

      const seedCandidate = (Array.isArray(candidateSet) ? candidateSet : []).find((candidate) => {
        if (!candidate || candidate.source !== 'local-index') return false;
        return canonicalizeName(candidate.title || '') === canonicalizeName(seed.resolution.canonical || '');
      });

      if (!seedCandidate) return picked;
      const pickedConfidence = Number(picked.confidence) || 0;
      if (pickedConfidence >= 0.94) return picked;
      return seedCandidate;
    };

    const runWithRetries = async (fn, attempts = 2) => {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const candidate = await fn().catch(() => null);
        if (candidate) return candidate;
      }
      return null;
    };

    const stageOneFetches = [
      () => fetchFromWikipediaEnhanced(baseName),
      () => fetchFromWikipediaContextualTitle(baseName, contextHints),
      () => fetchFromWikipediaSearchEnhanced(baseName, contextHints, entityHints),
      ...(!isRoundMode ? [() => fetchFromWikipediaOpenSearch(baseName, contextHints)] : []),
      () => fetchFromWikipediaPrefixSearch(baseName),
      ...(!isRoundMode ? [() => fetchFromWikipediaFuzzyToken(baseName)] : []),
      () => fetchFromWikipediaSummary(baseName),
      () => fetchFromWikidata(baseName, contextHints, entityHints)
    ];
    if (fastRoundMode) {
      stageOneFetches.length = Math.min(stageOneFetches.length, 5);
    }

    const seedVariantFetches = variants
      .filter(variant => canonicalizeName(variant) !== canonicalizeName(baseName))
      .slice(0, isRoundMode ? (fastRoundMode ? 1 : 2) : 3)
      .flatMap(variant => [
        () => fetchFromWikipediaEnhanced(variant),
        () => fetchFromWikipediaSearchEnhanced(variant, contextHints, entityHints)
      ]);

    stageOneFetches.push(...seedVariantFetches);

    for (const runFetch of stageOneFetches) {
      const candidate = await runWithRetries(runFetch, fastRoundMode ? 1 : 2);
      collectCandidates(candidate);

      const stageCandidates = toUniqueCandidates();
      const stageBest = maybePreferSeedCandidate(stageCandidates, pickBestCandidate(character, stageCandidates));
      if (stageBest && stageBest.confidence >= stageOneTargetConfidence) {
        const resolved = {
          ...stageBest,
          lookupMeta: {
            queriedVariants: variants,
            candidateCount: stageCandidates.length,
            contextHints,
            resolution: seed.resolution
          }
        };
        const resolvedWithImage = skipImageEnrichment ? resolved : await enrichCandidateImage(resolved);
        setCachedCharacter(character, resolvedWithImage);
        return resolvedWithImage;
      }
    }

    let candidates = toUniqueCandidates();
    let best = maybePreferSeedCandidate(candidates, pickBestCandidate(character, candidates));
    if (best && best.confidence >= preStageTwoTargetConfidence) {
      const resolved = {
        ...best,
        lookupMeta: {
          queriedVariants: variants,
          candidateCount: candidates.length,
          contextHints,
          resolution: seed.resolution
        }
      };
      const resolvedWithImage = skipImageEnrichment ? resolved : await enrichCandidateImage(resolved);
      setCachedCharacter(character, resolvedWithImage);
      return resolvedWithImage;
    }

    if (fastRoundMode && best) {
      const resolved = {
        ...best,
        lookupMeta: {
          queriedVariants: variants,
          candidateCount: candidates.length,
          contextHints,
          resolution: seed.resolution
        }
      };
      const resolvedWithImage = skipImageEnrichment ? resolved : await enrichCandidateImage(resolved);
      setCachedCharacter(character, resolvedWithImage);
      return resolvedWithImage;
    }

    if (fastRoundMode) {
      const aliasFallbackFast = fallbackFromAliasIndex(character);
      if (aliasFallbackFast) {
        setCachedCharacter(character, aliasFallbackFast, 10 * 60 * 1000);
        return aliasFallbackFast;
      }
      const typoFallbackFast = fallbackFromTypo(character);
      if (typoFallbackFast) {
        setCachedCharacter(character, typoFallbackFast, 10 * 60 * 1000);
        return typoFallbackFast;
      }
      const knowledgeFallbackFast = fallbackFromKnowledgeIndex(character);
      if (knowledgeFallbackFast) {
        setCachedCharacter(character, knowledgeFallbackFast, 10 * 60 * 1000);
        return knowledgeFallbackFast;
      }
      const nameOnlyFallbackFast = fallbackFromNameOnly(character);
      if (nameOnlyFallbackFast) {
        setCachedCharacter(character, nameOnlyFallbackFast, 30 * 1000);
        return nameOnlyFallbackFast;
      }
      return null;
    }

    const secondaryVariants = variants
      .filter(variant => canonicalizeName(variant) !== canonicalizeName(baseName))
      .slice(0, isRoundMode ? 3 : 5);

    const stageTwoTasks = [
      ...secondaryVariants.map(variant => fetchFromWikipediaEnhanced(variant).catch(() => null)),
      ...secondaryVariants.map(variant => fetchFromWikipediaSearchEnhanced(variant, contextHints, entityHints).catch(() => null)),
      ...secondaryVariants.slice(0, isRoundMode ? 1 : 3).map(variant => fetchFromWikipediaOpenSearch(variant, contextHints).catch(() => null)),
      ...secondaryVariants.slice(0, isRoundMode ? 1 : 2).map(variant => fetchFromWikidata(variant, contextHints, entityHints).catch(() => null)),
      ...(!isRoundMode ? [
        fetchFromFandom(baseName, contextHints).catch(() => null),
        fetchFromOMDb(baseName).catch(() => null)
      ] : [])
    ];

    const stageTwoResults = await Promise.all(stageTwoTasks);
    collectCandidates(stageTwoResults);

    candidates = toUniqueCandidates();
    best = maybePreferSeedCandidate(candidates, pickBestCandidate(character, candidates));
    if (best) {
      const resolved = {
        ...best,
        lookupMeta: {
          queriedVariants: variants,
          candidateCount: candidates.length,
          contextHints,
          resolution: seed.resolution
        }
      };
      const resolvedWithImage = skipImageEnrichment ? resolved : await enrichCandidateImage(resolved);
      setCachedCharacter(character, resolvedWithImage);
      return resolvedWithImage;
    }

    const rescueFetches = [
      () => fetchFromWikipediaSearchEnhanced(baseName, contextHints, entityHints),
      () => fetchFromWikipediaPrefixSearch(baseName),
      ...(!isRoundMode ? [() => fetchFromWikidata(baseName, contextHints, entityHints)] : []),
      () => fetchFromWikipediaSummary(baseName)
    ];

    for (const runFetch of rescueFetches) {
      const candidate = await runWithRetries(runFetch, 2);
      collectCandidates(candidate);
    }
    candidates = toUniqueCandidates();
    best = maybePreferSeedCandidate(candidates, pickBestCandidate(character, candidates));
    if (best) {
      const resolved = {
        ...best,
        lookupMeta: {
          queriedVariants: variants,
          candidateCount: candidates.length,
          contextHints,
          resolution: seed.resolution
        }
      };
      const resolvedWithImage = skipImageEnrichment ? resolved : await enrichCandidateImage(resolved);
      setCachedCharacter(character, resolvedWithImage);
      return resolvedWithImage;
    }

    const aliasFallback = fallbackFromAliasIndex(character);
    if (aliasFallback) {
      setCachedCharacter(character, aliasFallback, 10 * 60 * 1000);
      return aliasFallback;
    }

    const typoFallback = fallbackFromTypo(character);
    if (typoFallback) {
      setCachedCharacter(character, typoFallback, 10 * 60 * 1000);
      return typoFallback;
    }

    const knowledgeFallback = fallbackFromKnowledgeIndex(character);
    if (knowledgeFallback) {
      setCachedCharacter(character, knowledgeFallback, 10 * 60 * 1000);
      return knowledgeFallback;
    }

    const nameOnlyFallback = fallbackFromNameOnly(character);
    if (nameOnlyFallback) {
      setCachedCharacter(character, nameOnlyFallback, 30 * 1000);
      return nameOnlyFallback;
    }

    return null;
  })();

  INFLIGHT_FETCHES.set(inflightKey, task);
  try {
    return await task;
  } finally {
    INFLIGHT_FETCHES.delete(inflightKey);
  }
}

module.exports = {
  fetchCharacterInfo,
  getJson,
  fetchFromWikipediaEnhanced,
  fetchFromWikipediaSearchEnhanced,
  fetchFromWikipediaOpenSearch,
  fetchFromWikipediaPrefixSearch,
  fetchFromWikipediaFuzzyToken,
  fetchFromWikipediaSummary,
  fetchFromWikidata,
  fetchFromFandom,
  fetchFromOMDb
};
