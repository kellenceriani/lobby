const https = require('https');

// Cache: { characterName: { data, timestamp } }
const FETCH_CACHE = new Map();
const INFLIGHT_FETCHES = new Map();
const CACHE_TTL = 3600000; // 1 hour

const SCORE_MIN = 0;
const SCORE_MAX = 30;

// FIFA-Style OVR Color Tiers
const OVR_TIERS = {
  bronze: { min: 0, max: 64, color: '#cd7f32', label: 'Bronze' },
  silver: { min: 65, max: 74, color: '#c0c0c0', label: 'Silver' },
  gold: { min: 75, max: 84, color: '#ffd700', label: 'Gold' },
  rare: { min: 85, max: 89, color: '#ff6b35', label: 'Rare' },
  epic: { min: 90, max: 94, color: '#9b59b6', label: 'Epic' },
  legendary: { min: 95, max: 98, color: '#e74c3c', label: 'Legendary' },
  icon: { min: 99, max: 99, color: '#f39c12', label: 'Icon' }
};

const EMOTION_TIERS = {
  mad: { score: 0, ovrRange: [0, 12], emoji: '😠' },
  disappointed: { score: [1, 5], ovrRange: [13, 28], emoji: '😞' },
  confused: { score: [6, 10], ovrRange: [29, 44], emoji: '😕' },
  neutral: { score: [11, 18], ovrRange: [45, 64], emoji: '😐' },
  happy: { score: [19, 23], ovrRange: [65, 78], emoji: '😊' },
  amazed: { score: [24, 27], ovrRange: [79, 90], emoji: '😲' },
  mindBlown: { score: [28, 30], ovrRange: [91, 99], emoji: '🤯' }
};

// Character Rarity Classification
const RARITY_KEYWORDS = {
  icon: ['jesus', 'god', 'zeus', 'buddha', 'muhammad', 'shakespeare', 'einstein', 'newton', 'leonardo da vinci', 'michael jordan', 'muhammad ali'],
  legendary: ['superman', 'batman', 'spiderman', 'ironman', 'captain america', 'goku', 'naruto', 'harry potter', 'gandalf', 'yoda', 'darth vader', 'thanos', 'mickey mouse', 'michael jackson', 'elvis', 'marilyn monroe'],
  epic: ['wonder woman', 'thor', 'hulk', 'wolverine', 'flash', 'green lantern', 'aquaman', 'black panther', 'doctor strange', 'scarlet witch', 'vegeta', 'piccolo', 'sasuke', 'kakashi', 'luffy', 'zoro', 'hermione', 'ron weasley', 'frodo', 'aragorn', 'legolas', 'dumbledore', 'voldemort', 'sauron'],
  rare: ['hawkeye', 'black widow', 'falcon', 'winter soldier', 'ant-man', 'wasp', 'vision', 'quicksilver', 'drax', 'groot', 'rocket', 'star-lord', 'gohan', 'trunks', 'krillin', 'sakura', 'hinata', 'gaara', 'levi', 'eren', 'mikasa'],
  common: [] // Default tier
};

// Character Type Detection
const CHARACTER_TYPES = {
  combat: { keywords: ['warrior', 'fighter', 'soldier', 'knight', 'samurai', 'boxer', 'martial', 'gladiator', 'assassin', 'ninja', 'viking', 'spartan', 'hulk', 'thor', 'wolverine'], statBonus: { power: 15, durability: 10, speed: 5 } },
  intelligence: { keywords: ['scientist', 'professor', 'genius', 'doctor', 'inventor', 'engineer', 'scholar', 'wizard', 'mage', 'einstein', 'tony stark', 'bruce banner', 'rick sanchez', 'hermione'], statBonus: { intelligence: 15, control: 10, versatility: 5 } },
  support: { keywords: ['healer', 'medic', 'nurse', 'cleric', 'support', 'buffer', 'enchanter', 'mercy', 'ana', 'soraka'], statBonus: { durability: 10, control: 10, versatility: 5 } },
  speed: { keywords: ['speedster', 'flash', 'quicksilver', 'sonic', 'runner', 'dash', 'fast', 'rapid'], statBonus: { speed: 15, agility: 10, power: 5 } },
  tank: { keywords: ['tank', 'defender', 'shield', 'guardian', 'protector', 'reinhardt', 'captain america', 'colossus'], statBonus: { durability: 15, power: 10, intelligence: -5 } },
  versatile: { keywords: ['all-rounder', 'versatile', 'adaptable', 'multi', 'avatar'], statBonus: { versatility: 15, intelligence: 5, control: 5 } }
};

// Power Level Classification
const POWER_LEVELS = {
  cosmic: ['galactus', 'thanos', 'darkseid', 'anti-monitor', 'celestial', 'eternity', 'infinity', 'living tribunal'],
  godlike: ['thor', 'zeus', 'odin', 'loki', 'ares', 'superman', 'wonder woman', 'goku', 'vegeta', 'saitama', 'silver surfer', 'phoenix'],
  superhuman: ['hulk', 'spiderman', 'wolverine', 'captain america', 'ironman', 'batman', 'flash', 'green lantern', 'naruto', 'luffy', 'ichigo'],
  enhanced: ['hawkeye', 'black widow', 'robin', 'nightwing', 'daredevil', 'punisher', 'john wick', 'agent 47'],
  normal: ['sherlock', 'gordon freeman', 'rick grimes', 'walter white', 'tony soprano']
};

// Expanded Franchise Database with prestige tiers
const FRANCHISE_DATABASE = {
  marvel: { members: ['iron man', 'captain america', 'thor', 'hulk', 'black widow', 'hawkeye', 'spider-man', 'doctor strange', 'black panther', 'ant-man', 'wasp', 'scarlet witch', 'vision', 'falcon', 'winter soldier', 'thanos', 'loki', 'nick fury', 'groot', 'rocket', 'star-lord', 'gamora', 'drax', 'wolverine', 'cyclops', 'storm', 'jean grey', 'professor x', 'magneto', 'deadpool', 'punisher', 'daredevil', 'jessica jones', 'luke cage'], prestige: 'iconic' },
  dc: { members: ['superman', 'batman', 'wonder woman', 'flash', 'green lantern', 'aquaman', 'cyborg', 'robin', 'nightwing', 'batgirl', 'joker', 'harley quinn', 'lex luthor', 'darkseid', 'deathstroke', 'green arrow', 'black canary', 'zatanna', 'constantine', 'shazam', 'martian manhunter'], prestige: 'iconic' },
  starWars: { members: ['luke skywalker', 'darth vader', 'han solo', 'princess leia', 'obi-wan', 'yoda', 'anakin', 'qui-gon', 'mace windu', 'rey', 'kylo ren', 'finn', 'poe dameron', 'chewbacca', 'r2-d2', 'c-3po', 'boba fett', 'jango fett', 'darth maul', 'count dooku', 'palpatine'], prestige: 'legendary' },
  harryPotter: { members: ['harry potter', 'hermione', 'ron weasley', 'dumbledore', 'voldemort', 'snape', 'hagrid', 'mcgonagall', 'sirius', 'lupin', 'draco', 'neville', 'luna', 'ginny', 'fred', 'george'], prestige: 'legendary' },
  lotr: { members: ['frodo', 'gandalf', 'aragorn', 'legolas', 'gimli', 'boromir', 'sam', 'merry', 'pippin', 'sauron', 'saruman', 'gollum', 'elrond', 'galadriel'], prestige: 'legendary' },
  dragonBall: { members: ['goku', 'vegeta', 'gohan', 'piccolo', 'krillin', 'trunks', 'goten', 'frieza', 'cell', 'buu', 'beerus', 'whis', 'broly'], prestige: 'iconic' },
  naruto: { members: ['naruto', 'sasuke', 'sakura', 'kakashi', 'itachi', 'gaara', 'hinata', 'rock lee', 'neji', 'shikamaru', 'orochimaru', 'jiraiya', 'tsunade', 'madara', 'obito'], prestige: 'iconic' },
  onePiece: { members: ['luffy', 'zoro', 'sanji', 'nami', 'usopp', 'chopper', 'robin', 'franky', 'brook', 'jinbe', 'ace', 'shanks', 'whitebeard', 'blackbeard'], prestige: 'iconic' },
  pokemon: { members: ['pikachu', 'charizard', 'mewtwo', 'ash', 'misty', 'brock', 'team rocket', 'gary', 'professor oak'], prestige: 'major' },
  zelda: { members: ['link', 'zelda', 'ganondorf', 'epona', 'navi', 'midna', 'fi'], prestige: 'legendary' },
  gameOfThrones: { members: ['jon snow', 'daenerys', 'tyrion', 'arya', 'sansa', 'cersei', 'jaime', 'ned stark', 'robb', 'theon', 'bran', 'hodor', 'night king'], prestige: 'major' },
  breakingBad: { members: ['walter white', 'jesse pinkman', 'saul goodman', 'hank', 'skyler', 'gus fring', 'mike'], prestige: 'major' },
  disney: { members: ['mickey mouse', 'donald duck', 'goofy', 'elsa', 'anna', 'simba', 'aladdin', 'jasmine', 'belle', 'beast', 'ariel', 'mulan', 'moana', 'maui'], prestige: 'iconic' },
  mcu: { members: ['iron man', 'captain america', 'thor', 'black widow', 'hawkeye', 'hulk', 'vision', 'scarlet witch', 'doctor strange', 'spider-man', 'black panther', 'ant-man'], prestige: 'iconic' },
  transformer: { members: ['optimus prime', 'bumblebee', 'megatron', 'starscream', 'transformer'], prestige: 'major' },
  tmnt: { members: ['leonardo', 'raphael', 'donatello', 'michelangelo', 'ninja turtle'], prestige: 'major' },
  matrix: { members: ['neo', 'trinity', 'morpheus', 'agent smith'], prestige: 'major' },
  theWitcher: { members: ['geralt', 'yennefer', 'ciri', 'triss'], prestige: 'major' },
  rickAndMorty: { members: ['rick', 'morty', 'jerry', 'beth', 'summer'], prestige: 'major' }
};

const OFFENSIVE_WORDS = [
  'fuck', 'shit', 'nazi', 'hitler', 'n1gger', 'f4ggot', 'c0nt', 'whore', 'slut'
];

const KEYWORD_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'onto', 'over', 'under', 'above', 'below',
  'about', 'your', 'their', 'there', 'they', 'them', 'when', 'where', 'while', 'would', 'could', 'should',
  'have', 'has', 'had', 'were', 'was', 'are', 'is', 'been', 'being', 'not', 'but', 'can', 'will', 'just',
  'than', 'then', 'also', 'very', 'more', 'most', 'some', 'such', 'only', 'other', 'many', 'each', 'both',
  'into', 'within', 'through', 'because', 'across', 'after', 'before', 'during', 'against', 'without', 'between',
  'character', 'characters', 'story', 'series', 'movie', 'film', 'episode', 'season', 'comic', 'fictional'
]);

