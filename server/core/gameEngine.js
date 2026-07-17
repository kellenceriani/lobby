const TARGET_WORD_COUNT = 200;
const DEFAULT_MIN_SOURCE_WORDS = 36;
const WORD_FETCH_TIMEOUT_MS = 6000;

const FALLBACK_WORDS = [
  'Batman', 'Oprah', 'SpongeBob', 'Sherlock Holmes', 'Dwayne Johnson',
  'Einstein', 'Shakespeare', 'Gandalf', 'Darth Vader', 'Hermione Granger',
  'Lion', 'Tiger', 'Elephant', 'Falcon', 'Wolf',
  'Paris', 'Tokyo', 'Nairobi', 'Denver', 'Sydney',
  'Laptop', 'Bridge', 'Compass', 'Lantern', 'Bicycle',
  'Pizza', 'Sushi', 'Taco', 'Pasta', 'Sandwich'
];

let wordCache = [];
let activeWordSource = 'fallback';

const WORD_SOURCE_LABELS = {
  'common-names': 'Common Names API',
  animals: 'Animals API',
  athletes: 'Athletes API',
  'cartoon-characters': 'Cartoon Characters API',
  'food-items': 'Food Items API',
  places: 'Places API',
  'non-living-things': 'Non-living Things API',
  fallback: 'Fallback Word Pool'
};

function getActiveWordSourceLabel() {
  return WORD_SOURCE_LABELS[activeWordSource] || 'Fallback Word Pool';
}

function getActiveWordSourceMeta() {
  const curatedKeys = Array.isArray(WORD_SOURCE_FETCHERS)
    ? WORD_SOURCE_FETCHERS.map((source) => String(source && source.key || '').trim()).filter(Boolean)
    : [];
  const total = curatedKeys.length;
  const index = curatedKeys.indexOf(activeWordSource);
  return {
    key: activeWordSource,
    label: getActiveWordSourceLabel(),
    index: index >= 0 ? index + 1 : null,
    total
  };
}

const { getRoundWeight, scaleRoundPoints } = require('../services/scoreScaling');
const { evaluateRoundFromGame } = require('../services/roundEvaluationService');
const { evaluateRound4FromGame } = require('../services/round4Service');
const { warmCharacterEvaluationCaches, getEvaluationEngineMode } = require('../services/entryEvaluationService');
const { loadRoomsSnapshot, queueRoomsSnapshot } = require('../storage/statePersistence');
const {
  buildRoundStartVoiceCues,
  buildScenarioVoiceCues,
  buildCategoryRevealVoiceCues,
  buildTwistVoiceCues,
  buildRound4StartVoiceCues,
  buildGameEndedVoiceCues
} = require('../services/voiceCueFactory');
const { prewarmAdaptiveNarratorVoiceCues } = require('../services/adaptiveTtsService');
const {
  resolveContentPack,
  getPublicPackMeta,
  recordPackMatchStart,
  recordPackMatchCompletion
} = require('../content/packRegistry');
const {
  normalizeCategorySettings,
  lockCategoryForMatch
} = require('../services/categoryRegistryService');
const { emitPartyTelemetryEvent } = require('../telemetry/partyTelemetry');

const GAME_NARRATOR_VOICE_IDS = new Set(['af_heart', 'af_bella', 'am_michael', 'bm_george']);
const EVAL_PRESEED_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.EVAL_PRESEED_ENABLED || 'false').toLowerCase()
);
const EVAL_PRECOMPUTE_AWAIT_TIMEOUT_MS = Math.max(2500, Number(process.env.EVAL_PRECOMPUTE_AWAIT_TIMEOUT_MS) || 9000);

async function emitWithVoiceCuePrewarm(io, roomCode, eventName, payload, { timeoutMs = 1600 } = {}) {
  io.to(roomCode).emit(eventName, payload);
  const voiceCues = Array.isArray(payload && payload.voiceCues) ? payload.voiceCues : [];
  if (!voiceCues.length) return;
  const room = rooms[roomCode];
  const narratorVoiceId = room && room.voiceConfig && GAME_NARRATOR_VOICE_IDS.has(String(room.voiceConfig.narratorVoiceId || ''))
    ? String(room.voiceConfig.narratorVoiceId)
    : 'bm_george';
  Promise.resolve()
    .then(async () => {
      await prewarmAdaptiveNarratorVoiceCues({
        cues: voiceCues,
        narratorVoiceId,
        timeoutMs
      });
    })
    .catch(() => {});
}

function setGamePhase(game, roomCode, nextPhase, { force = false } = {}) {
  if (!game) return;
  const safeNextPhase = String(nextPhase || game.activePhase || '').trim();
  if (!safeNextPhase) return;

  const now = Date.now();
  const fromPhase = String(game.activePhase || '').trim() || 'UNKNOWN';
  const previousPhaseStartMs = Number(game.phaseStartTime) || 0;
  const phaseDurationMs = previousPhaseStartMs > 0 ? Math.max(0, now - previousPhaseStartMs) : null;

  game.activePhase = safeNextPhase;
  game.phaseStartTime = now;

  if (!force && fromPhase === safeNextPhase) return;
  emitPartyTelemetryEvent('phase_transition', {
    roomCode,
    gameId: game.id || null,
    fromPhase,
    toPhase: safeNextPhase,
    roundNumber: (Number(game.currentRound) || 0) + 1,
    totalRounds: Number(game.totalRounds) || 0,
    playerCount: Array.isArray(game.players) ? game.players.length : 0,
    phaseDurationMs
  });
}

function emitInitialGamePhaseTransition(roomCode, game) {
  if (!game) return;
  emitPartyTelemetryEvent('phase_transition', {
    roomCode,
    gameId: game.id || null,
    fromPhase: 'LOBBY',
    toPhase: String(game.activePhase || 'PRE_ROUND'),
    roundNumber: (Number(game.currentRound) || 0) + 1,
    totalRounds: Number(game.totalRounds) || 0,
    playerCount: Array.isArray(game.players) ? game.players.length : 0,
    phaseDurationMs: 0
  });
}

function normalizeWordCandidate(value) {
  if (typeof value !== 'string') return null;
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact;
}

function toWordCache(pool, targetCount = TARGET_WORD_COUNT) {
  const uniqueByKey = new Map();
  for (const raw of Array.isArray(pool) ? pool : []) {
    const cleaned = normalizeWordCandidate(raw);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!uniqueByKey.has(key)) uniqueByKey.set(key, cleaned);
  }

  const uniqueWords = Array.from(uniqueByKey.values());
  if (uniqueWords.length === 0) return [];

  for (let i = uniqueWords.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [uniqueWords[i], uniqueWords[j]] = [uniqueWords[j], uniqueWords[i]];
  }

  return uniqueWords.slice(0, Math.max(1, targetCount));
}

function wikiCategoryUrl(category, limit = TARGET_WORD_COUNT) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || TARGET_WORD_COUNT));
  return `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtype=page&cmlimit=${safeLimit}&format=json&cmtitle=Category:${encodeURIComponent(category)}`;
}

async function fetchWikipediaCategory(category, limit = TARGET_WORD_COUNT) {
  const response = await fetch(wikiCategoryUrl(category, limit));
  if (!response.ok) throw new Error(`Wikipedia API failed for ${category}`);
  const data = await response.json();
  return ((data && data.query && Array.isArray(data.query.categorymembers)) ? data.query.categorymembers : [])
    .map((member) => (member && member.title ? member.title : null))
    .filter(Boolean)
    .map((title) => title.replace(/\s*\([^)]*\)\s*$/g, '').trim());
}

function normalizeLabel(value) {
  if (typeof value !== 'string') return null;
  return value.replace(/\s*\([^)]*\)\s*$/g, '').replace(/[_-]+/g, ' ').trim();
}

async function fetchJson(url, errorLabel) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WORD_FETCH_TIMEOUT_MS);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'LobbyWordLoader/1.0 (word-source-refresh)'
    },
    signal: controller.signal
  }).finally(() => clearTimeout(timeoutId));
  if (!response.ok) throw new Error(`${errorLabel} failed`);
  return response.json();
}

async function fetchWikidataLabels(sparql, errorLabel = 'Wikidata API') {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
  const data = await fetchJson(url, errorLabel);
  return ((data && data.results && Array.isArray(data.results.bindings)) ? data.results.bindings : [])
    .map((entry) => {
      const key = Object.keys(entry || {}).find((candidate) => candidate.toLowerCase().endsWith('label'));
      return key && entry[key] && entry[key].value ? normalizeLabel(entry[key].value) : null;
    })
    .filter(Boolean);
}

const WORD_SOURCE_FETCHERS = [
  {
    key: 'common-names',
    label: 'Common Names',
    maxWords: 200,
    minWords: 120,
    url: 'https://randomuser.me/api/?results=200&inc=name&noinfo',
    fetchWords: async () => {
      const response = await fetch('https://randomuser.me/api/?results=200&inc=name&noinfo');
      if (!response.ok) throw new Error('RandomUser API failed');
      const data = await response.json();
      const results = Array.isArray(data && data.results) ? data.results : [];
      return results
        .map((entry) => {
          const first = entry && entry.name && entry.name.first ? entry.name.first : '';
          const last = entry && entry.name && entry.name.last ? entry.name.last : '';
          return `${first} ${last}`.trim();
        })
        .filter(Boolean);
    }
  },
  {
    key: 'animals',
    label: 'Animals',
    maxWords: 140,
    minWords: 80,
    url: 'https://api.inaturalist.org/v1/taxa?iconic_taxa=Animalia&rank=species&order_by=observations_count&order=desc&per_page=140',
    fetchWords: async () => {
      const data = await fetchJson('https://api.inaturalist.org/v1/taxa?iconic_taxa=Animalia&rank=species&order_by=observations_count&order=desc&per_page=140', 'iNaturalist API');
      return ((data && Array.isArray(data.results)) ? data.results : [])
        .map((taxon) => {
          const preferred = taxon && taxon.preferred_common_name ? taxon.preferred_common_name : '';
          const scientific = taxon && taxon.name ? taxon.name : '';
          return normalizeLabel(preferred || scientific);
        })
        .filter(Boolean);
    }
  },
  {
    key: 'athletes',
    label: 'Athletes',
    maxWords: 90,
    minWords: 60,
    url: 'https://query.wikidata.org/sparql (athletes query)',
    fetchWords: async () => fetchWikidataLabels(`
      SELECT DISTINCT ?athleteLabel WHERE {
        ?athlete wdt:P31 wd:Q5;
                 wdt:P106/wdt:P279* wd:Q2066131.
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      LIMIT 90
    `, 'Wikidata Athletes API')
  },
  {
    key: 'cartoon-characters',
    label: 'Cartoon Characters',
    maxWords: 120,
    minWords: 50,
    url: wikiCategoryUrl('Animated characters', 120),
    fetchWords: async () => fetchWikipediaCategory('Animated characters', 120)
  },
  {
    key: 'food-items',
    label: 'Food Items',
    maxWords: 120,
    minWords: 80,
    url: 'https://world.openfoodfacts.org/categories.json?page_size=140',
    fetchWords: async () => {
      const data = await fetchJson('https://world.openfoodfacts.org/categories.json?page_size=140', 'Open Food Facts API');
      return ((data && Array.isArray(data.tags)) ? data.tags : [])
        .map((tag) => normalizeLabel(tag && tag.name ? tag.name : null))
        .filter(Boolean);
    }
  },
  {
    key: 'places',
    label: 'Places',
    maxWords: 200,
    minWords: 80,
    url: 'https://restcountries.com/v3.1/all?fields=name',
    fetchWords: async () => {
      const data = await fetchJson('https://restcountries.com/v3.1/all?fields=name', 'REST Countries API');
      return (Array.isArray(data) ? data : [])
        .map((entry) => {
          const name = entry && entry.name && entry.name.common ? entry.name.common : '';
          return normalizeLabel(name);
        })
        .filter(Boolean);
    }
  },
  {
    key: 'non-living-things',
    label: 'Non-living Things',
    maxWords: 120,
    minWords: 60,
    url: 'https://api.datamuse.com/words?ml=object&max=160',
    fetchWords: async () => {
      const data = await fetchJson('https://api.datamuse.com/words?ml=object&max=160', 'Datamuse API');
      return (Array.isArray(data) ? data : [])
        .filter((entry) => Array.isArray(entry && entry.tags) && entry.tags.includes('n'))
        .map((entry) => normalizeLabel(entry && entry.word ? entry.word : null))
        .filter(Boolean);
    }
  }
];

async function fetchRandomWords() {
  const selectedSource = WORD_SOURCE_FETCHERS[Math.floor(Math.random() * WORD_SOURCE_FETCHERS.length)];
  const minimumWords = Math.max(DEFAULT_MIN_SOURCE_WORDS, Number(selectedSource.minWords) || DEFAULT_MIN_SOURCE_WORDS);

  try {
    const fetchedWords = await selectedSource.fetchWords();
    const sourceCap = Math.max(1, Math.min(TARGET_WORD_COUNT, Number(selectedSource.maxWords) || TARGET_WORD_COUNT));
    const normalized = toWordCache(fetchedWords, sourceCap);
    if (!normalized.length) throw new Error(`No words returned from ${selectedSource.label}`);
    if (normalized.length < minimumWords) {
      throw new Error(`Only ${normalized.length} words returned from ${selectedSource.label} (minimum ${minimumWords})`);
    }

    wordCache = normalized;
    activeWordSource = selectedSource.key;
    console.log(`✓ Loaded ${wordCache.length}/${sourceCap} words from ${selectedSource.label} (${selectedSource.url})`);
  } catch (error) {
    console.warn(`⚠️ Word source failed (${selectedSource.label}), using fallback pool`, error && error.message ? `- ${error.message}` : '');
    wordCache = toWordCache(FALLBACK_WORDS, TARGET_WORD_COUNT);
    if (!wordCache.length) {
      wordCache = FALLBACK_WORDS.slice(0);
    }
    activeWordSource = 'fallback';
    console.log(`✓ Loaded ${wordCache.length} words from fallback pool`);
  }
}

function initWordCache() {
  fetchRandomWords();
  setInterval(fetchRandomWords, 1 * 60 * 60 * 1000);
}

function getRandomWord() {
  if (wordCache.length === 0) {
    const fallbackCache = toWordCache(FALLBACK_WORDS, TARGET_WORD_COUNT);
    const safeCache = fallbackCache.length ? fallbackCache : FALLBACK_WORDS;
    return safeCache[Math.floor(Math.random() * safeCache.length)];
  }
  return wordCache[Math.floor(Math.random() * wordCache.length)];
}

function normalizeDraftCharacterLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildUsedDraftCharacterSet(game) {
  const used = new Set();
  if (game && Array.isArray(game.players)) {
    game.players.forEach((player) => {
      const team = Array.isArray(player && player.team) ? player.team : [];
      for (let i = 0; i < 2; i += 1) {
        const entry = normalizeDraftCharacterLabel(team[i]);
        if (!entry) continue;
        used.add(entry.toLowerCase());
      }
    });
  }
  if (game && Array.isArray(game.allCharactersDrafted)) {
    game.allCharactersDrafted.forEach((entry) => {
      const clean = normalizeDraftCharacterLabel(entry);
      if (!clean) return;
      used.add(clean.toLowerCase());
    });
  }
  return used;
}

function takeUniqueAutoFillWord(used = new Set()) {
  const attempts = Math.max(60, Math.min(600, (wordCache.length || FALLBACK_WORDS.length || 40) * 3));
  for (let i = 0; i < attempts; i += 1) {
    const candidate = normalizeDraftCharacterLabel(getRandomWord());
    if (!candidate) continue;
    if (used.has(candidate.toLowerCase())) continue;
    return candidate;
  }
  for (let suffix = 1; suffix <= 9999; suffix += 1) {
    const fallback = `Auto Pick ${suffix}`;
    if (!used.has(fallback.toLowerCase())) return fallback;
  }
  return `Auto Pick ${Date.now()}`;
}

const WORD_BANKS = {
  ACTIVITY: [
    'COOKING', 'BAKING', 'SINGING', 'DANCING', 'PAINTING', 'SURFING', 'SKIING', 'SWIMMING', 'RACING', 'CODING', 'WRITING', 'GARDENING', 'POKER', 'CHESS',
    'ACTING', 'FISHING', 'HIKING', 'CLIMBING', 'SCULPTING', 'PHOTOGRAPHY', 'SKATEBOARDING', 'SNOWBOARDING', 'JUGGLING', 'POTTERY', 'KNITTING', 'YOGA',
    'KARATE', 'BOXING', 'WRESTLING', 'FENCING', 'ARCHERY', 'ROWING', 'SAILING', 'KAYAKING', 'DIVING', 'PARAGLIDING', 'SPELUNKING', 'PARKOUR',
    'BEATBOXING', 'BREAKDANCING', 'GRAFFITI', 'HACKING', 'PODCASTING', 'STANDUP', 'IMPROV', 'ORIGAMI', 'CALLIGRAPHY', 'MIXOLOGY', 'WOODWORKING', 'METALWORKING',
    'GLASSBLOWING', 'TATTOOING', 'HAIRSTYLING', 'MAKEUP', 'FASHION DESIGN', 'GAME DESIGN'
  ],
  FOOD: [
    'SANDWICH', 'PIZZA', 'CAKE', 'SOUP', 'SALAD', 'SUSHI', 'BURGER', 'TACO', 'PASTA', 'STEW',
    'BURRITO', 'RAMEN', 'CURRY', 'LASAGNA', 'RISOTTO', 'PAELLA', 'GUMBO', 'CHILI', 'POKE BOWL', 'BURRITO BOWL',
    'OMELET', 'QUICHE', 'CREPE', 'WAFFLE', 'PANCAKE', 'DONUT', 'CROISSANT', 'BAGEL', 'MUFFIN', 'SCONE',
    'PIE', 'TART', 'BROWNIE', 'COOKIE', 'CUPCAKE', 'MACARON', 'CHEESECAKE', 'TIRAMISU', 'FLAN', 'SOUFFLÉ'
  ],
  THREAT: [
    'ALIEN INVASION', 'ZOMBIE APOCALYPSE', 'ROBOT UPRISING', 'DRAGON', 'METEOR', 'TSUNAMI', 'VOLCANO', 'MONSTER',
    'GIANT SPIDER', 'KRAKEN', 'WEREWOLF PACK', 'VAMPIRE ARMY', 'GHOST HORDE', 'DEMON', 'KAIJU', 'SENTIENT VIRUS',
    'ROGUE AI', 'CLONE ARMY', 'TIME PARADOX', 'BLACK HOLE', 'SOLAR FLARE', 'EARTHQUAKE', 'TORNADO', 'HURRICANE',
    'AVALANCHE', 'WILDFIRE', 'FLOOD', 'PLAGUE', 'MIND CONTROL WAVE', 'REALITY GLITCH', 'DIMENSIONAL RIFT', 'NANOBOTS'
  ],
  PLACE: [
    'MOUNT EVEREST', 'THE OCEAN', 'A JUNGLE', 'A DESERT', 'SPACE', 'THE MOON', 'ANTARCTICA', 'A VOLCANO',
    'THE AMAZON', 'THE SAHARA', 'THE ARCTIC', 'THE HIMALAYAS', 'THE GRAND CANYON', 'A RAINFOREST', 'A CORAL REEF', 'THE DEEP SEA',
    'A CAVE SYSTEM', 'AN ISLAND', 'A MOUNTAIN', 'A GLACIER', 'THE TUNDRA', 'A SWAMP', 'A CANYON', 'A VALLEY',
    'MARS', 'VENUS', 'JUPITER', 'AN ASTEROID', 'A BLACK HOLE', 'ANOTHER DIMENSION', 'THE PAST', 'THE FUTURE'
  ],
  ITEM: [
    'SPACESHIP', 'BRIDGE', 'CITY', 'CASTLE', 'TOWER', 'THEME PARK', 'ROBOT', 'TIME MACHINE',
    'SUBMARINE', 'AIRPLANE', 'HELICOPTER', 'YACHT', 'MOTORCYCLE', 'TANK', 'MECH SUIT', 'JETPACK',
    'TELEPORTER', 'PORTAL', 'HOLOGRAM', 'AI', 'QUANTUM COMPUTER', 'SATELLITE', 'SPACE STATION', 'MOON BASE',
    'FORTRESS', 'MANSION', 'SKYSCRAPER', 'PYRAMID', 'LIGHTHOUSE', 'DAM', 'TUNNEL', 'AMUSEMENT RIDE'
  ],
  PERSON: [
    'YOUR CRUSH', 'A BILLIONAIRE', 'A CELEBRITY', 'THE PRESIDENT', 'A WIZARD', 'A DRAGON', 'AN AI',
    'A KING', 'A QUEEN', 'A KNIGHT', 'A PIRATE', 'A NINJA', 'A SAMURAI', 'A VIKING', 'A GLADIATOR',
    'AN ASTRONAUT', 'A SUPERHERO', 'A VILLAIN', 'A SPY', 'A DETECTIVE', 'A SCIENTIST', 'AN INVENTOR', 'A GENIUS',
    'A GHOST', 'A VAMPIRE', 'AN ALIEN', 'A TIME TRAVELER', 'A CLONE', 'YOUR FUTURE SELF'
  ],
  MYSTERY: [
    'MYSTERY IN A HAUNTED MANSION', 'MISSING TREASURE', 'MASTER THIEF', 'SECRET IDENTITY', 'CONSPIRACY',
    'MURDER CASE', 'KIDNAPPING', 'ART HEIST', 'BANK ROBBERY', 'JEWEL THEFT', 'ANCIENT CURSE', 'PROPHECY',
    'HIDDEN MESSAGE', 'CODED LETTER', 'SECRET SOCIETY', 'UNDERGROUND OPERATION', 'DOUBLE AGENT', 'BETRAYAL',
    'LOST CIVILIZATION', 'FORBIDDEN ARTIFACT', 'VANISHING ACT'
  ],
  SPORT: [
    'BASKETBALL', 'FOOTBALL', 'SOCCER', 'TENNIS', 'GOLF', 'BOWLING', 'ARCHERY', 'FENCING',
    'BASEBALL', 'HOCKEY', 'RUGBY', 'CRICKET', 'VOLLEYBALL', 'BADMINTON', 'TABLE TENNIS', 'SQUASH',
    'BOXING', 'MMA', 'WRESTLING', 'JUDO', 'KARATE', 'TAEKWONDO', 'GYMNASTICS', 'TRACK AND FIELD',
    'SWIMMING', 'DIVING', 'SURFING', 'SKATEBOARDING', 'SNOWBOARDING', 'ROCK CLIMBING', 'PARKOUR', 'ESPORTS'
  ],
  SKILL: [
    'MAGIC SHOW', 'COMEDY ROUTINE', 'POETRY SLAM', 'FILM', 'SYMPHONY', 'NOVEL', 'SCULPTURE',
    'PAINTING', 'DANCE PERFORMANCE', 'OPERA', 'MUSICAL', 'PLAY', 'CONCERT', 'ALBUM', 'MUSIC VIDEO', 'PODCAST',
    'VIDEO GAME', 'MOBILE APP', 'WEBSITE', 'DOCUMENTARY', 'SHORT FILM', 'ANIMATION', 'COMIC BOOK', 'GRAPHIC NOVEL',
    'FASHION LINE', 'PERFUME', 'RECIPE BOOK', 'ARCHITECTURAL DESIGN'
  ],
  ABSURD: [
    'A SENTIENT CLOUD', 'A DANCE MOVE', 'AN EMOTION', 'A THOUGHT', 'A DREAM', 'FURNITURE', 'A ROCK',
    'A COLOR', 'A SOUND', 'A SMELL', 'A TEXTURE', 'A MEMORY', 'A SHADOW', 'AN ECHO', 'A REFLECTION',
    'TIME ITSELF', 'GRAVITY', 'MATHEMATICS', 'THE ALPHABET', 'A DIMENSION', 'REALITY', 'EXISTENCE', 'CONSCIOUSNESS',
    'YOUR OWN VOID', 'THE CONCEPT OF IRONY', 'A PARADOX', 'THE NUMBER SEVEN', 'TUESDAY'
  ]
};

