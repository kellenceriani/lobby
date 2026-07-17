const fs = require('fs');
const path = require('path');

const REGISTRY_FILE = path.join(__dirname, '..', 'content', 'categories', 'registry.v1.json');
const CATEGORY_MODES = new Set(['off', 'host_select', 'smart_random', 'group_vote']);
const CATEGORY_MODE_ALIASES = Object.freeze({
  off: 'off',
  host_select: 'host_select',
  hostselect: 'host_select',
  smart_random: 'smart_random',
  smartrandom: 'smart_random',
  group_vote: 'group_vote',
  groupvote: 'group_vote'
});
const DEFAULT_CATEGORY_SETTINGS = Object.freeze({
  categoriesMode: 'smart_random',
  categoryId: null,
  categoryVoteOptions: [],
  categoryVersion: 'v1'
});

let REGISTRY_CACHE = null;
const RULE_MATCHER_CACHE = new Map();
const TOKEN_EDIT_DISTANCE_CACHE = new Map();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeRegExp(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLooseText(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function deriveLooseStem(rule = '') {
  const token = String(rule || '').trim().toLowerCase();
  if (!token || token.length < 6 || token.includes(' ')) return '';
  const stem = token.replace(
    /(?:izations?|isers?|izers?|ations?|ators?|ships?|ments?|ness|ists?|ives?|ings?|ers?|ors?|ed|es|s)$/i,
    ''
  );
  if (!stem || stem.length < 5 || stem === token) return '';
  return stem;
}

function getRuleMatcher(normalizedRule = '', allowLooseStem = true) {
  const key = `${allowLooseStem ? '1' : '0'}:${normalizedRule}`;
  if (RULE_MATCHER_CACHE.has(key)) return RULE_MATCHER_CACHE.get(key);
  const exactPattern = new RegExp(`(?:^|\\s)${escapeRegExp(normalizedRule)}(?:\\s|$)`, 'i');
  const looseStem = allowLooseStem ? deriveLooseStem(normalizedRule) : '';
  const stemPattern = looseStem
    ? new RegExp(`(?:^|\\s)${escapeRegExp(looseStem)}[a-z]{1,12}(?:\\s|$)`, 'i')
    : null;
  const matcher = { exactPattern, stemPattern };
  RULE_MATCHER_CACHE.set(key, matcher);
  return matcher;
}

function countRuleHits(corpusNormalized = '', rules = [], options = {}) {
  const allowLooseStem = options && options.allowLooseStem !== false;
  const seen = new Set();
  let hits = 0;
  (Array.isArray(rules) ? rules : []).forEach((rule) => {
    const normalizedRule = normalizeLooseText(rule);
    if (!normalizedRule || seen.has(normalizedRule)) return;
    const { exactPattern, stemPattern } = getRuleMatcher(normalizedRule, allowLooseStem);
    if (exactPattern.test(corpusNormalized)) {
      hits += 1;
      seen.add(normalizedRule);
      return;
    }
    if (stemPattern) {
      if (!stemPattern.test(corpusNormalized)) return;
      hits += 1;
      seen.add(normalizedRule);
    }
  });
  return hits;
}

function tokenizeLooseText(value = '') {
  return normalizeLooseText(value)
    .split(' ')
    .map((token) => String(token || '').trim().toLowerCase())
    .filter(Boolean);
}

function tokenEditDistance(left = '', right = '') {
  const a = String(left || '').trim().toLowerCase();
  const b = String(right || '').trim().toLowerCase();
  if (!a || !b) return 99;
  if (a === b) return 0;
  const cacheKey = a < b ? `${a}|${b}` : `${b}|${a}`;
  if (TOKEN_EDIT_DISTANCE_CACHE.has(cacheKey)) return TOKEN_EDIT_DISTANCE_CACHE.get(cacheKey);

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[rows - 1][cols - 1];
  TOKEN_EDIT_DISTANCE_CACHE.set(cacheKey, distance);
  return distance;
}

function tokensAreNearMatch(left = '', right = '') {
  const a = String(left || '').trim().toLowerCase();
  const b = String(right || '').trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 2) return false;
  if (a.charAt(0) !== b.charAt(0)) return false;
  const maxLen = Math.max(a.length, b.length);
  const distance = tokenEditDistance(a, b);
  if (maxLen <= 5) return distance <= 1;
  if (maxLen <= 8) return distance <= 2;
  return distance <= 3;
}

function phraseTokensNearMatch(ruleTokens = [], candidateTokens = []) {
  if (!Array.isArray(ruleTokens) || !Array.isArray(candidateTokens)) return false;
  if (!ruleTokens.length || ruleTokens.length !== candidateTokens.length) return false;
  let fuzzyDistanceTotal = 0;
  for (let i = 0; i < ruleTokens.length; i += 1) {
    const ruleToken = String(ruleTokens[i] || '').trim().toLowerCase();
    const candidateToken = String(candidateTokens[i] || '').trim().toLowerCase();
    if (!ruleToken || !candidateToken) return false;
    if (ruleToken === candidateToken) continue;
    if (!tokensAreNearMatch(ruleToken, candidateToken)) return false;
    fuzzyDistanceTotal += tokenEditDistance(ruleToken, candidateToken);
  }
  return fuzzyDistanceTotal <= Math.max(2, ruleTokens.length + 1);
}

function countApproximateNameHits(valueNormalized = '', rules = []) {
  const corpusTokens = tokenizeLooseText(valueNormalized);
  if (!corpusTokens.length) return 0;
  const seen = new Set();
  let hits = 0;
  (Array.isArray(rules) ? rules : []).forEach((rule) => {
    const normalizedRule = normalizeLooseText(rule);
    if (!normalizedRule || seen.has(normalizedRule)) return;
    const ruleTokens = tokenizeLooseText(normalizedRule);
    if (!ruleTokens.length || ruleTokens.length > 4) return;
    if (ruleTokens.length > corpusTokens.length) return;
    if (ruleTokens.length <= 1) return;

    for (let start = 0; start <= (corpusTokens.length - ruleTokens.length); start += 1) {
      const windowTokens = corpusTokens.slice(start, start + ruleTokens.length);
      if (!phraseTokensNearMatch(ruleTokens, windowTokens)) continue;
      hits += 1;
      seen.add(normalizedRule);
      break;
    }
  });
  return hits;
}

function asSlug(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  return /^[a-z0-9-]{2,80}$/.test(normalized) ? normalized : '';
}

function normalizeCategoryModeValue(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return CATEGORY_MODE_ALIASES[normalized] || '';
}

const SIGNAL_STOP_WORDS = new Set([
  'and', 'or', 'the', 'a', 'an', 'of', 'to', 'for', 'with', 'without', 'from', 'in', 'on', 'at', 'by',
  'vs', 'via', 'into', 'across', 'through', 'under', 'over', 'out', 'up', 'down', 'about',
  'global', 'world', 'system', 'systems', 'specialists', 'specialist', 'advanced'
]);

const NON_SPECIFIC_STRICT_SIGNALS = new Set([
  'case', 'cases', 'evidence', 'history', 'culture', 'series', 'team', 'role', 'mission', 'unit', 'group',
  'technology', 'science', 'media', 'franchise', 'war', 'battle', 'professional', 'public figure', 'character'
]);

const NON_SIGNAL_TOKENS = new Set([
  'are', 'was', 'were', 'has', 'have', 'had', 'will', 'would', 'could', 'should', 'into', 'onto'
]);

const SIGNAL_DEPTH_TARGETS = Object.freeze({
  core: 24,
  related: 14,
  negative: 10,
  support: 8,
  primaryName: 36,
  supportName: 22
});

const FAMILY_SIGNAL_PACKS = Object.freeze({
  'fictional beings': Object.freeze({
    core: ['fictional character', 'hero', 'villain', 'protagonist', 'antagonist', 'superpower', 'anime', 'comic', 'fantasy', 'arc'],
    related: ['storyline', 'canon', 'franchise', 'character arc', 'lore', 'battle arc', 'power scaling', 'rival'],
    negative: ['hospital', 'laptop', 'aircraft', 'city hall', 'treaty', 'recipe', 'kitchen'],
    support: ['voice actor', 'costume', 'fan favorite']
  }),
  'food/culture': Object.freeze({
    core: ['food', 'dish', 'cuisine', 'culinary', 'ingredient', 'recipe', 'chef', 'kitchen', 'beverage', 'restaurant'],
    related: ['cooking', 'flavor', 'menu', 'dining', 'regional cuisine', 'street food', 'meal prep'],
    negative: ['fighter jet', 'warship', 'quantum', 'submarine', 'parliament', 'city skyline'],
    support: ['food critic', 'restaurateur', 'nutrition']
  }),
  'history/politics': Object.freeze({
    core: ['history', 'politics', 'treaty', 'diplomacy', 'revolution', 'conflict', 'government', 'policy', 'statecraft', 'regime'],
    related: ['parliament', 'election', 'coalition', 'international relations', 'historian', 'archives', 'geopolitics'],
    negative: ['dessert', 'sports car', 'anime opening', 'kitchen appliance', 'pet care'],
    support: ['ambassador', 'diplomat', 'strategist']
  }),
  'locations/environments': Object.freeze({
    core: ['location', 'environment', 'city', 'region', 'terrain', 'climate', 'landmark', 'urban', 'biome', 'geography'],
    related: ['map', 'altitude', 'ecosystem', 'district', 'metropolitan', 'coastal', 'remote'],
    negative: ['chef', 'quarterback', 'wizard', 'hand tool', 'quantum processor'],
    support: ['explorer', 'guide', 'urban planner']
  }),
  'media/franchises': Object.freeze({
    core: ['franchise', 'series', 'film', 'television', 'anime', 'comic universe', 'media property', 'character roster', 'studio'],
    related: ['sequel', 'episode', 'season', 'adaptation', 'fandom', 'box office', 'canon'],
    negative: ['surgical tool', 'hospital ward', 'airliner', 'diplomatic summit', 'culinary dish'],
    support: ['actor', 'director', 'producer', 'voice cast']
  }),
  'mythology/religion': Object.freeze({
    core: ['mythology', 'religion', 'deity', 'pantheon', 'god', 'goddess', 'mythic creature', 'legend', 'divine', 'ritual'],
    related: ['folklore', 'sacred text', 'temple', 'myth', 'oracle', 'epic'],
    negative: ['laptop', 'pickup truck', 'nfl season', 'operating room', 'city council'],
    support: ['priest', 'myth scholar', 'mythographer']
  }),
  'objects/tools': Object.freeze({
    core: ['tool', 'equipment', 'device', 'instrument', 'hardware', 'machine', 'implement', 'apparatus', 'gear'],
    related: ['maintenance', 'repair', 'construction', 'mechanic', 'workshop', 'industrial'],
    negative: ['mythological god', 'anime protagonist', 'capital city', 'treaty process', 'culinary school'],
    support: ['technician', 'operator', 'craftsperson']
  }),
  'professions/roles': Object.freeze({
    core: ['profession', 'role', 'occupation', 'specialist', 'operator', 'officer', 'responder', 'investigator', 'professional'],
    related: ['training', 'certified', 'team lead', 'fieldwork', 'mission', 'deployment'],
    negative: ['dessert', 'warship hull', 'city skyline', 'deity realm', 'comic crossover'],
    support: ['mentor', 'coach', 'instructor']
  }),
  'real living beings': Object.freeze({
    core: ['person', 'human', 'biography', 'leader', 'scientist', 'inventor', 'public figure', 'historical figure'],
    related: ['career', 'achievement', 'legacy', 'contribution', 'born', 'nationality'],
    negative: ['fighter jet', 'airliner', 'toolbox', 'kitchen dish', 'mythic beast'],
    support: ['institution', 'research lab', 'academy']
  }),
  'science/technology': Object.freeze({
    core: ['science', 'technology', 'engineering', 'research', 'laboratory', 'innovation', 'system design', 'computing', 'physics', 'biotech'],
    related: ['algorithm', 'network', 'protocol', 'simulation', 'analysis', 'data model', 'prototype'],
    negative: ['dessert menu', 'sports league', 'city district', 'mythic pantheon', 'fairy tale'],
    support: ['researcher', 'engineer', 'technician', 'analyst']
  }),
  'sports/competition': Object.freeze({
    core: ['sport', 'athlete', 'competition', 'tournament', 'league', 'championship', 'player', 'team sport', 'combat sport'],
    related: ['training', 'coach', 'season', 'medal', 'record', 'playoffs', 'matchup'],
    negative: ['hospital ward', 'fighter jet', 'laptop chipset', 'mythological god', 'culinary dish'],
    support: ['sports analyst', 'referee', 'manager']
  }),
  'vehicles/travel': Object.freeze({
    core: ['vehicle', 'transport', 'transit', 'engine', 'mobility', 'fleet', 'navigation', 'cockpit', 'chassis', 'vessel'],
    related: ['route', 'terminal', 'station', 'harbor', 'airport', 'runway', 'crew', 'dispatch'],
    negative: ['dessert', 'mythic creature', 'hospital diagnosis', 'anime opening', 'policy treaty'],
    support: ['pilot', 'driver', 'mechanic', 'operator', 'crew']
  })
});

const CATEGORY_SIGNAL_OVERRIDES = Object.freeze({
  aircraft: Object.freeze({
    core: ['fighter jet', 'airliner', 'bomber', 'rotorcraft', 'airframe', 'flight deck'],
    related: ['airport operations', 'air traffic', 'flight crew', 'aviation safety'],
    support: ['pilot', 'aviator', 'airport', 'runway', 'air traffic control', 'flight attendant'],
    primaryName: ['aircraft', 'airplane', 'plane', 'jet', 'fighter jet', 'helicopter', 'airliner', 'bomber', 'drone', 'boeing', 'airbus', 'f 16', 'f 22', 'c 130', 'sr 71', 'concorde'],
    supportName: ['pilot', 'aviator', 'airport', 'runway', 'air traffic control', 'flight attendant', 'airline crew'],
    negative: ['sports car', 'chef', 'basketball', 'myth creature']
  }),
  spacecraft: Object.freeze({
    core: ['orbiter', 'space vehicle', 'launch vehicle', 'capsule', 'space station', 'lunar module'],
    related: ['mission control', 'orbital mechanics', 'payload', 'reentry'],
    support: ['astronaut', 'flight controller', 'launch ops', 'space program']
  }),
  'naval-vessels': Object.freeze({
    core: ['warship', 'submarine', 'carrier', 'frigate', 'destroyer', 'cruiser'],
    related: ['naval fleet', 'shipyard', 'maritime patrol', 'naval command'],
    support: ['captain', 'sailor', 'harbor', 'fleet operations']
  }),
  'trains-transit': Object.freeze({
    core: ['locomotive', 'metro train', 'railcar', 'tram', 'subway train', 'high speed rail'],
    related: ['rail network', 'commuter route', 'transit line', 'platform'],
    support: ['conductor', 'rail operator', 'station', 'transit control']
  }),
  'cars-supercars': Object.freeze({
    core: ['sports car', 'supercar', 'car model', 'automobile', 'racing car', 'road car'],
    related: ['motor racing', 'garage', 'car culture', 'pit lane'],
    support: ['driver', 'mechanic', 'pit crew', 'auto racing']
  }),
  cybersecurity: Object.freeze({
    core: ['infosec', 'security operations', 'threat detection', 'intrusion response', 'red team', 'blue team'],
    related: ['incident response', 'vulnerability', 'soc analyst', 'threat intel'],
    support: ['security engineer', 'analyst', 'forensics']
  }),
  'biotech-genetics': Object.freeze({
    core: ['genomics', 'gene editing', 'cell therapy', 'biotech platform', 'molecular biology'],
    related: ['lab assay', 'clinical biotech', 'bioinformatics', 'protein engineering'],
    support: ['biologist', 'lab scientist', 'clinical researcher']
  }),
  'quantum-physics': Object.freeze({
    core: ['quantum mechanics', 'quantum system', 'qubit', 'entanglement', 'quantum computing'],
    related: ['particle physics', 'wavefunction', 'quantum lab', 'quantum protocol'],
    support: ['physicist', 'quantum researcher']
  }),
  'aerospace-engineering': Object.freeze({
    core: ['aerospace system', 'propulsion', 'avionics', 'airframe design', 'flight systems'],
    related: ['wind tunnel', 'guidance system', 'test flight', 'mission engineering'],
    support: ['aerospace engineer', 'flight engineer']
  }),
  'medical-professionals': Object.freeze({
    core: ['doctor', 'physician', 'surgeon', 'nurse', 'clinician', 'medical specialist'],
    related: ['hospital care', 'patient treatment', 'clinical practice', 'healthcare team'],
    support: ['paramedic', 'medical staff', 'caregiver']
  }),
  'detectives-investigators': Object.freeze({
    strictCore: [
      'sherlock holmes',
      'dr watson',
      'detective conan',
      'light yagami',
      'l death note',
      'detective pikachu',
      'ace ventura',
      'perry the platypus',
      'loid forger',
      'batman'
    ],
    core: ['detective', 'investigator', 'sleuth', 'forensic analyst', 'private investigator', 'case solver', 'crime scene analyst'],
    related: ['case file', 'clue trail', 'evidence chain', 'interrogation', 'deduction', 'surveillance'],
    support: ['forensics', 'profiler', 'inspector', 'detective bureau', 'investigative unit'],
    primaryName: [
      'sherlock holmes',
      'hercule poirot',
      'dr watson',
      'detective conan',
      'light yagami',
      'l death note',
      'detective pikachu',
      'ace ventura',
      'perry the platypus',
      'loid forger',
      'batman',
      'benoit blanc',
      'nancy drew',
      'jessica fletcher'
    ],
    supportName: [
      'detective', 'investigator', 'sleuth', 'inspector', 'forensic', 'private eye',
      'agent', 'operative', 'analyst', 'strategist',
      'captain america', 'hermione granger', 'monkey d dragon', 'monkey d. dragon'
    ],
    negative: ['kitchen recipe', 'river', 'sandwich', 'dessert', 'sports car']
  }),
  'explorers-adventurers': Object.freeze({
    core: ['explorer', 'adventurer', 'expedition leader', 'mountaineer', 'navigator', 'discoverer', 'field explorer', 'polar explorer'],
    related: ['expedition route', 'terrain crossing', 'survival trek', 'charted passage', 'remote mission'],
    support: ['guide', 'cartographer', 'naturalist', 'expedition crew'],
    primaryName: [
      'marco polo',
      'roald amundsen',
      'ernest shackleton',
      'ibn battuta',
      'jacques cousteau',
      'tenzing norgay',
      'edmund hillary',
      'ferdinand magellan',
      'neil armstrong',
      'sally ride',
      'bear grylls',
      'dora the explorer'
    ],
    supportName: ['explorer', 'adventurer', 'expedition', 'mountaineer', 'navigator', 'trailblazer'],
    negative: ['desk job', 'office software', 'kitchen appliance']
  }),
  'medical-equipment': Object.freeze({
    core: ['medical device', 'diagnostic equipment', 'surgical equipment', 'imaging system'],
    related: ['hospital device', 'patient monitor', 'clinical instrumentation'],
    support: ['biomedical technician', 'clinical engineer']
  }),
  'magic-users': Object.freeze({
    strictCore: [
      'doctor strange',
      'scarlet witch',
      'wanda maximoff',
      'gandalf',
      'merlin',
      'hermione granger',
      'frieren',
      'raven',
      'zatanna',
      'doctor fate',
      'john constantine'
    ],
    core: [
      'wizard',
      'sorcerer',
      'mage',
      'spellcaster',
      'warlock',
      'witch',
      'arcane',
      'mystic',
      'magic user',
      'sorcery',
      'spellcraft',
      'ritual magic'
    ],
    related: [
      'enchanter',
      'necromancer',
      'illusion magic',
      'telekinesis',
      'psychic power',
      'esper',
      'elemental bending',
      'arcane arts'
    ],
    support: [
      'illusionist',
      'magician',
      'stage magician',
      'occult',
      'mysticism',
      'energy manipulation'
    ],
    primaryName: [
      'doctor strange',
      'dr strange',
      'scarlet witch',
      'wanda maximoff',
      'gandalf',
      'merlin',
      'frieren',
      'raven',
      'zatanna',
      'doctor fate',
      'john constantine',
      'aang'
    ],
    supportName: [
      'wizard',
      'sorcerer',
      'mage',
      'witch',
      'warlock',
      'spellcaster',
      'magician',
      'illusionist',
      'psychic',
      'esper',
      'telekinetic'
    ],
    negative: ['kryptonian', 'athlete', 'footballer', 'boxer', 'chef', 'politician', 'business executive']
  }),
  athletes: Object.freeze({
    core: [
      'professional athlete',
      'olympian',
      'champion athlete',
      'sports star',
      'pro athlete',
      'hall of famer',
      'all star athlete'
    ],
    related: [
      'competition performance',
      'athletic training',
      'season stats',
      'league mvp',
      'olympic medal',
      'all star selection',
      'title defense'
    ],
    support: [
      'coach',
      'trainer',
      'sports staff',
      'sports federation',
      'athletic association'
    ],
    primaryName: [
      'michael jordan',
      'lebron james',
      'le bron james',
      'shohei ohtani',
      'mike tyson',
      'bo jackson',
      'jon jones',
      'jesse owens',
      'jessie owens',
      'usain bolt',
      'aaron donald',
      'serena williams',
      'lionel messi',
      'tiger woods'
    ],
    supportName: [
      'athlete',
      'olympian',
      'player',
      'boxer',
      'fighter',
      'sprinter',
      'pitcher',
      'striker',
      'quarterback',
      'running back',
      'linebacker',
      'mvp'
    ],
    negative: ['superhero', 'mythological god', 'fictional vigilante']
  }),
  'combat-sports': Object.freeze({
    strictCore: ['muhammad ali', 'floyd mayweather', 'mike tyson', 'jon jones', 'amanda nunes', 'ronda rousey', 'khabib nurmagomedov'],
    core: ['boxing', 'mma', 'kickboxing', 'muay thai', 'grappling', 'fight sport', 'ufc', 'combat sports'],
    related: ['fight camp', 'weight class', 'combat league', 'octagon', 'heavyweight champion', 'mixed martial arts'],
    support: ['coach', 'cornerman', 'referee', 'commentator', 'promoter', 'fight analyst'],
    primaryName: ['muhammad ali', 'floyd mayweather', 'mike tyson', 'jon jones', 'amanda nunes', 'ronda rousey', 'khabib nurmagomedov', 'conor mcgregor'],
    supportName: ['dana white', 'joe rogan', 'rocky balboa', 'boxer', 'fighter', 'martial artist', 'ufc commentator', 'fight promoter'],
    negative: ['basketball', 'nba', 'soccer', 'baseball', 'anime villain', 'fictional ruler', 'superhero', 'fictional boxer', 'sports drama', 'film character']
  }),
  'team-sports': Object.freeze({
    core: ['team sport', 'franchise team', 'league team', 'club side'],
    related: ['roster', 'playbook', 'season matchup'],
    support: ['coach', 'manager', 'captain']
  }),
  'scientists-inventors': Object.freeze({
    core: ['scientist', 'inventor', 'research pioneer', 'scientific breakthrough'],
    related: ['laboratory research', 'patent', 'scientific method'],
    support: ['research team', 'academic institution']
  }),
  'world-leaders': Object.freeze({
    strictCore: ['donald trump', 'theodore roosevelt', 'teddy roosevelt', 'john f kennedy', 'jfk', 'henry viii', 'king henry'],
    core: ['head of state', 'prime minister', 'president', 'national leader', 'monarch', 'king'],
    related: ['state policy', 'international summit', 'government leadership', 'executive government', 'statecraft'],
    support: ['diplomatic corps', 'cabinet', 'politician', 'statesman'],
    primaryName: ['donald trump', 'theodore roosevelt', 'teddy roosevelt', 'john f kennedy', 'john fitzgerald kennedy', 'jfk', 'henry viii', 'king henry', 'abraham lincoln', 'barack obama', 'winston churchill'],
    supportName: ['president', 'prime minister', 'king', 'monarch', 'head of state', 'politician', 'statesman'],
    negative: ['fictional ruler', 'fictional king', 'anime character', 'martial artist', 'basketball', 'superhero']
  }),
  'marvel-dc': Object.freeze({
    strictCore: ['marvel', 'dc', 'dc comics', 'marvel comics', 'justice league', 'avengers', 'teen titans'],
    core: ['superhero', 'comic book', 'comic universe', 'dc comics', 'marvel comics', 'justice league', 'avengers', 'teen titans'],
    related: ['secret identity', 'superhuman', 'vigilante', 'costumed hero', 'comic continuity'],
    support: ['hero', 'villain', 'sidekick', 'metahuman', 'mutant', 'bat family'],
    primaryName: ['superman', 'batman', 'wonder woman', 'spider man', 'spider-man', 'iron man', 'captain america', 'the flash', 'flash', 'robin', 'starfire', 'raven', 'cyborg', 'nightwing', 'teen titans', 'hulk', 'thor', 'doctor strange'],
    supportName: ['dc comics', 'marvel comics', 'superhero', 'comic book character', 'justice league', 'avengers', 'bat family'],
    negative: ['one piece', 'nico robin', 'anime series', 'manga', 'basketball', 'politician']
  }),
  'scifi-franchises': Object.freeze({
    strictCore: ['star wars', 'star trek', 'mass effect', 'dune', 'doctor who', 'battlestar galactica', 'the expanse', 'alien franchise'],
    core: ['science fiction', 'sci fi', 'sci-fi', 'space opera', 'galactic', 'starship', 'interstellar', 'alien worlds'],
    related: ['space travel', 'faster than light', 'future technology', 'galaxy', 'planetary system', 'extraterrestrial'],
    support: ['franchise', 'fictional universe', 'video game franchise', 'film franchise'],
    primaryName: ['star wars', 'star trek', 'mass effect', 'dune', 'doctor who', 'battlestar galactica', 'the expanse', 'blade runner', 'alien franchise', 'halo'],
    supportName: ['science fiction', 'sci fi', 'sci-fi', 'space opera', 'galactic', 'starship', 'alien'],
    negative: ['action thriller', 'crime thriller', 'archaeologist', 'adventure film', 'boxing', 'basketball', 'politician', 'fictional boxer']
  }),
  'historical-sites': Object.freeze({
    core: ['historic site', 'heritage site', 'ancient monument', 'archaeological site'],
    related: ['cultural heritage', 'historical landmark', 'preservation'],
    support: ['historian', 'archaeologist']
  }),
  'urban-cities': Object.freeze({
    core: ['metropolis', 'major city', 'urban center', 'city region'],
    related: ['city district', 'urban development', 'metro area'],
    support: ['urban planner', 'municipal']
  }),
  'extreme-environments': Object.freeze({
    core: ['extreme climate', 'harsh terrain', 'hostile environment', 'wilderness biome'],
    related: ['survival conditions', 'environmental hazard', 'terrain response'],
    support: ['expedition', 'field team']
  }),
  'deities-pantheons': Object.freeze({
    core: ['pantheon god', 'mythic deity', 'divine being', 'mythological god'],
    related: ['divine mythology', 'sacred myth', 'religious legend'],
    support: ['myth scholar', 'religious studies']
  }),
  'mythic-creatures': Object.freeze({
    core: ['legendary creature', 'mythical beast', 'fantasy creature', 'folklore monster'],
    related: ['myth folklore', 'creature legend', 'mythic lore'],
    support: ['monster hunter', 'folklore scholar']
  })
});

const CATEGORY_DOMAIN_NAME_SIGNALS = Object.freeze({
  detective: Object.freeze([
    'Sherlock Holmes', 'Hercule Poirot', 'Nancy Drew', 'Benoit Blanc', 'Jessica Fletcher', 'L (Death Note)',
    'Batman', 'Dr. Watson', 'Detective Conan', 'Detective Pikachu', 'Ace Ventura', 'Perry the Platypus', 'Loid Forger', 'Light Yagami'
  ]),
  rescue: Object.freeze([
    'Firefighter', 'Paramedic', 'Rescue Helicopter', 'Coast Guard', 'Search and Rescue Dog', 'Hazmat Team',
    'Emergency Dispatcher', 'Urban Rescue Team', 'Lifeguard', 'Ambulance Crew', 'Smoke Jumper', 'Disaster Response Unit'
  ]),
  martial: Object.freeze([
    'Bruce Lee', 'Jackie Chan', 'Jet Li', 'Ip Man', 'Chuck Norris', 'Ronda Rousey', 'Conor McGregor',
    'Anderson Silva', 'karate', 'taekwondo', 'judo', 'dojo'
  ]),
  combat_sports: Object.freeze([
    'boxing', 'mma', 'kickboxing', 'muay thai', 'judo', 'wrestling',
    'Muhammad Ali', 'Mike Tyson', 'Floyd Mayweather', 'Conor McGregor', 'Ronda Rousey',
    'Khabib Nurmagomedov', 'Amanda Nunes', 'Jon Jones', 'Dana White', 'Joe Rogan', 'UFC', 'Rocky Balboa'
  ]),
  medical: Object.freeze([
    'Florence Nightingale', 'Jonas Salk', 'Anthony Fauci', 'Atul Gawande', 'Paul Farmer', 'Harvey Cushing',
    'Virginia Apgar', 'Elizabeth Blackwell', 'Sanjay Gupta', 'Christiaan Barnard', 'Mae Jemison', 'Patch Adams'
  ]),
  sports: Object.freeze([
    'Michael Jordan', 'Lionel Messi', 'LeBron James', 'Serena Williams', 'Tom Brady', 'Tiger Woods',
    'Shohei Ohtani', 'Usain Bolt', 'Roger Federer', 'Simone Biles', 'Mookie Betts', 'George Kittle',
    'Mike Tyson', 'Bo Jackson', 'Jon Jones', 'Jesse Owens', 'Jessie Owens', 'Aaron Donald'
  ]),
  music: Object.freeze([
    'Taylor Swift', 'Beyonce', 'Freddie Mercury', 'Mozart', 'Beethoven', 'Eminem',
    'Adele', 'Bruno Mars', 'Ed Sheeran', 'Michael Jackson', 'Dua Lipa', 'Hans Zimmer'
  ]),
  actor: Object.freeze([
    'Tom Hanks', 'Meryl Streep', 'Denzel Washington', 'Leonardo DiCaprio', 'Scarlett Johansson', 'Ryan Reynolds',
    'Emma Stone', 'Keanu Reeves', 'Morgan Freeman', 'Viola Davis', 'Brad Pitt', 'Natalie Portman'
  ]),
  chef: Object.freeze([
    'Gordon Ramsay', 'Massimo Bottura', 'Alice Waters', 'Anthony Bourdain', 'Jamie Oliver', 'Wolfgang Puck',
    'Thomas Keller', 'Ina Garten', 'Jose Andres', 'Nobu Matsuhisa', 'Guy Fieri', 'Emeril Lagasse'
  ]),
  pilot: Object.freeze([
    'Amelia Earhart', 'Chuck Yeager', 'Sully Sullenberger', 'Wright Brothers', 'Bessie Coleman', 'Neil Armstrong',
    'Yuri Gagarin', 'Test Pilot', 'Fighter Pilot', 'Commercial Pilot', 'Blue Angels Pilot', 'Helicopter Pilot'
  ]),
  explorer: Object.freeze([
    'Marco Polo', 'Roald Amundsen', 'Ernest Shackleton', 'Ibn Battuta', 'Jacques Cousteau', 'Tenzing Norgay',
    'Edmund Hillary', 'Ferdinand Magellan', 'Neil Armstrong', 'Sally Ride', 'Bear Grylls', 'Dora the Explorer'
  ]),
  superheroes: Object.freeze([
    'Superman', 'Batman', 'Wonder Woman', 'Spider-Man', 'Iron Man', 'Captain America',
    'Black Panther', 'Thor', 'Doctor Strange', 'The Flash', 'Hulk', 'Captain Marvel',
    'Robin', 'Starfire', 'Raven', 'Cyborg', 'Nightwing', 'Teen Titans', 'Justice League'
  ]),
  anime: Object.freeze([
    'Naruto Uzumaki', 'Monkey D. Luffy', 'Goku', 'Sailor Moon', 'Eren Yeager', 'Tanjiro Kamado',
    'Gojo Satoru', 'Ichigo Kurosaki', 'Edward Elric', 'Lelouch Lamperouge', 'Mikasa Ackerman', 'Light Yagami'
  ]),
  villains: Object.freeze([
    'Darth Vader', 'Thanos', 'Joker', 'Voldemort', 'Sauron', 'Magneto',
    'Loki', 'Frieza', 'Sephiroth', 'Cruella de Vil', 'Hannibal Lecter', 'Bowser'
  ]),
  magic: Object.freeze([
    'Merlin', 'Gandalf', 'Doctor Strange', 'Hermione Granger', 'Harry Potter', 'Scarlet Witch',
    'Zatanna', 'Morgana', 'Dumbledore', 'Circe', 'Raven', 'Loki',
    'Frieren', 'Doctor Fate', 'John Constantine', 'Wanda Maximoff', 'Aang', 'Shigeo Kageyama'
  ]),
  mecha_pilots: Object.freeze([
    'Amuro Ray', 'Shinji Ikari', 'Char Aznable', 'Kira Yamato', 'Heero Yuy', 'gundam pilot',
    'eva pilot', 'mecha pilot', 'jaeger pilot', 'Lelouch Lamperouge', 'Mikazuki Augus', 'Sousuke Sagara'
  ]),
  monster_hunters: Object.freeze([
    'Geralt of Rivia', 'Van Helsing', 'Buffy Summers', 'Demon Slayer Corps', 'Witcher', 'monster hunter',
    'slayer', 'demon hunter', 'vampire hunter', 'Trevor Belmont', 'Doom Slayer', 'exorcist'
  ]),
  tools: Object.freeze([
    'Hammer', 'Screwdriver', 'Wrench', 'Pliers', 'Saw', 'Drill',
    'Chisel', 'Axe', 'Shovel', 'Socket Wrench', 'Multitool', 'Level'
  ]),
  machinery: Object.freeze([
    'Bulldozer', 'Excavator', 'Forklift', 'Crane', 'Tractor', 'Dump Truck',
    'Cement Mixer', 'Industrial Press', 'Lathe Machine', 'Backhoe', 'Harvester', 'Road Roller'
  ]),
  firearms: Object.freeze([
    'AK-47', 'M4 Carbine', 'Glock 19', 'Sniper Rifle', 'Shotgun', 'Revolver',
    'Crossbow', 'SMG', 'Light Machine Gun', 'Pistol', 'Rifle', 'Uzi'
  ]),
  medical_equipment: Object.freeze([
    'MRI Machine', 'Ventilator', 'Defibrillator', 'X-Ray Machine', 'Surgical Robot', 'Ultrasound Machine',
    'ECG Monitor', 'Infusion Pump', 'Anesthesia Machine', 'Dialysis Machine', 'CT Scanner', 'Stethoscope'
  ]),
  computing: Object.freeze([
    'Laptop', 'Supercomputer', 'Server Rack', 'Mainframe', 'Workstation', 'Tablet',
    'Desktop Computer', 'Single-board Computer', 'Gaming PC', 'Thin Client', 'Chromebook', 'MacBook'
  ]),
  robotics: Object.freeze([
    'Industrial Robot', 'Humanoid Robot', 'Robot Arm', 'Autonomous Drone', 'AI Assistant', 'Neural Network',
    'Autonomous System', 'Machine Learning Model', 'Computer Vision System', 'Reinforcement Agent', 'Service Robot', 'Mechatronic Platform'
  ]),
  vehicles: Object.freeze([
    'Ferrari', 'Lamborghini', 'Maserati', 'Porsche 911', 'Formula One Car', 'NASCAR Stock Car',
    'Ford Mustang', 'Chevrolet Corvette', 'Tesla Model S', 'Mini Van', 'Pickup Truck', 'Sports Car'
  ]),
  aircraft: Object.freeze([
    'Boeing 747', 'F-16', 'AH-64 Apache', 'B-2 Spirit', 'Concorde', 'C-130 Hercules',
    'MQ-9 Reaper', 'A-10 Warthog', 'SR-71 Blackbird', 'Eurofighter Typhoon', 'Boeing 787', 'Airbus A320'
  ]),
  spacecraft: Object.freeze([
    'Apollo Command Module', 'Space Shuttle', 'Falcon 9', 'Soyuz', 'International Space Station', 'Starship',
    'Lunar Module', 'Voyager 1', 'Hubble Telescope', 'Crew Dragon', 'James Webb Space Telescope', 'Saturn V'
  ]),
  naval: Object.freeze([
    'Aircraft Carrier', 'Destroyer', 'Submarine', 'Battleship', 'Cruiser', 'Frigate',
    'Patrol Boat', 'Nuclear Submarine', 'Corvette', 'Amphibious Assault Ship', 'Tugboat', 'Dreadnought'
  ]),
  trains: Object.freeze([
    'Bullet Train', 'Freight Train', 'Subway Train', 'Locomotive', 'Maglev Train', 'Tram',
    'Metro Rail', 'High-Speed Rail', 'Commuter Train', 'Steam Engine', 'Monorail', 'Light Rail'
  ]),
  cities: Object.freeze([
    'New York City', 'Tokyo', 'London', 'Paris', 'Dubai', 'Singapore',
    'Los Angeles', 'Seoul', 'Shanghai', 'Rome', 'Berlin', 'Sydney'
  ]),
  environments: Object.freeze([
    'Arctic', 'Sahara Desert', 'Deep Ocean', 'Volcano', 'Himalayas', 'Rainforest',
    'Antarctica', 'Canyon', 'Tundra', 'Swamp', 'Jungle', 'Tornado Alley'
  ]),
  historical: Object.freeze([
    'Great Wall of China', 'Pyramids of Giza', 'Colosseum', 'Machu Picchu', 'Stonehenge', 'Acropolis',
    'Angkor Wat', 'Petra', 'Taj Mahal', 'Roman Forum', 'Forbidden City', 'Eiffel Tower'
  ]),
  cyber: Object.freeze([
    'Firewall', 'SOC Analyst', 'Penetration Tester', 'Encryption Engine', 'Zero Trust Architecture', 'Intrusion Detection System',
    'SIEM Platform', 'Threat Hunter', 'Incident Response Team', 'Red Team Operator', 'Blue Team Operator', 'Sandbox Analyzer'
  ]),
  aerospace: Object.freeze([
    'Jet Engine', 'Wind Tunnel', 'Rocket Nozzle', 'Aerospace Engineer', 'Composite Airframe', 'Flight Computer',
    'Guidance System', 'Satellite Bus', 'Avionics Suite', 'Launch Vehicle', 'Orbital Mechanics Analyst', 'Propulsion Lab'
  ]),
  biotech: Object.freeze([
    'CRISPR', 'DNA Sequencer', 'Bioreactor', 'Gene Therapy', 'mRNA Platform', 'Biotech Lab',
    'Genome Editor', 'Cell Culture System', 'Protein Engineer', 'Bioinformatics Pipeline', 'PCR Machine', 'Stem Cell Researcher'
  ]),
  quantum: Object.freeze([
    'Quantum Computer', 'Qubit Processor', 'Quantum Physicist', 'Particle Accelerator', 'CERN Scientist', 'Quantum Sensor',
    'Superconducting Qubit', 'Ion Trap', 'Quantum Key Distribution', 'Schrodinger Equation', 'Entanglement Lab', 'Feynman Diagram'
  ]),
  leaders: Object.freeze([
    'Nelson Mandela', 'Winston Churchill', 'Abraham Lincoln', 'Angela Merkel', 'Jacinda Ardern', 'Theodore Roosevelt',
    'Donald Trump', 'John F. Kennedy', 'JFK', 'Henry VIII', 'King Henry', 'Margaret Thatcher',
    'Barack Obama', 'Lee Kuan Yew', 'Volodymyr Zelenskyy', 'Mahatma Gandhi', 'Franklin D. Roosevelt'
  ]),
  diplomacy: Object.freeze([
    'Kofi Annan', 'Ban Ki-moon', 'Dag Hammarskjold', 'Henry Kissinger', 'Madeleine Albright', 'Richard Holbrooke',
    'Foreign Minister', 'UN Envoy', 'Peace Envoy', 'Treaty Negotiator', 'Diplomatic Summit', 'Ceasefire Accord'
  ]),
  revolution_conflict: Object.freeze([
    'Napoleon Bonaparte', 'George Washington', 'Joan of Arc', 'Simon Bolivar', 'Toussaint Louverture', 'Sun Tzu',
    'Campaign General', 'War Strategist', 'Revolutionary Leader', 'Uprising Commander', 'Conflict Historian', 'Battlefront Commander'
  ]),
  deities: Object.freeze([
    'Zeus', 'Athena', 'Odin', 'Thor', 'Ra', 'Anubis',
    'Shiva', 'Vishnu', 'Poseidon', 'Ares', 'Hera', 'Loki'
  ]),
  mythic: Object.freeze([
    'Dragon', 'Kraken', 'Minotaur', 'Phoenix', 'Hydra', 'Cerberus',
    'Unicorn', 'Griffin', 'Cyclops', 'Werewolf', 'Vampire', 'Godzilla'
  ]),
  scifi: Object.freeze([
    'Star Wars', 'Star Trek', 'Mass Effect', 'Dune', 'The Expanse', 'Doctor Who',
    'Battlestar Galactica', 'science fiction', 'space opera', 'cyberpunk', 'Alien franchise', 'Blade Runner'
  ]),
  cuisine: Object.freeze([
    'Sushi', 'Ramen', 'Tacos', 'Paella', 'Curry', 'Kimchi',
    'Pho', 'Pasta', 'Biryani', 'Falafel', 'Dumplings', 'Ceviche'
  ]),
  science: Object.freeze([
    'Albert Einstein', 'Marie Curie', 'Nikola Tesla', 'Ada Lovelace', 'Alan Turing', 'Katherine Johnson',
    'Rosalind Franklin', 'Richard Feynman', 'Isaac Newton', 'Galileo Galilei', 'Charles Darwin', 'Carl Sagan'
  ]),
  media: Object.freeze([
    'Batman', 'Spider-Man', 'Wonder Woman', 'Harry Potter', 'Sherlock Holmes', 'Naruto Uzumaki',
    'Megan Fox', 'Gordon Ramsay', 'Darth Vader', 'Iron Man', 'Scooby-Doo', 'SpongeBob SquarePants'
  ])
});

function inferCategorySignalDomain(category = {}) {
  const id = String(category && category.id || '').toLowerCase();
  const family = String(category && category.family || '').toLowerCase();
  const displayName = String(category && category.displayName || '').toLowerCase();
  if (id.includes('detective') || id.includes('investigator') || displayName.includes('detective')) return 'detective';
  if (id.includes('firefighter') || id.includes('rescuer') || displayName.includes('rescue')) return 'rescue';
  if (id.includes('martial-artists')) return 'martial';
  if (id.includes('combat-sports')) return 'combat_sports';
  if (id.includes('monster-hunters')) return 'monster_hunters';
  if (id.includes('mecha-pilots')) return 'mecha_pilots';
  if (id.includes('scifi-franchises') || id.includes('sci-fi-franchises')) return 'scifi';
  if (id.includes('leader') || family.includes('leader') || displayName.includes('leader')) return 'leaders';
  if (id.includes('medical-professional') || (id.includes('medical') && !id.includes('equipment')) || displayName.includes('medical professional')) return 'medical';
  if (id.includes('musician') || id.includes('performer')) return 'music';
  if (id.includes('actor') || id.includes('entertainer')) return 'actor';
  if (id.includes('chef') || id.includes('culinary') || id.includes('cuisine')) return 'chef';
  if (id.includes('pilot') || id.includes('aviator')) return 'pilot';
  if (id.includes('explorer') || id.includes('adventurer')) return 'explorer';
  if (id.includes('superhero') || id.includes('marvel') || id.includes('dc')) return 'superheroes';
  if (id.includes('anime')) return 'anime';
  if (id.includes('villain') || id.includes('antagonist')) return 'villains';
  if (id.includes('magic')) return 'magic';
  if (id.includes('mecha')) return 'mecha_pilots';
  if (id.includes('monster')) return 'monster_hunters';
  if (id.includes('tool')) return 'tools';
  if (id.includes('machinery')) return 'machinery';
  if (id.includes('firearm')) return 'firearms';
  if (id.includes('medical-equipment')) return 'medical_equipment';
  if (id.includes('computing')) return 'computing';
  if (id.includes('robotics') || id.includes('ai-systems')) return 'robotics';
  if (id.includes('car') || id.includes('vehicle') || id.includes('supercar') || family.includes('vehicles')) return 'vehicles';
  if (id.includes('aircraft')) return 'aircraft';
  if (id.includes('spacecraft')) return 'spacecraft';
  if (id.includes('naval') || id.includes('vessel')) return 'naval';
  if (id.includes('train') || id.includes('transit')) return 'trains';
  if (id.includes('city') || id.includes('urban')) return 'cities';
  if (id.includes('environment')) return 'environments';
  if (id.includes('historical-site')) return 'historical';
  if (id.includes('cybersecurity')) return 'cyber';
  if (id.includes('aerospace')) return 'aerospace';
  if (id.includes('biotech') || id.includes('genetic')) return 'biotech';
  if (id.includes('quantum')) return 'quantum';
  if (
    id.includes('diplomacy')
    || id.includes('treaty')
    || id.includes('negotiation')
    || id.includes('peace-talk')
    || displayName.includes('diplomacy')
    || displayName.includes('treaties')
  ) return 'diplomacy';
  if (
    id.includes('revolution')
    || id.includes('conflict')
    || id.includes('war-history')
    || id.includes('uprising')
    || displayName.includes('revolution')
    || displayName.includes('conflict')
  ) return 'revolution_conflict';
  if (id.includes('deities') || id.includes('pantheon')) return 'deities';
  if (id.includes('mythic')) return 'mythic';
  if (id.includes('global-cuisines')) return 'cuisine';
  if (id.includes('sport') || id.includes('athlete') || family.includes('sports')) return 'sports';
  if (id.includes('tech') || id.includes('robot') || id.includes('comput') || family.includes('science')) return 'science';
  if (family.includes('media') || family.includes('fiction')) return 'media';
  return 'media';
}

function singularizeToken(token = '') {
  const value = String(token || '').trim().toLowerCase();
  if (!value || value.length <= 2) return value;
  if (/(us|is|os|ss|ics)$/.test(value)) return value;
  if (value.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`;
  if (value.endsWith('ses') && value.length > 4) return value.slice(0, -2);
  if (value.endsWith('s') && !value.endsWith('ss') && value.length > 3) return value.slice(0, -1);
  return value;
}

function normalizeSignalList(values = []) {
  const out = [];
  const seen = new Set();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const normalized = normalizeLooseText(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
    if (!normalized.includes(' ')) {
      const singular = singularizeToken(normalized);
      if (
        singular
        && singular !== normalized
        && singular.length >= 4
        && !SIGNAL_STOP_WORDS.has(singular)
        && !NON_SIGNAL_TOKENS.has(singular)
        && !seen.has(singular)
      ) {
        seen.add(singular);
        out.push(singular);
      }
    }
  });
  return out;
}

function extractSignalTokens(value = '') {
  return normalizeLooseText(value)
    .split(' ')
    .map((token) => String(token || '').trim().toLowerCase())
    .filter((token) => token && token.length >= 3 && !SIGNAL_STOP_WORDS.has(token))
    .flatMap((token) => {
      const singular = singularizeToken(token);
      return singular && singular !== token ? [token, singular] : [token];
    });
}

function buildBigramSignals(value = '') {
  const tokens = normalizeLooseText(value)
    .split(' ')
    .map((token) => String(token || '').trim().toLowerCase())
    .filter((token) => token && token.length >= 3 && !SIGNAL_STOP_WORDS.has(token));
  const out = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const phrase = `${tokens[i]} ${tokens[i + 1]}`.trim();
    if (phrase) out.push(phrase);
  }
  return out;
}

function mergeSignals(...lists) {
  return normalizeSignalList(lists.flatMap((list) => (Array.isArray(list) ? list : [])));
}

function buildCategorySignalPack(category = {}) {
  const familyKey = String(category.family || '').toLowerCase();
  const familySignals = FAMILY_SIGNAL_PACKS[familyKey] || {};
  const overrideSignals = CATEGORY_SIGNAL_OVERRIDES[String(category.id || '').toLowerCase()] || {};
  const categoryIdSignals = String(category.id || '').replace(/-/g, ' ');
  const signalDomain = inferCategorySignalDomain(category);
  const domainNameSignals = CATEGORY_DOMAIN_NAME_SIGNALS[signalDomain] || [];

  const strictCoreSignals = mergeSignals(
    category.aliases,
    category.exampleEntriesStrong,
    overrideSignals.strictCore
  ).filter((signal) => !NON_SPECIFIC_STRICT_SIGNALS.has(signal));
  const keywordTokens = mergeSignals(
    extractSignalTokens(categoryIdSignals),
    extractSignalTokens(category.displayName),
    extractSignalTokens(category.descriptionShort)
  );
  const keywordBigrams = mergeSignals(
    buildBigramSignals(categoryIdSignals),
    buildBigramSignals(category.displayName),
    buildBigramSignals(category.descriptionShort)
  );

  let coreSignals = mergeSignals(
    strictCoreSignals,
    category.inclusionRules,
    keywordTokens,
    familySignals.core,
    overrideSignals.core
  );
  let relatedSignals = mergeSignals(
    keywordBigrams,
    familySignals.related,
    overrideSignals.related
  );
  let negativeSignals = mergeSignals(
    category.exclusionRules,
    category.exampleEntriesWeak,
    familySignals.negative,
    overrideSignals.negative
  );
  let supportSignals = mergeSignals(
    familySignals.support,
    overrideSignals.support
  );
  let primaryNameSignals = mergeSignals(
    category.aliases,
    category.inclusionRules,
    category.exampleEntriesStrong,
    domainNameSignals,
    keywordTokens,
    keywordBigrams,
    overrideSignals.primaryName
  );
  let supportNameSignals = mergeSignals(
    category.aliases,
    category.inclusionRules,
    domainNameSignals.slice(0, 8),
    supportSignals,
    overrideSignals.supportName
  );

  const coreSet = new Set(coreSignals);
  relatedSignals = relatedSignals.filter((signal) => !coreSet.has(signal));
  const relatedSet = new Set(relatedSignals);
  supportSignals = supportSignals.filter((signal) => !coreSet.has(signal) && !relatedSet.has(signal));
  negativeSignals = negativeSignals.filter((signal) => !coreSet.has(signal));

  if (coreSignals.length < 16) {
    coreSignals = mergeSignals(coreSignals, familySignals.core, relatedSignals);
  }
  if (relatedSignals.length < 10) {
    relatedSignals = mergeSignals(relatedSignals, familySignals.related, keywordTokens);
  }
  if (negativeSignals.length < 8) {
    negativeSignals = mergeSignals(negativeSignals, familySignals.negative);
  }
  if (primaryNameSignals.length < 10) {
    primaryNameSignals = mergeSignals(primaryNameSignals, strictCoreSignals, coreSignals, keywordTokens);
  }
  if (supportNameSignals.length < 8) {
    supportNameSignals = mergeSignals(supportNameSignals, supportSignals, relatedSignals, keywordBigrams);
  }
  if (coreSignals.length < SIGNAL_DEPTH_TARGETS.core) {
    coreSignals = mergeSignals(coreSignals, category.aliases, category.inclusionRules, keywordBigrams, domainNameSignals);
  }
  if (relatedSignals.length < SIGNAL_DEPTH_TARGETS.related) {
    relatedSignals = mergeSignals(relatedSignals, keywordBigrams, keywordTokens, domainNameSignals);
  }
  if (negativeSignals.length < SIGNAL_DEPTH_TARGETS.negative) {
    negativeSignals = mergeSignals(
      negativeSignals,
      familySignals.negative,
      [
        'random object',
        'random food',
        'random place',
        'unrelated category',
        'misc item',
        'generic thing',
        'unknown object',
        'non category fit'
      ]
    );
  }
  if (supportSignals.length < SIGNAL_DEPTH_TARGETS.support) {
    supportSignals = mergeSignals(
      supportSignals,
      familySignals.support,
      category.aliases,
      keywordTokens,
      domainNameSignals.slice(0, 10)
    );
  }
  if (primaryNameSignals.length < SIGNAL_DEPTH_TARGETS.primaryName) {
    primaryNameSignals = mergeSignals(
      primaryNameSignals,
      strictCoreSignals,
      category.aliases,
      category.inclusionRules,
      category.exampleEntriesStrong,
      domainNameSignals,
      coreSignals,
      relatedSignals,
      supportSignals,
      keywordTokens,
      keywordBigrams
    );
  }
  if (supportNameSignals.length < SIGNAL_DEPTH_TARGETS.supportName) {
    supportNameSignals = mergeSignals(
      supportNameSignals,
      category.aliases,
      category.inclusionRules,
      supportSignals,
      relatedSignals,
      keywordTokens,
      domainNameSignals.slice(0, 12)
    );
  }

  return {
    strictCoreSignals,
    coreSignals,
    relatedSignals,
    negativeSignals,
    supportSignals,
    primaryNameSignals,
    supportNameSignals
  };
}

function loadRegistry() {
  if (REGISTRY_CACHE) return REGISTRY_CACHE;
  const raw = fs.readFileSync(REGISTRY_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  const categories = (Array.isArray(parsed && parsed.categories) ? parsed.categories : [])
    .map((entry) => ({
      id: asSlug(entry && entry.id),
      displayName: String(entry && entry.displayName || '').trim(),
      family: String(entry && entry.family || 'unknown').trim().toLowerCase(),
      aliases: Array.isArray(entry && entry.aliases) ? entry.aliases.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean) : [],
      descriptionShort: String(entry && entry.descriptionShort || '').trim(),
      inclusionRules: Array.isArray(entry && entry.inclusionRules) ? entry.inclusionRules.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean) : [],
      exclusionRules: Array.isArray(entry && entry.exclusionRules) ? entry.exclusionRules.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean) : [],
      exampleEntriesStrong: Array.isArray(entry && entry.exampleEntriesStrong) ? entry.exampleEntriesStrong.slice(0, 6) : [],
      exampleEntriesWeak: Array.isArray(entry && entry.exampleEntriesWeak) ? entry.exampleEntriesWeak.slice(0, 6) : [],
      riskLevel: String(entry && entry.riskLevel || 'med').trim().toLowerCase(),
      enabled: entry && entry.enabled !== false,
      weightProfileId: entry && entry.weightProfileId ? String(entry.weightProfileId) : null
    }))
    .map((entry) => ({
      ...entry,
      signalPack: buildCategorySignalPack(entry)
    }))
    .filter((entry) => entry.id && entry.displayName);

  const byId = new Map();
  categories.forEach((category) => byId.set(category.id, category));

  REGISTRY_CACHE = {
    version: String(parsed && parsed.version || 'v1'),
    updatedAt: String(parsed && parsed.updatedAt || ''),
    categories,
    byId
  };
  return REGISTRY_CACHE;
}

function getEnabledCategories() {
  return loadRegistry().categories.filter((entry) => entry.enabled !== false);
}

function getCategoryById(id) {
  const key = asSlug(id);
  if (!key) return null;
  return loadRegistry().byId.get(key) || null;
}

function toCategorySummary(category) {
  if (!category) return null;
  return {
    id: category.id,
    displayName: category.displayName,
    family: category.family,
    riskLevel: category.riskLevel,
    version: loadRegistry().version,
    weightProfileId: category.weightProfileId || null
  };
}

function normalizeCategorySettings(settings = {}) {
  const safe = settings && typeof settings === 'object' ? settings : {};
  const modeRaw = normalizeCategoryModeValue(safe.categoriesMode || DEFAULT_CATEGORY_SETTINGS.categoriesMode);
  const categoriesMode = CATEGORY_MODES.has(modeRaw) ? modeRaw : DEFAULT_CATEGORY_SETTINGS.categoriesMode;
  const categoryId = asSlug(safe.categoryId);
  const categoryVersion = String(safe.categoryVersion || loadRegistry().version || 'v1').trim().slice(0, 24) || 'v1';
  const categoryVoteOptions = Array.from(new Set(
    (Array.isArray(safe.categoryVoteOptions) ? safe.categoryVoteOptions : [])
      .map(asSlug)
      .filter(Boolean)
      .filter((id) => Boolean(getCategoryById(id)))
  )).slice(0, 5);

  return {
    categoriesMode,
    categoryId: categoryId || null,
    categoryVersion,
    categoryVoteOptions
  };
}

function scoreCategoryForRandom(category, recentIds = [], familyUsage = {}) {
  const recencyPenalty = recentIds.includes(category.id) ? 0.25 : 1;
  const riskWeight = category.riskLevel === 'low'
    ? 1
    : category.riskLevel === 'med'
      ? 0.8
      : 0.55;
  const familyCount = Number(familyUsage[category.family]) || 0;
  const familyWeight = 1 / (1 + Math.max(0, familyCount));
  return recencyPenalty * riskWeight * familyWeight;
}

function weightedPick(rows) {
  const safe = Array.isArray(rows) ? rows : [];
  const total = safe.reduce((sum, row) => sum + Math.max(0, Number(row && row.weight) || 0), 0);
  if (total <= 0 || !safe.length) return null;
  const ticket = Math.random() * total;
  let cursor = 0;
  for (const row of safe) {
    cursor += Math.max(0, Number(row && row.weight) || 0);
    if (ticket <= cursor) return row.item;
  }
  return safe[safe.length - 1].item;
}

function buildFamilyUsageMap(recentCategoryIds = []) {
  const usage = {};
  (Array.isArray(recentCategoryIds) ? recentCategoryIds : []).forEach((id) => {
    const category = getCategoryById(id);
    if (!category) return;
    const family = String(category.family || 'unknown');
    usage[family] = (usage[family] || 0) + 1;
  });
  return usage;
}

function pickSmartRandomCategory({ recentCategoryIds = [], blockedIds = [] } = {}) {
  const recent = (Array.isArray(recentCategoryIds) ? recentCategoryIds : []).map(asSlug).filter(Boolean).slice(-8);
  const blocked = new Set((Array.isArray(blockedIds) ? blockedIds : []).map(asSlug).filter(Boolean));
  const familyUsage = buildFamilyUsageMap(recent);
  const pool = getEnabledCategories().filter((category) => !blocked.has(category.id));
  if (!pool.length) return null;

  const weightedRows = pool.map((category) => ({
    item: category,
    weight: scoreCategoryForRandom(category, recent, familyUsage)
  }));
  return weightedPick(weightedRows) || pool[0];
}

function buildVoteOptions({ count = 3, recentCategoryIds = [], blockedIds = [] } = {}) {
  const safeCount = clamp(Math.round(Number(count) || 3), 3, 5);
  const chosen = [];
  const blocked = new Set((Array.isArray(blockedIds) ? blockedIds : []).map(asSlug).filter(Boolean));
  while (chosen.length < safeCount) {
    const next = pickSmartRandomCategory({
      recentCategoryIds,
      blockedIds: [...blocked, ...chosen.map((entry) => entry.id)]
    });
    if (!next) break;
    chosen.push(next);
  }
  return chosen.map(toCategorySummary).filter(Boolean);
}

function lockCategoryForMatch(settings = {}, { recentCategoryIds = [] } = {}) {
  const normalized = normalizeCategorySettings(settings);
  if (normalized.categoriesMode === 'off') {
    return {
      normalizedSettings: normalized,
      lockedCategory: null,
      selectionSource: 'off'
    };
  }

  const hostSelected = normalized.categoryId ? getCategoryById(normalized.categoryId) : null;
  if (normalized.categoriesMode === 'host_select' && hostSelected) {
    return {
      normalizedSettings: normalized,
      lockedCategory: toCategorySummary(hostSelected),
      selectionSource: 'host_select'
    };
  }

  if (normalized.categoriesMode === 'group_vote') {
    let voteOptions = normalized.categoryVoteOptions.map(getCategoryById).filter(Boolean);
    if (voteOptions.length < 3) {
      voteOptions = buildVoteOptions({
        count: 3,
        recentCategoryIds,
        blockedIds: voteOptions.map((entry) => entry.id)
      }).map((option) => getCategoryById(option.id)).filter(Boolean);
    }
    const winner = voteOptions[0] || pickSmartRandomCategory({ recentCategoryIds });
    return {
      normalizedSettings: {
        ...normalized,
        categoryVoteOptions: voteOptions.map((entry) => entry.id)
      },
      lockedCategory: toCategorySummary(winner),
      selectionSource: 'group_vote_fallback'
    };
  }

  const randomCategory = pickSmartRandomCategory({ recentCategoryIds }) || hostSelected;
  return {
    normalizedSettings: normalized,
    lockedCategory: toCategorySummary(randomCategory),
    selectionSource: 'smart_random'
  };
}

function resolveCategoryFit({
  categoryContext,
  rawEntryName,
  scoringInfo,
  subscores,
  confidenceOverall,
  confidenceName,
  riskFlags
} = {}) {
  const active = categoryContext && categoryContext.enabled === true && categoryContext.id;
  if (!active) {
    return {
      active: false,
      categoryFit: 50,
      membershipConfidence: 50,
      withinCategoryPowerRank: 50,
      ambiguityHandling: 50,
      eligibilityPenalty: 0,
      inCategoryBonus: 0,
      netImpact: 0,
      explain: 'Categories mode inactive for this evaluation.'
    };
  }

  const category = getCategoryById(categoryContext.id);
  if (!category) {
    return {
      active: false,
      categoryFit: 50,
      membershipConfidence: 50,
      withinCategoryPowerRank: 50,
      ambiguityHandling: 40,
      eligibilityPenalty: -6,
      inCategoryBonus: 0,
      netImpact: -6,
      explain: 'Category context missing from registry; applied conservative fallback.'
    };
  }

  const rawName = String(rawEntryName || '').toLowerCase();
  const title = String(scoringInfo && (scoringInfo.title || scoringInfo.name) || '').toLowerCase();
  const description = String(scoringInfo && scoringInfo.description || '').toLowerCase();
  const categories = Array.isArray(scoringInfo && scoringInfo.categories)
    ? scoringInfo.categories.map((entry) => String(entry || '').toLowerCase()).join(' ')
    : '';
  const aliases = Array.isArray(scoringInfo && scoringInfo.aliases)
    ? scoringInfo.aliases.map((entry) => String(entry || '').toLowerCase()).join(' ')
    : '';
  const corpus = `${rawName} ${title} ${description} ${categories} ${aliases}`.trim();
  const corpusNormalized = normalizeLooseText(corpus);
  const rawNameNormalized = normalizeLooseText(rawEntryName || title || rawName);
  const resolvedNameNormalized = normalizeLooseText(title || rawEntryName || rawName);
  const aliasNameNormalized = normalizeLooseText(aliases);
  const signalPack = category && category.signalPack && typeof category.signalPack === 'object'
    ? category.signalPack
    : buildCategorySignalPack(category);

  const inclusionHits = countRuleHits(corpusNormalized, category.inclusionRules);
  const exclusionHits = countRuleHits(corpusNormalized, category.exclusionRules);
  const aliasHitsCorpus = countRuleHits(corpusNormalized, category.aliases, { allowLooseStem: false });
  const aliasHitsNameExact = Math.max(
    countRuleHits(rawNameNormalized, category.aliases, { allowLooseStem: false }),
    countRuleHits(resolvedNameNormalized, category.aliases, { allowLooseStem: false }),
    countRuleHits(aliasNameNormalized, category.aliases, { allowLooseStem: false })
  );
  const aliasHitsNameApprox = Math.max(
    countApproximateNameHits(rawNameNormalized, category.aliases),
    countApproximateNameHits(resolvedNameNormalized, category.aliases),
    countApproximateNameHits(aliasNameNormalized, category.aliases)
  );
  const aliasHits = Math.max(aliasHitsCorpus, aliasHitsNameExact, aliasHitsNameApprox);
  const strongExampleHits = countRuleHits(corpusNormalized, category.exampleEntriesStrong || [], { allowLooseStem: false });
  const weakExampleHits = countRuleHits(corpusNormalized, category.exampleEntriesWeak || [], { allowLooseStem: false });
  const strictCoreHits = countRuleHits(corpusNormalized, signalPack.strictCoreSignals || [], { allowLooseStem: false });
  const coreHits = countRuleHits(corpusNormalized, signalPack.coreSignals || []);
  const relatedHits = countRuleHits(corpusNormalized, signalPack.relatedSignals || []);
  const negativeSignalHits = countRuleHits(corpusNormalized, signalPack.negativeSignals || []);
  const supportHitsCorpus = countRuleHits(corpusNormalized, signalPack.supportSignals || []);
  const supportHitsName = countRuleHits(rawNameNormalized, signalPack.supportSignals || []);
  const supportHitsTitle = countRuleHits(resolvedNameNormalized, signalPack.supportSignals || []);
  const supportHitsAlias = countRuleHits(aliasNameNormalized, signalPack.supportSignals || []);
  const supportHits = Math.max(supportHitsCorpus, supportHitsName, supportHitsTitle, supportHitsAlias);
  const primaryNameHitsExact = Math.max(
    countRuleHits(rawNameNormalized, signalPack.primaryNameSignals || [], { allowLooseStem: false }),
    countRuleHits(resolvedNameNormalized, signalPack.primaryNameSignals || [], { allowLooseStem: false }),
    countRuleHits(aliasNameNormalized, signalPack.primaryNameSignals || [], { allowLooseStem: false })
  );
  const primaryNameHitsApprox = Math.max(
    countApproximateNameHits(rawNameNormalized, signalPack.primaryNameSignals || []),
    countApproximateNameHits(resolvedNameNormalized, signalPack.primaryNameSignals || []),
    countApproximateNameHits(aliasNameNormalized, signalPack.primaryNameSignals || [])
  );
  const primaryNameHits = Math.max(primaryNameHitsExact, primaryNameHitsApprox);
  const supportNameHitsExact = Math.max(
    countRuleHits(rawNameNormalized, signalPack.supportNameSignals || [], { allowLooseStem: false }),
    countRuleHits(resolvedNameNormalized, signalPack.supportNameSignals || [], { allowLooseStem: false }),
    countRuleHits(aliasNameNormalized, signalPack.supportNameSignals || [], { allowLooseStem: false })
  );
  const supportNameHitsApprox = Math.max(
    countApproximateNameHits(rawNameNormalized, signalPack.supportNameSignals || []),
    countApproximateNameHits(resolvedNameNormalized, signalPack.supportNameSignals || []),
    countApproximateNameHits(aliasNameNormalized, signalPack.supportNameSignals || [])
  );
  const supportNameHits = Math.max(supportNameHitsExact, supportNameHitsApprox);
  const sportsAdjacentHits = countRuleHits(corpusNormalized, [
    'speedster',
    'sprinter',
    'runner',
    'track and field',
    'track athlete',
    'marathon',
    'racer'
  ]);
  const sportsAdjacentEvidence =
    String(category && category.family || '').toLowerCase() === 'sports/competition'
    && sportsAdjacentHits >= 1;
  const derivedCoreHits = Math.max(0, coreHits - strictCoreHits);
  const positiveEvidenceHits = strictCoreHits + derivedCoreHits + relatedHits;
  const conflictHits = exclusionHits + weakExampleHits + negativeSignalHits;
  const sportsAdjacentStrongEvidence = sportsAdjacentEvidence && sportsAdjacentHits >= 2 && conflictHits <= 2;
  const strongMembershipEvidence =
    strictCoreHits >= 1
    || derivedCoreHits >= 2
    || (primaryNameHits >= 1 && (supportNameHits >= 1 || relatedHits >= 1));
  const strongAnchorIdentity = strictCoreHits >= 1 && primaryNameHits >= 1 && conflictHits <= 1;
  const inferredAnchorEvidence =
    (derivedCoreHits >= 4 && conflictHits === 0)
    || (derivedCoreHits >= 3 && relatedHits >= 1 && conflictHits <= 1)
    || (derivedCoreHits >= 2 && relatedHits >= 2 && supportHits >= 1 && conflictHits === 0)
    || (primaryNameHits >= 1 && supportHits >= 1 && conflictHits <= 1);
  const anchorMembershipEvidence =
    strictCoreHits >= 1
    || aliasHits >= 1
    || primaryNameHits >= 1
    || (supportNameHits >= 1 && relatedHits >= 1)
    || inferredAnchorEvidence;
  const explicitNameAnchored = primaryNameHits >= 1
    && (aliasHits >= 1 || supportNameHits >= 1 || strictCoreHits >= 1)
    && conflictHits === 0;
  const supportNameOnly = supportNameHits > 0 && primaryNameHits <= 0;
  const supportOnlyEvidence = supportNameOnly || (supportHits > 0 && !strongMembershipEvidence && relatedHits >= 1);
  const lowEvidence = corpus.length < 120;
  const anchorInclusionHits = Math.max(inclusionHits, strictCoreHits >= 1 ? 1 : 0, primaryNameHits >= 1 ? 1 : 0);
  const anchorAliasHits = Math.max(aliasHits, primaryNameHits >= 1 ? 1 : 0, supportNameHits >= 1 ? 1 : 0, derivedCoreHits >= 3 ? 1 : 0);
  const safeConfidenceName = clamp(Number(confidenceName) || 0, 0, 1);
  const safeConfidenceOverall = clamp(Number(confidenceOverall) || 0, 0, 1);
  const riskSet = new Set((Array.isArray(riskFlags) ? riskFlags : []).map((entry) => String(entry || '').toLowerCase()));
  const riskyTitleMismatch =
    riskSet.has('dangerous_title_diff_suspected')
    || (
      riskSet.has('title_differs_from_input')
      && (riskSet.has('synthetic_image') || safeConfidenceName < 0.68)
    );
  const lowTrustIdentity =
    safeConfidenceName < 0.6
    && (riskSet.has('high_candidate_ambiguity') || riskSet.has('low_signal_ambiguity'));
  const reliabilityRisk = riskyTitleMismatch || lowTrustIdentity;

  let membershipConfidence =
    20 +
    (strictCoreHits * 15) +
    (derivedCoreHits * 8) +
    (relatedHits * 5) +
    Math.min(8, supportHits * 2) -
    (conflictHits * 9);
  if (strictCoreHits >= 1) membershipConfidence += 6;
  if (strictCoreHits >= 2) membershipConfidence += 4;
  if (derivedCoreHits >= 2) membershipConfidence += 3;
  if (derivedCoreHits >= 3 && conflictHits === 0) membershipConfidence += 5;
  if (inclusionHits > 0 && aliasHits > 0) membershipConfidence += 6;
  if (strongExampleHits > 0) membershipConfidence += 4;
  if (strongMembershipEvidence && relatedHits > 0) membershipConfidence += 4;
  if (strongMembershipEvidence && conflictHits === 0) membershipConfidence += 4;
  if (primaryNameHits > 0 && relatedHits > 0 && conflictHits <= 1) membershipConfidence += 4;
  if (derivedCoreHits >= 2 && relatedHits >= 2 && conflictHits <= 1) membershipConfidence += 5;
  if (sportsAdjacentEvidence && supportNameHits >= 1 && conflictHits <= 2) membershipConfidence += 4;
  if (sportsAdjacentStrongEvidence && supportNameHits <= 0) membershipConfidence += 2;
  if (strongAnchorIdentity) membershipConfidence += 6;
  if (primaryNameHits > 0) membershipConfidence += 6;
  if (supportNameHits > 0) membershipConfidence += 4;
  if (!strongMembershipEvidence && relatedHits > 0) membershipConfidence -= 2;
  if (supportOnlyEvidence) membershipConfidence -= 9;
  if (sportsAdjacentEvidence && !strongMembershipEvidence && supportNameHits <= 0) membershipConfidence -= 2;
  if (positiveEvidenceHits <= 0) membershipConfidence -= 12;
  else if (positiveEvidenceHits === 1) membershipConfidence -= 6;
  if (lowEvidence) membershipConfidence -= positiveEvidenceHits >= 2 ? 2 : 5;
  if (riskSet.has('title_differs_from_input') && safeConfidenceName < 0.78) membershipConfidence -= strongMembershipEvidence ? 2 : 6;
  if (riskSet.has('synthetic_image') && safeConfidenceName < 0.78) membershipConfidence -= strongMembershipEvidence ? 1 : 4;
  if (safeConfidenceName < 0.72) membershipConfidence -= strongMembershipEvidence ? 3 : 8;
  if (riskSet.has('high_candidate_ambiguity')) membershipConfidence -= strongMembershipEvidence ? 4 : 10;
  if (riskSet.has('dangerous_title_diff_suspected')) membershipConfidence -= strongMembershipEvidence ? 8 : 16;
  if (riskSet.has('fast_round_timeout_fallback') && !strongMembershipEvidence) membershipConfidence -= 4;
  if (reliabilityRisk) membershipConfidence -= strongAnchorIdentity ? 2 : (strongMembershipEvidence ? 6 : 14);
  if (strongAnchorIdentity && membershipConfidence < 58) membershipConfidence = 58;
  if (explicitNameAnchored && !supportOnlyEvidence) membershipConfidence = Math.max(membershipConfidence, 52);
  if (supportOnlyEvidence && membershipConfidence > 54) membershipConfidence = 54;
  if (!anchorMembershipEvidence && !strongMembershipEvidence && membershipConfidence > 48) membershipConfidence = 48;
  membershipConfidence = clamp(Math.round(membershipConfidence), 0, 100);

  const baseAbility = clamp(Number(subscores && subscores.baseAbility) || 55, 0, 100);
  const rarity = clamp(Number(subscores && subscores.rarity) || 50, 0, 100);
  const scenarioFit = clamp(Number(subscores && subscores.currentScenarioFit) || 50, 0, 100);
  const withinCategoryPowerRank = clamp(Math.round((baseAbility * 0.58) + (rarity * 0.16) + (scenarioFit * 0.26)), 0, 100);

  let ambiguityHandling = 100;
  if (category.riskLevel === 'med') ambiguityHandling -= 8;
  if (category.riskLevel === 'high') ambiguityHandling -= 16;
  ambiguityHandling -= Math.max(0, conflictHits * 5);
  ambiguityHandling -= Math.max(0, weakExampleHits * 3);
  ambiguityHandling -= Math.max(0, Math.round((1 - safeConfidenceOverall) * 18));
  if (riskSet.has('high_candidate_ambiguity')) ambiguityHandling -= 12;
  if (riskSet.has('fast_round_timeout_fallback') && !strongMembershipEvidence) ambiguityHandling -= 4;
  ambiguityHandling = clamp(Math.round(ambiguityHandling), 0, 100);

  const rawCategoryFit = clamp(
    Math.round((membershipConfidence * 0.58) + (withinCategoryPowerRank * 0.27) + (ambiguityHandling * 0.15)),
    0,
    100
  );

  let eligibilityPenalty = 0;
  if (membershipConfidence < 12) eligibilityPenalty = -26;
  else if (membershipConfidence < 24) eligibilityPenalty = -18;
  else if (membershipConfidence < 36) eligibilityPenalty = -10;
  else if (membershipConfidence < 45) eligibilityPenalty = -4;
  if (!strongMembershipEvidence && relatedHits <= 1) eligibilityPenalty -= 6;
  if (conflictHits >= 2) eligibilityPenalty -= 6;
  if (conflictHits >= 4) eligibilityPenalty -= 4;

  let inCategoryBonus = 0;
  if (membershipConfidence >= 80 && withinCategoryPowerRank >= 44) inCategoryBonus = 20;
  else if (membershipConfidence >= 68 && withinCategoryPowerRank >= 38) inCategoryBonus = 14;
  else if (membershipConfidence >= 56 && withinCategoryPowerRank >= 32) inCategoryBonus = 9;
  else if (membershipConfidence >= 46 && withinCategoryPowerRank >= 28) inCategoryBonus = 5;
  if (!strongMembershipEvidence) {
    inCategoryBonus = Math.min(inCategoryBonus, relatedHits >= 2 ? 3 : 0);
  }
  if (supportOnlyEvidence) {
    inCategoryBonus = Math.min(inCategoryBonus, 1);
    if (eligibilityPenalty > -2) eligibilityPenalty = -2;
  }
  if (primaryNameHits > 0 && !supportOnlyEvidence) {
    inCategoryBonus = Math.max(inCategoryBonus, 6);
  }
  if (explicitNameAnchored && !supportOnlyEvidence) {
    inCategoryBonus = Math.max(inCategoryBonus, 9);
  }
  if (derivedCoreHits >= 3 && conflictHits === 0 && !supportOnlyEvidence) {
    inCategoryBonus = Math.max(inCategoryBonus, 9);
  }
  if (strictCoreHits >= 1 && relatedHits >= 1 && conflictHits <= 1 && !supportOnlyEvidence) {
    inCategoryBonus = Math.max(inCategoryBonus, 8);
  }
  if (sportsAdjacentEvidence && supportNameHits >= 1 && conflictHits <= 2 && !supportOnlyEvidence) {
    inCategoryBonus = Math.max(inCategoryBonus, 5);
  }

  let netImpact = clamp(inCategoryBonus + eligibilityPenalty, -30, 24);
  let categoryFit = clamp(rawCategoryFit + netImpact, 0, 100);
  if (!strongMembershipEvidence) {
    categoryFit = Math.min(categoryFit, relatedHits >= 2 ? 68 : 40);
  }
  if (supportOnlyEvidence) {
    categoryFit = Math.min(categoryFit, 56);
  }
  if (primaryNameHits > 0 && !supportOnlyEvidence) {
    categoryFit = Math.max(categoryFit, 60);
  }
  if (explicitNameAnchored && !supportOnlyEvidence) {
    categoryFit = Math.max(categoryFit, 68);
  }
  if (supportNameHits > 0 && !strongMembershipEvidence) {
    categoryFit = Math.max(categoryFit, relatedHits >= 1 ? 40 : 34);
  }
  if (strictCoreHits >= 2 && primaryNameHits >= 1 && conflictHits === 0 && !supportOnlyEvidence) {
    categoryFit = Math.max(categoryFit, 70);
  } else if (strictCoreHits >= 1 && primaryNameHits >= 1 && conflictHits === 0 && !supportOnlyEvidence) {
    categoryFit = Math.max(categoryFit, 66);
  }
  if (strongAnchorIdentity && !supportOnlyEvidence) {
    categoryFit = Math.max(categoryFit, reliabilityRisk ? 58 : 64);
  }
  if (strongMembershipEvidence && anchorMembershipEvidence && conflictHits <= 1 && !supportOnlyEvidence) {
    categoryFit = Math.max(categoryFit, membershipConfidence >= 62 ? 64 : 58);
  }
  if (sportsAdjacentEvidence && conflictHits <= 2) {
    if (supportNameHits >= 1 && categoryFit < 52) categoryFit = 52;
    else if (sportsAdjacentHits >= 1 && categoryFit < 46) categoryFit = 46;
  }
  if (reliabilityRisk && !explicitNameAnchored && !strongAnchorIdentity) {
    categoryFit = Math.min(categoryFit, supportOnlyEvidence ? 36 : 50);
  } else if (reliabilityRisk && strongAnchorIdentity) {
    categoryFit = Math.min(categoryFit, 66);
  }
  if (safeConfidenceName < 0.58 && !strongMembershipEvidence) {
    categoryFit = Math.min(categoryFit, 44);
  }

  const categoryId = String(category.id || '').toLowerCase();
  const scifiSpecificEvidenceHits = categoryId === 'scifi-franchises'
    ? countRuleHits(corpusNormalized, [
      'star wars',
      'star trek',
      'mass effect',
      'dune',
      'doctor who',
      'battlestar galactica',
      'the expanse',
      'alien franchise',
      'blade runner',
      'science fiction',
      'sci fi',
      'sci-fi',
      'space opera',
      'galactic',
      'starship',
      'interstellar',
      'alien worlds',
      'future technology',
      'extraterrestrial'
    ], { allowLooseStem: false })
    : 0;
  const scifiGenericMediaHits = categoryId === 'scifi-franchises'
    ? countRuleHits(corpusNormalized, ['franchise', 'film franchise', 'media franchise', 'film', 'series', 'fictional universe'])
    : 0;
  const scifiOffDomainHits = categoryId === 'scifi-franchises'
    ? countRuleHits(corpusNormalized, ['action thriller', 'crime thriller', 'assassin', 'archaeologist', 'adventure film', 'boxing', 'basketball', 'politician', 'fictional boxer'])
    : 0;
  const scifiGenericOnlyGuard = categoryId === 'scifi-franchises'
    && scifiSpecificEvidenceHits <= 0
    && scifiGenericMediaHits > 0;
  if (scifiGenericOnlyGuard) {
    membershipConfidence = Math.min(membershipConfidence, scifiOffDomainHits > 0 ? 28 : 36);
    categoryFit = Math.min(categoryFit, scifiOffDomainHits > 0 ? 34 : 42);
    inCategoryBonus = 0;
    netImpact = Math.min(netImpact, scifiOffDomainHits > 0 ? -10 : -4);
  }

  const combatRealCompetitorHits = categoryId === 'combat-sports'
    ? countRuleHits(corpusNormalized, [
      'muhammad ali',
      'floyd mayweather',
      'mike tyson',
      'jon jones',
      'amanda nunes',
      'ronda rousey',
      'khabib nurmagomedov',
      'conor mcgregor',
      'mixed martial artist',
      'heavyweight champion'
    ], { allowLooseStem: false })
    : 0;
  const combatFictionalOrOffRoleHits = categoryId === 'combat-sports'
    ? countRuleHits(corpusNormalized, ['fictional boxer', 'sports drama', 'film character', 'anime villain', 'cursed spirit', 'animated character'])
    : 0;
  const combatSupportRoleHits = categoryId === 'combat-sports'
    ? countRuleHits(corpusNormalized, ['promoter', 'executive', 'president', 'commentator', 'podcaster', 'fight analyst', 'combat sports media'])
    : 0;
  const combatFictionGuard = categoryId === 'combat-sports'
    && combatFictionalOrOffRoleHits > 0
    && combatRealCompetitorHits <= 1;
  const combatSupportRoleGuard = categoryId === 'combat-sports'
    && combatSupportRoleHits > 0
    && combatRealCompetitorHits <= 0;
  if (combatFictionGuard) {
    membershipConfidence = Math.min(membershipConfidence, 34);
    categoryFit = Math.min(categoryFit, 38);
    inCategoryBonus = 0;
    netImpact = Math.min(netImpact, -8);
  } else if (combatSupportRoleGuard) {
    membershipConfidence = Math.min(membershipConfidence, 48);
    categoryFit = Math.min(categoryFit, 56);
    inCategoryBonus = Math.min(inCategoryBonus, 3);
    netImpact = Math.min(netImpact, 0);
  }

  let categoryStatus = 'not_in_category';
  let categoryStatusLabel = 'NOT IN CATEGORY';
  let categoryStatusTone = 'negative';
  let categoryStatusIcon = 'thumbs_down';
  const anchoredIdentityUnderRisk =
    reliabilityRisk
    && strongAnchorIdentity
    && categoryFit >= 58
    && membershipConfidence >= 50;
  const explicitAnchorForInCategory = strictCoreHits >= 1 || primaryNameHits >= 1 || aliasHits >= 1;
  const primaryNameQualified = primaryNameHits > 0 && categoryFit >= 58 && membershipConfidence >= 46;
  const derivedCoreQualified = derivedCoreHits >= 2 && conflictHits <= 1 && categoryFit >= 60 && membershipConfidence >= 44;
  const strictCoreQualified = strictCoreHits >= 1 && conflictHits <= 1 && categoryFit >= 56 && membershipConfidence >= 42;
  if (
    (
      (categoryFit >= 64 && membershipConfidence >= 54 && netImpact >= -1)
      || primaryNameQualified
      || derivedCoreQualified
      || strictCoreQualified
    )
    && strongMembershipEvidence
    && anchorMembershipEvidence
    && explicitAnchorForInCategory
    && membershipConfidence >= 50
    && conflictHits <= 1
    && !supportOnlyEvidence
    && !supportNameOnly
    && (!reliabilityRisk || anchoredIdentityUnderRisk)
  ) {
    categoryStatus = 'in_category';
    categoryStatusLabel = 'IN CATEGORY';
    categoryStatusTone = 'positive';
    categoryStatusIcon = 'thumbs_up';
  } else {
    const borderlineAnchorEvidence =
      strongMembershipEvidence
      || strictCoreHits >= 1
      || primaryNameHits >= 1
      || (supportNameHits >= 1 && (relatedHits >= 1 || sportsAdjacentEvidence))
      || (derivedCoreHits >= 1 && relatedHits >= 1)
      || (relatedHits >= 2 && conflictHits <= 2);
    const borderlineFitEvidence =
      (categoryFit >= 42 && membershipConfidence >= 26 && conflictHits <= 3)
      || (supportOnlyEvidence && categoryFit >= 46 && membershipConfidence >= 30 && conflictHits <= 2)
      || (sportsAdjacentEvidence && categoryFit >= 44 && membershipConfidence >= 24 && conflictHits <= 2)
      || (strictCoreHits >= 1 && categoryFit >= 38 && membershipConfidence >= 24 && conflictHits <= 2);
    if (
      borderlineAnchorEvidence
      && borderlineFitEvidence
      && (!reliabilityRisk || strictCoreHits >= 1 || primaryNameHits >= 1)
    ) {
    categoryStatus = 'borderline';
    categoryStatusLabel = 'BORDERLINE ENTRY';
    categoryStatusTone = 'neutral';
    categoryStatusIcon = 'meh';
    }
  }

  return {
    active: true,
    categoryId: category.id,
    categoryName: category.displayName,
    categoryFamily: category.family,
    categoryFit,
    membershipConfidence,
    withinCategoryPowerRank,
    ambiguityHandling,
    eligibilityPenalty,
    inCategoryBonus,
    netImpact,
    categoryStatus,
    categoryStatusLabel,
    categoryStatusTone,
    categoryStatusIcon,
    strictCoreHits,
    coreSignalHits: coreHits,
    relatedSignalHits: relatedHits,
    negativeSignalHits,
    supportSignalHits: supportHits,
    primaryNameHits,
    supportNameHits,
    sportsAdjacentHits,
    anchorInclusionHits,
    anchorAliasHits,
    explain: `Category ${category.displayName}: ${categoryStatusLabel} | fit ${categoryFit}/100, membership ${membershipConfidence}, rank ${withinCategoryPowerRank}, ambiguity ${ambiguityHandling}, impact ${netImpact >= 0 ? '+' : ''}${netImpact} (hits: strict ${strictCoreHits}, core ${coreHits}, related ${relatedHits}, support ${supportHits}, nameCore ${primaryNameHits}, nameSupport ${supportNameHits}, sportsAdj ${sportsAdjacentHits}, negSig ${negativeSignalHits}, inc ${anchorInclusionHits}, alias ${anchorAliasHits}, strong ${strongExampleHits}, weak ${weakExampleHits}, exc ${exclusionHits}${scifiGenericOnlyGuard ? ', scifiGenericGuard 1' : ''}${combatFictionGuard ? ', combatFictionGuard 1' : ''}${combatSupportRoleGuard ? ', combatSupportRoleGuard 1' : ''}).`
  };
}

function getCategoryRegistrySnapshot() {
  const registry = loadRegistry();
  return {
    version: registry.version,
    updatedAt: registry.updatedAt,
    categories: registry.categories.map(toCategorySummary)
  };
}

module.exports = {
  DEFAULT_CATEGORY_SETTINGS,
  loadRegistry,
  getEnabledCategories,
  getCategoryById,
  getCategoryRegistrySnapshot,
  normalizeCategorySettings,
  buildVoteOptions,
  lockCategoryForMatch,
  resolveCategoryFit,
  toCategorySummary
};