const CONTEXT_KEYWORD_GROUPS = {
  combat: ['fight', 'battle', 'war', 'duel', 'melee', 'weapon', 'martial', 'punch', 'strike', 'combat', 'assault', 'siege'],
  stealth: ['stealth', 'shadow', 'sneak', 'infiltrate', 'covert', 'silent', 'assassin', 'spy', 'cloak', 'heist', 'invisible', 'invisibility', 'camouflage'],
  mobility: ['climb', 'climbing', 'wall', 'wallcrawl', 'wallcrawler', 'crawl', 'swing', 'parkour', 'acrobat', 'agile', 'agility'],
  strategy: ['strategy', 'tactic', 'plan', 'analyze', 'intelligence', 'deduce', 'investigate', 'command', 'leadership'],
  science: ['science', 'scientist', 'lab', 'quantum', 'engineer', 'inventor', 'technology', 'robotics', 'ai', 'cyber'],
  magic: ['magic', 'wizard', 'sorcerer', 'spell', 'enchanted', 'arcane', 'mythic', 'rune', 'witch', 'artifact'],
  survival: ['survive', 'survival', 'resource', 'scarcity', 'wilderness', 'endure', 'escape', 'resilience'],
  leadership: ['leader', 'captain', 'commander', 'chief', 'king', 'queen', 'general', 'rally', 'organize'],
  rescue: ['rescue', 'protect', 'save', 'evacuate', 'defend', 'guardian', 'shelter', 'aid'],
  chaos: ['chaos', 'anarchy', 'disaster', 'catastrophe', 'breakdown', 'collapse', 'panic', 'crisis'],
  space: ['space', 'cosmic', 'galaxy', 'planet', 'starship', 'alien', 'orbit', 'astronaut', 'interstellar'],
  time: ['time', 'timeline', 'temporal', 'future', 'past', 'paradox', 'loop', 'history'],
  social: ['diplomacy', 'politics', 'negotiate', 'alliance', 'persuade', 'influence', 'public', 'crowd', 'society']
};

const INTENT_KEYWORD_GROUPS = {
  investigation: ['solve', 'mystery', 'secret', 'identity', 'detective', 'investigate', 'deduce', 'clue', 'evidence', 'uncover', 'reveal', 'suspect', 'spy', 'infiltrate', 'deception', 'disguise', 'mask', 'double', 'alias', 'hidden'],
  strategy: ['strategy', 'tactic', 'plan', 'counter', 'predict', 'outsmart', 'analyze', 'genius', 'mind', 'logic'],
  science: ['science', 'engineer', 'inventor', 'technology', 'lab', 'experiment', 'quantum', 'device', 'gadget', 'robot', 'ai'],
  leadership: ['leader', 'captain', 'commander', 'chief', 'organize', 'coordinate', 'rally', 'command'],
  combat: ['fight', 'battle', 'war', 'defeat', 'duel', 'weapon', 'combat', 'assault'],
  stealth: ['stealth', 'sneak', 'covert', 'silent', 'shadow', 'assassin', 'heist', 'invisible', 'invisibility', 'camouflage'],
  mobility: ['climb', 'climbing', 'wall', 'wallcrawl', 'wallcrawler', 'crawl', 'swing', 'parkour', 'agile', 'agility'],
  survival: ['survive', 'escape', 'endure', 'resource', 'resilience', 'wilderness', 'adapt'],
  magic: ['magic', 'wizard', 'sorcerer', 'spell', 'arcane', 'rune', 'witch'],
  time: ['time', 'timeline', 'temporal', 'paradox', 'future', 'past', 'loop'],
  social: ['diplomacy', 'negotiate', 'persuade', 'alliance', 'influence', 'politics']
};

const CAPABILITY_TRAIT_KEYWORDS = {
  combat: ['combat', 'battle', 'fighter', 'warrior', 'soldier', 'martial', 'duel', 'assassin', 'ninja', 'hero', 'superhero'],
  power: ['strength', 'strong', 'power', 'smash', 'force', 'godlike', 'cosmic', 'flight', 'laser', 'superhuman'],
  durability: ['durable', 'invulnerable', 'invulnerability', 'resilient', 'tank', 'endure', 'immortal', 'regen', 'bulletproof', 'superhuman'],
  mobility: ['agile', 'agility', 'acrobatic', 'parkour', 'swing', 'climb', 'wallcrawl', 'dash', 'runner'],
  speed: ['speed', 'speedster', 'fast', 'rapid', 'quicksilver', 'flash'],
  stealth: ['stealth', 'shadow', 'sneak', 'covert', 'infiltrate', 'invisible', 'camouflage', 'silent'],
  intelligence: ['genius', 'intelligent', 'detective', 'analyze', 'deduce', 'strategist', 'logic', 'investigate'],
  engineering: ['engineer', 'inventor', 'scientist', 'technology', 'robotics', 'gadget', 'lab', 'ai'],
  magic: ['magic', 'wizard', 'sorcerer', 'spell', 'arcane', 'witch', 'rune'],
  social: ['charisma', 'persuade', 'diplomacy', 'negotiate', 'influence', 'politics', 'public'],
  leadership: ['leader', 'captain', 'commander', 'chief', 'king', 'queen', 'general', 'rally'],
  space: ['space', 'cosmic', 'galaxy', 'orbit', 'starship', 'astronaut', 'interstellar'],
  time: ['time', 'timeline', 'temporal', 'future', 'past', 'paradox', 'loop'],
  aquatic: ['water', 'underwater', 'ocean', 'sea', 'swim', 'aquatic', 'submarine'],
  adaptability: ['adapt', 'versatile', 'multi', 'transform', 'improvise', 'resourceful'],
  control: ['control', 'precision', 'focus', 'discipline', 'mastery', 'balanced'],
  communication: ['speak', 'speech', 'language', 'translator', 'signal', 'sign', 'emoji']
};

const INTENT_TO_TRAITS = {
  combat: ['combat', 'power', 'durability'],
  stealth: ['stealth', 'mobility', 'control'],
  mobility: ['mobility', 'speed', 'adaptability'],
  strategy: ['intelligence', 'leadership', 'control'],
  science: ['engineering', 'intelligence', 'adaptability'],
  leadership: ['leadership', 'social', 'communication'],
  investigation: ['intelligence', 'stealth', 'control'],
  survival: ['durability', 'adaptability', 'control'],
  magic: ['magic', 'control', 'adaptability'],
  time: ['time', 'intelligence', 'adaptability'],
  social: ['social', 'communication', 'leadership']
};

const TWIST_EFFECT_RULES = [
  { keywords: ['underwater', 'ocean', 'deep sea'], helps: ['aquatic', 'durability'], hurts: ['communication', 'mobility'], severity: 2, label: 'underwater environment' },
  { keywords: ['zero gravity', 'on the moon', 'space', 'orbit'], helps: ['space', 'adaptability', 'control'], hurts: ['mobility'], severity: 2, label: 'low-gravity/space conditions' },
  { keywords: ['blindfolded', 'complete darkness', 'darkness'], helps: ['control', 'stealth'], hurts: ['precision', 'mobility'], severity: 2, label: 'reduced visibility' },
  { keywords: ['without speaking', 'different language', 'sign language', 'emojis', 'translator'], helps: ['communication', 'social'], hurts: ['communication'], severity: 1, label: 'communication constraint' },
  { keywords: ['30 seconds', 'against the clock', 'being timed', 'super speed'], helps: ['speed', 'control'], hurts: ['speed'], severity: 2, label: 'time pressure' },
  { keywords: ['earthquake', 'ice', 'quicksand', 'tightrope', 'moving train'], helps: ['mobility', 'durability', 'control'], hurts: ['mobility'], severity: 2, label: 'unstable terrain' },
  { keywords: ['time moves backwards', 'paradox', 'recursive loop', 'flat circle'], helps: ['time', 'intelligence', 'adaptability'], hurts: ['adaptability'], severity: 3, label: 'temporal distortion' },
  { keywords: ['dream', 'subjective reality', 'metaphorical', 'void', 'dimension', 'quantum realm'], helps: ['magic', 'adaptability', 'intelligence'], hurts: ['control'], severity: 2, label: 'abstract-reality conditions' }
];

const WIKI_SEARCH_HINTS = [
  'character', 'fictional character', 'hero', 'villain', 'comic', 'anime', 'manga', 'video game', 'film', 'tv',
  'mythology', 'legend', 'historical figure'
];

const CHARACTER_NAME_ALIASES = {
  spiderman: ['spider-man', 'peter parker'],
  superman: ['clark kent'],
  batman: ['bruce wayne'],
  ironman: ['iron man', 'tony stark'],
  naruto: ['naruto uzumaki'],
  'naruto uzamaki': ['naruto uzumaki'],
  'doctor strange': ['dr strange'],
  'dr strange': ['doctor strange']
};

const CHARACTER_ABILITY_HINTS = {
  spiderman: ['climb', 'climbing', 'wall-crawling', 'wall crawler', 'swing', 'web-slinging', 'stealth', 'invisible', 'invisibility'],
  'spider-man': ['climb', 'climbing', 'wall-crawling', 'wall crawler', 'swing', 'web-slinging', 'stealth', 'invisible', 'invisibility'],
  superman: ['flight', 'strength', 'x-ray', 'heat vision', 'space'],
  batman: ['stealth', 'detective', 'gadgets', 'infiltrate', 'strategy'],
  wonderwoman: ['combat', 'flight', 'warrior', 'leadership', 'lasso'],
  'wonder woman': ['combat', 'flight', 'warrior', 'leadership', 'lasso'],
  naruto: ['ninja', 'stealth', 'clone', 'chakra', 'speed']
};

function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ');
}