const SCENARIO_TEMPLATES = {
  food: [
    { template: 'WIN A {ACTIVITY} COMPETITION', vars: ['ACTIVITY'] },
    { template: 'MAKE THE PERFECT {FOOD}', vars: ['FOOD'] },
    { template: 'SURVIVE A {FOOD} EATING CONTEST', vars: ['FOOD'] },
    { template: 'CREATE A {FOOD} MASTERPIECE', vars: ['FOOD'] },
    { template: 'RUN A {FOOD} RESTAURANT', vars: ['FOOD'] },
    { template: 'INVENT A NEW {FOOD}', vars: ['FOOD'] },
    { template: 'JUDGE A {ACTIVITY} SHOWDOWN', vars: ['ACTIVITY'] },
    { template: 'CATER A WEDDING WITH {FOOD}', vars: ['FOOD'] }
  ],
  action: [
    { template: 'DEFEAT {THREAT}', vars: ['THREAT'] },
    { template: 'ESCAPE FROM {THREAT}', vars: ['THREAT'] },
    { template: 'SAVE THE WORLD FROM {THREAT}', vars: ['THREAT'] },
    { template: 'SURVIVE {THREAT}', vars: ['THREAT'] },
    { template: 'PREVENT {THREAT}', vars: ['THREAT'] },
    { template: 'OUTSMART {THREAT}', vars: ['THREAT'] },
    { template: 'TAME {THREAT}', vars: ['THREAT'] },
    { template: 'NEGOTIATE WITH {THREAT}', vars: ['THREAT'] }
  ],
  adventure: [
    { template: 'CLIMB {PLACE}', vars: ['PLACE'] },
    { template: 'EXPLORE {PLACE}', vars: ['PLACE'] },
    { template: 'SURVIVE IN {PLACE}', vars: ['PLACE'] },
    { template: 'CROSS {PLACE}', vars: ['PLACE'] },
    { template: 'DISCOVER {PLACE}', vars: ['PLACE'] },
    { template: 'MAP {PLACE}', vars: ['PLACE'] },
    { template: 'COLONIZE {PLACE}', vars: ['PLACE'] },
    { template: 'ESCAPE FROM {PLACE}', vars: ['PLACE'] }
  ],
  building: [
    { template: 'BUILD A {ITEM}', vars: ['ITEM'] },
    { template: 'DESIGN A {ITEM}', vars: ['ITEM'] },
    { template: 'CONSTRUCT A {ITEM}', vars: ['ITEM'] },
    { template: 'CREATE A {ITEM}', vars: ['ITEM'] },
    { template: 'REPAIR A {ITEM}', vars: ['ITEM'] },
    { template: 'UPGRADE A {ITEM}', vars: ['ITEM'] },
    { template: 'PILOT A {ITEM}', vars: ['ITEM'] },
    { template: 'DESTROY A {ITEM}', vars: ['ITEM'] }
  ],
  social: [
    { template: 'WIN THE HEART OF {PERSON}', vars: ['PERSON'] },
    { template: 'CONVINCE {PERSON} TO HELP YOU', vars: ['PERSON'] },
    { template: 'IMPRESS {PERSON}', vars: ['PERSON'] },
    { template: 'BECOME {PERSON}', vars: ['PERSON'] },
    { template: 'DEFEAT {PERSON} IN DEBATE', vars: ['PERSON'] },
    { template: 'BEFRIEND {PERSON}', vars: ['PERSON'] },
    { template: 'TEACH {PERSON} SOMETHING', vars: ['PERSON'] },
    { template: 'SWAP LIVES WITH {PERSON}', vars: ['PERSON'] }
  ],
  mystery: [
    { template: 'SOLVE A {MYSTERY}', vars: ['MYSTERY'] },
    { template: 'UNCOVER A {MYSTERY}', vars: ['MYSTERY'] },
    { template: 'CATCH A {MYSTERY}', vars: ['MYSTERY'] },
    { template: 'FIND THE {MYSTERY}', vars: ['MYSTERY'] },
    { template: 'PREVENT A {MYSTERY}', vars: ['MYSTERY'] },
    { template: 'INVESTIGATE A {MYSTERY}', vars: ['MYSTERY'] },
    { template: 'EXPOSE A {MYSTERY}', vars: ['MYSTERY'] },
    { template: 'DECODE A {MYSTERY}', vars: ['MYSTERY'] }
  ],
  sports: [
    { template: 'WIN A {SPORT} CHAMPIONSHIP', vars: ['SPORT'] },
    { template: 'BECOME A {SPORT} LEGEND', vars: ['SPORT'] },
    { template: 'MASTER {SPORT}', vars: ['SPORT'] },
    { template: 'TEACH {SPORT} TO BEGINNERS', vars: ['SPORT'] },
    { template: 'BREAK A {SPORT} WORLD RECORD', vars: ['SPORT'] },
    { template: 'COMMENTATE A {SPORT} MATCH', vars: ['SPORT'] }
  ],
  performance: [
    { template: 'PERFORM A {SKILL}', vars: ['SKILL'] },
    { template: 'WIN A {SKILL} COMPETITION', vars: ['SKILL'] },
    { template: 'CREATE A {SKILL}', vars: ['SKILL'] },
    { template: 'DIRECT A {SKILL}', vars: ['SKILL'] },
    { template: 'PRODUCE A {SKILL}', vars: ['SKILL'] },
    { template: 'CRITIQUE A {SKILL}', vars: ['SKILL'] }
  ],
  absurd: [
    { template: 'BECOME {ABSURD}', vars: ['ABSURD'] },
    { template: 'COMMUNICATE WITH {ABSURD}', vars: ['ABSURD'] },
    { template: 'TEACH {ABSURD} TO LOVE', vars: ['ABSURD'] },
    { template: 'MAKE FRIENDS WITH {ABSURD}', vars: ['ABSURD'] },
    { template: 'UNDERSTAND {ABSURD}', vars: ['ABSURD'] },
    { template: 'CONTROL {ABSURD}', vars: ['ABSURD'] },
    { template: 'MERGE WITH {ABSURD}', vars: ['ABSURD'] },
    { template: 'ARGUE WITH {ABSURD}', vars: ['ABSURD'] }
  ]
};

const TWIST_TEMPLATES = {
  easy: [
    'BUT YOU ONLY HAVE 30 SECONDS',
    'WITHOUT USING YOUR HANDS',
    'WHILE BLINDFOLDED',
    'IN COMPLETE DARKNESS',
    'WITHOUT SPEAKING',
    'WHILE HOPPING ON ONE LEG',
    'WITH ONE ARM TIED BEHIND YOUR BACK',
    'WHILE WEARING MITTENS',
    'ON A TIGHT BUDGET',
    'IN TOTAL SILENCE',
    'WITHOUT INSTRUCTIONS',
    'USING ONLY ONE TOOL',
    'WITH NO PREPARATION',
    'WHILE BEING TIMED',
    'IN FRONT OF A CROWD',
    'ON YOUR FIRST TRY',
    'WITHOUT TOUCHING THE GROUND',
    'USING ONLY NATURAL MATERIALS',
    'DURING A RAINSTORM',
    'IN EXTREME HEAT',
    'IN EXTREME COLD',
    'WHILE SLEEP DEPRIVED',
    'WITH NO HELP',
    'AGAINST THE CLOCK'
  ],
  normal: [
    'BUT IT\'S UNDERWATER',
    'BUT YOU\'RE IN A LIBRARY',
    'WHILE EVERYTHING SPINS',
    'IN ZERO GRAVITY',
    'MADE OF CHEESE',
    'USING ONLY YOUR FEET',
    'WHILE MOONWALKING',
    'ON ROLLER SKATES',
    'AS A HOLOGRAM',
    'BACKWARDS',
    'UPSIDE DOWN',
    'IN SLOW MOTION',
    'AT SUPER SPEED',
    'WHILE INVISIBLE',
    'AS A PUPPET',
    'THROUGH A TRANSLATOR',
    'IN REVERSE CHRONOLOGICAL ORDER',
    'WHILE SHRINKING',
    'WHILE GROWING',
    'ON A MOVING TRAIN',
    'IN A BOUNCY CASTLE',
    'DURING AN EARTHQUAKE',
    'ON ICE',
    'IN QUICKSAND',
    'ON A TIGHTROPE',
    'IN A MIRROR MAZE',
    'THROUGH A KALEIDOSCOPE',
    'IN BLACK AND WHITE',
    'IN A DIFFERENT LANGUAGE',
    'AS A SHADOW',
    'IN A WIND TUNNEL',
    'ON THE MOON',
    'IN A DREAM',
    'AS A VIDEO GAME',
    'IN SIGN LANGUAGE',
    'THROUGH INTERPRETIVE DANCE',
    'AS A MUSICAL',
    'IN HAIKU FORM',
    'USING ONLY EMOJIS'
  ],
  hard: [
    'BUT YOU\'RE MADE OF PUDDING',
    'AS A SENTIENT CLOUD',
    'WHERE TIME MOVES BACKWARDS',
    'IN A WORLD OF ONLY SOUNDS',
    'WHILE EVERYTHING TASTES PURPLE',
    'WHERE WORDS DON\'T EXIST',
    'IN 4D SPACE',
    'THAT\'S ALSO A DREAM',
    'WHILE YOU\'RE THE ECHO',
    'WHERE PHYSICS IS REVERSED',
    'AS YOUR OWN REFLECTION',
    'IN A RECURSIVE LOOP',
    'ACROSS PARALLEL UNIVERSES',
    'AS A MATHEMATICAL EQUATION',
    'WHERE CAUSE AND EFFECT ARE SWAPPED',
    'IN A NON-EUCLIDEAN SPACE',
    'AS PURE ENERGY',
    'WHERE THOUGHTS ARE VISIBLE',
    'IN THE SPACE BETWEEN MOMENTS',
    'AS A COLLECTIVE CONSCIOUSNESS',
    'WHERE REALITY IS SUBJECTIVE',
    'IN THE QUANTUM REALM',
    'AS AN ABSTRACT CONCEPT',
    'WHERE UP IS DOWN AND LEFT IS TOMORROW',
    'IN A WORLD WHERE YOU DON\'T EXIST',
    'AS THE ABSENCE OF SOMETHING',
    'WHERE EVERYTHING IS METAPHORICAL',
    'IN A PARADOX',
    'AS AN IMPOSSIBLE OBJECT',
    'WHERE MEANING IS MEANINGLESS',
    'IN THE SPACE BETWEEN THOUGHTS',
    'AS A GLITCH IN REALITY',
    'WHERE ALL SENSES ARE MERGED',
    'IN A DIMENSION OF PURE EMOTION',
    'AS THE ANSWER TO A QUESTION',
    'WHERE NOTHING AND EVERYTHING COEXIST',
    'IN THE LANGUAGE OF COLORS',
    'AS A MEMORY THAT NEVER HAPPENED',
    'WHERE TIME IS A FLAT CIRCLE',
    'IN THE VOID WHERE LOGIC DIED'
  ]
};

const TWIST_DOMAIN_SIGNALS = {
  ice: ['ice', 'arctic', 'frozen', 'snow', 'glacier', 'winter', 'frost'],
  fire: ['fire', 'flame', 'inferno', 'burn', 'lava', 'volcanic', 'blaze'],
  lightning: ['lightning', 'thunder', 'storm', 'electric', 'voltage', 'shock'],
  wind: ['wind', 'air', 'hurricane', 'tornado', 'gust', 'cyclone'],
  earth: ['earth', 'rock', 'stone', 'mountain', 'cave', 'quake', 'terrain'],
  elemental: ['elemental', 'elements', 'alchemy', 'nature force'],
  mystery: ['mystery', 'detective', 'investigate', 'clue', 'case', 'heist', 'secret'],
  animals: ['animal', 'beast', 'dog', 'wolf', 'cat', 'wildlife', 'pet'],
  cooking: ['cook', 'bake', 'chef', 'kitchen', 'food', 'recipe', 'restaurant'],
  sports: ['sport', 'match', 'team', 'tournament', 'league', 'championship', 'race'],
  water: ['ocean', 'underwater', 'sea', 'flood', 'tsunami', 'coast', 'river'],
  space: ['space', 'orbit', 'moon', 'mars', 'starship', 'galaxy', 'cosmic'],
  social: ['debate', 'convince', 'impress', 'heart', 'president', 'celebrity', 'negotiate'],
  stealth: ['stealth', 'shadow', 'infiltrate', 'covert', 'silent', 'spy', 'assassin'],
  style: ['fashion', 'style', 'outfit', 'costume', 'clothes', 'iconic look']
};

const TWIST_PREFIX_LIBRARY = {
  easy: [
    'NO DIRECT FORCE', 'LIMITED PREP TIME', 'NO REPEAT ACTIONS', 'ONLY BASIC TOOLS',
    'PUBLIC PERFORMANCE REQUIRED', 'NO VERBAL COMMUNICATION', 'ONE ATTEMPT ONLY', 'TIME-LIMITED WINDOWS',
    'NO OUTSIDE HELP', 'STRICT SAFETY RULES', 'COOL-DOWN AFTER EACH MOVE', 'LOW-BUDGET SOLUTION ONLY'
  ],
  normal: [
    'ON ICE', 'UNDERWATER', 'ZERO VISIBILITY', 'SUDDEN RULE CHANGES',
    'LIVE CROWD VOTING', 'NO MODERN TECH', 'IN A MOVING ENVIRONMENT', 'ONE SHARED RESOURCE',
    'DELAYED COMMUNICATION', 'MANDATORY TEAM ROTATION', 'NO PHYSICAL CONTACT', 'NOISE SATURATION',
    'MULTI-LANGUAGE BARRIER', 'RANDOM CHECKPOINT SHIFTS', 'PRESSURE TEST EVERY PHASE', 'ENERGY CAPPED'
  ],
  hard: [
    'REALITY DISTORTION', 'TIME DESYNC', 'HOSTILE ADAPTIVE OPPOSITION', 'NO RECOVERY WINDOW',
    'COMPETING OBJECTIVES', 'DUPLICATE THREATS', 'MIRROR-CONSTRAINT EXECUTION', 'CONTINUOUS COLLATERAL RISK',
    'FALSE DATA FEEDS', 'HARD MODE NO RETRIES', 'RAPID TERRAIN SHIFTS', 'CASCADING FAILURE CONDITIONS'
  ]
};

const TWIST_DOMAIN_LIBRARY = {
  ice: ['ON ICE', 'NO TRACTION', 'FREEZING CONDITIONS'],
  fire: ['EXTREME HEAT ZONE', 'FLAME HAZARDS ACTIVE', 'HEAT SHIELDING REQUIRED'],
  lightning: ['ELECTRICAL STORMS ACTIVE', 'EMP BURSTS INTERMITTENT', 'HIGH-VOLTAGE RISK WINDOWS'],
  wind: ['SEVERE WIND SHEAR', 'AIRFLOW SHIFTS CONSTANTLY', 'HIGH-GUST INSTABILITY'],
  earth: ['UNSTABLE TERRAIN', 'SEISMIC SHOCKS ACTIVE', 'ROCKFALL RISK INCREASING'],
  elemental: ['ELEMENTAL RESISTANCE CHECKS ACTIVE', 'AURA INTERFERENCE IS RANDOM', 'ELEMENT CYCLE SHIFTS EACH PHASE'],
  mystery: ['CLUE CHAIN ONLY', 'EVIDENCE-FIRST DECISIONS', 'NO ASSUMPTIONS ALLOWED'],
  animals: ['ANIMAL BEHAVIOR UNPREDICTABLE', 'NON-HUMAN TARGETS PRIORITIZED', 'WILDLIFE SAFETY FIRST'],
  cooking: ['INGREDIENTS ARE LIMITED', 'NO HEAT CONTROL', 'TASTE + TIMING BOTH SCORED'],
  sports: ['LEAGUE RULEBOOK ENFORCED', 'CLOCK NEVER STOPS', 'POSITIONAL RESTRICTIONS APPLY'],
  water: ['FLOODED TERRAIN', 'BUOYANCY CHANGES EACH PHASE', 'CURRENTS SHIFT CONSTANTLY'],
  space: ['LOW GRAVITY', 'COMMS LATENCY SPIKES', 'LIFE-SUPPORT CONSTRAINTS'],
  social: ['PUBLIC TRUST SCORE ACTIVE', 'NO AGGRESSIVE POSTURING', 'CONSENSUS NEEDED TO PROCEED'],
  stealth: ['NO DETECTION ALLOWED', 'SILENCE MANDATORY', 'LIGHT DISCIPLINE ENFORCED'],
  style: ['ICONIC CLOTHES REQUIRED', 'VISUAL IDENTITY MATTERS', 'COSTUME CONSISTENCY SCORED']
};

const TWIST_MODIFIER_LIBRARY = {
  easy: ['NO BACKTRACKING', 'WITH BASIC EQUIPMENT', 'WITH NEW TEAMMATES'],
  normal: ['AND EVERY STEP IS SCORED', 'AND YOU MUST ADAPT MID-RUN', 'AND RESOURCES DEGRADE OVER TIME'],
  hard: ['AND EACH SUCCESS SPAWNS A HARDER OBJECTIVE', 'AND YOU CANNOT REPEAT A STRATEGY', 'AND FAILURE MULTIPLIES PRESSURE']
};

const TWIST_DIFFICULTY_CLAUSES = {
  easy: [
    'WITH ONE TEAMMATE HELPING',
    'WITH EXTRA RECOVERY WINDOWS',
    'WITH COACHING ALLOWED BETWEEN PHASES',
    'WITH A SAFE RESET AFTER EACH ATTEMPT'
  ],
  normal: [
    'WHILE THE CLOCK NEVER STOPS',
    'WITH RULES SHIFTING EACH PHASE',
    'WHILE RESOURCES SHRINK OVER TIME',
    'WITH LIVE SCORE PRESSURE ACTIVE'
  ],
  hard: [
    'WITHOUT TOUCHING THE PRIMARY OBJECTIVE DIRECTLY',
    'WITH NO RETRIES OR RESPAWNS',
    'WHILE EVERY MISTAKE ADDS A NEW PENALTY',
    'WITH A MOVING WIN CONDITION'
  ]
};

