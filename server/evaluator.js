const https = require('https');

// Cache: { characterName: { data, timestamp } }
const FETCH_CACHE = new Map();
const CACHE_TTL = 3600000; // 1 hour

const EMOTION_TIERS = {
  mad: { score: 0, ovrRange: [0, 20], emoji: '😠' },
  disappointed: { score: [1, 3], ovrRange: [21, 40], emoji: '😞' },
  confused: { score: [4, 6], ovrRange: [41, 60], emoji: '😕' },
  neutral: { score: [7, 12], ovrRange: [61, 70], emoji: '😐' },
  happy: { score: [13, 15], ovrRange: [71, 80], emoji: '😊' },
  amazed: { score: [16, 18], ovrRange: [81, 90], emoji: '😲' },
  mindBlown: { score: [19, 20], ovrRange: [91, 99], emoji: '🤯' }
};

const OFFENSIVE_WORDS = [
  'fuck', 'shit', 'nazi', 'hitler', 'n1gger', 'f4ggot', 'c0nt', 'whore', 'slut'
];

function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ');
}

function getJson(url, timeoutMs = 3500) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'LobbyWARS/1.0',
          'Accept': 'application/json'
        }
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
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

function buildNotes({ validation, info, scenario, twist, score }) {
  const notes = [];
  const wordCount = validation.wordCount || 0;

  if (!validation.valid) {
    const reasonMap = {
      invalid: 'Invalid input (empty or numeric).',
      unreadable: 'Unreadable input (too many symbols).',
      'too-long': 'Too many words (over 5).',
      offensive: 'Blocked offensive content.'
    };
    notes.push(reasonMap[validation.reason] || 'Failed validation.');
    notes.push('Score heavily reduced by rules.');
    notes.push('Tip: use a real character name.');
    return notes;
  }

  if (info) {
    const titleNote = info.title ? ` (${info.title})` : '';
    notes.push(`Source: ${info.source}${titleNote}.`);
    const description = (info.description + (info.title || '')).toLowerCase();
    const scenarioLower = scenario.toLowerCase();
    const twistLower = twist.toLowerCase();
    const keywords = description.split(/\s+/).filter(kw => kw.length > 4).slice(0, 60);
    const matchCount = keywords.filter(kw => scenarioLower.includes(kw) || twistLower.includes(kw)).length;
    const matchNote = matchCount >= 3 ? 'Strong match to scenario/twist.' : matchCount >= 1 ? 'Some relevance to scenario/twist.' : 'Low relevance to scenario/twist.';
    notes.push(matchNote);
    notes.push(`Name signal: ${wordCount}-word pick.`);
    return notes;
  }

  if (wordCount > 3) {
    notes.push('Lookup skipped: long name (4+ words).');
  } else {
    notes.push('Lookup attempted: no direct match found.');
  }

  notes.push(`Heuristic score from name length (${wordCount} words).`);
  notes.push('Tip: well-known names score higher.');
  return notes;
}

// ========== STEP 1: INPUT VALIDATION ==========
function validateInput(character) {
  const sanitized = character.trim();
  
  // Check: Empty or numeric only
  if (!sanitized || /^[0-9]+$/.test(sanitized)) {
    return { valid: false, tier: 'mad', reason: 'invalid' };
  }
  
  // Check: Gibberish (>50% non-alphanumeric)
  const alphaCount = sanitized.replace(/[^a-z0-9\s]/gi, '').length;
  if (alphaCount / sanitized.length < 0.5) {
    return { valid: false, tier: 'mad', reason: 'unreadable' };
  }
  
  // Check: Word count > 5 (probably troll)
  const wordCount = sanitized.split(/\s+/).length;
  if (wordCount > 5) {
    return { valid: false, tier: 'mad', reason: 'too-long' };
  }
  
  // Check: Offensive content
  const lower = sanitized.toLowerCase();
  if (OFFENSIVE_WORDS.some(word => lower.includes(word))) {
    return { valid: false, tier: 'disappointed', reason: 'offensive' };
  }
  
  return { valid: true, wordCount };
}

// ========== STEP 2: CACHE MANAGEMENT ==========
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