function canonicalizeName(name) {
  return normalizeName(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getCharacterNameVariants(name) {
  const normalized = normalizeName(name || '');
  if (!normalized) return [];

  const lower = normalized.toLowerCase();
  const compact = canonicalizeName(normalized);
  const variants = new Set([normalized]);

  const aliasCandidates = [
    ...(CHARACTER_NAME_ALIASES[lower] || []),
    ...(CHARACTER_NAME_ALIASES[compact] || [])
  ];

  aliasCandidates.forEach(alias => variants.add(normalizeName(alias)));

  if (normalized.includes('-')) variants.add(normalized.replace(/-/g, ' '));
  if (normalized.includes(' ')) variants.add(normalized.replace(/\s+/g, '-'));

  return Array.from(variants);
}

function getCharacterAbilityHints(character = '', info = null) {
  const candidates = new Set([
    canonicalizeName(character),
    canonicalizeName(info && info.title ? info.title : ''),
    ...(Array.isArray(info && info.aliases) ? info.aliases.map(canonicalizeName) : [])
  ]);

  const hints = new Set();
  candidates.forEach(candidate => {
    if (!candidate) return;
    const mapped = CHARACTER_ABILITY_HINTS[candidate];
    if (Array.isArray(mapped)) {
      mapped.forEach(hint => hints.add(hint));
    }
  });

  return Array.from(hints);
}

// Enhanced: Extract profession/role from Wikipedia content
function extractProfessionFromWikipedia(extract) {
  if (!extract) return null;
  
  const firstParagraph = extract.split('\n')[0];
  const professionPatterns = [
    /(?:is a|was a|are) (?:an? )?([a-zA-Z\s]+?)(?:,| in| from|\.|$)/i,
    /\b(superhero|villain|character|actor|actress|musician|scientist|inventor|warrior|detective|assassin|spy|ninja|mage|wizard|robot|android)\b/gi
  ];
  
  for (const pattern of professionPatterns) {
    const match = firstParagraph.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

async function fetchWikidataMetadata(entityId) {
  if (!entityId) return null;
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(entityId)}&languages=en&props=labels|descriptions|aliases&format=json&origin=*`;

  try {
    const json = await getJson(url);
    const entity = json && json.entities ? json.entities[entityId] : null;
    if (!entity) return null;

    const aliases = entity.aliases && entity.aliases.en
      ? entity.aliases.en.map(item => item && item.value).filter(Boolean).slice(0, 10)
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

// Enhanced Wikipedia fetch with better structured data extraction
async function fetchFromWikipediaEnhanced(character) {
  const normalized = normalizeName(character);
  const query = encodeURIComponent(normalized);
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${query}&prop=extracts|pageprops|categories&cllimit=24&exintro=false&exchars=3600&explaintext=true&format=json&origin=*`;
  
  try {
    const json = await getJson(url);
    if (!json || !json.query || !json.query.pages) return null;

    const pages = json.query.pages;
    const firstPage = Object.values(pages)[0];

    if (firstPage && firstPage.extract && !firstPage.extract.includes('Disambiguation') && !firstPage.extract.includes('may refer to')) {
      const profession = extractProfessionFromWikipedia(firstPage.extract);
      const categories = Array.isArray(firstPage.categories)
        ? firstPage.categories.map(c => (c && c.title ? c.title.replace(/^Category:/, '') : '')).filter(Boolean).slice(0, 12)
        : [];
      const wikidataMeta = await fetchWikidataMetadata(firstPage.pageprops && firstPage.pageprops.wikibase_item);

      return {
        source: 'wikipedia',
        description: firstPage.extract.substring(0, 3000),
        title: firstPage.title,
        profession: profession,
        pageprops: firstPage.pageprops || {},
        categories,
        aliases: wikidataMeta && wikidataMeta.aliases ? wikidataMeta.aliases : [],
        wikidataDescription: wikidataMeta ? wikidataMeta.wikidataDescription : null,
        wikidataId: wikidataMeta ? wikidataMeta.wikidataId : null
      };
    }
  } catch (e) {
    // Fall through to next strategy
  }

  return null;
}

// Enhanced search with "character" keyword fallbacks
async function fetchFromWikipediaSearchEnhanced(character) {
  const normalized = normalizeName(character);
  const query = encodeURIComponent(normalized);
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&srlimit=5&format=json&origin=*`;

  try {
    const json = await getJson(url);
    const results = json && json.query && json.query.search ? json.query.search : [];
    
    // Try top search results
    for (const result of results) {
      if (result.title) {
        const pageResult = await fetchFromWikipediaEnhanced(result.title);
        if (pageResult) return pageResult;
      }
    }

    // Expanded keyword fallbacks
    for (const hint of WIKI_SEARCH_HINTS) {
      const hintQuery = encodeURIComponent(`${normalized} ${hint}`);
      const hintUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${hintQuery}&srlimit=3&format=json&origin=*`;
      const hintJson = await getJson(hintUrl);
      const hintResults = hintJson && hintJson.query && hintJson.query.search ? hintJson.query.search : [];

      for (const result of hintResults) {
        if (!result.title) continue;
        const pageResult = await fetchFromWikipediaEnhanced(result.title);
        if (pageResult) return pageResult;
      }
    }

    // Try with quotes for exact phrase
    const exactQuery = encodeURIComponent(`"${normalized}"`);
    const exactUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${exactQuery}&srlimit=4&format=json&origin=*`;
    const exactJson = await getJson(exactUrl);
    const exactResults = exactJson && exactJson.query && exactJson.query.search ? exactJson.query.search : [];
    
    for (const result of exactResults) {
      if (result.title) {
        const pageResult = await fetchFromWikipediaEnhanced(result.title);
        if (pageResult) return pageResult;
      }
    }
  } catch (e) {
    // Fall through
  }

  return null;
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

function buildNotes({ validation, info, scenario, twist, score, scoreMeta }) {
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
    if (scoreMeta && scoreMeta.relevanceNote) {
      notes.push(scoreMeta.relevanceNote);
    }
    return notes;
  }

  if (wordCount > 3) {
    notes.push('Lookup skipped: long name (4+ words).');
  } else {
    notes.push('Lookup attempted: no direct match found.');
  }

  notes.push(`Heuristic score from name length (${wordCount} words).`);
  if (scoreMeta && scoreMeta.relevanceNote) {
    notes.push(scoreMeta.relevanceNote);
  }
  notes.push('Tip: well-known names score higher.');
  return notes;
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 2);
}

function countOverlap(tokensA, tokensB) {
  const setB = new Set(tokensB);
  let count = 0;
  tokensA.forEach(token => {
    if (setB.has(token)) count += 1;
  });
  return count;
}

function normalizeKeywordToken(token) {
  if (!token) return '';
  const cleaned = String(token).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleaned) return '';
  if (cleaned.length <= 3) return cleaned;
  return cleaned
    .replace(/(ing|ers|ies|ied|ed|es|s)$/i, '')
    .replace(/(tion|ment|ness)$/i, '');
}

function getMeaningfulTokens(text, maxTokens = 120) {
  const raw = tokenize(text);
  const normalized = raw
    .map(normalizeKeywordToken)
    .filter(token => token.length >= 3 && !KEYWORD_STOPWORDS.has(token));
  return Array.from(new Set(normalized)).slice(0, maxTokens);
}

function expandKeywords(tokens) {
  const expanded = new Set(tokens);
  for (const [group, groupKeywords] of Object.entries(CONTEXT_KEYWORD_GROUPS)) {
    const normalizedGroupKeywords = groupKeywords.map(normalizeKeywordToken);
    if (tokens.some(token => normalizedGroupKeywords.includes(token))) {
      expanded.add(normalizeKeywordToken(group));
      normalizedGroupKeywords.forEach(keyword => expanded.add(keyword));
    }
  }
  return Array.from(expanded);
}

function buildKeywordFitDetails(sourceText, targetText) {
  const sourceTokens = getMeaningfulTokens(sourceText);
  const targetTokens = getMeaningfulTokens(targetText);
  const expandedSource = expandKeywords(sourceTokens);
  const expandedTargetSet = new Set(expandKeywords(targetTokens));

  const directMatches = sourceTokens.filter(token => targetTokens.includes(token));
  const expandedMatches = expandedSource.filter(token => expandedTargetSet.has(token));
  const uniqueMatches = Array.from(new Set([...directMatches, ...expandedMatches]))
    .filter(token => token.length >= 3)
    .slice(0, 12);

  return {
    directCount: directMatches.length,
    expandedCount: expandedMatches.length,
    totalCount: uniqueMatches.length,
    matchedKeywords: uniqueMatches
  };
}

function inferIntentGroups(text) {
  const normalizedText = String(text || '').toLowerCase();
  const tokens = getMeaningfulTokens(normalizedText, 180);
  const tokenSet = new Set(tokens);
  const intents = [];

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORD_GROUPS)) {
    const hasIntent = keywords.some(keyword => {
      const key = normalizeKeywordToken(keyword);
      return key && tokenSet.has(key);
    });
    if (hasIntent) intents.push(intent);
  }

  return intents;
}

function buildInfoCorpus(info, character = '') {
  if (!info && !character) return '';

  const abilityHints = getCharacterAbilityHints(character, info);

  return [
    character || '',
    info && info.title ? info.title : '',
    info && info.description ? info.description : '',
    info && info.profession ? info.profession : '',
    info && info.wikidataDescription ? info.wikidataDescription : '',
    info && Array.isArray(info.aliases) ? info.aliases.join(' ') : '',
    info && Array.isArray(info.categories) ? info.categories.join(' ') : '',
    abilityHints.join(' ')
  ].join(' ');
}

function mapFitCountToPoints(count) {
  if (count >= 14) return 10;
  if (count >= 10) return 8;
  if (count >= 7) return 6;
  if (count >= 4) return 4;
  if (count >= 2) return 2;
  if (count >= 1) return 1;
  return 0;
}

function mapFitCountToDraftBonus(count) {
  if (count >= 7) return 3;
  if (count >= 3) return 2;
  if (count >= 1) return 1;
  return 0;
}

function buildBreakdown({ character, validation, info, scenario, twist, score, nameSignals, relevance, draftedFitBonus, ovrData, scoreBreakdownSteps }) {
  const breakdown = {
    characterSummary: '',
    scenarioRelevance: '',
    twistRelevance: '',
    keywordMatches: {
      scenario: [],
      twist: []
    },
    draftedFitBonus: draftedFitBonus || { scenario: 0, twist: 0 },
    scoreBreakdown: scoreBreakdownSteps || [],
    ovrBreakdown: {
      baseFromScore: 0,
      rarityBonus: 0,
      attributeBonus: 0,
      scenarioMultiplier: 1.0,
      finalOVR: ovrData.ovr,
      percentages: {}
    }
  };

  // Character Summary
  if (!validation.valid) {
    breakdown.characterSummary = validation.reason === 'invalid' 
      ? 'Invalid input detected. This is not a valid character name.'
      : validation.reason === 'offensive'
      ? 'This input contains blocked content and cannot be scored normally.'
      : 'This input did not pass validation checks.';
  } else if (info) {
    const descPreview = info.description ? info.description.substring(0, 200) + '...' : 'No detailed description available.';
    const source = info.source === 'wikipedia' ? 'Wikipedia' : info.source;
    breakdown.characterSummary = `Found in ${source}${info.title ? ` as "${info.title}"` : ''}. ${descPreview}`;
  } else {
    breakdown.characterSummary = `Character not found in our database. Scored based on name structure and heuristics. This might be an obscure character, original creation, or misspelled name.`;
  }

  // Scenario Relevance
  if (relevance && relevance.scenario) {
    const scenarioMatchCount = relevance.scenario.matchCount || 0;
    const scenarioKeywords = relevance.scenario.matchedKeywords || [];
    const scenarioCapability = relevance.scenario.capabilityScore || 0;
    const feasibilityScore = relevance.scenario.feasibilityScore || 0;
    const canDoScenario = Boolean(relevance.scenario.canDo);
    const thrivesScenario = Boolean(relevance.scenario.thrive);
    breakdown.keywordMatches.scenario = scenarioKeywords;

    if (thrivesScenario) {
      breakdown.scenarioRelevance = `Can do scenario confidently and likely thrives (${feasibilityScore}/10 feasibility).`;
    } else if (canDoScenario) {
      breakdown.scenarioRelevance = `Can do scenario with workable fit (${feasibilityScore}/10 feasibility).`;
    } else if (scenarioMatchCount >= 1 || scenarioCapability >= 3) {
      breakdown.scenarioRelevance = `Partial scenario fit but likely struggles (${feasibilityScore}/10 feasibility).`;
    } else {
      breakdown.scenarioRelevance = `Likely cannot execute scenario reliably (${feasibilityScore}/10 feasibility).`;
    }

    if (Array.isArray(relevance.scenario.requiredTraits) && relevance.scenario.requiredTraits.length) {
      breakdown.scenarioRelevance += ` Required: ${relevance.scenario.requiredTraits.slice(0, 3).join(', ')}.`;
    }

    if (Array.isArray(relevance.scenario.matchedTraits) && relevance.scenario.matchedTraits.length) {
      breakdown.scenarioRelevance += ` Matches: ${relevance.scenario.matchedTraits.slice(0, 3).join(', ')}.`;
    }

    if (Array.isArray(relevance.scenario.missingTraits) && relevance.scenario.missingTraits.length) {
      breakdown.scenarioRelevance += ` Missing: ${relevance.scenario.missingTraits.slice(0, 2).join(', ')}.`;
    }

    if (scenarioCapability > 0 && Array.isArray(relevance.scenario.capabilityReasons) && relevance.scenario.capabilityReasons.length) {
      breakdown.scenarioRelevance += ` Capability alignment: ${relevance.scenario.capabilityReasons.slice(0, 2).join(' | ')}.`;
    }

    if ((draftedFitBonus && draftedFitBonus.scenario) > 0) {
      breakdown.scenarioRelevance += ` Drafted-fit bonus: +${draftedFitBonus.scenario}/3.`;
    }
  } else if (nameSignals && nameSignals.note && nameSignals.note.includes('name matches scenario')) {
    breakdown.scenarioRelevance = `Character name directly references scenario keywords, showing strong selection strategy.`;
  } else {
    breakdown.scenarioRelevance = info 
      ? `No strong keyword overlap with scenario. Character may still contribute through team dynamics or creative interpretation.`
      : `Unknown character with no database info to assess scenario fit. Scored on name structure alone.`;
  }

  // Twist Relevance
  if (relevance && relevance.twist) {
    const twistMatchCount = relevance.twist.matchCount || 0;
    const twistKeywords = relevance.twist.matchedKeywords || [];
    const twistCapability = relevance.twist.capabilityScore || 0;
    const twistImpactScore = relevance.twist.impactScore || 0;
    const twistHelps = Boolean(relevance.twist.helps);
    const twistHurts = Boolean(relevance.twist.hurts);
    breakdown.keywordMatches.twist = twistKeywords;

    if (twistHelps) {
      breakdown.twistRelevance = `Twist helps this character (${twistImpactScore} impact).`;
    } else if (twistHurts) {
      breakdown.twistRelevance = `Twist hurts this character (${twistImpactScore} impact).`;
    } else if (twistMatchCount >= 1 || twistCapability >= 3) {
      breakdown.twistRelevance = `Twist impact is mostly neutral with some overlap (${twistImpactScore} impact).`;
    } else {
      const description = info ? `${info.description || ''} ${info.title || ''}`.toLowerCase() : '';
      const domains = getDomainMatches(scenario, twist, description);
      breakdown.twistRelevance = domains.length > 0
        ? `Thematic alignment through ${domains.join(', ')} domains; twist impact ${twistImpactScore}.`
        : `No direct twist keyword match found; twist impact ${twistImpactScore}.`;
    }

    if (Array.isArray(relevance.twist.helpTraits) && relevance.twist.helpTraits.length) {
      breakdown.twistRelevance += ` Help traits: ${relevance.twist.helpTraits.slice(0, 3).join(', ')}.`;
    }

    if (Array.isArray(relevance.twist.hurtTraits) && relevance.twist.hurtTraits.length) {
      breakdown.twistRelevance += ` Risk traits: ${relevance.twist.hurtTraits.slice(0, 3).join(', ')}.`;
    }

    if (Array.isArray(relevance.twist.impactReasons) && relevance.twist.impactReasons.length) {
      breakdown.twistRelevance += ` ${relevance.twist.impactReasons.slice(0, 2).join(' | ')}.`;
    }

    if (twistCapability > 0 && Array.isArray(relevance.twist.capabilityReasons) && relevance.twist.capabilityReasons.length) {
      breakdown.twistRelevance += ` Capability alignment: ${relevance.twist.capabilityReasons.slice(0, 2).join(' | ')}.`;
    }

    if ((draftedFitBonus && draftedFitBonus.twist) > 0) {
      breakdown.twistRelevance += ` Drafted-fit bonus: +${draftedFitBonus.twist}/3.`;
    }
  } else {
    breakdown.twistRelevance = info
      ? `Limited connection to twist keywords. Success may depend on creative strategy and team synergy.`
      : `Unknown character - cannot assess twist relevance from database.`;
  }

  // OVR Breakdown with percentages
  if (ovrData) {
    const baseOVR = Math.round((score / SCORE_MAX) * 70);
    const rarityBonus = getRarityBonusFromTier(ovrData.rarity);
    
    // Calculate attribute bonus
    const attributeValues = Object.values(ovrData.attributes || {});
    const topStats = attributeValues.sort((a, b) => b - a).slice(0, 3);
    const attributeBonus = topStats.length > 0 ? Math.round(topStats.reduce((sum, val) => sum + val, 0) / 3 * 0.15) : 0;
    
    const scenarioFit = calculateScenarioFitValue(character, info, scenario, twist);
    
    // Calculate contributions before multiplier
    const preMultiplier = baseOVR + rarityBonus + attributeBonus;
    
    breakdown.ovrBreakdown = {
      baseFromScore: baseOVR,
      rarityBonus: rarityBonus,
      attributeBonus: attributeBonus,
      scenarioMultiplier: scenarioFit,
      finalOVR: ovrData.ovr,
      percentages: {
        scoreContribution: Math.round((baseOVR / ovrData.ovr) * 100),
        rarityContribution: Math.round((rarityBonus / ovrData.ovr) * 100),
        attributeContribution: Math.round((attributeBonus / ovrData.ovr) * 100),
        scenarioEffect: Math.round(((scenarioFit - 1.0) * preMultiplier / ovrData.ovr) * 100)
      },
      explanations: {
        base: `Base OVR from score (${score}/30 → ${baseOVR}/70 maximum)`,
        rarity: getRarityExplanation(ovrData.rarity, rarityBonus),
        attributes: `Top 3 attributes averaged: ${topStats.join(', ')} → +${attributeBonus}`,
        scenario: getScenarioFitExplanation(scenarioFit)
      }
    };
  }

  return breakdown;
}

function getRarityBonusFromTier(rarityTier) {
  const rarityMap = {
    'Icon': 15,
    'Legendary': 12,
    'Epic': 9,
    'Rare': 6,
    'Common': 2,
    'Bronze': 0
  };
  return rarityMap[rarityTier] || 0;
}

function getRarityExplanation(rarityTier, bonus) {
  const explanations = {
    'Icon': `Icon-tier character from legendary franchise/history (+${bonus})`,
    'Legendary': `Legendary character with massive cultural impact (+${bonus})`,
    'Epic': `Epic-tier character, well-known and powerful (+${bonus})`,
    'Rare': `Rare or niche pull with standout uniqueness (+${bonus})`,
    'Common': `Common/known character (+${bonus})`,
    'Bronze': `Unknown or unrecognized character (no bonus)`
  };
  return explanations[rarityTier] || `Character rarity: ${rarityTier} (+${bonus})`;
}

function calculateScenarioFitValue(character, info, scenario, twist) {
  if (!info) return 0.92;
  
  const description = buildInfoCorpus(info, character).toLowerCase();
  const fit = buildKeywordFitDetails(description, `${scenario || ''} ${twist || ''}`);
  const intentMatches = inferIntentGroups(description)
    .filter(intent => inferIntentGroups(`${scenario || ''} ${twist || ''}`).includes(intent));
  const capability = calculateCapabilityFit(character, info, scenario, twist);
  const assessment = assessScenarioAndTwist(character, info, scenario, twist);
  const overlap = fit.totalCount;

  let multiplier = 0.95;
  if (overlap >= 14) multiplier = 1.24;
  else if (overlap >= 9) multiplier = 1.16;
  else if (overlap >= 5) multiplier = 1.1;
  else if (overlap >= 2 || intentMatches.length > 0) multiplier = 1.04;

  if (capability.totalPoints >= 10) multiplier = Math.max(multiplier, 1.2);
  else if (capability.totalPoints >= 7) multiplier = Math.max(multiplier, 1.14);
  else if (capability.totalPoints >= 4) multiplier = Math.max(multiplier, 1.08);
  else if (capability.totalPoints >= 2) multiplier = Math.max(multiplier, 1.02);

  if (assessment.scenarioFeasibility.thrive) multiplier = Math.max(multiplier, 1.24);
  else if (assessment.scenarioFeasibility.canDo) multiplier = Math.max(multiplier, 1.1);
  else multiplier = Math.min(multiplier, 0.97);

  if (assessment.twistImpact.helps) multiplier += 0.04;
  if (assessment.twistImpact.hurts) multiplier -= 0.05;

  return Math.max(0.85, Math.min(1.3, multiplier));
}

function getScenarioFitExplanation(multiplier) {
  if (multiplier >= 1.2) return `Perfect scenario fit: 20% bonus multiplier`;
  if (multiplier >= 1.1) return `Excellent scenario fit: 10% bonus multiplier`;
  if (multiplier >= 1.05) return `Good scenario fit: 5% bonus multiplier`;
  if (multiplier >= 1.0) return `Neutral scenario fit: no penalty or bonus`;
  if (multiplier >= 0.95) return `Slight scenario mismatch: 5% penalty`;
  return `Poor scenario fit: ${Math.round((1 - multiplier) * 100)}% penalty`;
}

const TITLE_KEYWORDS = ['dr', 'doctor', 'professor', 'sir', 'lady', 'captain', 'king', 'queen', 'lord', 'saint', 'detective', 'agent', 'inspector', 'commander'];
const ROLE_KEYWORDS = ['wizard', 'mage', 'ninja', 'samurai', 'pirate', 'soldier', 'knight', 'warrior', 'scientist', 'engineer', 'inventor', 'chef', 'pilot', 'spy', 'assassin', 'detective', 'strategist', 'genius', 'hacker'];
const TYPE_INTENT_AFFINITY = {
  combat: ['combat', 'survival', 'rescue', 'stealth'],
  intelligence: ['investigation', 'strategy', 'science', 'time', 'leadership'],
  support: ['rescue', 'leadership', 'social', 'survival'],
  speed: ['mobility', 'combat', 'stealth', 'rescue'],
  tank: ['combat', 'survival', 'rescue', 'leadership'],
  versatile: ['combat', 'strategy', 'science', 'survival', 'social', 'rescue', 'stealth'],
  balanced: ['strategy', 'survival']
};
const DOMAIN_RULES = [
  { label: 'combat', keywords: ['fight', 'battle', 'war', 'combat', 'weapon', 'soldier', 'warrior'] },
  { label: 'science', keywords: ['science', 'experiment', 'lab', 'engineer', 'inventor', 'quantum', 'ai'] },
  { label: 'magic', keywords: ['magic', 'wizard', 'sorcerer', 'spell', 'witch', 'dragon'] },
  { label: 'cooking', keywords: ['cook', 'bake', 'chef', 'food', 'kitchen', 'recipe'] },
  { label: 'sports', keywords: ['sport', 'match', 'team', 'coach', 'athlete', 'race'] },
  { label: 'stealth', keywords: ['stealth', 'shadow', 'spy', 'assassin', 'infiltrate'] },
  { label: 'leadership', keywords: ['leader', 'captain', 'commander', 'chief', 'king', 'queen'] },
  { label: 'animals', keywords: ['animal', 'beast', 'dragon', 'wolf', 'horse', 'rider', 'trainer'] },
  { label: 'space', keywords: ['space', 'astronaut', 'galaxy', 'planet', 'alien', 'ship'] }
];

function getDomainMatches(scenario, twist, description) {
  const scenarioTokens = tokenize(`${scenario} ${twist}`);
  const descriptionTokens = tokenize(description);
  const scenarioText = scenarioTokens.join(' ');
  const descriptionText = descriptionTokens.join(' ');
  return DOMAIN_RULES.filter(rule =>
    rule.keywords.some(kw => scenarioText.includes(kw)) &&
    rule.keywords.some(kw => descriptionText.includes(kw))
  ).map(rule => rule.label);
}

function detectPowerClass(character, info) {
  const text = `${character || ''} ${info && info.title ? info.title : ''} ${info && info.description ? info.description : ''}`.toLowerCase();
  if (POWER_LEVELS.cosmic.some(name => text.includes(name))) return 'cosmic';
  if (POWER_LEVELS.godlike.some(name => text.includes(name))) return 'godlike';
  if (POWER_LEVELS.superhuman.some(name => text.includes(name))) return 'superhuman';
  if (POWER_LEVELS.enhanced.some(name => text.includes(name))) return 'enhanced';
  return 'normal';
}

function inferThreatDemandLevel(text) {
  const normalized = String(text || '').toLowerCase();
  if (/cosmic|universal|multiverse|apocalypse|extinction|planetary|galaxy|god/.test(normalized)) return 3;
  if (/invasion|catastrophe|war|world|destroy|annihilat|armageddon|disaster/.test(normalized)) return 2;
  if (/fight|battle|threat|danger|survive|hostile|crisis/.test(normalized)) return 1;
  return 0;
}

function getPowerFitPoints(powerClass, threatLevel) {
  if (threatLevel <= 0) return 0;
  if (threatLevel === 3) {
    if (powerClass === 'cosmic') return 3;
    if (powerClass === 'godlike') return 2;
    if (powerClass === 'superhuman') return 1;
    return 0;
  }
  if (threatLevel === 2) {
    if (powerClass === 'cosmic' || powerClass === 'godlike') return 3;
    if (powerClass === 'superhuman') return 2;
    if (powerClass === 'enhanced') return 1;
    return 0;
  }
  if (powerClass === 'cosmic' || powerClass === 'godlike' || powerClass === 'superhuman') return 2;
  if (powerClass === 'enhanced') return 1;
  return 0;
}

function getProfessionIntentMatches(professionText, targetIntents) {
  if (!professionText || !targetIntents.length) return [];
  const professionIntents = inferIntentGroups(professionText);
  return targetIntents.filter(intent => professionIntents.includes(intent));
}

function calculateCapabilityFit(character, info, scenario, twist) {
  if (!info) {
    return {
      scenario: { points: 0, reasons: [] },
      twist: { points: 0, reasons: [] },
      totalPoints: 0
    };
  }

  const sourceText = buildInfoCorpus(info, character).toLowerCase();
  const sourceIntents = inferIntentGroups(sourceText);
  const typeData = detectCharacterType(character, info);
  const type = typeData && typeData.type ? typeData.type : 'balanced';
  const typeAffinity = TYPE_INTENT_AFFINITY[type] || TYPE_INTENT_AFFINITY.balanced;
  const professionText = info.profession ? String(info.profession).toLowerCase() : '';
  const powerClass = detectPowerClass(character, info);

  const evaluateTarget = (targetText, domainMatches) => {
    const targetIntents = inferIntentGroups(targetText || '');
    const intentMatches = targetIntents.filter(intent => sourceIntents.includes(intent));
    const roleMatches = targetIntents.filter(intent => typeAffinity.includes(intent));
    const professionMatches = getProfessionIntentMatches(professionText, targetIntents);
    const threatLevel = inferThreatDemandLevel(targetText || '');
    const powerFit = getPowerFitPoints(powerClass, threatLevel);

    let points = 0;
    const reasons = [];

    if (intentMatches.length) {
      points += Math.min(3, intentMatches.length + 1);
      reasons.push(`intent alignment: ${intentMatches.join(', ')}`);
    }

    if (domainMatches.length) {
      points += Math.min(2, domainMatches.length);
      reasons.push(`domain alignment: ${domainMatches.join(', ')}`);
    }

    if (roleMatches.length) {
      points += Math.min(2, roleMatches.length);
      reasons.push(`type alignment: ${type}`);
    }

    if (professionMatches.length) {
      points += 1;
      reasons.push(`profession fit: ${professionMatches.join(', ')}`);
    }

    if (powerFit > 0) {
      points += Math.min(2, powerFit);
      reasons.push(`power-level fit (${powerClass})`);
    }

    return {
      points: Math.min(8, points),
      reasons,
      intentMatches,
      roleMatches,
      professionMatches,
      threatLevel,
      powerFit
    };
  };

  const scenarioDomains = getDomainMatches(scenario, '', sourceText);
  const twistDomains = getDomainMatches('', twist, sourceText);
  const scenarioResult = evaluateTarget(scenario || '', scenarioDomains);
  const twistResult = evaluateTarget(twist || '', twistDomains);

  return {
    scenario: scenarioResult,
    twist: twistResult,
    totalPoints: Math.min(14, scenarioResult.points + twistResult.points)
  };
}

function buildCapabilityProfile(character, info) {
  const corpus = buildInfoCorpus(info, character).toLowerCase();
  const tokenSet = new Set(getMeaningfulTokens(corpus, 320));
  const typeData = detectCharacterType(character, info);
  const powerClass = detectPowerClass(character, info);
  const traits = {};

  Object.entries(CAPABILITY_TRAIT_KEYWORDS).forEach(([trait, keywords]) => {
    const matches = keywords.reduce((count, keyword) => {
      const key = normalizeKeywordToken(keyword);
      return key && tokenSet.has(key) ? count + 1 : count;
    }, 0);
    traits[trait] = Math.min(3, matches);
  });

  if (typeData.type === 'combat') {
    traits.combat = Math.min(3, (traits.combat || 0) + 1);
    traits.power = Math.min(3, (traits.power || 0) + 1);
  }
  if (typeData.type === 'speed') {
    traits.speed = Math.min(3, (traits.speed || 0) + 1);
    traits.mobility = Math.min(3, (traits.mobility || 0) + 1);
  }
  if (typeData.type === 'intelligence') {
    traits.intelligence = Math.min(3, (traits.intelligence || 0) + 1);
    traits.engineering = Math.min(3, (traits.engineering || 0) + 1);
  }
  if (typeData.type === 'support') {
    traits.adaptability = Math.min(3, (traits.adaptability || 0) + 1);
    traits.control = Math.min(3, (traits.control || 0) + 1);
  }
  if (typeData.type === 'tank') {
    traits.durability = Math.min(3, (traits.durability || 0) + 1);
  }
  if (typeData.type === 'versatile' || typeData.type === 'balanced') {
    traits.adaptability = Math.min(3, (traits.adaptability || 0) + 1);
  }

  if (powerClass === 'cosmic' || powerClass === 'godlike') {
    traits.power = Math.min(3, (traits.power || 0) + 1);
    traits.durability = Math.min(3, (traits.durability || 0) + 1);
    traits.space = Math.min(3, (traits.space || 0) + 1);
  }

  if ((traits.aquatic || 0) >= 2) {
    traits.durability = Math.min(3, (traits.durability || 0) + 1);
    traits.adaptability = Math.min(3, (traits.adaptability || 0) + 1);
    traits.control = Math.min(3, (traits.control || 0) + 1);
  }

  if (info) {
    traits.adaptability = Math.max(1, traits.adaptability || 0);
    traits.control = Math.max(1, traits.control || 0);
    traits.intelligence = Math.max(1, traits.intelligence || 0);
  }

  if ((traits.power || 0) >= 2) {
    traits.combat = Math.max(1, traits.combat || 0);
    traits.durability = Math.max(1, traits.durability || 0);
  }
  if ((traits.intelligence || 0) >= 2) {
    traits.control = Math.max(2, traits.control || 0);
  }
  if ((traits.mobility || 0) >= 2) {
    traits.speed = Math.max(1, traits.speed || 0);
  }
  if ((traits.social || 0) >= 2) {
    traits.communication = Math.max(1, traits.communication || 0);
  }
  if ((traits.engineering || 0) >= 2) {
    traits.intelligence = Math.max(2, traits.intelligence || 0);
  }

  const rankedTraits = Object.entries(traits)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([trait]) => trait);

  return {
    traits,
    rankedTraits,
    type: typeData.type,
    powerClass
  };
}

function inferScenarioRequirements(scenario) {
  const scenarioText = String(scenario || '').toLowerCase();
  const intents = inferIntentGroups(scenarioText);
  const required = new Set();
  const pathways = [];

  const addPathway = (label, traits) => {
    const normalizedTraits = Array.from(new Set((traits || []).filter(Boolean)));
    if (!normalizedTraits.length) return;
    const signature = `${label}:${normalizedTraits.join('|')}`;
    if (pathways.some(path => `${path.label}:${path.traits.join('|')}` === signature)) return;
    pathways.push({ label, traits: normalizedTraits });
  };

  intents.forEach(intent => {
    (INTENT_TO_TRAITS[intent] || []).forEach(trait => required.add(trait));
    addPathway(`${intent} pathway`, INTENT_TO_TRAITS[intent] || []);
  });

  if (/space|moon|galaxy|planet|orbit/.test(scenarioText)) {
    required.add('space');
    required.add('adaptability');
    addPathway('space specialist', ['space', 'adaptability', 'control']);
    addPathway('science fallback', ['intelligence', 'engineering', 'adaptability']);
  }
  if (/save|defeat|prevent|protect|threat|invasion|apocalypse|dragon|monster|war|battle/.test(scenarioText)) {
    required.add('combat');
    required.add('power');
    required.add('durability');
    addPathway('frontline fighter', ['combat', 'power', 'durability']);
    addPathway('tactical commander', ['intelligence', 'leadership', 'control']);
  }
  if (/solve|mystery|investigate|uncover|decode|detective|secret/.test(scenarioText)) {
    required.add('intelligence');
    required.add('control');
    required.add('stealth');
    addPathway('detective analyst', ['intelligence', 'control', 'stealth']);
    addPathway('social investigator', ['social', 'communication', 'intelligence']);
  }
  if (/make|cook|bake|perfect|restaurant|food|recipe|sushi/.test(scenarioText)) {
    required.add('control');
    required.add('adaptability');
    addPathway('craft specialist', ['control', 'adaptability', 'intelligence']);
    addPathway('performance creator', ['social', 'communication', 'control']);
  }
  if (/win|championship|record|race|sport/.test(scenarioText)) {
    required.add('speed');
    required.add('control');
    addPathway('athlete speed path', ['speed', 'mobility', 'control']);
    addPathway('strategic competitor', ['intelligence', 'control', 'adaptability']);
  }
  if (/underwater|ocean|deep sea|submarine/.test(scenarioText)) {
    required.add('aquatic');
    required.add('durability');
    addPathway('aquatic specialist', ['aquatic', 'durability', 'adaptability']);
    addPathway('tech dive path', ['engineering', 'control', 'durability']);
  }
  if (/build|design|construct|repair|invent|create/.test(scenarioText)) {
    required.add('engineering');
    required.add('control');
    addPathway('builder engineer', ['engineering', 'control', 'intelligence']);
    addPathway('resourceful maker', ['adaptability', 'control', 'mobility']);
  }
  if (/survive|escape|wilderness|desert|volcano|apocalypse/.test(scenarioText)) {
    required.add('durability');
    required.add('adaptability');
    addPathway('survival endurance', ['durability', 'adaptability', 'control']);
    addPathway('escape mobility', ['mobility', 'speed', 'adaptability']);
  }
  if (/win|competition|championship|record/.test(scenarioText)) {
    required.add('control');
    required.add('speed');
  }

  if (!required.size) {
    required.add('adaptability');
    required.add('control');
    addPathway('generalist path', ['adaptability', 'control', 'intelligence']);
  }

  addPathway('universal adaptive path', ['adaptability', 'control', 'intelligence']);
  addPathway('creative wildcard path', ['versatility', 'social', 'communication']);

  if (pathways.length === 0) {
    addPathway('default generalist', ['adaptability', 'control', 'intelligence']);
  }

  return {
    intents,
    requiredTraits: Array.from(required),
    pathways
  };
}

function evaluateScenarioFeasibility(profile, requirements) {
  const traits = profile && profile.traits ? profile.traits : {};
  const requiredTraits = requirements && Array.isArray(requirements.requiredTraits)
    ? requirements.requiredTraits
    : [];

  if (!requiredTraits.length) {
    return {
      score: 5,
      canDo: true,
      thrive: false,
      matchedTraits: [],
      missingTraits: [],
      reasons: ['insufficient scenario constraints; baseline feasibility applied']
    };
  }

  const pathways = requirements && Array.isArray(requirements.pathways)
    ? requirements.pathways
    : [];

  const evaluatePath = (pathwayTraits) => {
    const targetTraits = Array.isArray(pathwayTraits) && pathwayTraits.length
      ? pathwayTraits
      : requiredTraits;
    const traitValues = targetTraits.map(trait => traits[trait] || 0);
    const achieved = traitValues.reduce((sum, value) => sum + value, 0);
    const maxPossible = Math.max(1, targetTraits.length * 3);
    const normalized = achieved / maxPossible;
    const coveredCount = traitValues.filter(value => value >= 1).length;
    const strongCount = traitValues.filter(value => value >= 2).length;
    const flexibility = Math.min(2, ((traits.adaptability || 0) + (traits.control || 0)) / 2);
    const coverageBonus = targetTraits.length > 0 ? (coveredCount / targetTraits.length) * 2 : 0;
    const strongBonus = targetTraits.length > 0 ? (strongCount / targetTraits.length) * 1.5 : 0;
    const score = Math.max(0, Math.min(10, Math.round((normalized * 7) + coverageBonus + strongBonus + flexibility)));

    return {
      score,
      targetTraits,
      coveredCount,
      strongCount,
      normalized
    };
  };

  const pathEvaluations = (pathways.length ? pathways : [{ label: 'required traits', traits: requiredTraits }])
    .map(path => ({
      label: path.label || 'pathway',
      ...evaluatePath(path.traits)
    }));

  const bestPath = pathEvaluations.sort((a, b) => b.score - a.score)[0];

  const matchedTraits = [];
  const missingTraits = [];

  bestPath.targetTraits.forEach(trait => {
    const traitScore = traits[trait] || 0;
    if (traitScore >= 2) matchedTraits.push(trait);
    if (traitScore === 0) missingTraits.push(trait);
  });

  const baselineFloor = profile ? 2 : 0;
  const score = Math.max(baselineFloor, bestPath.score);
  const canDo = score >= 3;
  const thrive = score >= 7;
  const reasons = [];

  reasons.push(`best path: ${bestPath.label}`);
  if (matchedTraits.length) {
    reasons.push(`strong traits: ${matchedTraits.slice(0, 3).join(', ')}`);
  }
  if (missingTraits.length) {
    reasons.push(`gaps: ${missingTraits.slice(0, 2).join(', ')}`);
  }
  if (pathEvaluations.length > 1) {
    reasons.push(`viable paths checked: ${pathEvaluations.length}`);
  }

  return {
    score,
    canDo,
    thrive,
    matchedTraits,
    missingTraits,
    reasons
  };
}

function inferTwistEffects(twist) {
  const text = String(twist || '').toLowerCase();
  const helps = new Set();
  const hurts = new Set();
  const labels = [];
  let severity = 0;

  TWIST_EFFECT_RULES.forEach(rule => {
    const triggered = rule.keywords.some(keyword => text.includes(keyword));
    if (!triggered) return;

    (rule.helps || []).forEach(trait => helps.add(trait));
    (rule.hurts || []).forEach(trait => hurts.add(trait));
    labels.push(rule.label);
    severity = Math.max(severity, rule.severity || 1);
  });

  return {
    helps: Array.from(helps),
    hurts: Array.from(hurts),
    labels,
    severity: severity || 1,
    affects: labels.length > 0
  };
}

function evaluateTwistImpact(profile, twist) {
  const traits = profile && profile.traits ? profile.traits : {};
  const effects = inferTwistEffects(twist);
  const adaptationBuffer = Math.round(((traits.adaptability || 0) + (traits.control || 0)) / 2);

  let helpScore = 0;
  effects.helps.forEach(trait => {
    const traitScore = traits[trait] || 0;
    helpScore += traitScore >= 2 ? traitScore + 1 : traitScore;
  });

  let penalty = 0;
  effects.hurts.forEach(trait => {
    const traitScore = traits[trait] || 0;
    penalty += Math.max(0, effects.severity - traitScore);
  });

  if (effects.helps.includes('aquatic') && (traits.aquatic || 0) >= 2) {
    helpScore += 2;
    penalty = Math.max(0, penalty - 1);
  }

  if (effects.helps.includes('speed') && (traits.speed || 0) >= 2) {
    helpScore += 1;
  }

  if (effects.hurts.includes('communication') && (traits.communication || 0) >= 2) {
    penalty = Math.max(0, penalty - 1);
  }

  const rawImpact = helpScore - penalty + adaptationBuffer;
  const impactScore = Math.max(-4, Math.min(4, Math.round(rawImpact / 2)));
  const helps = impactScore >= 2;
  const hurts = impactScore <= -2;
  const neutral = !helps && !hurts;
  const reasons = [];

  if (effects.labels.length) {
    reasons.push(`twist factors: ${effects.labels.join(', ')}`);
  }
  if (effects.helps.length) {
    reasons.push(`advantage traits: ${effects.helps.filter(t => (traits[t] || 0) >= 2).slice(0, 3).join(', ') || 'limited'}`);
  }
  if (effects.hurts.length) {
    reasons.push(`risk traits: ${effects.hurts.filter(t => (traits[t] || 0) <= 1).slice(0, 3).join(', ') || 'covered'}`);
  }

  return {
    impactScore,
    affects: effects.affects,
    helps,
    hurts,
    neutral,
    helpTraits: effects.helps,
    hurtTraits: effects.hurts,
    reasons
  };
}

function assessScenarioAndTwist(character, info, scenario, twist) {
  if (!info) {
    return {
      profile: null,
      requirements: inferScenarioRequirements(scenario),
      scenarioFeasibility: {
        score: 0,
        canDo: false,
        thrive: false,
        matchedTraits: [],
        missingTraits: ['unknown profile'],
        reasons: ['no character data available']
      },
      twistImpact: {
        impactScore: 0,
        affects: false,
        helps: false,
        hurts: false,
        neutral: true,
        helpTraits: [],
        hurtTraits: [],
        reasons: ['no character data available']
      }
    };
  }

  const profile = buildCapabilityProfile(character, info);
  const requirements = inferScenarioRequirements(scenario);
  const scenarioFeasibility = evaluateScenarioFeasibility(profile, requirements);
  const twistImpact = evaluateTwistImpact(profile, twist);

  return {
    profile,
    requirements,
    scenarioFeasibility,
    twistImpact
  };
}

function scoreRelevance(character, info, scenario, twist) {
  if (!info) return { points: 0, note: null };
  const sourceText = buildInfoCorpus(info, character).toLowerCase();
  const scenarioFit = buildKeywordFitDetails(sourceText, scenario);
  const twistFit = buildKeywordFitDetails(sourceText, twist);

  const scenarioDomains = getDomainMatches(scenario, '', sourceText);
  const twistDomains = getDomainMatches('', twist, sourceText);

  const sourceIntents = inferIntentGroups(sourceText);
  const scenarioIntents = inferIntentGroups(scenario);
  const twistIntents = inferIntentGroups(twist);

  const matchedScenarioIntents = scenarioIntents.filter(intent => sourceIntents.includes(intent));
  const matchedTwistIntents = twistIntents.filter(intent => sourceIntents.includes(intent));
  const uniqueMatchedIntents = Array.from(new Set([...matchedScenarioIntents, ...matchedTwistIntents]));
  const assessment = assessScenarioAndTwist(character, info, scenario, twist);

  const scenarioPoints = mapFitCountToPoints(scenarioFit.totalCount);
  const twistPoints = mapFitCountToPoints(twistFit.totalCount);
  const domainPoints = Math.min(8, (scenarioDomains.length + twistDomains.length) * 2);
  const intentPoints = Math.min(6, uniqueMatchedIntents.length * 2);
  const capability = calculateCapabilityFit(character, info, scenario, twist);
  const capabilityPoints = Math.min(8, capability.totalPoints);
  const feasibility = assessment.scenarioFeasibility;
  const twistImpact = assessment.twistImpact;
  const scenarioFeasibilityPoints = feasibility.score >= 9
    ? 4
    : feasibility.score >= 7
    ? 3
    : feasibility.score >= 5
    ? 2
    : feasibility.score >= 3
    ? 1
    : 0;
  const twistImpactPoints = twistImpact.helps
    ? Math.min(4, Math.max(1, twistImpact.impactScore))
    : twistImpact.hurts
    ? -Math.min(4, Math.abs(twistImpact.impactScore))
    : 0;
  const precisionBonus = (scenarioFit.totalCount >= 6 && twistFit.totalCount >= 4) ? 2 : 0;
  const total = Math.max(-6, Math.min(24, scenarioPoints + twistPoints + domainPoints + intentPoints + precisionBonus + capabilityPoints + scenarioFeasibilityPoints + twistImpactPoints));

  const noteParts = [];
  if (scenarioFit.totalCount > 0 || twistFit.totalCount > 0) {
    noteParts.push(`Keyword fit: S${scenarioFit.totalCount}/T${twistFit.totalCount}`);
  }
  if (scenarioDomains.length || twistDomains.length) {
    const mergedDomains = Array.from(new Set([...scenarioDomains, ...twistDomains]));
    noteParts.push(`Domain fit: ${mergedDomains.join(', ')}`);
  }
  if (uniqueMatchedIntents.length) {
    noteParts.push(`Intent fit: ${uniqueMatchedIntents.join(', ')}`);
  }
  if (capability.totalPoints >= 4) {
    noteParts.push(`Thrive potential: +${capability.totalPoints} capability fit`);
  }
  noteParts.push(`Scenario feasibility: ${feasibility.canDo ? 'can do' : 'struggles'} (${feasibility.score}/10)`);
  if (twistImpact.affects) {
    noteParts.push(`Twist impact: ${twistImpact.helps ? 'helps' : twistImpact.hurts ? 'hurts' : 'neutral'} (${twistImpact.impactScore})`);
  }

  return {
    points: total,
    note: noteParts.length ? noteParts.join(' | ') : 'Limited direct overlap with scenario/twist.',
    scenario: {
      matchCount: scenarioFit.totalCount,
      matchedKeywords: scenarioFit.matchedKeywords,
      domains: scenarioDomains,
      capabilityScore: capability.scenario.points,
      capabilityReasons: capability.scenario.reasons,
      feasibilityScore: feasibility.score,
      canDo: feasibility.canDo,
      thrive: feasibility.thrive,
      requiredTraits: assessment.requirements.requiredTraits,
      matchedTraits: feasibility.matchedTraits,
      missingTraits: feasibility.missingTraits,
      feasibilityReasons: feasibility.reasons
    },
    twist: {
      matchCount: twistFit.totalCount,
      matchedKeywords: twistFit.matchedKeywords,
      domains: twistDomains,
      capabilityScore: capability.twist.points,
      capabilityReasons: capability.twist.reasons,
      impactScore: twistImpact.impactScore,
      affects: twistImpact.affects,
      helps: twistImpact.helps,
      hurts: twistImpact.hurts,
      helpTraits: twistImpact.helpTraits,
      hurtTraits: twistImpact.hurtTraits,
      impactReasons: twistImpact.reasons
    },
    profile: assessment.profile ? {
      topTraits: assessment.profile.rankedTraits,
      type: assessment.profile.type,
      powerClass: assessment.profile.powerClass
    } : null
  };
}

function calculateDraftedFitBonus(info, scenario, twist, character) {
  const sourceText = buildInfoCorpus(info, character);
  const scenarioFit = buildKeywordFitDetails(sourceText, scenario || '');
  const twistFit = buildKeywordFitDetails(sourceText, twist || '');

  return {
    scenario: mapFitCountToDraftBonus(scenarioFit.totalCount),
    twist: mapFitCountToDraftBonus(twistFit.totalCount)
  };
}

function scoreNameSignals(character, validation, scenario, twist) {
  const signals = [];
  let points = 0;
  const wordCount = validation.wordCount || 0;
  const trimmed = character.trim();
  const lower = trimmed.toLowerCase();

  if (wordCount >= 4) { points -= 2; signals.push('long name'); }

  if (TITLE_KEYWORDS.some(title => lower.includes(`${title} `) || lower.endsWith(` ${title}`))) {
    points += 2;
    signals.push('title/honorific');
  }

  if (ROLE_KEYWORDS.some(role => lower.includes(role))) {
    points += 2;
    signals.push('role keyword');
  }

  if (/\d/.test(lower)) {
    points -= 3;
    signals.push('numeric token');
  }

  if (trimmed.length <= 3) {
    points -= 2;
    signals.push('very short name');
  }

  if (/-|\'/.test(trimmed)) {
    points += 1;
    signals.push('distinct formatting');
  }

  const scenarioTokens = tokenize(`${scenario} ${twist}`);
  const nameTokens = tokenize(trimmed);
  const nameOverlap = countOverlap(nameTokens, scenarioTokens);
  if (nameOverlap > 0) {
    points += 3;
    signals.push('name matches scenario/twist');
  }

  const note = signals.length ? `Name signals: ${signals.join(', ')}.` : 'Name signals: minimal.';
  return { points, note };
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
  const normalized = normalizeName(character);
  const query = encodeURIComponent(normalized);
  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${query}&language=en&format=json&limit=5&origin=*`;
  const searchJson = await getJson(searchUrl);
  const results = searchJson && Array.isArray(searchJson.search) ? searchJson.search : [];
  const candidate = results.find(item => item && item.label && item.description) || results[0];

  if (!candidate) return null;

  const wikidataMeta = await fetchWikidataMetadata(candidate.id);

  return {
    source: 'wikidata',
    description: `${candidate.description || 'Wikidata entity'} (${candidate.label || normalized})`,
    title: candidate.label || normalized,
    profession: candidate.description || null,
    aliases: wikidataMeta && wikidataMeta.aliases ? wikidataMeta.aliases : [],
    wikidataDescription: wikidataMeta && wikidataMeta.wikidataDescription ? wikidataMeta.wikidataDescription : candidate.description || null,
    wikidataId: candidate.id || null
  };
}

async function fetchFromFandom(character) {
  const normalized = normalizeName(character);
  const searchQueries = [normalized, ...WIKI_SEARCH_HINTS.slice(0, 6).map(hint => `${normalized} ${hint}`)];

  for (const searchQuery of searchQueries) {
    const searchUrl = `https://community.fandom.com/api/v1/Search/List?query=${encodeURIComponent(searchQuery)}&limit=4&ns=0`;
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
            description: firstPage.extract.substring(0, 500),
            title: firstPage.title || articleTitle
          };
        }
      } catch (e) {
        // Continue trying next result
      }
    }
  }

  return null;
}