const TWIST_ABSURD_MARKERS = [
  'PUDDING', 'SENTIENT CLOUD', '4D', 'QUANTUM', 'PARADOX', 'NON-EUCLIDEAN', 'ABSTRACT',
  'YOU DON\'T EXIST', 'MEANING IS MEANINGLESS', 'METAPHORICAL', 'SPACE BETWEEN THOUGHTS',
  'COLLECTIVE CONSCIOUSNESS', 'AS PURE ENERGY', 'REALITY IS SUBJECTIVE'
];

const SCENARIO_SOURCE = {
  PACK: 'pack',
  THEME: 'theme',
  CORE: 'core'
};

function inferTwistDomains(text) {
  const source = String(text || '').toLowerCase();
  const domains = Object.entries(TWIST_DOMAIN_SIGNALS)
    .filter(([, keywords]) => keywords.some(keyword => source.includes(keyword)))
    .map(([domain]) => domain);

  if (!domains.length) return ['social', 'stealth', 'sports'];
  return domains.slice(0, 3);
}

function shufflePool(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function composeDynamicTwist({ difficulty = 'normal', scenarioText = '' }) {
  const safeDifficulty = ['easy', 'normal', 'hard'].includes(difficulty) ? difficulty : 'normal';
  const domains = inferTwistDomains(scenarioText);
  const primaryPool = [
    ...(safeDifficulty === 'easy' ? TWIST_PREFIX_LIBRARY.easy || [] : []),
    ...(safeDifficulty !== 'easy' ? TWIST_PREFIX_LIBRARY.normal || [] : []),
    ...(safeDifficulty === 'hard' ? TWIST_PREFIX_LIBRARY.hard || [] : [])
  ];

  const chosenDomain = randomFrom(domains);
  const domainPool = TWIST_DOMAIN_LIBRARY[chosenDomain] || [];
  const modifierPool = [
    ...(TWIST_MODIFIER_LIBRARY[safeDifficulty] || []),
    ...(TWIST_DIFFICULTY_CLAUSES[safeDifficulty] || [])
  ];

  const primary = randomFrom(primaryPool);
  const domainLine = domainPool.length ? randomFrom(domainPool) : '';

  const modifier = randomFrom(modifierPool);
  return applyPromptBrevity([primary, domainLine, modifier].filter(Boolean).join(' | '), 'twist');
}

function normalizeDifficulty(difficulty = 'normal') {
  return ['easy', 'normal', 'hard'].includes(difficulty) ? difficulty : 'normal';
}

function isKnownTheme(theme = 'all') {
  return Object.prototype.hasOwnProperty.call(SCENARIO_TEMPLATES, String(theme || '').toLowerCase());
}

function isAbsurdTwistLine(line) {
  const source = String(line || '').toUpperCase();
  if (!source) return false;
  return TWIST_ABSURD_MARKERS.some((marker) => source.includes(marker));
}

function filterTwistsForTheme(pool, theme = 'all') {
  const safeTheme = String(theme || 'all').toLowerCase();
  if (safeTheme === 'absurd') return Array.isArray(pool) ? pool.slice() : [];
  const candidates = (Array.isArray(pool) ? pool : []).filter((line) => !isAbsurdTwistLine(line));
  return candidates.length ? candidates : (Array.isArray(pool) ? pool.slice() : []);
}

function buildTwistBasePool(difficulty = 'normal', theme = 'all') {
  const safeDifficulty = normalizeDifficulty(difficulty);
  const easyTwists = TWIST_TEMPLATES.easy || [];
  const normalTwists = TWIST_TEMPLATES.normal || [];
  const hardTwists = TWIST_TEMPLATES.hard || [];

  let pool = [];
  if (safeDifficulty === 'easy') {
    pool = [...easyTwists, ...normalTwists.slice(0, 4)];
  } else if (safeDifficulty === 'hard') {
    pool = [...normalTwists, ...hardTwists];
  } else {
    pool = [...easyTwists.slice(0, 4), ...normalTwists, ...hardTwists.slice(0, 3)];
  }

  return filterTwistsForTheme(pool, theme);
}

function buildScenarioSourceMix({ count = 3, theme = 'all', packRuntime = null } = {}) {
  const total = Math.max(1, Number(count) || 1);
  const safeTheme = String(theme || 'all').toLowerCase();
  const hasThemeControl = safeTheme !== 'all' && (resolveThemeAliases(safeTheme).length > 0 || isKnownTheme(safeTheme));
  const hasPackCards = getPackScenarioCards(packRuntime).length > 0;

  const slots = [];

  if (hasPackCards && hasThemeControl) {
    const variants = [
      { pack: Math.max(1, Math.floor(total * 0.5)), theme: Math.ceil(total * 0.5), core: 0 },
      { pack: Math.max(1, Math.ceil(total * 0.67)), theme: Math.max(1, total - Math.ceil(total * 0.67)), core: 0 },
      { pack: Math.max(1, Math.floor(total * 0.75)), theme: Math.max(1, total - Math.floor(total * 0.75)), core: 0 }
    ].filter((variant) => variant.pack + variant.theme + variant.core === total);
    const selected = randomFrom(variants);
    for (let i = 0; i < selected.pack; i++) slots.push(SCENARIO_SOURCE.PACK);
    for (let i = 0; i < selected.theme; i++) slots.push(SCENARIO_SOURCE.THEME);
  } else if (hasPackCards) {
    for (let i = 0; i < total; i++) slots.push(SCENARIO_SOURCE.PACK);
  } else if (hasThemeControl) {
    for (let i = 0; i < total; i++) slots.push(SCENARIO_SOURCE.THEME);
  } else {
    for (let i = 0; i < total; i++) slots.push(SCENARIO_SOURCE.CORE);
  }

  return shufflePool(slots);
}

function generateTemplateScenarioFromCategory(category) {
  const safeCategory = Object.prototype.hasOwnProperty.call(SCENARIO_TEMPLATES, category) ? category : 'action';
  const templates = SCENARIO_TEMPLATES[safeCategory] || SCENARIO_TEMPLATES.action;
  const template = templates[Math.floor(Math.random() * templates.length)];

  let scenario = template.template;
  template.vars.forEach((varName) => {
    const words = WORD_BANKS[varName] || FALLBACK_WORDS;
    const word = words[Math.floor(Math.random() * words.length)];
    scenario = scenario.replace(`{${varName}}`, word);
  });

  return applyPromptBrevity(scenario, 'scenario');
}

function generateScenarioFromPack(theme = 'all', packRuntime = null) {
  const packCards = getPackScenarioCards(packRuntime);
  if (!packCards.length) return null;

  const requestedTheme = String(theme || 'all').toLowerCase();
  const themedCategories = new Set(resolveThemeAliases(requestedTheme));
  const strictThemeCards = requestedTheme === 'all'
    ? packCards
    : packCards.filter((card) => themedCategories.has(String(card.category || '').toLowerCase()));

  const cardPool = strictThemeCards.length ? strictThemeCards : packCards;
  const selectedCard = randomFrom(cardPool);
  if (!selectedCard) return null;

  return {
    scenario: applyPromptBrevity(selectedCard.text, 'scenario'),
    category: selectedCard.category || 'pack',
    source: SCENARIO_SOURCE.PACK
  };
}

function generateScenarioFromTheme(theme = 'all', packRuntime = null) {
  const requestedTheme = String(theme || 'all').toLowerCase();
  const categories = buildScenarioCategoryPool(requestedTheme, packRuntime);
  const aliases = new Set(resolveThemeAliases(requestedTheme));
  const strictThemeCategories = requestedTheme === 'all'
    ? categories
    : categories.filter((category) => aliases.has(category) || category === requestedTheme);
  const categoryPool = strictThemeCategories.length ? strictThemeCategories : categories;
  const selectedCategory = randomFrom(categoryPool.length ? categoryPool : Object.keys(SCENARIO_TEMPLATES));

  return {
    scenario: generateTemplateScenarioFromCategory(selectedCategory),
    category: selectedCategory,
    source: requestedTheme === 'all' ? SCENARIO_SOURCE.CORE : SCENARIO_SOURCE.THEME
  };
}

function resolveScenarioForSource({ source = SCENARIO_SOURCE.CORE, theme = 'all', packRuntime = null } = {}) {
  if (source === SCENARIO_SOURCE.PACK) {
    const fromPack = generateScenarioFromPack(theme, packRuntime);
    if (fromPack) return fromPack;
    const fromThemeFallback = generateScenarioFromTheme(theme, packRuntime);
    return { ...fromThemeFallback, source: SCENARIO_SOURCE.THEME };
  }

  if (source === SCENARIO_SOURCE.THEME) {
    return generateScenarioFromTheme(theme, packRuntime);
  }

  return {
    ...generateScenarioFromTheme('all', null),
    source: SCENARIO_SOURCE.CORE
  };
}

function normalizePackRuntime(packRuntime) {
  if (!packRuntime || typeof packRuntime !== 'object') return null;
  if (packRuntime.id === 'default') return packRuntime;
  return packRuntime;
}

function getPackAllowedThemes(packRuntime) {
  const pack = normalizePackRuntime(packRuntime);
  if (!pack || !pack.gameplay || !Array.isArray(pack.gameplay.allowedThemes)) return [];
  return pack.gameplay.allowedThemes
    .map((theme) => String(theme || '').toLowerCase())
    .filter((theme) => Object.prototype.hasOwnProperty.call(SCENARIO_TEMPLATES, theme));
}

function getPackScenarioCards(packRuntime) {
  const pack = normalizePackRuntime(packRuntime);
  if (!pack || !pack.gameplay || !Array.isArray(pack.gameplay.scenarioCards)) return [];
  return pack.gameplay.scenarioCards
    .filter((entry) => entry && typeof entry === 'object' && entry.text)
    .map((entry) => ({
      text: String(entry.text),
      category: entry.category ? String(entry.category) : 'pack'
    }));
}

const THEME_CATEGORY_ALIASES = {
  all: [],
  food: ['food', 'performance', 'social'],
  action: ['action', 'adventure', 'mystery', 'building'],
  adventure: ['adventure', 'action', 'mystery'],
  sports: ['sports', 'performance', 'action'],
  performance: ['performance', 'social', 'sports'],
  absurd: ['absurd', 'mystery', 'adventure']
};

const THEME_TWIST_ADDS = {
  food: {
    easy: ['WITH A BLIND TASTE PANEL'],
    normal: ['WITH LIMITED INGREDIENT WINDOWS'],
    hard: ['WHILE THE MENU CHANGES EVERY ROUND']
  },
  action: {
    easy: ['WITH NONSTOP PRESSURE'],
    normal: ['WITH HOSTILE INTERFERENCE ACTIVE'],
    hard: ['WHILE COLLATERAL RISK NEVER DROPS']
  },
  adventure: {
    easy: ['WITH MAP UPDATES DELAYED'],
    normal: ['WHILE TERRAIN SHIFTS MID-RUN'],
    hard: ['WITH NO SAFE RETREAT ROUTE']
  },
  sports: {
    easy: ['UNDER CHAMPIONSHIP CLOCK RULES'],
    normal: ['WITH LIVE SCORE SWINGS'],
    hard: ['WHILE REF CALLS CHANGE MOMENTUM']
  },
  performance: {
    easy: ['IN FRONT OF A LIVE CROWD'],
    normal: ['WITH JUDGES SCORING EVERY MOVE'],
    hard: ['WHILE PUBLIC VOTE SHIFTS CONSTANTLY']
  },
  absurd: {
    easy: ['UNDER CHAOS RULES'],
    normal: ['WHILE LOGIC BREAKS PERIODICALLY'],
    hard: ['AS REALITY REWRITES YOUR PLAN']
  }
};

function resolveThemeAliases(theme = 'all') {
  const safeTheme = String(theme || 'all').toLowerCase();
  const aliases = THEME_CATEGORY_ALIASES[safeTheme];
  if (Array.isArray(aliases) && aliases.length) return aliases.slice();
  if (safeTheme === 'all') return [];
  return [safeTheme];
}

function getThemeTwistAdds(theme = 'all', difficulty = 'normal') {
  const safeTheme = String(theme || 'all').toLowerCase();
  const safeDifficulty = normalizeDifficulty(difficulty);
  const bucket = THEME_TWIST_ADDS[safeTheme];
  if (!bucket || !Array.isArray(bucket[safeDifficulty])) return [];
  return bucket[safeDifficulty].slice();
}

function buildScenarioCategoryPool(theme = 'all', packRuntime = null) {
  const requestedTheme = String(theme || 'all').toLowerCase();
  const baseCategories = requestedTheme === 'all'
    ? Object.keys(SCENARIO_TEMPLATES)
    : (Object.prototype.hasOwnProperty.call(SCENARIO_TEMPLATES, requestedTheme) ? [requestedTheme] : Object.keys(SCENARIO_TEMPLATES));

  const packAllowedThemes = getPackAllowedThemes(packRuntime);
  if (!packAllowedThemes.length) return baseCategories;

  const filtered = baseCategories.filter((category) => packAllowedThemes.includes(category));
  return filtered.length ? filtered : baseCategories;
}

function generateScenario(theme = 'all', packRuntime = null) {
  const source = randomFrom(buildScenarioSourceMix({ count: 1, theme, packRuntime })) || SCENARIO_SOURCE.CORE;
  return resolveScenarioForSource({ source, theme, packRuntime });
}

function getPackTwistAdds(packRuntime, difficulty) {
  const pack = normalizePackRuntime(packRuntime);
  if (!pack || !pack.gameplay || !pack.gameplay.twistAdds) return [];
  const twists = pack.gameplay.twistAdds[difficulty];
  return Array.isArray(twists) ? twists.slice() : [];
}

function generateTwists(difficulty = 'normal', count = 4, scenarioText = '', packRuntime = null, theme = 'all') {
  if (difficulty && typeof difficulty === 'object') {
    const options = difficulty;
    return generateTwists(
      options.difficulty || 'normal',
      options.count || 4,
      options.scenarioText || options.scenario || '',
      options.packRuntime || options.pack || null,
      options.theme || options.scenarioTheme || 'all'
    );
  }

  const safeDifficulty = normalizeDifficulty(difficulty);
  const safeTheme = String(theme || 'all').toLowerCase();
  const targetCount = Math.max(1, Math.min(12, Number(count) || 4));
  const basePool = buildTwistBasePool(safeDifficulty, safeTheme);
  const packAdds = getPackTwistAdds(packRuntime, safeDifficulty);
  const themeAdds = getThemeTwistAdds(safeTheme, safeDifficulty);

  const pool = [
    ...basePool,
    ...packAdds,
    ...themeAdds
  ];

  const themeSignal = resolveThemeAliases(safeTheme).join(' ');
  const dynamicScenarioSeed = [String(scenarioText || ''), themeSignal].filter(Boolean).join(' ');

  const dynamicPool = [];
  for (let i = 0; i < (targetCount * 3); i++) {
    dynamicPool.push(composeDynamicTwist({
      difficulty: safeDifficulty,
      scenarioText: dynamicScenarioSeed
    }));
  }

  const mustInclude = [];
  if (packAdds.length) mustInclude.push(randomFrom(packAdds));
  if (themeAdds.length) mustInclude.push(randomFrom(themeAdds));
  mustInclude.push(randomFrom(TWIST_DIFFICULTY_CLAUSES[safeDifficulty] || []));

  const merged = Array.from(new Set([...mustInclude.filter(Boolean), ...pool, ...dynamicPool]));
  const concise = Array.from(new Set(
    merged
      .map((twist) => applyPromptBrevity(twist, 'twist'))
      .filter(Boolean)
  ));
  const prioritized = Array.from(new Set([
    ...mustInclude.filter(Boolean).map((twist) => applyPromptBrevity(twist, 'twist')).filter(Boolean),
    ...shufflePool(concise)
  ]));
  return prioritized.slice(0, targetCount);
}

function generateScenarios(count = 3, theme = 'all', difficulty = 'normal', packRuntime = null) {
  const safeCount = Math.max(1, Math.min(8, Number(count) || 3));
  const sourceSlots = buildScenarioSourceMix({ count: safeCount, theme, packRuntime });
  const scenarios = [];
  const usedScenarios = new Set();

  for (let i = 0; i < safeCount; i++) {
    const source = sourceSlots[i] || SCENARIO_SOURCE.CORE;
    let generated = null;

    for (let attempts = 0; attempts < 5; attempts += 1) {
      generated = resolveScenarioForSource({ source, theme, packRuntime });
      const dedupeKey = String(generated && generated.scenario || '').toLowerCase();
      if (!dedupeKey || !usedScenarios.has(dedupeKey)) {
        if (dedupeKey) usedScenarios.add(dedupeKey);
        break;
      }
    }

    if (!generated) {
      generated = resolveScenarioForSource({ source: SCENARIO_SOURCE.CORE, theme: 'all', packRuntime: null });
    }

    const scenario = generated.scenario;
    const twistTheme = (generated.category && generated.category !== 'pack')
      ? generated.category
      : theme;
    const twists = generateTwists(difficulty, 6, scenario, packRuntime, twistTheme);
    scenarios.push({ scenario, twists, category: generated.category, source: generated.source || source });
  }
  return scenarios;
}

const FINAL_PROMPT_TEMPLATES = [
  '{TEAM_TYPE} TEAM', '{TEAM_TYPE} SQUAD', '{TEAM_TYPE} CREW', '{TEAM_TYPE} UNIT',
  '{TEAM_TYPE} LEAGUE', '{TEAM_TYPE} PARTY', '{TEAM_TYPE} FORCE', '{TEAM_TYPE} ALLIANCE',
  '{TEAM_TYPE} BRIGADE', '{TEAM_TYPE} DIVISION', '{TEAM_TYPE} COALITION', '{TEAM_TYPE} SYNDICATE',
  '{TEAM_TYPE} COLLECTIVE', '{TEAM_TYPE} ENSEMBLE', '{TEAM_TYPE} GUILD', '{TEAM_TYPE} ORDER',
  '{TEAM_TYPE} SOCIETY', '{TEAM_TYPE} BROTHERHOOD', '{TEAM_TYPE} SISTERHOOD', '{TEAM_TYPE} FELLOWSHIP',
  '{TEAM_TYPE} CORPS', '{TEAM_TYPE} REGIMENT', '{TEAM_TYPE} BATTALION', '{TEAM_TYPE} PLATOON',
  '{TEAM_TYPE} TASKFORCE', '{TEAM_TYPE} COMMITTEE', '{TEAM_TYPE} COUNCIL', '{TEAM_TYPE} ASSEMBLY',
  '{TEAM_TYPE} CONSORTIUM', '{TEAM_TYPE} FEDERATION', '{TEAM_TYPE} UNION', '{TEAM_TYPE} ORGANIZATION'
];

const TEAM_TYPES = [
  'BASKETBALL', 'BASEBALL', 'FOOTBALL', 'SOCCER', 'HOCKEY', 'VOLLEYBALL', 'TENNIS',
  'RUGBY', 'CRICKET', 'LACROSSE', 'SOFTBALL', 'HANDBALL', 'WATER POLO', 'FIELD HOCKEY',
  'BOXING', 'MMA', 'WRESTLING', 'JUDO', 'KARATE', 'TAEKWONDO', 'FENCING', 'KICKBOXING',
  'GYMNASTICS', 'FIGURE SKATING', 'TRACK AND FIELD', 'SWIMMING', 'DIVING', 'ARCHERY',
  'SKATEBOARDING', 'SNOWBOARDING', 'SURFING', 'BMX', 'PARKOUR', 'ROCK CLIMBING', 'ESPORTS',
  'DRONE RACING', 'COMPETITIVE EATING', 'SPEED CUBING', 'PROFESSIONAL TAG', 'DODGEBALL',
  'HEIST', 'SPY', 'DETECTIVE', 'MYSTERY SOLVING', 'ESCAPE ROOM', 'TREASURE HUNTING',
  'BOUNTY HUNTING', 'MERCENARY', 'VIGILANTE', 'SECRET AGENT', 'COVERT OPS', 'BLACK OPS',
  'ZOMBIE SURVIVAL', 'APOCALYPSE', 'MONSTER HUNTING', 'DRAGON SLAYING', 'DEMON HUNTING',
  'VAMPIRE HUNTING', 'ALIEN FIGHTING', 'KAIJU DEFENSE', 'WASTELAND SCAVENGING', 'BUNKER',
  'SUPERHERO', 'VILLAIN', 'MAGICAL', 'WIZARD', 'NINJA', 'PIRATE', 'KNIGHT', 'SAMURAI',
  'VIKING', 'GLADIATOR', 'CRUSADER', 'TEMPLAR', 'ASSASSIN', 'RANGER', 'PALADIN', 'WARLOCK',
  'NECROMANCER', 'DRUID', 'MONK', 'BARD', 'ROGUE', 'BARBARIAN', 'SORCERER', 'CLERIC',
  'SPACE', 'MARS COLONY', 'UNDERWATER', 'AIRSHIP', 'TIME TRAVEL', 'SPACE MARINES',
  'STARSHIP', 'ORBITAL', 'LUNAR BASE', 'ASTEROID MINING', 'TERRAFORMING', 'WARP DRIVE',
  'CYBORG', 'ANDROID', 'SYNTHETIC', 'MECH PILOT', 'GUNDAM', 'TRANSFORMER',
  'ROCK BAND', 'POP IDOL', 'DJ', 'DANCE', 'COMEDY', 'MAGIC SHOW', 'THEATER', 'IMPROV',
  'ACAPELLA', 'ORCHESTRA', 'JAZZ BAND', 'RAP BATTLE', 'BEATBOX', 'BREAKDANCING', 'BALLET',
  'COOKING', 'BAKING', 'RESTAURANT', 'FOOD TRUCK', 'CATERING', 'PASTRY', 'SUSHI',
  'MIXOLOGY', 'WINE TASTING', 'FOOD CRITIC', 'FARM TO TABLE', 'MOLECULAR GASTRONOMY',
  'RACING', 'RALLY', 'DRIFT', 'OBSTACLE COURSE', 'TRIVIA', 'GAME SHOW', 'REALITY TV',
  'TALENT SHOW', 'COMPETITION', 'TOURNAMENT', 'CHAMPIONSHIP', 'DEATH MATCH',
  'SCIENCE', 'RESEARCH', 'INVENTION', 'CODING', 'HACKING', 'ROBOTICS', 'AI DEVELOPMENT',
  'QUANTUM COMPUTING', 'BIOENGINEERING', 'NANOTECHNOLOGY', 'CYBERSECURITY', 'DATA SCIENCE',
  'STARTUP', 'MARKETING', 'SALES', 'CONSULTING', 'LEGAL', 'MEDICAL', 'EMERGENCY',
  'FIREFIGHTING', 'SEARCH AND RESCUE', 'DISASTER RELIEF', 'CRISIS MANAGEMENT', 'SWAT',
  'FILM', 'DOCUMENTARY', 'ANIMATION', 'VIDEO GAME', 'PODCAST', 'STREAMING', 'YOUTUBE',
  'PHOTOGRAPHY', 'JOURNALISM', 'INFLUENCER', 'CONTENT CREATION', 'VIRAL MARKETING',
  'DREAM', 'NIGHTMARE', 'EXISTENTIAL CRISIS', 'PHILOSOPHICAL DEBATE', 'MEME CREATION',
  'TIME LOOP ESCAPE', 'DIMENSION HOPPING', 'REALITY RESTRUCTURING', 'CHAOS MANAGEMENT',
  'VOID EXPLORATION', 'MULTIDIMENSIONAL CHESS', 'PARADOX RESOLUTION', 'COSMIC HORROR'
];

const FINAL_SCENARIO_PATTERNS = [
  '{ACTION} {OBJECTIVE} ACROSS {ARENA}',
  '{ACTION} {OBJECTIVE} BEFORE {DEADLINE}',
  '{ACTION} {OBJECTIVE} WHILE {COMPLICATION}',
  '{ACTION} {OBJECTIVE} USING {RESOURCE}',
  '{ACTION} {OBJECTIVE} AGAINST {OPPOSITION}',
  '{ACTION} {OBJECTIVE} IN {ARENA} BEFORE {DEADLINE}',
  '{ACTION} {OBJECTIVE} AGAINST {OPPOSITION} WHILE {COMPLICATION}',
  '{ACTION} {OBJECTIVE} USING {RESOURCE} IN {ARENA}'
];

const FINAL_SCENARIO_COMPONENTS = {
  ACTION: [
    'SECURE', 'DEFEND', 'REBUILD', 'NEGOTIATE', 'DECODE', 'DISMANTLE', 'STABILIZE', 'OUTSMART', 'EVACUATE', 'REMEDIATE',
    'REVERSE', 'CONTAIN', 'ORCHESTRATE', 'COORDINATE', 'RESTRUCTURE', 'OPTIMIZE', 'PREDICT', 'INTERCEPT', 'CONVINCE', 'PROTECT',
    'COACH', 'TRAIN', 'QUALIFY', 'DELIVER', 'RESTORE', 'REPAIR', 'LAUNCH', 'NAVIGATE', 'MEDIATE', 'MENTOR',
    'SYNCHRONIZE', 'CALIBRATE', 'SALVAGE', 'IMPROVISE', 'REDEPLOY', 'RECOVER', 'FACILITATE', 'STREAMLINE', 'HACK', 'PILOT'
  ],
  OBJECTIVE: [
    'A PEACE DEAL', 'A POWER GRID CRASH', 'A BROKEN QUANTUM NET', 'A CITY SUPPLY CRISIS',
    'A PANICKED SPACE COLONY', 'A FIRST-CONTACT SUMMIT', 'A BIODOME FOOD SHORTAGE', 'A BANKING CRASH',
    'A NANOTECH OUTBREAK', 'A SATELLITE BLACKOUT', 'A ROGUE WEATHER ARRAY', 'A DEEP-SEA LAB FAILURE',
    'A MULTIVERSE BREACH', 'A MEGA WILDFIRE', 'A SUPPLY CHAIN BREAKDOWN', 'A TRANSPORT GRIDLOCK',
    'A RELIC HEIST', 'A HOSTAGE STANDOFF', 'A SPECIES ESCAPE', 'A LOST MEMORY ARCHIVE',
    'A DRONE SWARM TAKEOVER', 'A GLOBAL CYBER PANIC', 'A FRACTURING ALLIANCE', 'A TIME-LOOP DISASTER',
    'A TRADE BLOCKADE', 'AN ARCTIC FACILITY FAILURE', 'AN ANCIENT CURSE', 'AN UNDERGROUND FLOOD',
    'AN AI COURT FAILURE', 'A DISINFORMATION WAVE', 'AN AUGMENTATION CRISIS',
    'A FLOATING CITY EVACUATION', 'A MARS TERRAFORMING FAILURE', 'A WARP-GATE COLLISION',
    'A PANDEMIC RESPONSE BREAKDOWN', 'A BOT-RUN FINANCIAL CRASH', 'A DIMENSIONAL POWER LOSS',
    'A WATER PURIFICATION FAILURE', 'A MEGACITY FOOD COLLAPSE', 'A MEDICAL DATA BREACH',
    'A CHAMPIONSHIP FINAL', 'A REGIONAL TOURNAMENT MELTDOWN', 'A STADIUM EVACUATION',
    'A COLLAPSED PUBLIC TRANSIT MORNING', 'A NATIONAL EXAM SECURITY BREACH', 'A SCHOOL DISTRICT NETWORK OUTAGE',
    'A HOSPITAL TRIAGE OVERFLOW', 'A CITYWIDE DELIVERY GRIDLOCK', 'A GLOBAL SHIPPING BACKLOG',
    'A FAILING COMMUNITY POWER CO-OP', 'A WATERFRONT CHEMICAL SPILL', 'A WILDLIFE CORRIDOR COLLAPSE',
    'A CROP BLIGHT CRISIS', 'A FISHERY STOCK CRASH', 'A NATIONAL PARK FIRE LINE',
    'A WORLD TOUR LOGISTICS FAILURE', 'A LIVE AWARDS SHOW TECH MELTDOWN', 'A STUDIO DATA VAULT LOCKOUT',
    'A STREAMING PLATFORM OUTAGE', 'A VIRAL MISINFO PANIC', 'A MUSEUM SECURITY LOCKDOWN',
    'A HISTORIC ARCHIVE RESCUE', 'A LABYRINTH RELAY RACE', 'A BLACKOUT MARATHON',
    'A DRONE RACING LEAGUE SABOTAGE', 'A COASTAL RESCUE CHAIN', 'A CIVIC TRUST COLLAPSE',
    'A TOWN HALL STANDOFF', 'A CEASEFIRE MONITORING FAILURE', 'A DIPLOMATIC GALA INCIDENT',
    'A SUPPLY DEPOT STAMPEDE', 'A CARGO PORT STRIKE', 'A CROSS-BORDER AID DEADLOCK',
    'A TRAIN SIGNAL CASCADE FAILURE', 'A MAJOR BRIDGE CLOSURE', 'AN AIR TRAFFIC CONFLICT WINDOW',
    'AN ENERGY RATIONING PANIC', 'AN URBAN HEATWAVE RESPONSE', 'AN ELDER CARE SERVICE BREAKDOWN'
  ],
  ARENA: [
    'A NEON MEGACITY', 'AN ORBITAL SHIPYARD', 'THE DEEP OCEAN', 'A FRACTURED DESERT REPUBLIC', 'A VOLCANIC ARCHIPELAGO',
    'AN ARCTIC SCIENCE RING', 'A POST-QUAKE METRO', 'A FLOATING SKYPORT NETWORK', 'A DIGITAL TWIN OF EARTH',
    'A MYTH-BOUND KINGDOM', 'A PARALLEL TIMELINE', 'AN UNDERGROUND CIVILIZATION', 'A JUNGLE BIO-RESERVE', 'A LUNAR MINING BELT',
    'AN INTERDIMENSIONAL CUSTOMS HUB', 'A REMOTE ISLAND CHAIN', 'A CIVIL WAR FRONTLINE', 'A VAST CAVE ECOSYSTEM',
    'A COLLAPSING SPACE ELEVATOR', 'A PLANET-SCALE DATA CENTER',
    'A PACKED DOWNTOWN STADIUM', 'A SUBURBAN SCHOOL DISTRICT', 'A COASTAL HARBOR CITY',
    'A RURAL FARM BELT', 'A HIGH-SPEED RAIL CORRIDOR', 'A FLOODED RIVER BASIN',
    'A DESERT SOLAR FIELD', 'A MOUNTAIN RESCUE TRAIL', 'A NIGHT MARKET DISTRICT',
    'AN ABANDONED INDUSTRIAL ZONE', 'A MEDIA BROADCAST CAMPUS', 'A TOURING FESTIVAL CIRCUIT',
    'A NATIONAL TRAINING COMPLEX', 'A COMMUNITY SPORTS LEAGUE', 'AN INTERNATIONAL AIR HUB',
    'A DENSE UNDERGROUND METRO GRID', 'A DISASTER RELIEF STAGING AREA', 'A BORDER CHECKPOINT WEB',
    'A COAST GUARD SEARCH GRID', 'A MOBILE FIELD HOSPITAL NETWORK', 'A REMOTE MINING TOWN',
    'A POLAR SUPPLY OUTPOST', 'A GIANT INDOOR ARENA', 'AN ESPORTS PRODUCTION STAGE',
    'A CITY HOSPITAL CLUSTER', 'A BUSY FREIGHT TERMINAL', 'A UNIVERSITY RESEARCH CAMPUS',
    'A LIBRARY ARCHIVE COMPLEX', 'A MIXED REALITY SIMULATION PARK', 'A TOURIST ISLAND CIRCUIT'
  ],
  RESOURCE: [
    'SALVAGED PARTS ONLY', 'A CIVILIAN TEAM', 'OLD BLUEPRINTS', 'A FRAGILE ALLIANCE', 'LIMITED COMMS',
    'NO CENTRAL COMMAND', 'PARTIAL SATELLITE COVERAGE', 'AN INCOMPLETE MAP', 'THREE EXPERTS AND A PROTOTYPE',
    'ONE WORKING REACTOR', 'A SHAKY PEACE TREATY', 'ONE TRANSLATION DEVICE', 'AI BLACK-BOX LOGS',
    'A MOBILE LAB', 'SCATTERED INFORMANTS', 'LEGACY INFRASTRUCTURE', 'A SMALL RESCUE FLEET',
    'LOCAL KNOWLEDGE ONLY', 'A TIGHT ENERGY BUDGET', 'PATCHY SENSOR DATA',
    'VOLUNTEERS ONLY', 'A STUDENT CREW', 'ONE MAINTENANCE VAN', 'A SINGLE DRONE TEAM',
    'A LOCKED TOOL CRIB', 'PAPER RECORDS ONLY', 'OUTDATED RADIO RELAYS', 'A SHARED MAKERSPACE',
    'DONATED EQUIPMENT', 'A PART-TIME STAFF ROSTER', 'A SMALL LOCAL BUDGET',
    'ONE PRACTICE WINDOW', 'A CROWDSOURCED MAP', 'A BORROWED SERVER RACK',
    'AN EMERGENCY HOTLINE', 'A MOBILE COMMAND TRAILER', 'A FRAGMENTED DATASET',
    'A MIX OF ANALOG AND DIGITAL TOOLS', 'A SKELETON CREW', 'ONE SPARE BATTERY BANK'
  ],
  OPPOSITION: [
    'A ROGUE AI GROUP', 'PIRATE FLEETS', 'A CORPORATE CARTEL', 'A REALITY CULT',
    'A DRONE SWARM', 'A PARASITIC INFO NET', 'BIOENGINEERED PREDATORS',
    'HOSTILE KINGDOMS', 'A FRACTURED MILITARY COALITION', 'TIME-DISPLACED MERCENARIES',
    'A CYBER MILITIA', 'SELF-REPLICATING MACHINES', 'A TITAN-CLASS THREAT',
    'SMUGGLER STATES', 'A POLITICAL DEADLOCK', 'SABOTEUR SCIENTISTS',
    'A CHEATING LEAGUE SYNDICATE', 'A BLACK-MARKET SCALPER RING', 'A DISINFO INFLUENCER SWARM',
    'A CORRUPT PROCUREMENT BOARD', 'A PREDATORY LENDER NETWORK', 'A RIVAL STARTUP BLOC',
    'A TROLL FARM', 'A BOTNED PROPAGANDA CELL', 'A LOCKED-BRIEFCASE BUREAUCRACY',
    'A PREDATORY MONOPOLY PLATFORM', 'A CRASHED INSURANCE MARKET', 'A HOSTILE MEDIA CYCLE',
    'A PANICKED CROWD DYNAMIC', 'COMPETING RESPONSE TEAMS', 'A FRACTURED UNION FRONT',
    'A COORDINATED HACKTIVIST CELL'
  ],
  DEADLINE: [
    'SUNRISE', 'THE NEXT ORBITAL PASS', 'THE END OF 12 HOURS', 'THE LAST EVAC SHUTTLE',
    'THE POINT OF NO RETURN', 'THE NEXT TIDAL SURGE', 'A PLANETARY COMMS RESET', 'SAFETY BUFFER COLLAPSE',
    'MARKET OPEN PANIC', 'CEASEFIRE EXPIRATION', 'FINAL TIMELINE CHECKPOINT', 'THE NEXT VOLCANIC EVENT',
    'THE CHAMPIONSHIP KICKOFF', 'THE MORNING COMMUTE PEAK', 'THE EVENING NEWS CYCLE',
    'THE NEXT STORM CELL LANDFALL', 'THE SCHOOL DAY START BELL', 'THE SUPPLY SHIP CUT-OFF',
    'A COURT-ORDERED COMPLIANCE WINDOW', 'THE FINAL QUALIFIER ROUND', 'THE MEDICAL COLD-CHAIN LIMIT',
    'THE LAST CLEAN WEATHER WINDOW', 'THE LAST TRAIN DEPARTURE', 'THE NEXT TIDE REVERSAL'
  ],
  COMPLICATION: [
    'PUBLIC TRUST IS DROPPING', 'COMMAND CHAIN IS MISSING', 'SOURCES CONFLICT',
    'EVERY DECISION HURTS SOMEONE', 'WEATHER SHIFTS HOURLY', 'MAPS ARE OUTDATED',
    'RIVAL TEAMS INTERFERE', 'INFRASTRUCTURE FAILS RANDOMLY', 'YOU MUST KEEP CASUALTIES AT ZERO',
    'MEDIA FEED IS COMPROMISED', 'THE PROBLEM CHANGES LIVE', 'SUCCESS NEEDS ENEMY COOPERATION',
    'MORALE DROPS EACH HOUR', 'NONSTOP PUBLIC SCRUTINY', 'NO SAFE RETREAT PATH',
    'YOUR BEST PLAYER IS INJURED', 'HALF THE TEAM IS NEW TODAY', 'VOLUNTEERS KEEP ROTATING OUT',
    'YOU MUST STAY WITHIN LEAGUE RULES', 'NO ONE AGREES ON PRIORITIES', 'SUPPLY PRICES DOUBLE HOURLY',
    'RUMORS SPREAD FASTER THAN FACTS', 'THE VENUE CHANGES MID-OPERATION', 'TRANSPORT ROUTES CLOSE WITHOUT NOTICE',
    'YOU CANNOT CANCEL EXISTING COMMITMENTS', 'EVIDENCE IS LEGALLY CONTESTED',
    'YOU MUST KEEP BOTH SIDES SATISFIED', 'THREE CRISES SHARE THE SAME CREW',
    'YOUR METRICS ARE PUBLIC IN REAL TIME', 'CRITICAL EQUIPMENT FAILS UNDER LOAD',
    'EVERY FIX CREATES A NEW BOTTLENECK', 'TEAMS SPEAK DIFFERENT PROCEDURES',
    'YOU MUST TRAIN ROOKIES WHILE EXECUTING', 'YOU CANNOT INTERRUPT ESSENTIAL SERVICES',
    'KEY STAKEHOLDERS DISTRUST EACH OTHER', 'FUNDING IS RELEASED IN SMALL PHASES'
  ]
};

const FINAL_TWIST_COMPONENTS = {
  PREFIX: [
    'WITH BURST POWER ONLY',
    'WHILE COMMS LAG 90 SECONDS',
    'UNDER LIVE GLOBAL BROADCAST',
    'WITH THE TEAM SPLIT ACROSS ZONES',
    'UNDER CONSTANT AFTERSHOCKS',
    'WHILE ACTION WINDOWS LAST 2 MINUTES',
    'WITH RULES CHANGING HOURLY',
    'WHILE SYSTEMS ARE PARTLY CORRUPTED',
    'UNDER A NON-LETHAL PROTOCOL',
    'WITH ONE SHARED POWER SOURCE',
    'WHILE GPS SIGNALS DRIFT',
    'WITH MANUAL TOOLS ONLY',
    'WHILE HALF THE CREW IS ROOKIES',
    'UNDER LEAGUE RULEBOOK OVERSIGHT',
    'WITH A HARD MEDIA EMBARGO',
    'WHILE CROWD NOISE BLOCKS COMMS',
    'UNDER A STRICT INJURY LIMIT',
    'WITH ONLY PUBLIC TRANSIT ACCESS',
    'WHILE WEATHER SHIFTS EVERY 15 MINUTES',
    'WITH YOUR BEST EXPERT OFFLINE',
    'UNDER INTERMITTENT ZERO VISIBILITY',
    'WHILE TRANSLATIONS DROP MEANING',
    'WITH SUPPLIES DEGRADING EACH PHASE',
    'WHILE KEY LOCATIONS SHIFT',
    'WITH ONLY ANALOG BACKUPS',
    'WHILE DRONE SUPPORT IS GROUNDED',
    'UNDER A TOTAL PRIVACY MANDATE',
    'WITH FUEL CAPPED PER PHASE',
    'WHILE EVERY MESSAGE IS DELAYED',
    'WITH A MOVING SAFE ZONE'
  ],
  MIDDLE: [
    'AND EVERY PLAN NEEDS AN EVAC ROUTE',
    'AND YOU CANNOT USE DIRECT FORCE',
    'AND YOU MUST HOLD A FRAGILE ALLIANCE',
    'AND EACH MOVE MUST BE AUDITABLE',
    'AND EACH FAILURE ADDS A SUB-CRISIS',
    'AND CONTROL PASSES EVERY 10 MINUTES',
    'AND HALF YOUR SENSOR FEED IS FAKE',
    'AND YOU CANNOT REUSE A STRATEGY',
    'AND CRITICAL TARGETS KEEP MOVING',
    'AND EACH SUCCESS UNLOCKS A HARDER STEP',
    'AND INSTRUCTIONS ARE LIMITED TO 5 WORDS',
    'AND YOUR BEST TOOL HAS A LONG COOLDOWN',
    'AND TEAM TIMELINES ARE DESYNCED',
    'AND EACH DECISION SHIFTS MARKET STABILITY',
    'AND YOU MUST PREVENT ALLY PANIC',
    'AND OPPONENTS LEARN YOUR LAST MOVE',
    'AND YOU MUST KEEP A PERFECT SAFETY RECORD',
    'AND YOU MAY NOT REPEAT ANY TEAM PAIRING',
    'AND ALL PUBLIC UPDATES MUST BE ACCURATE',
    'AND EVERY CHECKPOINT NEEDS LEGAL SIGN-OFF',
    'AND YOU MUST TRAIN NEWCOMERS MID-CRISIS',
    'AND YOU CAN ONLY ISSUE VISUAL SIGNALS',
    'AND EACH ZONE HAS DIFFERENT RULES',
    'AND YOU MUST SHARE RESOURCES WITH RIVALS',
    'AND YOU CAN ONLY MOVE IN FIXED WINDOWS',
    'AND ALL ROUTES REQUIRE CIVILIAN CLEARANCE',
    'AND YOU MUST ROTATE LEADERS EACH PHASE',
    'AND EVERY ACTION IS SCORED LIVE',
    'AND NO DECISION CAN BE REVERSED',
    'AND YOU MUST MAINTAIN PUBLIC MORALE ABOVE 60%'
  ],
  SUFFIX: [
    'BEFORE SUNRISE',
    'BEFORE THE LAST TRAIN LEAVES',
    'BEFORE THE CROWD TURNS HOSTILE',
    'WHILE THE CROWD VOTES ON PRIORITIES',
    'AS FUEL DROPS BELOW 10%',
    'WITH ONLY ANALOG BACKUPS',
    'BEFORE THE NEXT SOLAR STORM',
    'AS GRAVITY FLUCTUATES',
    'WHILE MICRO-RIFTS OPEN',
    'WHILE HISTORY STARTS UNDOING ITSELF',
    'AS LANGUAGE DRIFTS BY REGION',
    'WITH EVIDENCE TRAILS SELF-DELETING',
    'AS MORAL TRADEOFFS GET WORSE',
    'WITH EACH HOUR CUTTING YOUR RANGE',
    'AS ALLIES SPLIT INTO RIVALS',
    'WHILE A MYTHIC ANOMALY DISABLES MODERN TECH',
    'AS TIME DESYNC CREATES DUPLICATE THREATS',
    'WITH ONE EXTRACTION WINDOW LEFT',
    'AS A SECOND CRISIS IGNITES',
    'WHILE OPPOSITION ADAPTS TO EACH WIN',
    'AS THE FINANCIAL FLOOR REPRICES EVERY MINUTE',
    'WHILE A FALSE-FLAG OP FRAMES YOU',
    'AS SENSOR MAPS DRIFT OFF BY KILOMETERS',
    'WHILE TREATY TERMS CHANGE LIVE',
    'AS SUPPLY LINES FREEZE IN PLACE',
    'WHILE THE SAFE ZONE SHRINKS EACH HOUR',
    'AS STORM CELLS MIGRATE OFF FORECAST',
    'WHILE PARADOX ECHOES REPEAT FAILED MOVES',
    'AS REALITY REWRITES LOCAL PHYSICS',
    'WHILE EVERY VICTORY CREATES A NEW VULNERABILITY'
  ]
};

function randomFrom(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items[Math.floor(Math.random() * items.length)];
}

function fillTemplate(template, values) {
  return String(template || '').replace(/\{([A-Z_]+)\}/g, (_, key) => values[key] || '');
}

function normalizeScenarioText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/\s+\./g, '.')
    .trim()
    .toUpperCase();
}

