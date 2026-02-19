const FALLBACK_WORDS = [
  'Batman', 'Oprah', 'SpongeBob', 'Sherlock Holmes', 'Dwayne Johnson',
  'Einstein', 'Shakespeare', 'Gandalf', 'Darth Vader', 'Hermione Granger'
];

let wordCache = [];

const { getRoundWeight, scaleRoundPoints } = require('../services/scoreScaling');
const { evaluateRoundFromGame } = require('../services/roundEvaluationService');
const { loadRoomsSnapshot, queueRoomsSnapshot } = require('../storage/statePersistence');

async function fetchRandomWords() {
  try {
    const response = await fetch('https://random-word-api.herokuapp.com/all');
    if (!response.ok) throw new Error('API failed');
    const words = await response.json();
    wordCache = words.slice(0, 200).map(w => w.charAt(0).toUpperCase() + w.slice(1));
    console.log('✓ Loaded', wordCache.length, 'words from API');
  } catch (error) {
    console.warn('⚠️ Word API failed, using fallback pool');
    wordCache = FALLBACK_WORDS;
  }
}

function initWordCache() {
  fetchRandomWords();
  setInterval(fetchRandomWords, 1 * 60 * 60 * 1000);
}

function getRandomWord() {
  if (wordCache.length === 0) {
    return FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
  }
  return wordCache[Math.floor(Math.random() * wordCache.length)];
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
    ...(TWIST_PREFIX_LIBRARY.easy || []),
    ...(safeDifficulty !== 'easy' ? TWIST_PREFIX_LIBRARY.normal || [] : []),
    ...(safeDifficulty === 'hard' ? TWIST_PREFIX_LIBRARY.hard || [] : [])
  ];

  const chosenDomain = randomFrom(domains);
  const domainPool = TWIST_DOMAIN_LIBRARY[chosenDomain] || [];
  const modifierPool = TWIST_MODIFIER_LIBRARY[safeDifficulty] || [];

  const primary = randomFrom(primaryPool);
  const domainLine = domainPool.length ? randomFrom(domainPool) : '';

  if (safeDifficulty === 'easy') {
    return normalizeScenarioText([primary, domainLine].filter(Boolean).join(' | '));
  }

  const modifier = Math.random() < (safeDifficulty === 'hard' ? 0.75 : 0.45)
    ? randomFrom(modifierPool)
    : '';
  return normalizeScenarioText([primary, domainLine, modifier].filter(Boolean).join(' | '));
}

function generateScenario(theme = 'all') {
  const categories = theme === 'all'
    ? Object.keys(SCENARIO_TEMPLATES)
    : [theme];

  const category = categories[Math.floor(Math.random() * categories.length)];
  const templates = SCENARIO_TEMPLATES[category];
  const template = templates[Math.floor(Math.random() * templates.length)];

  let scenario = template.template;
  template.vars.forEach(varName => {
    const words = WORD_BANKS[varName];
    const word = words[Math.floor(Math.random() * words.length)];
    scenario = scenario.replace(`{${varName}}`, word);
  });

  return { scenario, category };
}

function generateTwists(difficulty = 'normal', count = 4, scenarioText = '') {
  if (difficulty && typeof difficulty === 'object') {
    const options = difficulty;
    return generateTwists(
      options.difficulty || 'normal',
      options.count || 4,
      options.scenarioText || options.scenario || ''
    );
  }

  const safeDifficulty = ['easy', 'normal', 'hard'].includes(difficulty) ? difficulty : 'normal';
  const targetCount = Math.max(1, Math.min(12, Number(count) || 4));
  const easyTwists = TWIST_TEMPLATES.easy;
  const normalTwists = TWIST_TEMPLATES.normal;
  const hardTwists = TWIST_TEMPLATES.hard;

  let pool = [];
  if (safeDifficulty === 'easy') {
    pool = [...easyTwists, ...normalTwists.slice(0, 3)];
  } else if (safeDifficulty === 'hard') {
    pool = [...normalTwists, ...hardTwists];
  } else {
    pool = [...easyTwists.slice(0, 2), ...normalTwists, ...hardTwists.slice(0, 2)];
  }

  const dynamicPool = [];
  for (let i = 0; i < (targetCount * 3); i++) {
    dynamicPool.push(composeDynamicTwist({
      difficulty: safeDifficulty,
      scenarioText
    }));
  }

  const merged = Array.from(new Set([...pool, ...dynamicPool]));
  return shufflePool(merged).slice(0, targetCount);
}