// ========== STEP 4: TIERED FETCH ORCHESTRATION ==========
async function fetchCharacterInfo(character) {
  // Try cache first
  const cached = getCachedCharacter(character);
  if (cached) return cached;

  const inflightKey = character.toLowerCase().trim();
  const existingInflight = INFLIGHT_FETCHES.get(inflightKey);
  if (existingInflight) {
    return existingInflight;
  }

  const fetchPromise = (async () => {
    const variants = getCharacterNameVariants(character);
    
    // Try enhanced tiers in order (high precision first)
    for (const variant of variants) {
      const result = await fetchFromWikipediaEnhanced(variant);
      if (result) {
        setCachedCharacter(character, result);
        return result;
      }
    }

    // Broader lookups in parallel to reduce long sequential tail latency
    const secondaryLookups = [
      ...variants.map((variant) => fetchFromWikipediaSummary(variant).catch(() => null)),
      ...variants.map((variant) => fetchFromWikipediaSearchEnhanced(variant).catch(() => null)),
      fetchFromFandom(character).catch(() => null),
      fetchFromOMDb(character).catch(() => null),
      fetchFromWikidata(character).catch(() => null)
    ];

    const results = await Promise.all(secondaryLookups);
    const firstHit = results.find(Boolean) || null;
    if (firstHit) {
      setCachedCharacter(character, firstHit);
      return firstHit;
    }

    return null; // All APIs failed
  })();

  INFLIGHT_FETCHES.set(inflightKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    INFLIGHT_FETCHES.delete(inflightKey);
  }
}

