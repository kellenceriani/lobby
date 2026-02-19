const https = require('https');
const { WIKI_SEARCH_HINTS, CHARACTER_NAME_ALIASES } = require('./constants');
const { normalizeName, canonicalizeName, getCharacterNameVariants, parseCharacterQuery, resolveLikelyTypo } = require('./textUtils');
const { normalizeInfoCandidate, extractProfessionFromWikipedia, pickBestInfoCandidate } = require('./candidateScoring');

const FETCH_CACHE = new Map();
const INFLIGHT_FETCHES = new Map();
const CACHE_TTL = 3600000;

function getJson(url, timeoutMs = 4500) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'LobbyWARS/1.1',
          Accept: 'application/json'
        }
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(null);
          }
        });
      }
    );

    req.on('error', () => resolve(null));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function getCachedCharacter(name) {
  const normalized = name.toLowerCase().trim();
  const cached = FETCH_CACHE.get(normalized);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    FETCH_CACHE.delete(normalized);
    return null;
  }
  return cached.data;
}

function setCachedCharacter(name, data) {
  FETCH_CACHE.set(name.toLowerCase().trim(), {
    data,
    timestamp: Date.now()
  });
}

function toTitleCase(text) {
  return String(text || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function fallbackFromAliasIndex(character) {
  const variants = getCharacterNameVariants(character).map(v => canonicalizeName(v));
  const aliasEntries = Object.entries(CHARACTER_NAME_ALIASES);

  for (const [key, aliases] of aliasEntries) {
    const all = [key, ...(Array.isArray(aliases) ? aliases : [])]
      .map(name => normalizeName(name))
      .filter(Boolean);
    const allCanonical = all.map(name => canonicalizeName(name));

    if (allCanonical.some(aliasCanon => variants.includes(aliasCanon))) {
      const bestTitle = all.find(name => name.includes(' ')) || all[0] || key;
      return {
        source: 'local-index',
        title: toTitleCase(bestTitle),
        description: `Resolved via local alias index for ${character}.`,
        aliases: all,
        categories: ['fictional characters'],
        confidence: 0.58,
        confidenceBand: 'medium',
        confidenceSignals: {
          sourceReliability: 0.16,
          nameMatch: 0.22,
          aliasMatch: 0.2,
          contextMatch: 0,
          quality: 0,
          penalties: 0
        }
      };
    }
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
    title: toTitleCase(corrected),
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

async function fetchWikidataMetadata(entityId) {
  if (!entityId) return null;
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(entityId)}&languages=en&props=labels|descriptions|aliases&format=json&origin=*`;

  try {
    const json = await getJson(url);
    const entity = json && json.entities ? json.entities[entityId] : null;
    if (!entity) return null;

    const aliases = entity.aliases && entity.aliases.en
      ? entity.aliases.en.map(item => item && item.value).filter(Boolean).slice(0, 16)
      : [];

    return {
      wikidataId: entityId,
      wikidataLabel: entity.labels && entity.labels.en ? entity.labels.en.value : null,
      wikidataDescription: entity.descriptions && entity.descriptions.en ? entity.descriptions.en.value : null,
      aliases
    };
  } catch (e) {
    return null;
  }
}

async function fetchFromWikipediaEnhanced(title) {
  const normalized = normalizeName(title);
  const query = encodeURIComponent(normalized);
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${query}&prop=extracts|pageprops|categories&cllimit=36&exintro=false&exchars=4200&explaintext=true&format=json&origin=*`;

  try {
    const json = await getJson(url);
    if (!json || !json.query || !json.query.pages) return null;

    const pages = json.query.pages;
    const firstPage = Object.values(pages)[0];

    if (firstPage && firstPage.extract && !firstPage.extract.includes('Disambiguation') && !firstPage.extract.includes('may refer to')) {
      const profession = extractProfessionFromWikipedia(firstPage.extract);
      const categories = Array.isArray(firstPage.categories)
        ? firstPage.categories.map(c => (c && c.title ? c.title.replace(/^Category:/, '') : '')).filter(Boolean).slice(0, 16)
        : [];
      const wikidataMeta = await fetchWikidataMetadata(firstPage.pageprops && firstPage.pageprops.wikibase_item);

      return {
        source: 'wikipedia',
        description: firstPage.extract.substring(0, 3200),
        title: firstPage.title,
        profession,
        pageprops: firstPage.pageprops || {},
        categories,
        aliases: wikidataMeta && wikidataMeta.aliases ? wikidataMeta.aliases : [],
        wikidataDescription: wikidataMeta ? wikidataMeta.wikidataDescription : null,
        wikidataId: wikidataMeta ? wikidataMeta.wikidataId : null
      };
    }
  } catch (e) {
    return null;
  }

  return null;
}

async function fetchFromWikipediaSummary(character) {
  const normalized = normalizeName(character);
  const query = encodeURIComponent(normalized.replace(/\s+/g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${query}`;
  const json = await getJson(url);
  if (!json || !json.extract || json.type === 'disambiguation') return null;

  return {
    source: 'wikipedia',
    description: json.extract.substring(0, 1200),
    title: json.title || normalized
  };
}

async function fetchFromWikipediaSearchEnhanced(character, contextHints = []) {
  const normalized = normalizeName(character);
  const candidatePool = [];

  const runSearch = async (queryText, limit = 6) => {
    const query = encodeURIComponent(queryText);
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&srlimit=${limit}&format=json&origin=*`;
    const json = await getJson(url);
    return json && json.query && Array.isArray(json.query.search) ? json.query.search : [];
  };

  try {
    const baselineQueries = [
      normalized,
      `"${normalized}"`,
      `${normalized} character`,
      `${normalized} person`
    ];

    contextHints.forEach(hint => {
      baselineQueries.push(`${normalized} ${hint}`);
      baselineQueries.push(`${hint} ${normalized}`);
    });

    WIKI_SEARCH_HINTS.slice(0, 10).forEach(hint => baselineQueries.push(`${normalized} ${hint}`));

    const dedupedQueries = Array.from(new Set(baselineQueries.map(normalizeName).filter(Boolean)));

    for (const queryText of dedupedQueries) {
      const results = await runSearch(queryText);
      for (const result of results) {
        if (!result || !result.title) continue;
        const pageResult = await fetchFromWikipediaEnhanced(result.title);
        if (pageResult) candidatePool.push(pageResult);
      }
    }
  } catch (e) {
    return null;
  }

  return pickBestInfoCandidate(character, candidatePool);
}

async function fetchFromOMDb(character) {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) return null;

  const query = encodeURIComponent(normalizeName(character));
  const url = `https://www.omdbapi.com/?apikey=${apiKey}&s=${query}`;
  const json = await getJson(url);
  if (json && json.Search && json.Search[0]) {
    const top = json.Search[0];
    return {
      source: 'omdb',
      description: `${top.Type || 'title'}: ${top.Title} (${top.Year || 'n/a'})`,
      title: top.Title
    };
  }

  return null;
}

async function fetchFromWikidata(character, contextHints = []) {
  const normalized = normalizeName(character);
  const searches = [normalized, ...contextHints.map(h => `${normalized} ${h}`)].slice(0, 6);

  const allCandidates = [];

  for (const searchText of searches) {
    const query = encodeURIComponent(searchText);
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${query}&language=en&format=json&limit=8&origin=*`;
    const searchJson = await getJson(searchUrl);
    const results = searchJson && Array.isArray(searchJson.search) ? searchJson.search : [];

    results.forEach(candidate => {
      if (!candidate || !candidate.label) return;
      allCandidates.push(candidate);
    });
  }

  const bestCandidate = allCandidates[0];
  if (!bestCandidate) return null;

  const wikidataMeta = await fetchWikidataMetadata(bestCandidate.id);

  return {
    source: 'wikidata',
    description: `${bestCandidate.description || 'Wikidata entity'} (${bestCandidate.label || normalized})`,
    title: bestCandidate.label || normalized,
    profession: bestCandidate.description || null,
    aliases: wikidataMeta && wikidataMeta.aliases ? wikidataMeta.aliases : [],
    wikidataDescription: wikidataMeta && wikidataMeta.wikidataDescription ? wikidataMeta.wikidataDescription : bestCandidate.description || null,
    wikidataId: bestCandidate.id || null
  };
}

async function fetchFromFandom(character, contextHints = []) {
  const normalized = normalizeName(character);
  const searchQueries = [
    normalized,
    ...contextHints.map(hint => `${normalized} ${hint}`),
    ...WIKI_SEARCH_HINTS.slice(0, 8).map(hint => `${normalized} ${hint}`)
  ];

  for (const searchQuery of searchQueries) {
    const searchUrl = `https://community.fandom.com/api/v1/Search/List?query=${encodeURIComponent(searchQuery)}&limit=5&ns=0`;
    const searchJson = await getJson(searchUrl);
    const items = searchJson && Array.isArray(searchJson.items) ? searchJson.items : [];

    for (const item of items) {
      if (!item || !item.url) continue;

      try {
        const parsedUrl = new URL(item.url);
        const wikiIndex = parsedUrl.pathname.indexOf('/wiki/');
        if (wikiIndex === -1) continue;
        const articleTitle = decodeURIComponent(parsedUrl.pathname.slice(wikiIndex + 6));
        const apiUrl = `https://${parsedUrl.hostname}/api.php?action=query&titles=${encodeURIComponent(articleTitle)}&prop=extracts&explaintext=true&format=json&origin=*`;
        const pageJson = await getJson(apiUrl);
        if (!pageJson || !pageJson.query || !pageJson.query.pages) continue;
        const pages = pageJson.query.pages;
        const firstPage = Object.values(pages)[0];
        if (firstPage && firstPage.extract) {
          return {
            source: 'fandom',
            description: firstPage.extract.substring(0, 1800),
            title: firstPage.title || articleTitle
          };
        }
      } catch (e) {
        continue;
      }
    }
  }

  return null;
}

async function fetchCharacterInfo(character) {
  const cached = getCachedCharacter(character);
  if (cached) return cached;

  const inflightKey = character.toLowerCase().trim();
  const existingInflight = INFLIGHT_FETCHES.get(inflightKey);
  if (existingInflight) return existingInflight;

  const fetchPromise = (async () => {
    const queryProfile = parseCharacterQuery(character);
    const variants = getCharacterNameVariants(character);
    const contextHints = queryProfile.contextHints;

    const candidates = [];
    const seen = new Set();

    const addCandidate = (candidate) => {
      const normalized = normalizeInfoCandidate(candidate);
      if (!normalized) return;
      const key = `${normalized.source}|${canonicalizeName(normalized.title || '')}|${canonicalizeName(normalized.description || '').slice(0, 80)}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(normalized);
    };

    for (const variant of variants.slice(0, 10)) {
      const direct = await fetchFromWikipediaEnhanced(variant);
      if (direct) addCandidate(direct);
    }

    const secondaryLookups = [
      ...variants.slice(0, 8).map(variant => fetchFromWikipediaSummary(variant).catch(() => null)),
      ...variants.slice(0, 6).map(variant => fetchFromWikipediaSearchEnhanced(variant, contextHints).catch(() => null)),
      fetchFromFandom(queryProfile.baseName, contextHints).catch(() => null),
      fetchFromOMDb(queryProfile.baseName).catch(() => null),
      fetchFromWikidata(queryProfile.baseName, contextHints).catch(() => null)
    ];

    const results = await Promise.all(secondaryLookups);
    results.forEach(result => {
      if (result) addCandidate(result);
    });

    const bestHit = pickBestInfoCandidate(character, candidates);
    if (bestHit) {
      const enriched = {
        ...bestHit,
        lookupMeta: {
          queriedVariants: variants.slice(0, 10),
          candidateCount: candidates.length,
          contextHints
        }
      };
      setCachedCharacter(character, enriched);
      return enriched;
    }

    const aliasFallback = fallbackFromAliasIndex(character);
    if (aliasFallback) {
      setCachedCharacter(character, aliasFallback);
      return aliasFallback;
    }

    const typoFallback = fallbackFromTypo(character);
    if (typoFallback) {
      setCachedCharacter(character, typoFallback);
      return typoFallback;
    }

    return null;
  })();

  INFLIGHT_FETCHES.set(inflightKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    INFLIGHT_FETCHES.delete(inflightKey);
  }
}

module.exports = {
  fetchCharacterInfo,
  getJson,
  fetchFromWikipediaEnhanced,
  fetchFromWikipediaSearchEnhanced,
  fetchFromWikipediaSummary,
  fetchFromWikidata,
  fetchFromFandom,
  fetchFromOMDb
};