function generateScenarios(count = 3, theme = 'all', difficulty = 'normal') {
  const scenarios = [];
  for (let i = 0; i < count; i++) {
    const generated = generateScenario(theme);
    const scenario = generated.scenario;
    const twists = generateTwists(difficulty, 6, scenario);
    scenarios.push({ scenario, twists, category: generated.category });
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

function generateFinalScenario(difficulty = 'normal') {
  const patternWeights = difficulty === 'hard'
    ? FINAL_SCENARIO_PATTERNS
    : difficulty === 'easy'
      ? FINAL_SCENARIO_PATTERNS.slice(0, 6)
      : FINAL_SCENARIO_PATTERNS.slice(0, 7);

  const chosenPattern = randomFrom(patternWeights);
  const values = {};
  Object.entries(FINAL_SCENARIO_COMPONENTS).forEach(([key, pool]) => {
    values[key] = randomFrom(pool);
  });

  if (difficulty === 'easy') {
    values.COMPLICATION = randomFrom(FINAL_SCENARIO_COMPONENTS.COMPLICATION.slice(0, 8));
    values.OPPOSITION = randomFrom(FINAL_SCENARIO_COMPONENTS.OPPOSITION.slice(0, 10));
  } else if (difficulty === 'hard') {
    values.DEADLINE = randomFrom(FINAL_SCENARIO_COMPONENTS.DEADLINE.slice(4));
    values.COMPLICATION = randomFrom(FINAL_SCENARIO_COMPONENTS.COMPLICATION.slice(6));
    values.OPPOSITION = randomFrom(FINAL_SCENARIO_COMPONENTS.OPPOSITION.slice(6));
  }

  return normalizeScenarioText(fillTemplate(chosenPattern, values));
}

function generateFinalTwist(difficulty = 'normal', scenarioText = '') {
  const domains = inferTwistDomains(scenarioText);
  const prefixPool = difficulty === 'easy'
    ? FINAL_TWIST_COMPONENTS.PREFIX.slice(0, 14)
    : difficulty === 'hard'
      ? FINAL_TWIST_COMPONENTS.PREFIX.slice(10)
      : FINAL_TWIST_COMPONENTS.PREFIX;

  const prefix = randomFrom(prefixPool);
  const domainPool = TWIST_DOMAIN_LIBRARY[randomFrom(domains)] || [];
  const domainConstraint = Math.random() > 0.4 ? randomFrom(domainPool) : '';

  return normalizeScenarioText([prefix, domainConstraint].filter(Boolean).join(' | '));
}

function generateFinalScenarioAndTwist(difficulty = 'normal') {
  const scenario = generateFinalScenario(difficulty);
  return {
    scenario,
    twist: generateFinalTwist(difficulty, scenario)
  };
}

const rooms = {};
const voteTimeouts = {};

Object.assign(rooms, loadRoomsSnapshot());

function markRoomsDirty() {
  queueRoomsSnapshot(rooms);
}

function createRoom(roomCode) {
  const room = {
    roomCode,
    players: [],
    gameState: null,
    isGameActive: false,
    host: null,
    settings: {
      difficulty: 'normal',
      scenarioTheme: 'all',
      plotTwists: true,
      maxPlayers: 6,
      customScenario: ''
    },
    messages: [],
    reactions: {}
  };
  markRoomsDirty();
  return room;
}

function createGameInstance(roomCode, players, settings) {
  const theme = settings.scenarioTheme || 'all';
  const difficulty = settings.difficulty || 'normal';
  const scenarios = generateScenarios(3, theme, difficulty);

  if (settings.customScenario && settings.customScenario.trim()) {
    const customIndex = Math.floor(Math.random() * scenarios.length);
    const customScenario = settings.customScenario.trim().toUpperCase();
    scenarios[customIndex] = {
      scenario: customScenario,
      twists: generateTwists(difficulty, 6, customScenario),
      category: 'custom'
    };
  }

  return {
    id: `game_${Date.now()}_${roomCode}`,
    roomCode,
    players: players.map(p => ({
      id: p.id,
      name: p.name,
      isBot: false,
      team: [],
      teamAutoFilled: [],
      finalTeam: [],
      finalTeamDraftMeta: [],
      votes: 0,
      roundScores: [0, 0, 0, 0],
      totalScore: 0,
      draftLocked: false,
      draftLockTime: null,
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
    settings,
    roundStartTime: null,
    allCharactersDrafted: [],
    roundResolutionLocks: {}
  };
}

function getDraftSeconds(settings) {
  const difficulty = (settings && settings.difficulty) || 'normal';
  if (difficulty === 'easy') return 60;
  if (difficulty === 'hard') return 35;
  return 45;
}

function getVoteSeconds() {
  return 30;
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

    if (p.team.length === 2) {
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
  room.gameState = createGameInstance(roomCode, room.players, room.settings);

  io.to(roomCode).emit('gameStarting', {
    totalRounds: 3,
    players: room.gameState.players.map(p => p.name),
    settings: room.settings
  });

  markRoomsDirty();
  setTimeout(() => startRound(io, roomCode), 3000);
}

function startRound(io, roomCode) {
  if (!rooms[roomCode] || !rooms[roomCode].gameState) return;
  const game = rooms[roomCode].gameState;
  if (!game || game.currentRound >= game.totalRounds) {
    startFinalRound(io, roomCode);
    return;
  }

  game.activePhase = 'PRE_ROUND';
  game.phaseStartTime = Date.now();

  io.to(roomCode).emit('roundStart', {
    roundNumber: game.currentRound + 1,
    totalRounds: game.totalRounds
  });

  markRoomsDirty();
  setTimeout(() => revealScenario(io, roomCode), 3000);
}

function revealScenario(io, roomCode) {
  const room = rooms[roomCode];
  if (!room || !room.gameState) return;
  const game = room.gameState;
  game.activePhase = 'DRAFT';
  game.roundStartTime = Date.now();
  game.draftEntries = {};
  game.votes = {};
  game.voteLocks = {};
  game.players.forEach(p => {
    p.team = [];
    p.teamAutoFilled = [];
    p.draftLocked = false;
    p.draftLockTime = null;
    p.voteLocked = false;
  });

  room.messages = [];

  const scenario = game.scenarios[game.currentRound];
  game.currentScenario = scenario.scenario;

  const draftSeconds = getDraftSeconds(game.settings);

  io.to(roomCode).emit('scenarioRevealed', {
    scenario: scenario.scenario,
    draftTimeRemaining: draftSeconds,
    maxCharactersPerPlayer: 2,
    roundNumber: game.currentRound + 1
  });

  game.draftTimeout = setTimeout(() => revealPlotTwist(io, roomCode), draftSeconds * 1000);
  markRoomsDirty();
}

function revealPlotTwist(io, roomCode) {
  if (!rooms[roomCode] || !rooms[roomCode].gameState) return;
  const game = rooms[roomCode].gameState;
  const scenario = game.scenarios[game.currentRound];
  if (!game.settings.plotTwists) {
    game.currentTwist = 'NO PLOT TWIST';
    startVoting(io, roomCode);
    return;
  }

  const difficulty = game.settings && game.settings.difficulty ? game.settings.difficulty : 'normal';
  const generatedTwists = (Array.isArray(scenario && scenario.twists) && scenario.twists.length)
    ? scenario.twists
    : generateTwists(difficulty, 6, game.currentScenario || (scenario && scenario.scenario) || '');
  game.currentTwist = generatedTwists[Math.floor(Math.random() * generatedTwists.length)] || 'NO RULE BREAKERS';

  game.activePhase = 'TWIST';

  game.players.forEach(p => {
    while (p.team.length < 2) {
      let randomWord = getRandomWord();
      while (game.players.some(other => other.name !== p.name && other.team.some(c => c.toLowerCase() === randomWord.toLowerCase())) ||
             game.allCharactersDrafted.some(c => c.toLowerCase() === randomWord.toLowerCase())) {
        randomWord = getRandomWord();
      }
      p.team.push(randomWord);
      p.teamAutoFilled.push(true);
      game.allCharactersDrafted.push(randomWord);
    }
  });

  io.to(roomCode).emit('plotTwistRevealed', {
    twist: game.currentTwist,
    scenario: game.currentScenario,
    currentTeams: game.players.map(p => ({
      name: p.name,
      team: p.team
    }))
  });

  markRoomsDirty();
  setTimeout(() => startVoting(io, roomCode), 3000);
}

function startVoting(io, roomCode) {
  if (!rooms[roomCode] || !rooms[roomCode].gameState) return;
  const game = rooms[roomCode].gameState;
  game.activePhase = 'VOTING';
  game.phaseStartTime = Date.now();
  game.votes = {};
  game.voteLocks = {};
  game.voteTallyStarted = false;
  game.roundResolutionLocks = game.roundResolutionLocks || {};
  game.roundResolutionLocks[game.currentRound] = false;

  const teamsDisplay = game.players.map(p => ({
    name: p.name,
    team: p.team,
    votes: 0
  }));

  io.to(roomCode).emit('votingPhaseStart', {
    teams: teamsDisplay,
    votingTimeRemaining: getVoteSeconds(),
    scenario: game.currentScenario,
    twist: game.currentTwist,
    totalPlayers: game.players.length,
    roundNumber: game.currentRound + 1
  });

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
  }, getVoteSeconds() * 1000);
  voteTimeouts[roomCode] = voteTimeout;
  markRoomsDirty();
}

function startFinalRound(io, roomCode) {
  console.log(`🏁 Starting Round 4 for room ${roomCode}`);
  if (!rooms[roomCode] || !rooms[roomCode].gameState) return;
  const game = rooms[roomCode].gameState;
  game.activePhase = 'AI_EVALUATION';
  game.phaseStartTime = Date.now();
  game.round4InProgress = false;
  game.round4Applied = false;
  game.round4Results = null;
  game.finalResultsReady = {};
  game.finalResultsEmitted = false;

  // Collect each player's final team (from rounds 1-3)
  game.players.forEach(p => {
    p.finalTeam = [];
    p.finalTeamDraftMeta = [];
    for (let i = 0; i < 3; i++) {
      if (game.results[i] && game.results[i].playerTeams && game.results[i].playerTeams[p.name]) {
        p.finalTeam.push(...game.results[i].playerTeams[p.name]);
      }
      if (game.results[i] && game.results[i].playerTeamDraftMeta && game.results[i].playerTeamDraftMeta[p.name]) {
        p.finalTeamDraftMeta.push(...game.results[i].playerTeamDraftMeta[p.name]);
      }
    }
    console.log(`👤 ${p.name}'s final team (${p.finalTeam.length} chars): ${p.finalTeam.join(', ')}`);
  });

  // Generate a massively expanded, difficulty-scaled final scenario and twist for AI evaluation
  const finalConditions = generateFinalScenarioAndTwist(game.settings && game.settings.difficulty ? game.settings.difficulty : 'normal');
  game.currentScenario = finalConditions.scenario;
  game.currentTwist = finalConditions.twist;

  console.log(`🎯 Scenario: ${game.currentScenario}`);
  console.log(`🔄 Twist: ${game.currentTwist}`);

  io.to(roomCode).emit('roundStart', {
    roundNumber: 4,
    totalRounds: 4,
    isFinalRound: true
  });

  // Create finalTeams object with all players' rosters
  const finalTeams = {};
  game.players.forEach(p => {
    finalTeams[p.name] = p.finalTeam;
  });

  // Emit Round 4 start event with all data needed for AI evaluation
  setTimeout(() => {
    console.log(`📡 Emitting round4Start event to room ${roomCode}`);
    io.to(roomCode).emit('round4Start', {
      scenario: game.currentScenario,
      twist: game.currentTwist,
      finalTeams
    });
  }, 3000);
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

  let roundIntel = null;
  try {
    roundIntel = await evaluateRoundFromGame(game, roundIndex);
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

  game.activePhase = 'RESULTS';

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
    roundIntelSummary: roundIntel
      ? Object.entries(roundIntel.playerEvaluations || {}).reduce((acc, [name, data]) => {
        acc[name] = data && data.summary ? data.summary : null;
        return acc;
      }, {})
      : {}
  });

  game.players.forEach(p => p.voteLocked = false);
  game.resultsReady = {};
  } catch (error) {
    console.error(`❌ Failed to tally round ${roundIndex + 1} in room ${roomCode}:`, error);
  } finally {
    game.roundResolutionLocks[roundIndex] = false;
    markRoomsDirty();
  }
}


function endGame(io, roomCode) {
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
  const winnerTeamData = winner
    && game.round4Results
    && game.round4Results.payload
    && game.round4Results.payload.allTeamEvaluations
    && game.round4Results.payload.allTeamEvaluations[winner.name]
    ? game.round4Results.payload.allTeamEvaluations[winner.name]
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

  const winnerCharacters = winnerEvaluations.map((entry, index) => {
    const draftMeta = winnerDraftMeta.find((meta) =>
      meta
      && meta.character
      && entry.character
      && String(meta.character).toLowerCase() === String(entry.character).toLowerCase()
    ) || null;

    const draftedRound = draftMeta && Number.isFinite(Number(draftMeta.draftedRound))
      ? Number(draftMeta.draftedRound)
      : Math.min(3, Math.floor(index / 2) + 1);
    const pickNumberInRound = draftMeta && Number.isFinite(Number(draftMeta.pickNumberInRound))
      ? Number(draftMeta.pickNumberInRound)
      : ((index % 2) + 1);

    const expectedAtDraft = Math.round(66 + ((4 - draftedRound) * 6) + ((3 - pickNumberInRound) * 3));
    const expectedNearEnd = Math.max(56, expectedAtDraft - 8);
    const currentOVR = Number(entry.ovr) || 0;

    return {
      character: entry.character,
      imageUrl: entry.imageUrl || null,
      infoSource: entry.infoSource || null,
      ovr: currentOVR,
      score: Number(entry.score) || 0,
      rarity: entry.rarity || 'Bronze',
      ovrTierLabel: entry && entry.ovrTier && entry.ovrTier.label ? entry.ovrTier.label : null,
      characterType: entry.characterType || null,
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
      notes: Array.isArray(entry.notes) ? entry.notes.slice(0, 2) : []
    };
  });

  io.to(roomCode).emit('gameEnded', {
    finalLeaderboard,
    totalRounds: game.totalRounds,
    winner,
    winnerCharacters,
    winnerTeamStats
  });

  room.isGameActive = false;
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