const PROMPT_BREVITY_PROFILES = {
  scenario: { targetMaxWords: 8, hardMaxWords: 11 },
  twist: { targetMaxWords: 6, hardMaxWords: 8 },
  finalScenario: { targetMaxWords: 4, hardMaxWords: 4 },
  finalTwist: { targetMaxWords: 5, hardMaxWords: 5 }
};

const FINAL_SCENARIO_BREAK_TOKENS = /\b(?:ACROSS|BEFORE|WHILE|USING|AGAINST|IN|DURING|UNDER|THROUGH|VIA|WITH|AS)\b/;
const PROMPT_ARTICLES = new Set(['A', 'AN', 'THE']);
const PROMPT_WEAK_END_WORDS = new Set(['AND', 'OR', 'TO', 'FOR', 'WITH', 'IN', 'ON', 'AT', 'BY', 'OF', 'THE', 'A', 'AN', 'AS', 'IS', 'ARE', 'WAS', 'WERE', 'BE', 'BEEN', 'BEING']);
const TWIST_PREFIX_TOKENS = new Set(['WITH', 'WHILE', 'UNDER', 'AS', 'BEFORE']);

function trimTerminalGlueWords(text) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  while (words.length > 1 && PROMPT_WEAK_END_WORDS.has(words[words.length - 1])) {
    words.pop();
  }
  return words.join(' ');
}