// ========== STEP 3: EXTERNAL API CALLS ==========
// Tier 1: Wikipedia
async function fetchFromWikipediaTitle(title) {
  const query = encodeURIComponent(title);
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${query}&prop=extracts&explaintext=true&format=json&origin=*`;
  const json = await getJson(url);
  if (!json || !json.query || !json.query.pages) return null;

  const pages = json.query.pages;
  const firstPage = Object.values(pages)[0];

  if (firstPage && firstPage.extract && !firstPage.extract.includes('Disambiguation') && !firstPage.extract.includes('may refer to')) {
    return {
      source: 'wikipedia',
      description: firstPage.extract.substring(0, 500),
      title: firstPage.title
    };
  }

  return null;
}

function fetchFromWikipedia(character) {
  return fetchFromWikipediaTitle(normalizeName(character));
}

async function fetchFromWikipediaSearch(character) {
  const normalized = normalizeName(character);
  const query = encodeURIComponent(normalized);
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&srlimit=1&format=json&origin=*`;

  const json = await getJson(url);
  const firstResult = json && json.query && json.query.search && json.query.search[0];
  if (firstResult && firstResult.title) {
    const result = await fetchFromWikipediaTitle(firstResult.title);
    if (result) return result;
  }

  if (normalized.split(/\s+/).length <= 2) {
    const fallbackQuery = encodeURIComponent(`${normalized} character`);
    const fallbackUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${fallbackQuery}&srlimit=1&format=json&origin=*`;
    const fallbackJson = await getJson(fallbackUrl);
    const fallbackResult = fallbackJson && fallbackJson.query && fallbackJson.query.search && fallbackJson.query.search[0];
    if (fallbackResult && fallbackResult.title) {
      return fetchFromWikipediaTitle(fallbackResult.title);
    }
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
    description: json.extract.substring(0, 500),
    title: json.title || normalized
  };
}

// Tier 2: OMDb (requires API key in env)
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

// Tier 3: Wikidata (concept lookup)
async function fetchFromWikidata(character) {
  const query = encodeURIComponent(normalizeName(character));
  const url = `https://www.wikidata.org/w/api.php?action=query&titles=${query}&format=json&origin=*`;
  const json = await getJson(url);
  if (!json || !json.query || !json.query.pages) return null;

  const pages = json.query.pages;
  const firstPage = Object.values(pages)[0];
  if (firstPage && firstPage.pageid) {
    return {
      source: 'wikidata',
      description: `Wikidata entry: ${normalizeName(character)}`,
      found: true
    };
  }

  return null;
}

async function fetchFromFandom(character) {
  const normalized = normalizeName(character);
  const searchUrl = `https://community.fandom.com/api/v1/Search/List?query=${encodeURIComponent(normalized)}&limit=1&ns=0`;
  const searchJson = await getJson(searchUrl);
  const item = searchJson && searchJson.items && searchJson.items[0];
  if (!item || !item.url) return null;

  try {
    const parsedUrl = new URL(item.url);
    const wikiIndex = parsedUrl.pathname.indexOf('/wiki/');
    if (wikiIndex === -1) return null;
    const articleTitle = decodeURIComponent(parsedUrl.pathname.slice(wikiIndex + 6));
    const apiUrl = `https://${parsedUrl.hostname}/api.php?action=query&titles=${encodeURIComponent(articleTitle)}&prop=extracts&explaintext=true&format=json&origin=*`;
    const pageJson = await getJson(apiUrl);
    if (!pageJson || !pageJson.query || !pageJson.query.pages) return null;
    const pages = pageJson.query.pages;
    const firstPage = Object.values(pages)[0];
    if (firstPage && firstPage.extract) {
      return {
        source: 'fandom',
        description: firstPage.extract.substring(0, 500),
        title: firstPage.title || articleTitle
      };
    }
  } catch (e) {
    return null;
  }

  return null;
}

// ========== STEP 4: TIERED FETCH ORCHESTRATION ==========
async function fetchCharacterInfo(character) {
  // Try cache first
  const cached = getCachedCharacter(character);
  if (cached) return cached;
  
  // Try tiers in order
  let result = await fetchFromWikipedia(character);
  if (result) {
    setCachedCharacter(character, result);
    return result;
  }

  result = await fetchFromWikipediaSummary(character);
  if (result) {
    setCachedCharacter(character, result);
    return result;
  }

  result = await fetchFromWikipediaSearch(character);
  if (result) {
    setCachedCharacter(character, result);
    return result;
  }

  result = await fetchFromFandom(character);
  if (result) {
    setCachedCharacter(character, result);
    return result;
  }
  
  result = await fetchFromOMDb(character);
  if (result) {
    setCachedCharacter(character, result);
    return result;
  }
  
  result = await fetchFromWikidata(character);
  if (result) {
    setCachedCharacter(character, result);
    return result;
  }
  
  return null; // All APIs failed
}

// ========== STEP 5: SCORING LOGIC ==========
// Called for EACH CHARACTER across ALL TEAMS (up to 36 times)
async function scoreCharacter(character, scenario, twist) {
  console.log(`🔍 Scoring character: "${character}"`);
  
  // Validation
  const validation = validateInput(character);
  if (!validation.valid) {
    console.log(`❌ Invalid character "${character}": ${validation.reason}`);
    if (validation.tier === 'mad') {
      return {
        character,
        emotion: 'mad',
        score: 0,
        ovr: 10,
        reason: 'Invalid input',
        notes: buildNotes({ validation, info: null, scenario, twist, score: 0 })
      };
    }
    if (validation.tier === 'disappointed') {
      return {
        character,
        emotion: 'disappointed',
        score: 2,
        ovr: 30,
        reason: 'Offensive content',
        notes: buildNotes({ validation, info: null, scenario, twist, score: 2 })
      };
    }
  }
  
  // Fetch character info
  const info = validation.wordCount <= 3 ? await fetchCharacterInfo(character) : null;
  
  if (info) {
    console.log(`✅ Found info for "${character}" from ${info.source}`);
  } else {
    console.log(`⚠️ No info found for "${character}"`);
  }
  
  // Score Logic
  let score = 10; // Base neutral
  
  if (info) {
    // Scored with info
    const description = (info.description + (info.title || '')).toLowerCase();
    const scenarioLower = scenario.toLowerCase();
    const twistLower = twist.toLowerCase();
    
    // Bonus: keyword matches
    const keywords = description.split(/\s+/);
    if (keywords.some(kw => scenarioLower.includes(kw) || twistLower.includes(kw))) {
      score += 3; // Relevant to scenario
    }
    
    // Complexity bonus: multi-word name shows intent
    if (validation.wordCount > 1) {
      score += 2;
    }
  } else {
    // Scored without info
    if (validation.wordCount === 1) {
      score = 9; // Single-word, likely real
    } else if (validation.wordCount === 2) {
      score = 10; // Two-word, likely real
    } else {
      score = 5; // Three-word, obscure
    }
  }
  
  // Clamp to 0-20
  score = Math.max(0, Math.min(20, score));
  
  const result = {
    character,
    emotion: mapScoreToEmotion(score),
    score: Math.round(score),
    ovr: mapScoreToOVR(score),
    reason: info ? 'Evaluated' : 'Unknown character',
    notes: buildNotes({ validation, info, scenario, twist, score })
  };
  
  console.log(`📊 "${character}" → Score: ${result.score}/20, OVR: ${result.ovr}, Emotion: ${result.emotion}`);
  
  return result;
}

// ========== STEP 6: EMOTION MAPPING ==========
function mapScoreToEmotion(score) {
  if (score === 0) return 'mad';
  if (score <= 3) return 'disappointed';
  if (score <= 6) return 'confused';
  if (score <= 12) return 'neutral';
  if (score <= 15) return 'happy';
  if (score <= 18) return 'amazed';
  return 'mindBlown';
}

function mapScoreToOVR(score) {
  // Linear mapping: 0-20 score → 0-99 OVR
  return Math.round((score / 20) * 99);
}

// ========== EXPORTS ==========
module.exports = {
  scoreCharacter,
  validateInput,
  fetchCharacterInfo,
  mapScoreToEmotion,
  mapScoreToOVR
};
