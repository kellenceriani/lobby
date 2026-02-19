const MIN_INFO_CONFIDENCE = 0.4;
const SCORE_MIN = 0;
const SCORE_MAX = 30;

const OVR_TIERS = {
  bronze: { min: 0, max: 64, color: '#cd7f32', label: 'Bronze' },
  silver: { min: 65, max: 74, color: '#c0c0c0', label: 'Silver' },
  gold: { min: 75, max: 84, color: '#ffd700', label: 'Gold' },
  rare: { min: 85, max: 89, color: '#ff6b35', label: 'Rare' },
  epic: { min: 90, max: 94, color: '#9b59b6', label: 'Epic' },
  legendary: { min: 95, max: 98, color: '#e74c3c', label: 'Legendary' },
  icon: { min: 99, max: 99, color: '#f39c12', label: 'Icon' }
};

const RARITY_KEYWORDS = {
  icon: ['jesus', 'god', 'zeus', 'buddha', 'muhammad', 'shakespeare', 'einstein', 'newton', 'leonardo da vinci', 'michael jordan', 'muhammad ali'],
  legendary: ['superman', 'batman', 'spiderman', 'ironman', 'captain america', 'goku', 'naruto', 'harry potter', 'gandalf', 'yoda', 'darth vader', 'thanos', 'mickey mouse', 'michael jackson', 'elvis', 'marilyn monroe'],
  epic: ['wonder woman', 'thor', 'hulk', 'wolverine', 'flash', 'green lantern', 'aquaman', 'black panther', 'doctor strange', 'scarlet witch', 'vegeta', 'piccolo', 'sasuke', 'kakashi', 'luffy', 'zoro', 'hermione', 'ron weasley', 'frodo', 'aragorn', 'legolas', 'dumbledore', 'voldemort', 'sauron'],
  rare: ['hawkeye', 'black widow', 'falcon', 'winter soldier', 'ant-man', 'wasp', 'vision', 'quicksilver', 'drax', 'groot', 'rocket', 'star-lord', 'gohan', 'trunks', 'krillin', 'sakura', 'hinata', 'gaara', 'levi', 'eren', 'mikasa'],
  common: []
};

const CHARACTER_TYPES = {
  combat: { keywords: ['warrior', 'fighter', 'soldier', 'knight', 'samurai', 'boxer', 'martial', 'gladiator', 'assassin', 'ninja', 'viking', 'spartan', 'hulk', 'thor', 'wolverine'], statBonus: { power: 15, durability: 10, speed: 5 } },
  intelligence: { keywords: ['scientist', 'professor', 'genius', 'doctor', 'inventor', 'engineer', 'scholar', 'wizard', 'mage', 'einstein', 'tony stark', 'bruce banner', 'rick sanchez', 'hermione'], statBonus: { intelligence: 15, control: 10, versatility: 5 } },
  support: { keywords: ['healer', 'medic', 'nurse', 'cleric', 'support', 'buffer', 'enchanter', 'mercy', 'ana', 'soraka'], statBonus: { durability: 10, control: 10, versatility: 5 } },
  speed: { keywords: ['speedster', 'flash', 'quicksilver', 'sonic', 'runner', 'dash', 'fast', 'rapid'], statBonus: { speed: 15, agility: 10, power: 5 } },
  tank: { keywords: ['tank', 'defender', 'shield', 'guardian', 'protector', 'reinhardt', 'captain america', 'colossus'], statBonus: { durability: 15, power: 10, intelligence: -5 } },
  versatile: { keywords: ['all-rounder', 'versatile', 'adaptable', 'multi', 'avatar'], statBonus: { versatility: 15, intelligence: 5, control: 5 } }
};

const POWER_LEVELS = {
  cosmic: ['galactus', 'thanos', 'darkseid', 'anti-monitor', 'celestial', 'eternity', 'infinity', 'living tribunal'],
  godlike: ['thor', 'zeus', 'odin', 'loki', 'ares', 'superman', 'wonder woman', 'goku', 'vegeta', 'saitama', 'silver surfer', 'phoenix'],
  superhuman: ['hulk', 'spiderman', 'wolverine', 'captain america', 'ironman', 'batman', 'flash', 'green lantern', 'naruto', 'luffy', 'ichigo'],
  enhanced: ['hawkeye', 'black widow', 'robin', 'nightwing', 'daredevil', 'punisher', 'john wick', 'agent 47'],
  normal: ['sherlock', 'gordon freeman', 'rick grimes', 'walter white', 'tony soprano']
};

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

const OFFENSIVE_WORDS = ['fuck', 'shit', 'nazi', 'hitler', 'n1gger', 'f4ggot', 'c0nt', 'whore', 'slut'];

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
  'mythology', 'legend', 'historical figure', 'athlete', 'scientist', 'musician', 'politician', 'actor'
];

const CHARACTER_NAME_ALIASES = {
  spiderman: ['spider-man', 'peter parker'],
  superman: ['clark kent'],
  batman: ['bruce wayne'],
  ironman: ['iron man', 'tony stark'],
  naruto: ['naruto uzumaki'],
  'naruto uzamaki': ['naruto uzumaki'],
  'doctor strange': ['dr strange'],
  'dr strange': ['doctor strange'],
  loid: ['loid forger', 'twilight']
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

module.exports = {
  MIN_INFO_CONFIDENCE,
  SCORE_MIN,
  SCORE_MAX,
  OVR_TIERS,
  RARITY_KEYWORDS,
  CHARACTER_TYPES,
  POWER_LEVELS,
  FRANCHISE_DATABASE,
  OFFENSIVE_WORDS,
  KEYWORD_STOPWORDS,
  CONTEXT_KEYWORD_GROUPS,
  INTENT_KEYWORD_GROUPS,
  CAPABILITY_TRAIT_KEYWORDS,
  INTENT_TO_TRAITS,
  TWIST_EFFECT_RULES,
  WIKI_SEARCH_HINTS,
  CHARACTER_NAME_ALIASES,
  CHARACTER_ABILITY_HINTS,
  TITLE_KEYWORDS,
  ROLE_KEYWORDS,
  TYPE_INTENT_AFFINITY,
  DOMAIN_RULES
};