function chooseIndefiniteArticle(nextWord) {
  if (!nextWord) return 'A';
  return /^[AEIOU]/.test(String(nextWord).toUpperCase()) ? 'AN' : 'A';
}

function compressFinalScenarioText(value, maxWords) {
  const normalized = normalizeScenarioText(value);
  if (!normalized) return '';

  const primarySegment = normalized.split('|')[0].trim();
  const preConstraint = primarySegment.split(FINAL_SCENARIO_BREAK_TOKENS)[0].trim();
  const source = preConstraint || primarySegment;
  const words = source.split(/\s+/).filter(Boolean);
  const safeMaxWords = Math.max(1, maxWords);
  if (words.length <= safeMaxWords) {
    return trimTerminalGlueWords(words.join(' '));
  }

  const action = words[0] || '';
  let objectiveWords = words.slice(1);
  let article = 'A';

  if (objectiveWords.length && PROMPT_ARTICLES.has(objectiveWords[0])) {
    article = objectiveWords.shift();
  }

  objectiveWords = objectiveWords.filter(Boolean);
  const objectiveBudget = Math.max(1, safeMaxWords - 2);
  const objectiveCore = objectiveWords.length > objectiveBudget
    ? objectiveWords.slice(-objectiveBudget)
    : objectiveWords;

  if (article === 'A' || article === 'AN') {
    article = chooseIndefiniteArticle(objectiveCore[0] || objectiveWords[0]);
  }

  const compactWords = [action, article, ...objectiveCore]
    .filter(Boolean)
    .slice(0, safeMaxWords);

  return trimTerminalGlueWords(compactWords.join(' '));
}

function compressFinalTwistText(value, maxWords) {
  const normalized = normalizeScenarioText(value);
  if (!normalized) return '';

  const primarySegment = normalized.split('|')[0].trim();
  const words = primarySegment.split(/\s+/).filter(Boolean);
  const safeMaxWords = Math.max(1, maxWords);
  if (words.length <= safeMaxWords) {
    return trimTerminalGlueWords(words.join(' '));
  }

  let compactWords = words.slice(0, safeMaxWords);
  if (TWIST_PREFIX_TOKENS.has(words[0])) {
    let tail = words.slice(1);
    if (tail.length > 1 && PROMPT_ARTICLES.has(tail[0])) {
      tail = tail.slice(1);
    }

    const tailBudget = Math.max(1, safeMaxWords - 1);
    const chosenTail = tail.slice(0, tailBudget);
    let nextTailIndex = tailBudget;

    while (chosenTail.length && PROMPT_WEAK_END_WORDS.has(chosenTail[chosenTail.length - 1])) {
      const replacement = tail[nextTailIndex];
      if (replacement) {
        chosenTail[chosenTail.length - 1] = replacement;
        nextTailIndex += 1;
      } else {
        chosenTail.pop();
      }
    }

    compactWords = [words[0], ...chosenTail].slice(0, safeMaxWords);
  }

  return trimTerminalGlueWords(compactWords.join(' '));
}

function countWords(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function applyPromptBrevity(value, profileKey = 'scenario') {
  const profile = PROMPT_BREVITY_PROFILES[profileKey] || PROMPT_BREVITY_PROFILES.scenario;
  const targetMaxWords = Math.max(1, Number(profile.targetMaxWords) || 1);
  const hardMaxWords = Math.max(targetMaxWords, Number(profile.hardMaxWords) || targetMaxWords);

  let normalized = normalizeScenarioText(value);
  if (!normalized) return '';

  if (profileKey === 'finalScenario') {
    return compressFinalScenarioText(normalized, hardMaxWords);
  }

  if (profileKey === 'finalTwist') {
    return compressFinalTwistText(normalized, hardMaxWords);
  }

  const segments = normalized.split('|').map(segment => segment.trim()).filter(Boolean);
  if (segments.length > 1) {
    const kept = [];
    let usedWords = 0;

    for (const segment of segments) {
      const segmentWords = countWords(segment);
      if (!segmentWords) continue;

      if (usedWords + segmentWords <= hardMaxWords || kept.length === 0) {
        kept.push(segment);
        usedWords += segmentWords;
      } else {
        break;
      }

      if (usedWords >= targetMaxWords) break;
    }

    normalized = kept.join(' | ');
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > hardMaxWords) {
    normalized = words.slice(0, hardMaxWords).join(' ');
  }

  return normalized;
}

function getPackFinalScenarioPool(packRuntime) {
  const pack = normalizePackRuntime(packRuntime);
  if (!pack || !pack.gameplay || !pack.gameplay.final) return [];
  const pool = pack.gameplay.final.scenarioPool;
  return Array.isArray(pool) ? pool.slice() : [];
}

function getPackFinalTwistPool(packRuntime, difficulty = 'normal') {
  const pack = normalizePackRuntime(packRuntime);
  if (!pack || !pack.gameplay || !pack.gameplay.final || !pack.gameplay.final.twistPool) return [];
  const twists = pack.gameplay.final.twistPool[difficulty];
  return Array.isArray(twists) ? twists.slice() : [];
}

function generateFinalScenario(difficulty = 'normal', packRuntime = null, theme = 'all') {
  const safeDifficulty = normalizeDifficulty(difficulty);
  const safeTheme = String(theme || 'all').toLowerCase();
  const packScenarioPool = getPackFinalScenarioPool(packRuntime);
  const usePackChance = safeTheme !== 'all' ? 0.58 : 0.72;
  if (packScenarioPool.length && Math.random() < usePackChance) {
    return applyPromptBrevity(randomFrom(packScenarioPool), 'finalScenario');
  }

  if (safeTheme !== 'all') {
    const themedSeed = generateScenarioFromTheme(safeTheme, packRuntime);
    const thematicFinalWrap = {
      easy: 'WIN THE FINAL BY',
      normal: 'SECURE THE FINAL BY',
      hard: 'SURVIVE THE FINAL BY'
    };
    const wrapped = `${thematicFinalWrap[safeDifficulty] || thematicFinalWrap.normal} ${String(themedSeed.scenario || '').toUpperCase()}`;
    return applyPromptBrevity(wrapped, 'finalScenario');
  }

  const patternWeights = safeDifficulty === 'hard'
    ? FINAL_SCENARIO_PATTERNS
    : safeDifficulty === 'easy'
      ? FINAL_SCENARIO_PATTERNS.slice(0, 6)
      : FINAL_SCENARIO_PATTERNS.slice(0, 7);

  const chosenPattern = randomFrom(patternWeights);
  const values = {};
  Object.entries(FINAL_SCENARIO_COMPONENTS).forEach(([key, pool]) => {
    values[key] = randomFrom(pool);
  });

  if (safeDifficulty === 'easy') {
    values.COMPLICATION = randomFrom(FINAL_SCENARIO_COMPONENTS.COMPLICATION.slice(0, 8));
    values.OPPOSITION = randomFrom(FINAL_SCENARIO_COMPONENTS.OPPOSITION.slice(0, 10));
  } else if (safeDifficulty === 'hard') {
    values.DEADLINE = randomFrom(FINAL_SCENARIO_COMPONENTS.DEADLINE.slice(4));
    values.COMPLICATION = randomFrom(FINAL_SCENARIO_COMPONENTS.COMPLICATION.slice(6));
    values.OPPOSITION = randomFrom(FINAL_SCENARIO_COMPONENTS.OPPOSITION.slice(6));
  }

  return applyPromptBrevity(fillTemplate(chosenPattern, values), 'finalScenario');
}

function generateFinalTwist(difficulty = 'normal', scenarioText = '', packRuntime = null, theme = 'all') {
  const safeDifficulty = normalizeDifficulty(difficulty);
  const safeTheme = String(theme || 'all').toLowerCase();
  const packTwists = getPackFinalTwistPool(packRuntime, safeDifficulty);
  const themedTwists = getThemeTwistAdds(safeTheme, safeDifficulty);
  const curatedPool = Array.from(new Set([...packTwists, ...themedTwists]));
  if (curatedPool.length && Math.random() < 0.72) {
    return applyPromptBrevity(randomFrom(curatedPool), 'finalTwist');
  }

  const dynamic = composeDynamicTwist({
    difficulty: safeDifficulty,
    scenarioText: [String(scenarioText || ''), safeTheme].filter(Boolean).join(' ')
  });

  const fallbackPool = [
    dynamic,
    randomFrom(TWIST_DIFFICULTY_CLAUSES[safeDifficulty] || []),
    randomFrom(FINAL_TWIST_COMPONENTS.PREFIX || [])
  ].filter(Boolean);

  return applyPromptBrevity(randomFrom(fallbackPool) || 'NO RULE BREAKERS', 'finalTwist');
}

function generateFinalScenarioAndTwist(difficulty = 'normal', packRuntime = null, theme = 'all') {
  const scenario = generateFinalScenario(difficulty, packRuntime, theme);
  return {
    scenario,
    twist: generateFinalTwist(difficulty, scenario, packRuntime, theme)
  };
}

const rooms = {};
const voteTimeouts = {};

Object.assign(rooms, loadRoomsSnapshot());
Object.values(rooms).forEach((room) => {
  if (!room || typeof room !== 'object') return;
  room.settings = buildDefaultRoomSettings(room.settings || {});
  room.categoryHistory = Array.isArray(room.categoryHistory) ? room.categoryHistory.slice(-16) : [];
});

function markRoomsDirty() {
  queueRoomsSnapshot(rooms);
}

function shouldUseEvalPrecompute() {
  const flag = String(process.env.EVAL_PRECOMPUTE || '').trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(flag)) return false;
  if (['1', 'true', 'on', 'yes'].includes(flag)) return true;
  const mode = getEvaluationEngineMode();
  return mode === 'context' || mode === 'context_shadow';
}

function ensureEvalPrecomputeStore(game) {
  if (!game || typeof game !== 'object') return null;
  if (!game.evalPrecompute || typeof game.evalPrecompute !== 'object') {
    game.evalPrecompute = { rounds: {}, round4: null };
  }
  if (!game.evalPrecompute.rounds || typeof game.evalPrecompute.rounds !== 'object') {
    game.evalPrecompute.rounds = {};
  }
  return game.evalPrecompute;
}

function buildRoundIntelSnapshot(game, roundIndex) {
  return {
    currentScenario: game.currentScenario,
    currentTwist: game.currentTwist,
    scenarios: Array.isArray(game.scenarios)
      ? game.scenarios.map((entry) => (entry && typeof entry === 'object' ? { ...entry } : entry))
      : [],
    players: Array.isArray(game.players)
      ? game.players.map((player) => ({
        name: player.name,
        team: Array.isArray(player.team) ? [...player.team] : []
      }))
      : [],
    draftEntries: (game.draftEntries && typeof game.draftEntries === 'object')
      ? Object.fromEntries(Object.entries(game.draftEntries).map(([name, entries]) => [
        name,
        Array.isArray(entries)
          ? entries.map((entry) => (entry && typeof entry === 'object' ? { ...entry } : entry))
          : []
      ]))
      : {},
    lockedCategory: game && game.lockedCategory && typeof game.lockedCategory === 'object'
      ? { ...game.lockedCategory }
      : null,
    settings: game && game.settings && typeof game.settings === 'object'
      ? { ...game.settings }
      : {},
    __snapshotMeta: {
      type: 'round_intel',
      roundIndex,
      gameId: game.id,
      createdAtMs: Date.now()
    }
  };
}

function buildRound4Snapshot(game) {
  const pendingFinal = game && game.pendingFinalRound && typeof game.pendingFinalRound === 'object'
    ? game.pendingFinalRound
    : null;
  return {
    currentScenario: pendingFinal && pendingFinal.scenario ? pendingFinal.scenario : game.currentScenario,
    currentTwist: pendingFinal && pendingFinal.twist ? pendingFinal.twist : game.currentTwist,
    players: Array.isArray(game.players)
      ? game.players.map((player) => ({
        name: player.name,
        finalTeam: Array.isArray(player.finalTeam) ? [...player.finalTeam] : [],
        finalTeamDraftMeta: Array.isArray(player.finalTeamDraftMeta)
          ? player.finalTeamDraftMeta.map((entry) => (entry && typeof entry === 'object' ? { ...entry } : entry))
          : []
      }))
      : [],
    results: Array.isArray(game && game.results)
      ? game.results.map((round) => ({
        teamEvaluation: round && round.teamEvaluation && typeof round.teamEvaluation === 'object'
          ? JSON.parse(JSON.stringify(round.teamEvaluation))
          : {}
      }))
      : [],
    lockedCategory: game && game.lockedCategory && typeof game.lockedCategory === 'object'
      ? { ...game.lockedCategory }
      : null,
    settings: game && game.settings && typeof game.settings === 'object'
      ? { ...game.settings }
      : {},
    __snapshotMeta: {
      type: 'round4_eval',
      gameId: game.id,
      createdAtMs: Date.now()
    }
  };
}

function startRoundIntelPrecompute(roomCode, game) {
  if (!shouldUseEvalPrecompute()) return;
  if (!game || !Array.isArray(game.players)) return;
  const roundIndex = Number(game.currentRound) || 0;
  const store = ensureEvalPrecomputeStore(game);
  if (!store) return;
  const existing = store.rounds[roundIndex];
  if (existing && (existing.promise || existing.result)) return;

  const snapshot = buildRoundIntelSnapshot(game, roundIndex);
  const startedAt = Date.now();
  const task = evaluateRoundFromGame(snapshot, roundIndex)
    .then((result) => {
      const current = ensureEvalPrecomputeStore(game);
      if (!current) return result;
      current.rounds[roundIndex] = {
        status: 'ready',
        startedAt,
        finishedAt: Date.now(),
        result
      };
      console.log(`[Eval precompute] Round ${roundIndex + 1} intel ready for room ${roomCode} in ${Date.now() - startedAt}ms`);
      return result;
    })
    .catch((error) => {
      const current = ensureEvalPrecomputeStore(game);
      if (current) {
        current.rounds[roundIndex] = {
          status: 'failed',
          startedAt,
          finishedAt: Date.now(),
          error: error && error.message ? error.message : 'unknown error'
        };
      }
      console.warn(`[Eval precompute] Round ${roundIndex + 1} intel failed for room ${roomCode}: ${error && error.message ? error.message : 'unknown error'}`);
      throw error;
    });

  store.rounds[roundIndex] = {
    status: 'running',
    startedAt,
    promise: task
  };
  console.log(`[Eval precompute] Started round ${roundIndex + 1} intel for room ${roomCode}`);
}