// ========== STEP 5: SCORING LOGIC ==========
// Called for EACH CHARACTER across ALL TEAMS (up to 36 times)
async function scoreCharacter(character, scenario, twist, options = {}) {
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
        ovr: mapScoreToOVR(0),
        reason: 'Invalid input',
        notes: buildNotes({ validation, info: null, scenario, twist, score: 0 }),
        breakdown: buildBreakdown({ character, validation, info: null, scenario, twist, score: 0, nameSignals: null, relevance: null, ovrData: { ovr: mapScoreToOVR(0), tier: getOVRTier(mapScoreToOVR(0)), rarity: 'Bronze', type: 'balanced', attributes: {} } })
      };
    }
    if (validation.tier === 'disappointed') {
      return {
        character,
        emotion: 'disappointed',
        score: 4,
        ovr: mapScoreToOVR(4),
        reason: 'Offensive content',
        notes: buildNotes({ validation, info: null, scenario, twist, score: 4 }),
        breakdown: buildBreakdown({ character, validation, info: null, scenario, twist, score: 4, nameSignals: null, relevance: null, ovrData: { ovr: mapScoreToOVR(4), tier: getOVRTier(mapScoreToOVR(4)), rarity: 'Bronze', type: 'balanced', attributes: {} } })
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
  let score = info ? 14 : 10;
  const scoreBreakdownSteps = [];
  scoreBreakdownSteps.push({ step: 'Base Score', points: score, description: info ? 'Character found in database' : 'Unknown character' });
  
  const nameSignals = scoreNameSignals(character, validation, scenario, twist);
  score += nameSignals.points;
  if (nameSignals.points !== 0) {
    scoreBreakdownSteps.push({ step: 'Name Signals', points: nameSignals.points, description: nameSignals.note });
  }
  
  const relevance = scoreRelevance(character, info, scenario, twist);
  score += relevance.points;
  if (relevance.points !== 0) {
    scoreBreakdownSteps.push({ step: 'Scenario/Twist Relevance', points: relevance.points, description: relevance.note });
  }

  const draftedScenario = options.originalScenario || scenario;
  const draftedTwist = options.originalTwist || twist;
  const draftedFitBonus = calculateDraftedFitBonus(info, draftedScenario, draftedTwist, character);
  const draftedScenarioBonus = Math.min(3, draftedFitBonus.scenario || 0);
  const draftedTwistBonus = Math.min(3, draftedFitBonus.twist || 0);

  if (draftedScenarioBonus > 0) {
    score += draftedScenarioBonus;
    scoreBreakdownSteps.push({
      step: 'Original Scenario Fit (Drafted)',
      points: draftedScenarioBonus,
      description: `Draft-time scenario alignment bonus (+${draftedScenarioBonus}/3)`
    });
  }

  if (draftedTwistBonus > 0) {
    score += draftedTwistBonus;
    scoreBreakdownSteps.push({
      step: 'Original Twist Fit (Drafted)',
      points: draftedTwistBonus,
      description: `Draft-time twist alignment bonus (+${draftedTwistBonus}/3)`
    });
  }

  if (info && info.source === 'wikipedia') {
    score += 2;
    scoreBreakdownSteps.push({ step: 'Wikipedia Source', points: 2, description: 'Found on Wikipedia (prestigious source)' });
  }

  if (!info && validation.wordCount >= 3) {
    score -= 2;
    scoreBreakdownSteps.push({ step: 'Long Unknown Name', points: -2, description: '3+ words but not found in database' });
  }

  // Clamp to 0-30
  score = Math.max(SCORE_MIN, Math.min(SCORE_MAX, score));
  
  // Calculate advanced OVR with multi-dimensional attributes
  const ovrData = calculateAdvancedOVR(score, character, info, scenario, twist);
  
  const result = {
    character,
    emotion: mapScoreToEmotion(score),
    score: Math.round(score),
    ovr: ovrData.ovr,
    ovrTier: ovrData.tier,
    attributes: ovrData.attributes,
    rarity: ovrData.rarity,
    characterType: ovrData.type,
    reason: info ? 'Evaluated' : 'Unknown character',
    notes: buildNotes({
      validation,
      info,
      scenario,
      twist,
      score,
      scoreMeta: { relevanceNote: relevance.note || nameSignals.note }
    }),
    breakdown: buildBreakdown({
      character,
      validation,
      info,
      scenario,
      twist,
      score: Math.round(score),
      nameSignals,
      relevance,
      draftedFitBonus: {
        scenario: draftedScenarioBonus,
        twist: draftedTwistBonus
      },
      ovrData,
      scoreBreakdownSteps
    })
  };
  
  console.log(`📊 "${character}" → Score: ${result.score}/30, OVR: ${result.ovr} [${ovrData.tier.label}], Type: ${ovrData.type}, Rarity: ${ovrData.rarity}, Emotion: ${result.emotion}`);
  
  return result;
}

// ========== STEP 6: EMOTION MAPPING ==========
function mapScoreToEmotion(score) {
  if (score === 0) return 'mad';
  if (score <= 5) return 'disappointed';
  if (score <= 10) return 'confused';
  if (score <= 18) return 'neutral';
  if (score <= 23) return 'happy';
  if (score <= 27) return 'amazed';
  return 'mindBlown';
}

// Advanced OVR Calculation with Multi-Dimensional Attributes
function calculateAdvancedOVR(score, character, info, scenario, twist) {
  // Base OVR from score (40% weight)
  let baseOVR = Math.round((score / SCORE_MAX) * 70); // Max 70 from score alone
  
  // Detect character rarity (adds 0-15 points)
  const rarityBonus = detectRarity(character, info);
  
  // Detect character type and get stat bonuses
  const typeData = detectCharacterType(character, info);
  
  // Calculate attribute scores (6 core stats)
  const attributes = calculateAttributes(character, info, scenario, twist, typeData);
  
  // Average of top 3 attributes (adds 0-15 points)
  const topStats = Object.values(attributes).sort((a, b) => b - a).slice(0, 3);
  const attributeBonus = Math.round(topStats.reduce((sum, val) => sum + val, 0) / 3 * 0.15);
  
  // Scenario fit multiplier (0.8x - 1.2x)
  const scenarioFit = calculateScenarioFit(character, info, scenario, twist);
  
  // Final OVR calculation
  let finalOVR = Math.round((baseOVR + rarityBonus + attributeBonus) * scenarioFit);
  
  // Clamp to 0-99
  finalOVR = Math.max(0, Math.min(99, finalOVR));
  
  return {
    ovr: finalOVR,
    attributes,
    rarity: getRarityTier(rarityBonus),
    type: typeData.type,
    tier: getOVRTier(finalOVR)
  };
}

function detectRarity(character, info) {
  const lower = character.toLowerCase();
  
  // Icon tier: +15
  if (RARITY_KEYWORDS.icon.some(name => lower.includes(name))) return 15;
  
  // Legendary tier: +12
  if (RARITY_KEYWORDS.legendary.some(name => lower.includes(name))) return 12;
  
  // Epic tier: +9
  if (RARITY_KEYWORDS.epic.some(name => lower.includes(name))) return 9;
  
  // Rare tier: +6
  if (RARITY_KEYWORDS.rare.some(name => lower.includes(name))) return 6;
  
  // Franchise-based prestige bonus (new)
  for (const [franchise, franchiseData] of Object.entries(FRANCHISE_DATABASE)) {
    const members = Array.isArray(franchiseData) ? franchiseData : franchiseData.members;
    const prestige = franchiseData.prestige || 'major';
    
    if (members.some(member => lower.includes(member))) {
      if (prestige === 'iconic') return 5;      // Icon franchises get +5 (between Rare and Common)
      if (prestige === 'legendary') return 4;   // Legendary franchises get +4
      if (prestige === 'major') return 3;       // Major franchises get +3
    }
  }

  const nicheSignal = calculateNicheSignal(character, info);
  if (nicheSignal >= 3) return 6;
  if (nicheSignal >= 2) return 4;
  
  // Wikipedia found: +4
  if (info && info.source === 'wikipedia') return 4;
  
  // Any info found: +2
  if (info) return 2;
  
  // Common/Unknown: +0
  return 0;
}

function calculateNicheSignal(character, info) {
  if (!info) return 0;

  const lower = String(character || '').toLowerCase();
  const compact = canonicalizeName(character);
  const isKnownTopTier = Object.values(RARITY_KEYWORDS)
    .flat()
    .some(name => lower.includes(name));

  if (isKnownTopTier) return 0;

  const inKnownFranchise = Object.values(FRANCHISE_DATABASE).some(franchiseData => {
    const members = Array.isArray(franchiseData) ? franchiseData : franchiseData.members;
    return members.some(member => lower.includes(member) || compact.includes(canonicalizeName(member)));
  });

  let signal = 0;
  if (!inKnownFranchise) signal += 1;

  const categoryCount = Array.isArray(info.categories) ? info.categories.length : 0;
  if (categoryCount >= 3) signal += 1;

  const aliasCount = Array.isArray(info.aliases) ? info.aliases.length : 0;
  if (aliasCount >= 2) signal += 1;

  const titleWordCount = normalizeName(info.title || character).split(/\s+/).filter(Boolean).length;
  if (titleWordCount >= 2) signal += 1;

  return Math.min(4, signal);
}

function getRarityTier(bonus) {
  if (bonus >= 15) return 'Icon';
  if (bonus >= 12) return 'Legendary';
  if (bonus >= 9) return 'Epic';
  if (bonus >= 6) return 'Rare';
  if (bonus >= 2) return 'Common';
  return 'Bronze';
}

function detectCharacterType(character, info) {
  const lower = `${character} ${info ? info.description || '' : ''}`.toLowerCase();
  const profession = info && info.profession ? info.profession.toLowerCase() : '';
  
  // First, check profession if extracted from Wikipedia
  if (profession) {
    if (profession.includes('warrior') || profession.includes('fighter') || profession.includes('soldier') || profession.includes('martial')) {
      return { type: 'combat', statBonus: CHARACTER_TYPES.combat.statBonus };
    }
    if (profession.includes('scientist') || profession.includes('professor') || profession.includes('inventor') || profession.includes('genius') || profession.includes('engineer')) {
      return { type: 'intelligence', statBonus: CHARACTER_TYPES.intelligence.statBonus };
    }
    if (profession.includes('speedster') || profession.includes('fast') || profession.includes('speed')) {
      return { type: 'speed', statBonus: CHARACTER_TYPES.speed.statBonus };
    }
    if (profession.includes('tank') || profession.includes('defender') || profession.includes('guardian') || profession.includes('protector')) {
      return { type: 'tank', statBonus: CHARACTER_TYPES.tank.statBonus };
    }
    if (profession.includes('healer') || profession.includes('medic') || profession.includes('support')) {
      return { type: 'support', statBonus: CHARACTER_TYPES.support.statBonus };
    }
  }
  
  // Then check explicit keywords in description
  for (const [type, data] of Object.entries(CHARACTER_TYPES)) {
    if (data.keywords.some(kw => lower.includes(kw))) {
      return { type, statBonus: data.statBonus };
    }
  }
  
  return { type: 'balanced', statBonus: {} };
}

function calculateAttributes(character, info, scenario, twist, typeData) {
  const base = 50; // Base for all stats
  const attributes = {
    power: base,
    speed: base,
    intelligence: base,
    durability: base,
    control: base,
    versatility: base
  };
  
  // Apply type bonuses
  Object.entries(typeData.statBonus).forEach(([stat, bonus]) => {
    if (attributes[stat] !== undefined) {
      attributes[stat] = Math.max(0, Math.min(99, attributes[stat] + bonus));
    }
  });
  
  // Boost based on power level
  const lower = character.toLowerCase();
  if (POWER_LEVELS.cosmic.some(name => lower.includes(name))) {
    attributes.power = Math.min(99, attributes.power + 30);
    attributes.durability = Math.min(99, attributes.durability + 25);
  } else if (POWER_LEVELS.godlike.some(name => lower.includes(name))) {
    attributes.power = Math.min(99, attributes.power + 20);
    attributes.durability = Math.min(99, attributes.durability + 15);
  } else if (POWER_LEVELS.superhuman.some(name => lower.includes(name))) {
    attributes.power = Math.min(99, attributes.power + 10);
    attributes.speed = Math.min(99, attributes.speed + 10);
  }
  
  // Info-based boosts
  if (info) {
    attributes.intelligence = Math.min(99, attributes.intelligence + 10);
    attributes.versatility = Math.min(99, attributes.versatility + 5);
  }
  
  return attributes;
}

function calculateScenarioFit(character, info, scenario, twist) {
  const scenarioText = `${scenario} ${twist}`.toLowerCase();
  const characterText = buildInfoCorpus(info, character).toLowerCase();
  const profession = info ? info.profession || '' : '';
  
  // Token overlap (basic matching)
  const scenarioTokens = tokenize(scenarioText);
  const charTokens = tokenize(characterText);
  const overlap = countOverlap(charTokens, scenarioTokens);
  const semanticFit = buildKeywordFitDetails(characterText, scenarioText);
  const sourceIntents = inferIntentGroups(characterText);
  const targetIntents = inferIntentGroups(scenarioText);
  const scenarioIntentMatches = targetIntents.filter(intent => sourceIntents.includes(intent));
  const capability = calculateCapabilityFit(character, info, scenario, twist);
  const assessment = assessScenarioAndTwist(character, info, scenario, twist);
  
  let multiplier = 1.0;
  
  // Perfect fit: 3+ token overlaps (e.g., "Batman" vs "Crime Fighting", "Gadgets")
  if (semanticFit.totalCount >= 14 || overlap >= 6) {
    multiplier = 1.25; // Increased from 1.2
  } 
  // Great fit: 2-3 overlaps
  else if (semanticFit.totalCount >= 9 || overlap >= 4) {
    multiplier = 1.18; // Increased from 1.15
  } 
  // Good fit: 1-2 overlaps
  else if (semanticFit.totalCount >= 4 || overlap >= 1) {
    multiplier = 1.1;
  }

  if (scenarioIntentMatches.length >= 2) {
    multiplier += 0.08;
  } else if (scenarioIntentMatches.length === 1) {
    multiplier += 0.04;
  }

  if (capability.totalPoints >= 10) {
    multiplier += 0.12;
  } else if (capability.totalPoints >= 7) {
    multiplier += 0.08;
  } else if (capability.totalPoints >= 4) {
    multiplier += 0.05;
  } else if (capability.totalPoints >= 2) {
    multiplier += 0.03;
  }
  
  // Profession-based matching (new)
  if (profession) {
    const professionLower = profession.toLowerCase();
    // Check if profession keywords match scenario context
    const professionBonus = 0.05; // 5% bonus per profession match
    
    // Combat/Action scenarios
    if ((scenarioText.includes('defeat') || scenarioText.includes('fight') || scenarioText.includes('survive')) 
        && (professionLower.includes('warrior') || professionLower.includes('fighter') || professionLower.includes('soldier'))) {
      multiplier += professionBonus;
    }
    
    // Building/Creation scenarios
    if ((scenarioText.includes('build') || scenarioText.includes('create') || scenarioText.includes('design')) 
        && (professionLower.includes('engineer') || professionLower.includes('inventor') || professionLower.includes('scientist'))) {
      multiplier += professionBonus;
    }
    
    // Investigation/Strategy scenarios
    if ((scenarioText.includes('solve') || scenarioText.includes('uncover') || scenarioText.includes('strategize')) 
        && (professionLower.includes('detective') || professionLower.includes('strategist') || professionLower.includes('genius'))) {
      multiplier += professionBonus;
    }
  }
  
  // Power level matching (new)
  const characterLower = character.toLowerCase();
  const scenarioHasThreat = scenarioText.includes('threat') || scenarioText.includes('apocalypse') 
                            || scenarioText.includes('invasion') || scenarioText.includes('god')
                            || scenarioText.includes('cosmic') || scenarioText.includes('battle');
  
  if (scenarioHasThreat) {
    // Cosmic threats need cosmic/godlike heroes
    if (POWER_LEVELS.cosmic.some(name => characterLower.includes(name))) {
      multiplier += 0.1;
    }
    // Godlike threats need godlike/superhuman heroes
    else if (POWER_LEVELS.godlike.some(name => characterLower.includes(name))) {
      multiplier += 0.08;
    }
    // Superhuman threats need superhuman/enhanced heroes
    else if (POWER_LEVELS.superhuman.some(name => characterLower.includes(name))) {
      multiplier += 0.05;
    }
  }
  
  // Franchise thematic bonus (new) - with prestige levels
  for (const [franchise, franchiseData] of Object.entries(FRANCHISE_DATABASE)) {
    const members = Array.isArray(franchiseData) ? franchiseData : franchiseData.members;
    const prestige = franchiseData.prestige || 'major';
    
    if (members.some(member => characterLower.includes(member))) {
      // Prestige bonus on top of franchise match
      let prestigeBonus = 0;
      if (prestige === 'iconic') prestigeBonus = 0.08;      // Iconic franchises: +8%
      else if (prestige === 'legendary') prestigeBonus = 0.07; // Legendary franchises: +7%
      else prestigeBonus = 0.05;                              // Major franchises: +5%
      
      // Check if scenario mentions the franchise
      if (scenarioText.includes(franchise.toLowerCase())) {
        multiplier += prestigeBonus;
      } else {
        // Even without direct mention, iconic/legendary franchises get a small boost
        if (prestige === 'iconic' || prestige === 'legendary') {
          multiplier += prestigeBonus * 0.4; // 40% of prestige bonus
        }
      }
    }
  }
  
  // If info exists but no direct match, provide stability bonus
  if (info && overlap === 0) {
    multiplier = Math.max(multiplier, 1.0);
  }

  if (info && overlap <= 1 && capability.totalPoints >= 6) {
    multiplier = Math.max(multiplier, 1.12);
  }

  if (assessment.scenarioFeasibility.thrive) {
    multiplier = Math.max(multiplier, 1.24);
  } else if (!assessment.scenarioFeasibility.canDo) {
    multiplier = Math.min(multiplier, 0.96);
  }

  if (assessment.twistImpact.helps) {
    multiplier += 0.05;
  } else if (assessment.twistImpact.hurts) {
    multiplier -= 0.06;
  }
  
  // If no info, apply penalty
  if (!info && overlap === 0) {
    multiplier = 0.9;
  }
  
  // Clamp multiplier to 0.8 - 1.35 range
  return Math.max(0.8, Math.min(1.35, multiplier));
}

function getOVRTier(ovr) {
  for (const [tier, data] of Object.entries(OVR_TIERS)) {
    if (ovr >= data.min && ovr <= data.max) {
      return { tier, color: data.color, label: data.label };
    }
  }
  return { tier: 'bronze', color: '#cd7f32', label: 'Bronze' };
}

function mapScoreToOVR(score) {
  // Legacy function - kept for backward compatibility
  return Math.round((score / SCORE_MAX) * 99);
}

// ========== EXPORTS ==========
module.exports = {
  scoreCharacter,
  validateInput,
  fetchCharacterInfo,
  mapScoreToEmotion,
  mapScoreToOVR
};