function preseedRoundContextCache(roomCode, game) {
  if (!EVAL_PRESEED_ENABLED) return Promise.resolve({ scheduled: 0, completed: 0, disabled: true });
  if (!game || !Array.isArray(game.players)) return Promise.resolve({ scheduled: 0, completed: 0 });
  const mode = getEvaluationEngineMode();
  if (mode !== 'context' && mode !== 'context_shadow') return Promise.resolve({ scheduled: 0, completed: 0 });

  const scenario = String(game.currentScenario || '').trim();
  const twist = String(game.currentTwist || 'NO PLOT TWIST').trim();
  if (!scenario) return Promise.resolve({ scheduled: 0, completed: 0 });
  const roundIndex = Number(game.currentRound) || 0;
  const roundPool = game.players.flatMap((player) => (
    Array.isArray(player && player.team) ? player.team.slice(0, 2).filter(Boolean) : []
  ));
  const categoryContext = game && game.lockedCategory && game.lockedCategory.id
    ? {
      enabled: true,
      id: String(game.lockedCategory.id),
      name: String(game.lockedCategory.displayName || game.lockedCategory.id),
      family: String(game.lockedCategory.family || 'unknown'),
      version: String(game && game.settings && game.settings.categoryVersion || game.lockedCategory.version || 'v1')
    }
    : null;
  const concurrency = Math.max(1, Math.min(4, Number(process.env.EVAL_PRESEED_CONCURRENCY) || 1));
  const jobs = [];

  for (const player of game.players) {
    const roster = Array.isArray(player && player.team) ? player.team.slice(0, 2).filter(Boolean) : [];
    const draftMeta = Array.isArray(game.draftEntries && game.draftEntries[player.name]) ? game.draftEntries[player.name] : [];
    for (const character of roster) {
      const draftedMeta = draftMeta.find((entry) => (
        entry && entry.character && String(entry.character).toLowerCase() === String(character).toLowerCase()
      )) || null;
      jobs.push(async () => {
        try {
          const result = await warmCharacterEvaluationCaches(character, scenario, twist, {
            precomputeContext: true,
            evaluationMode: 'round',
            categoryContext,
            fastRoundMode: true,
            roundQualityPass: false,
            roundResolveTimeoutMs: Math.max(450, Number(process.env.ROUND_FAST_RESOLVE_TIMEOUT_MS) || 900),
            roundAliasOverrideTimeoutMs: Math.max(250, Number(process.env.ROUND_FAST_ALIAS_TIMEOUT_MS) || 380),
            skipImageEnrichment: true,
            skipImageBackfill: true,
            skipSyntheticImageUpgrade: true,
            skipExternalFactEnrichment: true,
            originalScenario: draftedMeta && draftedMeta.originalScenario ? draftedMeta.originalScenario : scenario,
            originalTwist: draftedMeta && draftedMeta.originalTwist ? draftedMeta.originalTwist : twist,
            roundPool,
            teamPool: roster,
            fetchContext: {
              scenario,
              twist,
              originalScenario: draftedMeta && draftedMeta.originalScenario ? draftedMeta.originalScenario : scenario,
              originalTwist: draftedMeta && draftedMeta.originalTwist ? draftedMeta.originalTwist : twist,
              draftedRound: roundIndex + 1
            }
          });
          if (process.env.EVAL_WARMUP_VERBOSE === '1' && result && result.contextPreseeded) {
            console.log(`[Eval warmup] ${character} context-preseeded`);
          }
          return result;
        } catch (error) {
          return null;
        }
      });
    }
  }

  if (!jobs.length) return Promise.resolve({ scheduled: 0, completed: 0 });

  return (async () => {
    let cursor = 0;
    const settled = [];
    async function worker() {
      while (cursor < jobs.length) {
        const idx = cursor;
        cursor += 1;
        settled[idx] = await jobs[idx]();
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
    const completed = settled.reduce((count, item) => count + (item && item.contextPreseeded ? 1 : 0), 0);
    return { scheduled: jobs.length, completed };
  })();
}

function startRound4Precompute(roomCode, game) {
  if (!shouldUseEvalPrecompute()) return;
  if (!game || !Array.isArray(game.players)) return;
  const store = ensureEvalPrecomputeStore(game);
  if (!store) return;
  if (store.round4 && (store.round4.promise || store.round4.result)) return;

  const snapshot = buildRound4Snapshot(game);
  const startedAt = Date.now();
  const task = evaluateRound4FromGame(snapshot)
    .then((result) => {
      const current = ensureEvalPrecomputeStore(game);
      if (!current) return result;
      current.round4 = {
        status: 'ready',
        startedAt,
        finishedAt: Date.now(),
        result
      };
      console.log(`[Eval precompute] Round 4 eval ready for room ${roomCode} in ${Date.now() - startedAt}ms`);
      return result;
    })
    .catch((error) => {
      const current = ensureEvalPrecomputeStore(game);
      if (current) {
        current.round4 = {
          status: 'failed',
          startedAt,
          finishedAt: Date.now(),
          error: error && error.message ? error.message : 'unknown error'
        };
      }
      console.warn(`[Eval precompute] Round 4 eval failed for room ${roomCode}: ${error && error.message ? error.message : 'unknown error'}`);
      throw error;
    });

  store.round4 = {
    status: 'running',
    startedAt,
    promise: task
  };
  console.log(`[Eval precompute] Started round 4 eval for room ${roomCode}`);
}

function prepareFinalRoundState(game, roomCode) {
  if (!game || !Array.isArray(game.players)) return null;

  const hasPreparedTeams = game.players.every((player) =>
    Array.isArray(player.finalTeam)
    && player.finalTeam.filter((entry) => normalizeDraftCharacterLabel(entry)).length >= 6
    && Array.isArray(player.finalTeamDraftMeta)
    && player.finalTeamDraftMeta.length >= 6
  );

  if (!hasPreparedTeams) {
    game.players.forEach((p) => {
      p.finalTeam = [];
      p.finalTeamDraftMeta = [];
      for (let i = 0; i < 3; i += 1) {
        if (game.results[i] && game.results[i].playerTeams && game.results[i].playerTeams[p.name]) {
          p.finalTeam.push(...game.results[i].playerTeams[p.name]);
        }
        if (game.results[i] && game.results[i].playerTeamDraftMeta && game.results[i].playerTeamDraftMeta[p.name]) {
          p.finalTeamDraftMeta.push(...game.results[i].playerTeamDraftMeta[p.name]);
        }
      }
    });
  }

  const finalIntegrity = ensureFinalRoundTeamsComplete(game);
  if (finalIntegrity.totalFilled > 0 && roomCode) {
    const detail = Object.entries(finalIntegrity.byPlayer)
      .map(([name, count]) => `${name}:${count}`)
      .join(', ');
    console.warn(`[Final prep] Auto-filled ${finalIntegrity.totalFilled} missing final slot(s) (${detail || 'n/a'})`);
  }

  if (!game.pendingFinalRound || !game.pendingFinalRound.scenario || !game.pendingFinalRound.twist) {
    const difficulty = game.settings && game.settings.difficulty ? game.settings.difficulty : 'normal';
    const theme = game.settings && game.settings.scenarioTheme ? game.settings.scenarioTheme : 'all';
    const noFinalScenarioTwist = Boolean(game.settings && game.settings.noFinalScenarioTwist === true);
    const pack = resolveContentPack(game && game.packMeta && game.packMeta.id
      ? game.packMeta.id
      : (game.settings && game.settings.contentPackId));
    const finalConditions = noFinalScenarioTwist
      ? {
        scenario: 'NO FINAL SCENARIO',
        twist: 'NO PLOT TWIST'
      }
      : generateFinalScenarioAndTwist(difficulty, pack, theme);
    game.pendingFinalRound = {
      scenario: finalConditions.scenario,
      twist: finalConditions.twist,
      noFinalScenarioTwist,
      createdAtMs: Date.now()
    };
    if (roomCode) {
      console.log(`[Final prep] Seeded hidden round 4 scenario/twist for room ${roomCode}`);
    }
  }

  return game.pendingFinalRound;
}

function buildDefaultRoomSettings(source = {}) {
  const categorySettings = normalizeCategorySettings(source || {});
  return {
    difficulty: 'normal',
    scenarioTheme: 'all',
    plotTwists: true,
    noFinalScenarioTwist: false,
    maxPlayers: Math.min(6, Math.max(3, Number(source && source.maxPlayers) || 6)),
    customScenario: '',
    ...categorySettings,
    contentPackId: 'default'
  };
}

function getChangedRoomSettingKeys(previousSettings = {}, nextSettings = {}) {
  const keys = new Set([
    ...Object.keys(previousSettings || {}),
    ...Object.keys(nextSettings || {})
  ]);
  return Array.from(keys).filter((key) => {
    const before = previousSettings[key];
    const after = nextSettings[key];
    if (typeof before === 'string' || typeof after === 'string') {
      return String(before || '').trim() !== String(after || '').trim();
    }
    return before !== after;
  });
}

function createRoom(roomCode) {
  const room = {
    roomCode,
    players: [],
    gameState: null,
    isGameActive: false,
    host: null,
    voiceConfig: {
      narratorVoiceId: 'bm_george',
      updatedBy: '',
      updatedAt: 0
    },
    settings: buildDefaultRoomSettings(),
    categoryHistory: [],
    messages: [],
    reactions: {}
  };
  emitPartyTelemetryEvent('room_created', {
    roomCode,
    maxPlayers: Number(room.settings && room.settings.maxPlayers) || 6,
    categoriesMode: room.settings && room.settings.categoriesMode ? room.settings.categoriesMode : null
  });
  markRoomsDirty();
  return room;
}

function createGameInstance(roomCode, players, settings, recentCategoryIds = []) {
  const pack = resolveContentPack(settings && settings.contentPackId);
  const packMeta = getPublicPackMeta(pack.id);
  const normalizedCategorySettings = normalizeCategorySettings(settings || {});
  const categoryLock = lockCategoryForMatch(
    {
      ...settings,
      ...normalizedCategorySettings
    },
    {
      recentCategoryIds: Array.isArray(recentCategoryIds) ? recentCategoryIds : []
    }
  );
  const effectiveSettings = {
    ...(settings || {}),
    ...normalizedCategorySettings,
    ...(categoryLock && categoryLock.normalizedSettings ? categoryLock.normalizedSettings : {})
  };
  const theme = effectiveSettings.scenarioTheme || 'all';
  const difficulty = effectiveSettings.difficulty || 'normal';
  const scenarios = generateScenarios(3, theme, difficulty, pack);

  if (effectiveSettings.customScenario && effectiveSettings.customScenario.trim()) {
    const customIndex = Math.floor(Math.random() * scenarios.length);
    const customScenario = applyPromptBrevity(effectiveSettings.customScenario.trim(), 'scenario');
    scenarios[customIndex] = {
      scenario: customScenario,
      twists: generateTwists(difficulty, 6, customScenario, pack, theme),
      category: 'custom'
    };
  }

  return {
    id: `game_${Date.now()}_${roomCode}`,
    roomCode,
    startedAtMs: Date.now(),
    players: players.map(p => ({
      id: p.id,
      name: p.name,
      isBot: false,
      team: [],
      teamAutoFilled: [],
      teamEditLocks: [],
      finalTeam: [],
      finalTeamDraftMeta: [],
      votes: 0,
      roundScores: [0, 0, 0, 0],
      totalScore: 0,
      draftLocked: false,
      draftLockTime: null,
      fastestDraftLockMs: null,
      voteLocked: false
    })),
    currentRound: 0,
    totalRounds: 3,
    scenarios,
    activePhase: 'PRE_ROUND',
    phaseStartTime: Date.now(),
    draftEntries: {},
    votes: {},
    voteLocks: {},
    currentScenario: '',
    currentTwist: '',
    results: [],
    settings: {
      ...effectiveSettings,
      contentPackId: pack.id
    },
    lockedCategory: categoryLock && categoryLock.lockedCategory ? { ...categoryLock.lockedCategory } : null,
    categorySelectionSource: categoryLock && categoryLock.selectionSource ? categoryLock.selectionSource : 'off',
    packMeta,
    roundStartTime: null,
    allCharactersDrafted: [],
    roundResolutionLocks: {},
    pendingFinalRound: null,
    evalPrecompute: {
      rounds: {},
      round4: null
    }
  };
}

function getDraftSeconds(settings) {
  const difficulty = (settings && settings.difficulty) || 'normal';
  if (difficulty === 'easy') return 60;
  if (difficulty === 'hard') return 35;
  return 45;
}

function getVoteSeconds(settings) {
  const difficulty = (settings && settings.difficulty) || 'normal';
  if (difficulty === 'easy') return 35;
  if (difficulty === 'hard') return 24;
  return 30;
}

function ensureRoundDraftTeamsFilled(game, {
  scenario = '',
  twist = 'NO PLOT TWIST',
  autoFillReason = 'draft_autofill_guard'
} = {}) {
  if (!game || !Array.isArray(game.players)) return { totalFilled: 0, byPlayer: {} };
  if (!game.draftEntries || typeof game.draftEntries !== 'object') game.draftEntries = {};
  if (!Array.isArray(game.allCharactersDrafted)) game.allCharactersDrafted = [];

  const used = buildUsedDraftCharacterSet(game);
  const byPlayer = {};
  let totalFilled = 0;
  const draftedAtMs = Math.max(0, Date.now() - (game.roundStartTime || Date.now()));

  game.players.forEach((player) => {
    if (!player) return;
    const playerName = String(player.name || '').trim();
    if (!playerName) return;
    if (!Array.isArray(player.team)) player.team = [];
    if (!Array.isArray(player.teamAutoFilled)) player.teamAutoFilled = [];
    if (!Array.isArray(player.teamEditLocks)) player.teamEditLocks = [];
    if (!Array.isArray(game.draftEntries[playerName])) game.draftEntries[playerName] = [];

    for (let slotIndex = 0; slotIndex < 2; slotIndex += 1) {
      const existing = normalizeDraftCharacterLabel(player.team[slotIndex]);
      if (existing) {
        const key = existing.toLowerCase();
        if (!used.has(key)) used.add(key);
        if (!game.allCharactersDrafted.some((entry) => normalizeDraftCharacterLabel(entry).toLowerCase() === key)) {
          game.allCharactersDrafted.push(existing);
        }
        continue;
      }

      const autoFill = takeUniqueAutoFillWord(used);
      const key = autoFill.toLowerCase();
      used.add(key);
      if (!game.allCharactersDrafted.some((entry) => normalizeDraftCharacterLabel(entry).toLowerCase() === key)) {
        game.allCharactersDrafted.push(autoFill);
      }

      player.team[slotIndex] = autoFill;
      player.teamAutoFilled[slotIndex] = true;
      player.teamEditLocks[slotIndex] = true;

      const existingMeta = game.draftEntries[playerName][slotIndex] && typeof game.draftEntries[playerName][slotIndex] === 'object'
        ? game.draftEntries[playerName][slotIndex]
        : {};
      game.draftEntries[playerName][slotIndex] = {
        ...existingMeta,
        character: autoFill,
        originalScenario: existingMeta.originalScenario || scenario || game.currentScenario || '',
        originalTwist: existingMeta.originalTwist || twist || game.currentTwist || 'NO PLOT TWIST',
        draftedRound: existingMeta.draftedRound || ((game.currentRound || 0) + 1),
        pickNumberInRound: slotIndex + 1,
        globalDraftOrder: existingMeta.globalDraftOrder || game.allCharactersDrafted.length,
        draftedAtMs: Number.isFinite(Number(existingMeta.draftedAtMs))
          ? Number(existingMeta.draftedAtMs)
          : draftedAtMs,
        draftedAtWallMs: Number(existingMeta.draftedAtWallMs) || Date.now(),
        updatedAtMs: Date.now(),
        autoFilled: true,
        editLocked: true,
        lockReason: 'auto_fill',
        autoFillReason,
        editCount: Math.max(0, Number(existingMeta.editCount) || 0)
      };

      totalFilled += 1;
      byPlayer[playerName] = (byPlayer[playerName] || 0) + 1;
    }
  });

  return { totalFilled, byPlayer };
}

function ensureFinalRoundTeamsComplete(game) {
  if (!game || !Array.isArray(game.players)) return { totalFilled: 0, byPlayer: {} };

  const used = new Set();
  game.players.forEach((player) => {
    const roster = Array.isArray(player && player.finalTeam) ? player.finalTeam : [];
    roster.forEach((entry) => {
      const clean = normalizeDraftCharacterLabel(entry);
      if (!clean) return;
      used.add(clean.toLowerCase());
    });
  });

  const byPlayer = {};
  let totalFilled = 0;

  game.players.forEach((player) => {
    if (!player) return;
    const playerName = String(player.name || '').trim();
    if (!Array.isArray(player.finalTeam)) player.finalTeam = [];
    if (!Array.isArray(player.finalTeamDraftMeta)) player.finalTeamDraftMeta = [];
    for (let slotIndex = 0; slotIndex < 6; slotIndex += 1) {
      const existing = normalizeDraftCharacterLabel(player.finalTeam[slotIndex]);
      if (existing) {
        used.add(existing.toLowerCase());
        continue;
      }
      const autoFill = takeUniqueAutoFillWord(used);
      used.add(autoFill.toLowerCase());
      player.finalTeam[slotIndex] = autoFill;

      const existingMeta = player.finalTeamDraftMeta[slotIndex] && typeof player.finalTeamDraftMeta[slotIndex] === 'object'
        ? player.finalTeamDraftMeta[slotIndex]
        : {};
      player.finalTeamDraftMeta[slotIndex] = {
        ...existingMeta,
        character: autoFill,
        originalScenario: existingMeta.originalScenario || 'AUTO-FILLED FINAL SLOT',
        originalTwist: existingMeta.originalTwist || 'AUTO-FILLED FINAL SLOT',
        draftedRound: existingMeta.draftedRound || 4,
        pickNumberInRound: Number.isFinite(Number(existingMeta.pickNumberInRound))
          ? Number(existingMeta.pickNumberInRound)
          : ((slotIndex % 2) + 1),
        globalDraftOrder: Number.isFinite(Number(existingMeta.globalDraftOrder))
          ? Number(existingMeta.globalDraftOrder)
          : (slotIndex + 1),
        draftedAtMs: Number.isFinite(Number(existingMeta.draftedAtMs))
          ? Number(existingMeta.draftedAtMs)
          : 0,
        draftedAtWallMs: Number(existingMeta.draftedAtWallMs) || Date.now(),
        updatedAtMs: Date.now(),
        autoFilled: true,
        editLocked: true,
        lockReason: 'final_autofill_guard',
        autoFillReason: 'final_team_integrity'
      };

      totalFilled += 1;
      if (playerName) byPlayer[playerName] = (byPlayer[playerName] || 0) + 1;
    }
  });

  return { totalFilled, byPlayer };
}

function getRoundPointConfig(totalPlayers) {
  const players = Math.max(3, Number(totalPlayers) || 3);
  return {
    fullTeamBonus: 16,
    voteShareScale: 12,
    winnerBonusBase: 24,
    winnerBonusPerPlayer: 2,
    runnerUpBonus: 9,
    tieBonusBase: 18,
    tieBonusPerPlayer: 2,
    noVotePenalty: Math.min(14, Math.max(6, Math.round(players * 1.8))),
    roundBaseCap: 88
  };
}

function calculateRoundBonuses(game, round) {
  const voteCount = {};
  game.players.forEach(p => {
    voteCount[p.name] = 0;
  });

  Object.values(game.votes).forEach(votedName => {
    if (voteCount.hasOwnProperty(votedName)) {
      voteCount[votedName]++;
    }
  });

  const sortedVotes = Object.entries(voteCount).sort((a, b) => b[1] - a[1]);
  const totalPlayers = game.players.length;
  const config = getRoundPointConfig(totalPlayers);
  const maxIncomingVotes = Math.max(1, totalPlayers - 1);

  const points = {};
  const bonuses = {};
  const pointBreakdown = {};

  game.players.forEach(p => {
    points[p.name] = 0;
    pointBreakdown[p.name] = [];

    const filledTeamCount = Array.isArray(p.team)
      ? p.team.filter((entry) => normalizeDraftCharacterLabel(entry)).length
      : 0;
    if (filledTeamCount === 2) {
      const hasAutoFilled = p.teamAutoFilled.some(filled => filled === true);
      if (!hasAutoFilled) {
        points[p.name] += config.fullTeamBonus;
        pointBreakdown[p.name].push(`Full Team (2 chars): +${config.fullTeamBonus}`);
      } else {
        pointBreakdown[p.name].push('Full Team (contains auto-filled): No bonus (had duplicate or empty)');
      }
    }

    const votesReceived = voteCount[p.name] || 0;
    if (votesReceived > 0) {
      const voteShareBonus = Math.round((votesReceived / maxIncomingVotes) * config.voteShareScale);
      points[p.name] += voteShareBonus;
      pointBreakdown[p.name].push(`Vote Share (${votesReceived}/${maxIncomingVotes}): +${voteShareBonus}`);
    }
  });

  const isTie = sortedVotes.length > 1 && sortedVotes[0][1] === sortedVotes[1][1] && sortedVotes[0][1] > 0;

  if (!isTie && sortedVotes.length > 0 && sortedVotes[0][1] > 0) {
    const winner = sortedVotes[0][0];
    const votesReceived = sortedVotes[0][1];

    const winBonus = config.winnerBonusBase + (totalPlayers * config.winnerBonusPerPlayer);
    points[winner] += winBonus;
    pointBreakdown[winner].push(`Most Votes (${votesReceived}): +${winBonus}`);

    if (sortedVotes.length > 1 && sortedVotes[1][1] > 0) {
      const runnerUpBonus = config.runnerUpBonus;
      points[sortedVotes[1][0]] += runnerUpBonus;
      pointBreakdown[sortedVotes[1][0]].push(`Runner-Up: +${runnerUpBonus}`);
    }
  } else if (isTie) {
    const tieBonus = config.tieBonusBase + (totalPlayers * config.tieBonusPerPlayer);
    const tiedPlayers = sortedVotes.filter(v => v[1] === sortedVotes[0][1]);

    tiedPlayers.forEach(([playerName]) => {
      points[playerName] += tieBonus;
      pointBreakdown[playerName].push(`Tied for Most Votes: +${tieBonus}`);
    });
  }

  const votingPlayers = new Set(Object.keys(game.votes));
  game.players.forEach(p => {
    if (!votingPlayers.has(p.name)) {
      const penalty = config.noVotePenalty;
      points[p.name] -= penalty;
      if (!pointBreakdown[p.name]) pointBreakdown[p.name] = [];
      pointBreakdown[p.name].push(`Didn't Vote: -${penalty}`);
    }
  });

  const roundNumber = round + 1;
  const roundWeight = getRoundWeight(roundNumber);

  game.players.forEach(p => {
    const rawBase = Math.max(0, points[p.name]);
    const baseEarned = Math.min(config.roundBaseCap, rawBase);
    const earned = scaleRoundPoints(baseEarned, roundNumber);
    points[p.name] = earned;
    p.roundScores[round] = earned;
    p.totalScore += earned;

    if (rawBase > config.roundBaseCap) {
      pointBreakdown[p.name].push(`Round Base Cap Applied: ${config.roundBaseCap}`);
    }

    if (baseEarned !== earned) {
      pointBreakdown[p.name].push(`Round ${roundNumber} Weight (x${roundWeight.toFixed(2)}): ${baseEarned} → ${earned}`);
    }
  });

  return { points, bonuses, voteCount, pointBreakdown };
}


function startGame(io, roomCode) {
  const room = rooms[roomCode];
  if (!room || room.players.length < 3) return;

  const readyCount = room.players.filter(p => p.ready).length;
  if (readyCount < 3 || readyCount !== room.players.length) return;

  room.isGameActive = true;
  room.gameState = createGameInstance(
    roomCode,
    room.players,
    room.settings,
    Array.isArray(room.categoryHistory) ? room.categoryHistory : []
  );
  room.settings = {
    ...room.settings,
    ...normalizeCategorySettings(room.settings || {}),
    contentPackId: room.gameState && room.gameState.packMeta ? room.gameState.packMeta.id : 'default'
  };
  if (room.gameState && room.gameState.lockedCategory && room.gameState.lockedCategory.id) {
    const nextHistory = [
      ...(Array.isArray(room.categoryHistory) ? room.categoryHistory : []),
      String(room.gameState.lockedCategory.id)
    ];
    room.categoryHistory = nextHistory.slice(-12);
  }
  recordPackMatchStart(room.settings.contentPackId);
  emitInitialGamePhaseTransition(roomCode, room.gameState);

  io.to(roomCode).emit('gameStarting', {
    totalRounds: 3,
    players: room.gameState.players.map(p => p.name),
    settings: room.settings,
    lockedCategory: room.gameState.lockedCategory || null,
    packMeta: room.gameState.packMeta || getPublicPackMeta(room.settings.contentPackId)
  });

  markRoomsDirty();
  setTimeout(() => startRound(io, roomCode), 3000);
}

async function startRound(io, roomCode) {
  if (!rooms[roomCode] || !rooms[roomCode].gameState) return;
  const game = rooms[roomCode].gameState;
  if (!game || game.currentRound >= game.totalRounds) {
    startFinalRound(io, roomCode);
    return;
  }

  setGamePhase(game, roomCode, 'PRE_ROUND');

  const categoryLabel = getLockedCategoryDisplayName(game.lockedCategory);
  if (categoryLabel) {
    await revealCategory(io, roomCode, { continueToRoundStart: true });
    return;
  }

  await emitRoundStartAndScheduleScenario(io, roomCode);
}

async function emitRoundStartAndScheduleScenario(io, roomCode) {
  const room = rooms[roomCode];
  const game = room && room.gameState;
  if (!game) return;

  const roundStartPayload = {
    roundNumber: game.currentRound + 1,
    totalRounds: game.totalRounds,
    voiceCues: buildRoundStartVoiceCues({
      roundNumber: game.currentRound + 1,
      isFinalRound: false
    })
  };
  await emitWithVoiceCuePrewarm(io, roomCode, 'roundStart', roundStartPayload, { timeoutMs: 1400 });

  markRoomsDirty();
  setTimeout(() => revealScenario(io, roomCode), 3000);
}

function getLockedCategoryDisplayName(lockedCategory = null) {
  if (!lockedCategory || typeof lockedCategory !== 'object') return '';
  const candidate = lockedCategory.displayName || lockedCategory.label || lockedCategory.name || lockedCategory.slug || '';
  return String(candidate || '').replace(/\s+/g, ' ').trim();
}

async function revealCategory(io, roomCode, { continueToRoundStart = false } = {}) {
  const room = rooms[roomCode];
  if (!room || !room.gameState) return;
  const game = room.gameState;
  const categoryLabel = getLockedCategoryDisplayName(game.lockedCategory);
  if (!categoryLabel) {
    if (continueToRoundStart) {
      await emitRoundStartAndScheduleScenario(io, roomCode);
      return;
    }
    revealScenario(io, roomCode);
    return;
  }

  setGamePhase(game, roomCode, 'CATEGORY_REVEAL');

  const payload = {
    roundNumber: game.currentRound + 1,
    lockedCategory: game.lockedCategory || null,
    categoryLabel,
    voiceCues: buildCategoryRevealVoiceCues({
      roundNumber: game.currentRound + 1,
      category: categoryLabel
    })
  };
  await emitWithVoiceCuePrewarm(io, roomCode, 'categoryRevealed', payload, { timeoutMs: 1600 });

  markRoomsDirty();
  if (continueToRoundStart) {
    setTimeout(() => emitRoundStartAndScheduleScenario(io, roomCode), 3000);
    return;
  }
  setTimeout(() => revealScenario(io, roomCode), 3000);
}

async function revealScenario(io, roomCode) {
  const room = rooms[roomCode];
  if (!room || !room.gameState) return;
  const game = room.gameState;
  setGamePhase(game, roomCode, 'DRAFT');
  game.roundStartTime = Date.now();
  game.draftEntries = {};
  game.votes = {};
  game.voteLocks = {};
  game.players.forEach(p => {
    p.team = [];
    p.teamAutoFilled = [];
    p.teamEditLocks = [];
    p.draftLocked = false;
    p.draftLockTime = null;
    p.voteLocked = false;
  });

  room.messages = [];

  const scenario = game.scenarios[game.currentRound];
  game.currentScenario = scenario.scenario;

  const draftSeconds = getDraftSeconds(game.settings);

  const wordSourceMeta = getActiveWordSourceMeta();
  const scenarioPayload = {
    scenario: scenario.scenario,
    draftTimeRemaining: draftSeconds,
    maxCharactersPerPlayer: 2,
    roundNumber: game.currentRound + 1,
    packMeta: game.packMeta || getPublicPackMeta(game && game.settings && game.settings.contentPackId),
    wordApiSource: wordSourceMeta.label,
    wordApiSourceKey: wordSourceMeta.key,
    wordApiSourceIndex: wordSourceMeta.index,
    wordApiSourceTotal: wordSourceMeta.total,
    lockedCategory: game.lockedCategory || null,
    voiceCues: buildScenarioVoiceCues({
      roundNumber: game.currentRound + 1,
      scenario: scenario.scenario
    })
  };
  await emitWithVoiceCuePrewarm(io, roomCode, 'scenarioRevealed', scenarioPayload, { timeoutMs: 1800 });

  game.draftTimeout = setTimeout(() => revealPlotTwist(io, roomCode), draftSeconds * 1000);
  markRoomsDirty();
}

async function revealPlotTwist(io, roomCode) {
  if (!rooms[roomCode] || !rooms[roomCode].gameState) return;
  const game = rooms[roomCode].gameState;
  const scenario = game.scenarios[game.currentRound];
  const plotTwistsEnabled = Boolean(game.settings && game.settings.plotTwists);
  if (!plotTwistsEnabled) {
    game.currentTwist = 'NO PLOT TWIST';
  } else {
    const difficulty = game.settings && game.settings.difficulty ? game.settings.difficulty : 'normal';
    const pack = resolveContentPack(game && game.packMeta && game.packMeta.id
      ? game.packMeta.id
      : (game.settings && game.settings.contentPackId));
    const generatedTwists = (Array.isArray(scenario && scenario.twists) && scenario.twists.length)
      ? scenario.twists
      : generateTwists(
        difficulty,
        6,
        game.currentScenario || (scenario && scenario.scenario) || '',
        pack,
        game.settings && game.settings.scenarioTheme ? game.settings.scenarioTheme : 'all'
      );
    game.currentTwist = generatedTwists[Math.floor(Math.random() * generatedTwists.length)] || 'NO RULE BREAKERS';
  }

  const autoFilled = ensureRoundDraftTeamsFilled(game, {
    scenario: game.currentScenario || (scenario && scenario.scenario) || '',
    twist: game.currentTwist || 'NO PLOT TWIST',
    autoFillReason: plotTwistsEnabled ? 'draft_timeout_before_twist' : 'draft_timeout_no_plot_twists'
  });
  if (autoFilled.totalFilled > 0) {
    const detail = Object.entries(autoFilled.byPlayer)
      .map(([name, count]) => `${name}:${count}`)
      .join(', ');
    console.log(`[Draft auto-fill] Filled ${autoFilled.totalFilled} slot(s) before voting/twist (${detail || 'n/a'})`);
  }

  if (!plotTwistsEnabled) {
    startVoting(io, roomCode);
    return;
  }

  setGamePhase(game, roomCode, 'TWIST');

  const twistPayload = {
    twist: game.currentTwist,
    scenario: game.currentScenario,
    lockedCategory: game.lockedCategory || null,
    packMeta: game.packMeta || getPublicPackMeta(game && game.settings && game.settings.contentPackId),
    currentTeams: game.players.map(p => ({
      name: p.name,
      team: p.team
    })),
    voiceCues: buildTwistVoiceCues({
      roundNumber: game.currentRound + 1,
      twist: game.currentTwist
    })
  };
  await emitWithVoiceCuePrewarm(io, roomCode, 'plotTwistRevealed', twistPayload, { timeoutMs: 1900 });

  const preseedHeadStartMs = Math.max(0, Math.min(2000, Number(process.env.EVAL_PRESEED_HEADSTART_MS) || 300));
  const preseedPromise = preseedRoundContextCache(roomCode, game);
  Promise.race([
    Promise.resolve(preseedPromise).catch(() => null),
    new Promise((resolve) => setTimeout(resolve, preseedHeadStartMs))
  ]).finally(() => {
    startRoundIntelPrecompute(roomCode, game);
  });

  markRoomsDirty();
  setTimeout(() => startVoting(io, roomCode), 3000);
}

function startVoting(io, roomCode) {
  if (!rooms[roomCode] || !rooms[roomCode].gameState) return;
  const game = rooms[roomCode].gameState;
  setGamePhase(game, roomCode, 'VOTING');
  game.votes = {};
  game.voteLocks = {};
  game.voteTallyStarted = false;
  game.roundResolutionLocks = game.roundResolutionLocks || {};
  game.roundResolutionLocks[game.currentRound] = false;

  const guardedFill = ensureRoundDraftTeamsFilled(game, {
    scenario: game.currentScenario || '',
    twist: game.currentTwist || 'NO PLOT TWIST',
    autoFillReason: 'voting_phase_guard'
  });
  if (guardedFill.totalFilled > 0) {
    const detail = Object.entries(guardedFill.byPlayer)
      .map(([name, count]) => `${name}:${count}`)
      .join(', ');
    console.warn(`[Draft guard] Auto-filled ${guardedFill.totalFilled} missing draft slot(s) before voting (${detail || 'n/a'})`);
  }

  const voteSeconds = getVoteSeconds(game.settings);
  const teamsDisplay = game.players.map(p => ({
    name: p.name,
    team: p.team,
    votes: 0
  }));

  io.to(roomCode).emit('votingPhaseStart', {
    teams: teamsDisplay,
    votingTimeRemaining: voteSeconds,
    scenario: game.currentScenario,
    twist: game.currentTwist,
    lockedCategory: game.lockedCategory || null,
    packMeta: game.packMeta || getPublicPackMeta(game && game.settings && game.settings.contentPackId),
    totalPlayers: game.players.length,
    roundNumber: game.currentRound + 1
  });

  startRoundIntelPrecompute(roomCode, game);

  const voteTimeout = setTimeout(() => {
    if (!rooms[roomCode] || !rooms[roomCode].gameState) return;
    const activeGame = rooms[roomCode].gameState;
    if (!activeGame || activeGame.activePhase !== 'VOTING' || activeGame.voteTallyStarted === true) return;

    const fetchQueue = {};
    activeGame.players.forEach((player) => {
      fetchQueue[player.name] = Array.isArray(player.team) ? [...player.team] : [];
    });

    activeGame.voteTallyStarted = true;
    io.to(roomCode).emit('voteTallying', {
      trigger: 'timer',
      settleDelayMs: 1200,
      fetchQueue
    });

    setTimeout(() => tallyResults(io, roomCode), 1200);
  }, voteSeconds * 1000);
  voteTimeouts[roomCode] = voteTimeout;
  markRoomsDirty();
}

async function startFinalRound(io, roomCode) {
  console.log(`🏁 Starting Round 4 for room ${roomCode}`);
  if (!rooms[roomCode] || !rooms[roomCode].gameState) return;
  const game = rooms[roomCode].gameState;
  setGamePhase(game, roomCode, 'AI_EVALUATION');
  game.round4InProgress = false;
  game.round4InProgressStartedAtMs = 0;
  game.round4Applied = false;
  game.round4Results = null;
  game.finalResultsReady = {};
  game.finalResultsEmitted = false;
  game.finalResultsGateStartedAtMs = 0;
  game.finalResultsFailSafeTimersArmed = false;

  const preparedFinal = prepareFinalRoundState(game, roomCode);

  game.players.forEach(p => {
    console.log(`👤 ${p.name}'s final team (${p.finalTeam.length} chars): ${p.finalTeam.join(', ')}`);
  });

  game.currentScenario = preparedFinal && preparedFinal.scenario ? preparedFinal.scenario : game.currentScenario;
  game.currentTwist = preparedFinal && preparedFinal.twist ? preparedFinal.twist : game.currentTwist;

  console.log(`🎯 Scenario: ${game.currentScenario}`);
  console.log(`🔄 Twist: ${game.currentTwist}`);

  startRound4Precompute(roomCode, game);

  const round4PrePayload = {
    roundNumber: 4,
    totalRounds: 4,
    isFinalRound: true,
    voiceCues: buildRoundStartVoiceCues({
      roundNumber: 4,
      isFinalRound: true,
      scenario: game.currentScenario,
      twist: game.currentTwist
    })
  };
  await emitWithVoiceCuePrewarm(io, roomCode, 'roundStart', round4PrePayload, { timeoutMs: 1600 });

  // Create finalTeams object with all players' rosters
  const finalTeams = {};
  game.players.forEach(p => {
    finalTeams[p.name] = p.finalTeam;
  });

  // Emit Round 4 start quickly so the Round 4 loading screen appears fast; evaluation/precompute continues in parallel.
  const round4StartLeadDelayMs = 850;
  setTimeout(async () => {
    console.log(`📡 Emitting round4Start event to room ${roomCode}`);
    console.log(
      `Round 4 Start Payload teams=${Object.keys(finalTeams).length}` +
      ` chars=${Object.values(finalTeams).reduce((sum, roster) => sum + (Array.isArray(roster) ? roster.length : 0), 0)}` +
      ` scenario="${game.currentScenario}" twist="${game.currentTwist}"`
    );
    const round4StartPayload = {
      scenario: game.currentScenario,
      twist: game.currentTwist,
      lockedCategory: game.lockedCategory || null,
      finalTeams,
      packMeta: game.packMeta || getPublicPackMeta(game && game.settings && game.settings.contentPackId),
      voiceCues: buildRound4StartVoiceCues({
        scenario: game.currentScenario,
        twist: game.currentTwist
      })
    };
    await emitWithVoiceCuePrewarm(io, roomCode, 'round4Start', round4StartPayload, { timeoutMs: 2200 });
  }, round4StartLeadDelayMs);
  markRoomsDirty();
}


// Helper function to determine round winner(s) and detect ties
function determineRoundWinner(points) {
  if (!points || Object.keys(points).length === 0) {
    return { winner: null, isTie: false, tiedPlayers: [] };
  }

  const sorted = Object.entries(points).sort((a, b) => b[1] - a[1]);
  const maxPoints = sorted[0][1];
  const tiedPlayers = sorted.filter(([_, pts]) => pts === maxPoints).map(([name, _]) => name);

  return {
    winner: tiedPlayers[0] || null,
    isTie: tiedPlayers.length > 1,
    tiedPlayers: tiedPlayers,
    maxPoints: maxPoints
  };
}

async function tallyResults(io, roomCode) {
  if (!rooms[roomCode] || !rooms[roomCode].gameState) return;
  const game = rooms[roomCode].gameState;
  const roundIndex = game.currentRound;
  game.roundResolutionLocks = game.roundResolutionLocks || {};
  if (game.roundResolutionLocks[roundIndex] === true) return;
  game.roundResolutionLocks[roundIndex] = true;

  try {
  const scenario = game.scenarios[game.currentRound];

  if (!game.results[game.currentRound]) {
    game.results[game.currentRound] = {};
  }
  game.results[game.currentRound].playerTeams = {};
  game.results[game.currentRound].playerTeamDraftMeta = {};
  game.players.forEach(p => {
    game.results[game.currentRound].playerTeams[p.name] = [...p.team];
    const meta = Array.isArray(game.draftEntries[p.name]) ? game.draftEntries[p.name] : [];
    game.results[game.currentRound].playerTeamDraftMeta[p.name] = meta.map(entry => ({ ...entry }));
  });

  const { points, bonuses, voteCount, pointBreakdown } = calculateRoundBonuses(game, game.currentRound);

  const totalFetches = game.players.reduce((acc, player) => {
    const roster = Array.isArray(player.team) ? player.team : [];
    return acc + Math.min(2, roster.length);
  }, 0);
  let completedFetches = 0;

  let roundIntel = null;
  try {
    const precomputeStore = ensureEvalPrecomputeStore(game);
    const precomputedRound = precomputeStore && precomputeStore.rounds ? precomputeStore.rounds[roundIndex] : null;

    if (precomputedRound && precomputedRound.result) {
      roundIntel = precomputedRound.result;
      completedFetches = Math.max(1, totalFetches);
      io.to(roomCode).emit('voteTallyProgress', {
        completed: completedFetches,
        total: Math.max(1, totalFetches),
        playerName: null,
        character: null,
        success: true,
        source: 'precomputed'
      });
      console.log(`[Eval precompute] Reused round ${roundIndex + 1} intel for room ${roomCode}`);
    } else if (precomputedRound && precomputedRound.promise) {
      let usedFallback = false;
      roundIntel = await Promise.race([
        precomputedRound.promise,
        new Promise((resolve) => setTimeout(() => resolve(null), EVAL_PRECOMPUTE_AWAIT_TIMEOUT_MS))
      ]);
      if (!roundIntel) {
        usedFallback = true;
        console.warn(
          `[Eval precompute] Round ${roundIndex + 1} precompute wait timeout for room ${roomCode} ` +
          `after ${EVAL_PRECOMPUTE_AWAIT_TIMEOUT_MS}ms; switching to direct evaluation`
        );
        roundIntel = await evaluateRoundFromGame(game, roundIndex, {
          onCharacterEvaluated: ({ playerName, character, success }) => {
            completedFetches += 1;
            io.to(roomCode).emit('voteTallyProgress', {
              completed: completedFetches,
              total: Math.max(1, totalFetches),
              playerName,
              character,
              success: success !== false,
              source: 'precomputed_timeout_fallback'
            });
          }
        });
      }
      completedFetches = Math.max(1, totalFetches);
      io.to(roomCode).emit('voteTallyProgress', {
        completed: completedFetches,
        total: Math.max(1, totalFetches),
        playerName: null,
        character: null,
        success: true,
        source: usedFallback ? 'precomputed_timeout_fallback' : 'precomputed_wait'
      });
      if (!usedFallback) {
        console.log(`[Eval precompute] Awaited in-flight round ${roundIndex + 1} intel for room ${roomCode}`);
      }
    } else {
      roundIntel = await evaluateRoundFromGame(game, roundIndex, {
        onCharacterEvaluated: ({ playerName, character, success }) => {
          completedFetches += 1;
          io.to(roomCode).emit('voteTallyProgress', {
            completed: completedFetches,
            total: Math.max(1, totalFetches),
            playerName,
            character,
            success: success !== false
          });
        }
      });
    }
  } catch (error) {
    console.error(`❌ Round ${roundIndex + 1} intel evaluation failed:`, error);
  }

  if (roundIntel && roundIntel.intelBonuses) {
    game.results[roundIndex].teamEvaluation = roundIntel.playerEvaluations || {};

    game.players.forEach((player) => {
      const bonus = Number(roundIntel.intelBonuses[player.name]) || 0;
      if (bonus !== 0) {
        points[player.name] = (points[player.name] || 0) + bonus;
      }

      const intelLines = Array.isArray(roundIntel.intelBreakdown && roundIntel.intelBreakdown[player.name])
        ? roundIntel.intelBreakdown[player.name]
        : [];
      intelLines.forEach((line) => pointBreakdown[player.name].push(line));
    });
  }

  setGamePhase(game, roomCode, 'RESULTS');

  const leaderboardData = [...game.players].sort((a, b) => b.totalScore - a.totalScore).map(p => ({
    name: p.name,
    score: p.totalScore,
    roundScore: points[p.name],
    breakdown: pointBreakdown[p.name]
  }));

  if (!game.results[game.currentRound]) game.results[game.currentRound] = {};
  
  // Use improved winner detection with tie support
  const winnerInfo = determineRoundWinner(points);
  game.results[game.currentRound].winner = winnerInfo.winner;
  game.results[game.currentRound].isTie = winnerInfo.isTie;
  game.results[game.currentRound].tiedPlayers = winnerInfo.tiedPlayers;
  game.results[game.currentRound].scenario = (scenario && scenario.scenario) ? scenario.scenario : game.currentScenario;
  game.results[game.currentRound].twist = game.currentTwist;
  game.results[game.currentRound].leaderboard = leaderboardData;

  io.to(roomCode).emit('roundResults', {
    winner: winnerInfo.winner,
    isTie: winnerInfo.isTie,
    tiedPlayers: winnerInfo.tiedPlayers,
    roundPoints: points,
    voteCount,
    leaderboard: leaderboardData,
    pointBreakdown,
    round: game.currentRound + 1,
    lockedCategory: game.lockedCategory || null,
    packMeta: game.packMeta || getPublicPackMeta(game && game.settings && game.settings.contentPackId),
    roundIntelSummary: roundIntel
      ? Object.entries(roundIntel.playerEvaluations || {}).reduce((acc, [name, data]) => {
        acc[name] = data && data.summary ? data.summary : null;
        return acc;
      }, {})
      : {},
    roundIntelDiagnostics: roundIntel
      ? Object.entries(roundIntel.playerEvaluations || {}).reduce((acc, [name, data]) => {
        const evaluations = Array.isArray(data && data.evaluations) ? data.evaluations : [];
        const engineModes = Array.from(new Set(
          evaluations
            .map((entry) => entry && entry.scoreMeta && entry.scoreMeta.evaluationEngineMode)
            .filter(Boolean)
            .map((value) => String(value))
        ));
        const engineNames = Array.from(new Set(
          evaluations
            .map((entry) => entry && entry.scoreMeta && entry.scoreMeta.evaluationEngine)
            .filter(Boolean)
            .map((value) => String(value))
        ));
        const trustedCount = evaluations.filter((entry) => entry && entry.scoreMeta && entry.scoreMeta.trustedInfo).length;
        const avgConfidence = evaluations.length
          ? Number((evaluations.reduce((sum, entry) => sum + (Number(entry && entry.scoreMeta && entry.scoreMeta.infoConfidence) || 0), 0) / evaluations.length).toFixed(3))
          : 0;
        const avgResolverConfidence = evaluations.length
          ? Number((evaluations.reduce((sum, entry) => sum + (Number(entry && entry.scoreMeta && entry.scoreMeta.resolverConfidence) || 0), 0) / evaluations.length).toFixed(3))
          : 0;
        const avgContextConfidence = evaluations.length
          ? Number((evaluations.reduce((sum, entry) => sum + (Number(entry && entry.scoreMeta && entry.scoreMeta.contextFitConfidence) || 0), 0) / evaluations.length).toFixed(3))
          : 0;
        const contextStatuses = Array.from(new Set(
          evaluations
            .map((entry) => entry && entry.scoreMeta && entry.scoreMeta.contextExplainability && entry.scoreMeta.contextExplainability.status)
            .filter(Boolean)
            .map((value) => String(value))
        ));
        const contextStatusLabels = Array.from(new Set(
          evaluations
            .map((entry) => entry && entry.scoreMeta && entry.scoreMeta.contextExplainability && entry.scoreMeta.contextExplainability.statusLabel)
            .filter(Boolean)
            .map((value) => String(value))
        ));
        const shadowStatuses = Array.from(new Set(
          evaluations
            .map((entry) => entry && entry.scoreMeta && entry.scoreMeta.contextShadow && entry.scoreMeta.contextShadow.status)
            .filter(Boolean)
            .map((value) => String(value))
        ));
        const riskCounts = evaluations.reduce((bucket, entry) => {
          const flags = Array.isArray(entry && entry.scoreMeta && entry.scoreMeta.contextSignals && entry.scoreMeta.contextSignals.riskFlags)
            ? entry.scoreMeta.contextSignals.riskFlags
            : [];
          flags.forEach((flag) => {
            const key = String(flag || 'unknown');
            bucket[key] = (bucket[key] || 0) + 1;
          });
          return bucket;
        }, {});
        const topRiskFlags = Object.entries(riskCounts)
          .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
          .slice(0, 4)
          .map(([flag, count]) => ({ flag, count }));
        acc[name] = {
          evaluationCount: evaluations.length,
          engineModes,
          engineNames,
          trustedCount,
          avgConfidence,
          avgResolverConfidence,
          avgContextConfidence,
          contextStatuses,
          contextStatusLabels,
          shadowStatuses,
          topRiskFlags
        };
        return acc;
      }, {})
      : {},
    voiceCues: []
  });

  emitPartyTelemetryEvent('round_completed', {
    roomCode,
    gameId: game.id || null,
    roundNumber: roundIndex + 1,
    playerCount: Array.isArray(game.players) ? game.players.length : 0,
    winner: winnerInfo.winner || null,
    isTie: winnerInfo.isTie === true,
    tiedCount: Array.isArray(winnerInfo.tiedPlayers) ? winnerInfo.tiedPlayers.length : 0,
    roundDurationMs: Number(game.roundStartTime) > 0 ? Math.max(0, Date.now() - Number(game.roundStartTime)) : null
  });

  if (roundIndex === ((Number(game.totalRounds) || 3) - 1)) {
    prepareFinalRoundState(game, roomCode);
    startRound4Precompute(roomCode, game);
  }

  game.players.forEach(p => p.voteLocked = false);
  game.resultsReady = {};
  } catch (error) {
    console.error(`❌ Failed to tally round ${roundIndex + 1} in room ${roomCode}:`, error);
  } finally {
    game.roundResolutionLocks[roundIndex] = false;
    markRoomsDirty();
  }
}


async function endGame(io, roomCode) {
  const room = rooms[roomCode];
  if (!room || !room.gameState) return;
  const game = room.gameState;
  const finalLeaderboard = [...game.players]
    .filter(p => !p.isBot)
    .sort((a, b) => b.totalScore - a.totalScore)
    .map(p => ({
      name: p.name,
      score: p.totalScore,
      breakdown: p.roundScores
    }));

  const winner = finalLeaderboard[0] || null;
  const finalRankByPlayer = new Map(finalLeaderboard.map((row, idx) => [row && row.name ? row.name : '', idx + 1]));
  const allTeamEvaluations = game.round4Results
    && game.round4Results.payload
    && game.round4Results.payload.allTeamEvaluations
    && typeof game.round4Results.payload.allTeamEvaluations === 'object'
    ? game.round4Results.payload.allTeamEvaluations
    : {};
  const winnerTeamData = winner
    && allTeamEvaluations[winner.name]
    ? allTeamEvaluations[winner.name]
    : null;

  const winnerEvaluations = winner
    && winnerTeamData
    && Array.isArray(winnerTeamData.evaluations)
    ? winnerTeamData.evaluations
    : [];
  const winnerPlayer = winner ? game.players.find((player) => player.name === winner.name) : null;
  const winnerDraftMeta = winnerPlayer && Array.isArray(winnerPlayer.finalTeamDraftMeta)
    ? winnerPlayer.finalTeamDraftMeta
    : [];

  const rarityWeights = {
    Bronze: 1,
    Silver: 2,
    Gold: 3,
    Rare: 4,
    Epic: 5,
    Legendary: 6,
    Icon: 7
  };

  const mvpEntry = winnerEvaluations.reduce((best, current) => {
    if (!best) return current;
    const bestOVR = Number(best.ovr) || 0;
    const currentOVR = Number(current.ovr) || 0;
    if (currentOVR > bestOVR) return current;
    if (currentOVR === bestOVR && (Number(current.score) || 0) > (Number(best.score) || 0)) return current;
    return best;
  }, null);

  const averageOVR = winnerEvaluations.length
    ? Math.round(winnerEvaluations.reduce((sum, entry) => sum + (Number(entry.ovr) || 0), 0) / winnerEvaluations.length)
    : 0;

  const rarityScore = winnerEvaluations.reduce((sum, entry) => {
    const rarity = entry && entry.rarity ? String(entry.rarity) : 'Bronze';
    return sum + (rarityWeights[rarity] || 1);
  }, 0);

  const rarePlusCount = winnerEvaluations.filter((entry) => {
    const rarity = entry && entry.rarity ? String(entry.rarity) : 'Bronze';
    return ['Rare', 'Epic', 'Legendary', 'Icon'].includes(rarity);
  }).length;

  const imageIntel = winnerEvaluations.filter((entry) => entry && entry.imageUrl).length;
  const winnerRound4Points = winner && game.round4Results && game.round4Results.roundPoints
    ? (game.round4Results.roundPoints[winner.name] || 0)
    : 0;

  const winnerTeamStats = {
    mvp: mvpEntry ? mvpEntry.character : 'N/A',
    mvpOVR: mvpEntry ? (Number(mvpEntry.ovr) || 0) : 0,
    averageOVR,
    teamOVR: winnerTeamData && winnerTeamData.teamSummary ? (Number(winnerTeamData.teamSummary.totalOVR) || averageOVR) : averageOVR,
    chemistryBonus: winnerTeamData && winnerTeamData.teamSummary ? (Number(winnerTeamData.teamSummary.chemistryBonus) || 0) : 0,
    round4Points: winnerRound4Points,
    rarityScore,
    rarePlusCount,
    imageIntel,
    picks: winnerEvaluations.length
  };

  function buildMetaMatcher(draftMetaList = []) {
    const safeList = Array.isArray(draftMetaList) ? draftMetaList : [];
    const used = new Set();
    return {
      takeFor(entry, fallbackIndex = 0) {
        const target = entry && entry.character ? String(entry.character).toLowerCase() : '';
        let matchedIndex = -1;
        for (let i = 0; i < safeList.length; i += 1) {
          const candidate = safeList[i];
          if (used.has(i)) continue;
          if (!candidate || !candidate.character) continue;
          if (String(candidate.character).toLowerCase() === target) {
            matchedIndex = i;
            break;
          }
        }
        if (matchedIndex >= 0) {
          used.add(matchedIndex);
          return safeList[matchedIndex];
        }
        if (safeList[fallbackIndex] && !used.has(fallbackIndex)) {
          used.add(fallbackIndex);
          return safeList[fallbackIndex];
        }
        return null;
      }
    };
  }

  function mapShowcaseEntry({
    entry,
    index,
    draftMeta,
    ownerName,
    ownerFinalRank,
    championName,
    eliteRank
  }) {
    const draftedRound = draftMeta && Number.isFinite(Number(draftMeta.draftedRound))
      ? Number(draftMeta.draftedRound)
      : Math.min(3, Math.floor(index / 2) + 1);
    const pickNumberInRound = draftMeta && Number.isFinite(Number(draftMeta.pickNumberInRound))
      ? Number(draftMeta.pickNumberInRound)
      : ((index % 2) + 1);
    const expectedAtDraft = Math.round(66 + ((4 - draftedRound) * 6) + ((3 - pickNumberInRound) * 3));
    const expectedNearEnd = Math.max(56, expectedAtDraft - 8);
    const currentOVR = Number(entry && entry.ovr) || 0;
    const scoreMeta = entry && entry.scoreMeta && typeof entry.scoreMeta === 'object' ? entry.scoreMeta : {};
    const explain = scoreMeta.contextExplainability && typeof scoreMeta.contextExplainability === 'object'
      ? scoreMeta.contextExplainability
      : null;
    const contextSignals = scoreMeta.contextSignals && typeof scoreMeta.contextSignals === 'object'
      ? scoreMeta.contextSignals
      : {};
    const categoryContext = scoreMeta.categoryContext && typeof scoreMeta.categoryContext === 'object'
      ? scoreMeta.categoryContext
      : (entry && entry.categoryContext && typeof entry.categoryContext === 'object' ? entry.categoryContext : null);
    const categoryStatus = categoryContext && categoryContext.categoryStatus
      ? String(categoryContext.categoryStatus)
      : (entry && entry.categoryStatus ? String(entry.categoryStatus) : 'not_in_category');
    const categoryStatusLabel = categoryContext && categoryContext.categoryStatusLabel
      ? String(categoryContext.categoryStatusLabel)
      : (entry && entry.categoryStatusLabel ? String(entry.categoryStatusLabel) : 'NOT IN CATEGORY');
    const categoryStatusTone = categoryContext && categoryContext.categoryStatusTone
      ? String(categoryContext.categoryStatusTone)
      : (entry && entry.categoryStatusTone ? String(entry.categoryStatusTone) : 'negative');
    const categoryStatusIcon = categoryContext && categoryContext.categoryStatusIcon
      ? String(categoryContext.categoryStatusIcon)
      : (entry && entry.categoryStatusIcon ? String(entry.categoryStatusIcon) : 'thumbs_down');
    const categoryFit = Number(categoryContext && categoryContext.categoryFit) || Number(entry && entry.categoryFit) || 0;
    const categoryMembershipConfidence = Number(categoryContext && categoryContext.membershipConfidence) || Number(entry && entry.categoryMembershipConfidence) || 0;
    const categoryNetImpact = Number(categoryContext && categoryContext.netImpact) || Number(entry && entry.categoryNetImpact) || 0;

    return {
      character: entry && entry.character ? entry.character : 'Unknown',
      imageUrl: entry && entry.imageUrl ? entry.imageUrl : null,
      infoSource: entry && entry.infoSource ? entry.infoSource : null,
      ovr: currentOVR,
      score: Number(entry && entry.score) || 0,
      rarity: entry && entry.rarity ? entry.rarity : 'Bronze',
      ovrTierLabel: entry && entry.ovrTier && entry.ovrTier.label ? entry.ovrTier.label : null,
      characterType: entry && entry.characterType ? entry.characterType : null,
      draftRound: draftedRound,
      pickNumberInRound,
      globalDraftOrder: draftMeta && Number.isFinite(Number(draftMeta.globalDraftOrder)) ? Number(draftMeta.globalDraftOrder) : null,
      draftedAtMs: draftMeta && Number.isFinite(Number(draftMeta.draftedAtMs)) ? Number(draftMeta.draftedAtMs) : null,
      originalScenario: draftMeta && draftMeta.originalScenario ? draftMeta.originalScenario : null,
      originalTwist: draftMeta && draftMeta.originalTwist ? draftMeta.originalTwist : null,
      expectedAtDraft,
      expectedNearEnd,
      valueVsDraftExpected: currentOVR - expectedAtDraft,
      valueVsLateExpected: currentOVR - expectedNearEnd,
      notes: Array.isArray(entry && entry.notes) ? entry.notes.slice(0, 2) : [],
      ownerName: ownerName || null,
      ownerFinalRank: Number.isFinite(Number(ownerFinalRank)) ? Number(ownerFinalRank) : null,
      isChampionMember: Boolean(championName && ownerName && String(ownerName) === String(championName)),
      eliteRank: Number.isFinite(Number(eliteRank)) ? Number(eliteRank) : null,
      evalTrustPct: Math.round(Math.max(0, Math.min(100, (Number(scoreMeta.infoConfidence) || 0) * 100))),
      evalEngineMode: scoreMeta.evaluationEngineMode ? String(scoreMeta.evaluationEngineMode) : null,
      evalStatus: explain && explain.status ? String(explain.status) : null,
      evalStatusLabel: explain && explain.statusLabel ? String(explain.statusLabel) : null,
      evalRiskSeverity: explain && explain.riskSeverity ? String(explain.riskSeverity) : null,
      evalRiskFlags: Array.isArray(contextSignals.riskFlags) ? contextSignals.riskFlags.slice(0, 4) : [],
      evalMatchedTraits: Array.isArray(contextSignals.matchedTraits) ? contextSignals.matchedTraits.slice(0, 4) : [],
      categoryFit,
      categoryMembershipConfidence,
      categoryNetImpact,
      categoryStatus,
      categoryStatusLabel,
      categoryStatusTone,
      categoryStatusIcon,
      scoreMeta: {
        infoConfidence: Number(scoreMeta.infoConfidence) || 0,
        evaluationEngineMode: scoreMeta.evaluationEngineMode ? String(scoreMeta.evaluationEngineMode) : null,
        categoryContext: {
          categoryFit,
          membershipConfidence: categoryMembershipConfidence,
          netImpact: categoryNetImpact,
          categoryStatus,
          categoryStatusLabel,
          categoryStatusTone,
          categoryStatusIcon
        }
      }
    };
  }

  function buildShowcaseEntriesForPlayer(playerName, evaluations, draftMetaList, championName) {
    const matcher = buildMetaMatcher(draftMetaList);
    const ownerFinalRank = finalRankByPlayer.get(String(playerName || '')) || null;
    return (Array.isArray(evaluations) ? evaluations : []).map((entry, index) => (
      mapShowcaseEntry({
        entry,
        index,
        draftMeta: matcher.takeFor(entry, index),
        ownerName: playerName,
        ownerFinalRank,
        championName
      })
    ));
  }

  const winnerTeamCharacters = buildShowcaseEntriesForPlayer(
    winner && winner.name ? winner.name : null,
    winnerEvaluations,
    winnerDraftMeta,
    winner && winner.name ? winner.name : null
  );

  const allEliteCandidates = Object.entries(allTeamEvaluations).flatMap(([playerName, teamData]) => {
    const evaluations = Array.isArray(teamData && teamData.evaluations) ? teamData.evaluations : [];
    const sourcePlayer = game.players.find((player) => player && player.name === playerName);
    const playerDraftMeta = sourcePlayer && Array.isArray(sourcePlayer.finalTeamDraftMeta) ? sourcePlayer.finalTeamDraftMeta : [];
    const rows = buildShowcaseEntriesForPlayer(playerName, evaluations, playerDraftMeta, winner && winner.name ? winner.name : null);
    return rows;
  });

  const eliteFinalSix = allEliteCandidates
    .slice()
    .sort((a, b) => {
      if ((Number(b.ovr) || 0) !== (Number(a.ovr) || 0)) return (Number(b.ovr) || 0) - (Number(a.ovr) || 0);
      if ((Number(b.score) || 0) !== (Number(a.score) || 0)) return (Number(b.score) || 0) - (Number(a.score) || 0);
      if ((Number(b.evalTrustPct) || 0) !== (Number(a.evalTrustPct) || 0)) return (Number(b.evalTrustPct) || 0) - (Number(a.evalTrustPct) || 0);
      if ((Number(a.ownerFinalRank) || 999) !== (Number(b.ownerFinalRank) || 999)) return (Number(a.ownerFinalRank) || 999) - (Number(b.ownerFinalRank) || 999);
      return String(a.character || '').localeCompare(String(b.character || ''));
    })
    .slice(0, 6)
    .map((entry, index) => ({
      ...entry,
      eliteRank: index + 1
    }));

  const eliteTeamsRepresented = new Set(eliteFinalSix.map((entry) => entry && entry.ownerName).filter(Boolean)).size;
  const eliteChampionMembers = eliteFinalSix.filter((entry) => entry && entry.isChampionMember).length;
  const eliteFinalSixMeta = {
    scope: 'global_top_ovr',
    candidateCount: allEliteCandidates.length,
    teamsRepresented: eliteTeamsRepresented,
    championMembers: eliteChampionMembers,
    averageOVR: eliteFinalSix.length
      ? Math.round(eliteFinalSix.reduce((sum, entry) => sum + (Number(entry && entry.ovr) || 0), 0) / eliteFinalSix.length)
      : 0,
    topOVR: eliteFinalSix.length ? Math.max(...eliteFinalSix.map((entry) => Number(entry && entry.ovr) || 0)) : 0,
    floorOVR: eliteFinalSix.length ? Math.min(...eliteFinalSix.map((entry) => Number(entry && entry.ovr) || 0)) : 0
  };

  const winnerCharacters = winnerTeamCharacters;
  const packMeta = game && game.packMeta
    ? game.packMeta
    : getPublicPackMeta(game && game.settings && game.settings.contentPackId);

  recordPackMatchCompletion(packMeta && packMeta.id ? packMeta.id : 'default');

  const gameEndedPayload = {
    finalLeaderboard,
    totalRounds: game.totalRounds,
    winner,
    lockedCategory: game.lockedCategory || null,
    packMeta,
    winnerCharacters,
    winnerTeamCharacters,
    eliteFinalSix,
    eliteFinalSixMeta,
    winnerTeamStats,
    voiceCues: buildGameEndedVoiceCues({ winner })
  };
  await emitWithVoiceCuePrewarm(io, roomCode, 'gameEnded', gameEndedPayload, { timeoutMs: 2200 });

  const isFinalTie = finalLeaderboard.length > 1
    && Number(finalLeaderboard[0] && finalLeaderboard[0].score) === Number(finalLeaderboard[1] && finalLeaderboard[1].score);
  emitPartyTelemetryEvent('final_completed', {
    roomCode,
    gameId: game.id || null,
    playerCount: finalLeaderboard.length,
    winner: winner && winner.name ? winner.name : null,
    isTie: isFinalTie,
    roundsCompleted: Array.isArray(game.results) ? game.results.filter(Boolean).length : 0,
    matchDurationMs: Number(game.startedAtMs) > 0 ? Math.max(0, Date.now() - Number(game.startedAtMs)) : null
  });

  room.isGameActive = false;
  const previousSettings = { ...(room.settings || {}) };
  room.settings = buildDefaultRoomSettings(previousSettings);
  const resetKeys = getChangedRoomSettingKeys(previousSettings, room.settings);
  if (resetKeys.length) {
    io.to(roomCode).emit('settingsUpdated', room.settings);
    io.to(roomCode).emit('settingsChangePing', {
      changedKeys: resetKeys,
      changedBy: 'system',
      system: true,
      summary: 'Match complete: settings reset to defaults.',
      settings: room.settings,
      timestamp: Date.now()
    });
  }
  markRoomsDirty();
  setTimeout(() => {
    room.gameState = null;
    markRoomsDirty();
  }, 10000);
}

module.exports = {
  rooms,
  voteTimeouts,
  initWordCache,
  getRandomWord,
  generateScenario,
  generateTwists,
  generateScenarios,
  generateFinalScenarioAndTwist,
  createRoom,
  startGame,
  startRound,
  revealPlotTwist,
  startFinalRound,
  tallyResults,
  markRoomsDirty,
  endGame
};
