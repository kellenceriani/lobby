const FALLBACK_WORDS = [
  'Batman', 'Oprah', 'SpongeBob', 'Sherlock Holmes', 'Dwayne Johnson',
  'Einstein', 'Shakespeare', 'Gandalf', 'Darth Vader', 'Hermione Granger'
];

let wordCache = [];

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

function generateTwists(difficulty = 'normal', count = 4) {
  const easyTwists = TWIST_TEMPLATES.easy;
  const normalTwists = TWIST_TEMPLATES.normal;
  const hardTwists = TWIST_TEMPLATES.hard;

  let pool = [];
  if (difficulty === 'easy') {
    pool = [...easyTwists, ...normalTwists.slice(0, 3)];
  } else if (difficulty === 'hard') {
    pool = [...normalTwists, ...hardTwists];
  } else {
    pool = [...easyTwists.slice(0, 2), ...normalTwists, ...hardTwists.slice(0, 2)];
  }

  const shuffled = pool.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function generateScenarios(count = 3, theme = 'all', difficulty = 'normal') {
  const scenarios = [];
  for (let i = 0; i < count; i++) {
    const { scenario } = generateScenario(theme);
    const twists = generateTwists(difficulty, 4);
    scenarios.push({ scenario, twists, category: theme });
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

function generateFinalPrompt() {
  const template = FINAL_PROMPT_TEMPLATES[Math.floor(Math.random() * FINAL_PROMPT_TEMPLATES.length)];
  const teamType = TEAM_TYPES[Math.floor(Math.random() * TEAM_TYPES.length)];
  const prompt = template.replace('{TEAM_TYPE}', teamType);
  return `Now which drafted team has made the best..... ${prompt}!!??!!`;
}

const rooms = {};
const voteTimeouts = {};

function createRoom(roomCode) {
  return {
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
}

function createGameInstance(roomCode, players, settings) {
  const theme = settings.scenarioTheme || 'all';
  const difficulty = settings.difficulty || 'normal';
  const scenarios = generateScenarios(3, theme, difficulty);

  if (settings.customScenario && settings.customScenario.trim()) {
    const customIndex = Math.floor(Math.random() * scenarios.length);
    scenarios[customIndex] = {
      scenario: settings.customScenario.trim().toUpperCase(),
      twists: generateTwists(difficulty, 4),
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
    allCharactersDrafted: []
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

  const points = {};
  const bonuses = {};
  const pointBreakdown = {};

  game.players.forEach(p => {
    points[p.name] = 0;
    pointBreakdown[p.name] = [];

    if (p.team.length === 2) {
      const hasAutoFilled = p.teamAutoFilled.some(filled => filled === true);
      if (!hasAutoFilled) {
        points[p.name] += 30;
        pointBreakdown[p.name].push('Full Team (2 chars): +30');
      } else {
        pointBreakdown[p.name].push('Full Team (contains auto-filled): No bonus (had duplicate or empty)');
      }
    }
  });

  const isTie = sortedVotes.length > 1 && sortedVotes[0][1] === sortedVotes[1][1] && sortedVotes[0][1] > 0;

  if (!isTie && sortedVotes.length > 0 && sortedVotes[0][1] > 0) {
    const winner = sortedVotes[0][0];
    const votesReceived = sortedVotes[0][1];

    const winBonus = 50 + (totalPlayers * 5);
    points[winner] += winBonus;
    pointBreakdown[winner].push(`Most Votes (${votesReceived}): +${winBonus}`);

    if (sortedVotes.length > 1 && sortedVotes[1][1] > 0) {
      const runnerUpBonus = 20;
      points[sortedVotes[1][0]] += runnerUpBonus;
      pointBreakdown[sortedVotes[1][0]].push(`Runner-Up: +${runnerUpBonus}`);
    }
  } else if (isTie) {
    const tieBonus = 35 + (totalPlayers * 3);
    const tiedPlayers = sortedVotes.filter(v => v[1] === sortedVotes[0][1]);

    tiedPlayers.forEach(([playerName]) => {
      points[playerName] += tieBonus;
      pointBreakdown[playerName].push(`Tied for Most Votes: +${tieBonus}`);
    });
  }

  const votingPlayers = new Set(Object.keys(game.votes));
  game.players.forEach(p => {
    if (!votingPlayers.has(p.name)) {
      const penalty = 15;
      points[p.name] -= penalty;
      if (!pointBreakdown[p.name]) pointBreakdown[p.name] = [];
      pointBreakdown[p.name].push(`Didn't Vote: -${penalty}`);
    }
  });

  game.players.forEach(p => {
    const earned = Math.max(0, points[p.name]);
    p.roundScores[round] = earned;
    p.totalScore += earned;
  });

  return { points, bonuses, voteCount, pointBreakdown };
}

function calculateFinalRoundBonuses(game) {
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

  const points = {};
  const bonuses = {};
  const pointBreakdown = {};

  game.players.forEach(p => {
    points[p.name] = 0;
    pointBreakdown[p.name] = [];

    if (p.finalTeam.length === 6) {
      const hasAutoFilled = p.teamAutoFilled.some(filled => filled === true);
      if (!hasAutoFilled) {
        points[p.name] += 40;
        pointBreakdown[p.name].push('Complete Team (6 chars): +40');
      } else {
        pointBreakdown[p.name].push('Complete Team (contains auto-filled): No bonus (had duplicate or empty)');
      }
    }
  });

  const isTie = sortedVotes.length > 1 && sortedVotes[0][1] === sortedVotes[1][1] && sortedVotes[0][1] > 0;

  if (!isTie && sortedVotes.length > 0 && sortedVotes[0][1] > 0) {
    const winner = sortedVotes[0][0];
    const votesReceived = sortedVotes[0][1];

    const finalWinBonus = 100 + (totalPlayers * 10);
    points[winner] += finalWinBonus;
    pointBreakdown[winner].push(`Most Votes (${votesReceived}): +${finalWinBonus}`);

    if (sortedVotes.length > 1 && sortedVotes[1][1] > 0) {
      const runnerUpBonus = 40;
      points[sortedVotes[1][0]] += runnerUpBonus;
      pointBreakdown[sortedVotes[1][0]].push(`Runner-Up: +${runnerUpBonus}`);
    }
  } else if (isTie) {
    const finalTieBonus = 75 + (totalPlayers * 8);
    const tiedPlayers = sortedVotes.filter(v => v[1] === sortedVotes[0][1]);

    tiedPlayers.forEach(([playerName]) => {
      points[playerName] += finalTieBonus;
      pointBreakdown[playerName].push(`Tied for Most Votes: +${finalTieBonus}`);
    });
  }

  const votingPlayers = new Set(Object.keys(game.votes));
  game.players.forEach(p => {
    if (!votingPlayers.has(p.name)) {
      const penalty = 25;
      points[p.name] -= penalty;
      if (!pointBreakdown[p.name]) pointBreakdown[p.name] = [];
      pointBreakdown[p.name].push(`Didn't Vote: -${penalty}`);
    }
  });

  game.players.forEach(p => {
    const earned = Math.max(0, points[p.name]);
    p.roundScores[3] = earned;
    p.totalScore += earned;
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

  setTimeout(() => startRound(io, roomCode), 3000);
}

function startRound(io, roomCode) {
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

  setTimeout(() => revealScenario(io, roomCode), 3000);
}

function revealScenario(io, roomCode) {
  const room = rooms[roomCode];
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
}

function revealPlotTwist(io, roomCode) {
  const game = rooms[roomCode].gameState;
  const scenario = game.scenarios[game.currentRound];
  if (!game.settings.plotTwists) {
    game.currentTwist = 'NO PLOT TWIST';
    startVoting(io, roomCode);
    return;
  }

  const twist = scenario.twists[Math.floor(Math.random() * scenario.twists.length)];
  game.currentTwist = twist;

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
    twist: twist,
    scenario: game.currentScenario,
    currentTeams: game.players.map(p => ({
      name: p.name,
      team: p.team
    }))
  });

  setTimeout(() => startVoting(io, roomCode), 3000);
}

function startVoting(io, roomCode) {
  const game = rooms[roomCode].gameState;
  game.activePhase = 'VOTING';
  game.phaseStartTime = Date.now();
  game.votes = {};
  game.voteLocks = {};

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

  const voteTimeout = setTimeout(() => tallyResults(io, roomCode), getVoteSeconds() * 1000);
  voteTimeouts[roomCode] = voteTimeout;
}

function startFinalRound(io, roomCode) {
  const game = rooms[roomCode].gameState;
  game.activePhase = 'PRE_FINAL';
  game.phaseStartTime = Date.now();

  game.players.forEach(p => {
    p.finalTeam = [];
    for (let i = 0; i < 3; i++) {
      if (game.results[i] && game.results[i].playerTeams && game.results[i].playerTeams[p.name]) {
        p.finalTeam.push(...game.results[i].playerTeams[p.name]);
      }
    }
  });

  io.to(roomCode).emit('roundStart', {
    roundNumber: 4,
    totalRounds: 4,
    isFinalRound: true
  });

  setTimeout(() => startFinalVoting(io, roomCode), 3000);
}

function startFinalVoting(io, roomCode) {
  const game = rooms[roomCode].gameState;
  game.activePhase = 'FINAL_VOTING';
  game.phaseStartTime = Date.now();
  game.votes = {};
  game.voteLocks = {};

  const finalPrompt = generateFinalPrompt();
  const finalScenario = game.scenarios[Math.floor(Math.random() * game.scenarios.length)];
  game.currentScenario = finalScenario.scenario;

  const teamsDisplay = game.players.map(p => ({
    name: p.name,
    team: p.finalTeam,
    votes: 0
  }));

  io.to(roomCode).emit('finalVotingPhaseStart', {
    teams: teamsDisplay,
    votingTimeRemaining: getVoteSeconds(),
    totalPlayers: game.players.length,
    scenario: game.currentScenario,
    finalPrompt
  });

  const voteTimeout = setTimeout(() => tallyFinalResults(io, roomCode), getVoteSeconds() * 1000);
  voteTimeouts[roomCode] = voteTimeout;
}

function tallyResults(io, roomCode) {
  const game = rooms[roomCode].gameState;
  const scenario = game.scenarios[game.currentRound];

  if (!game.results[game.currentRound]) {
    game.results[game.currentRound] = {};
  }
  game.results[game.currentRound].playerTeams = {};
  game.players.forEach(p => {
    game.results[game.currentRound].playerTeams[p.name] = [...p.team];
  });

  const { points, bonuses, voteCount, pointBreakdown } = calculateRoundBonuses(game, game.currentRound);

  game.activePhase = 'RESULTS';

  const leaderboardData = [...game.players].sort((a, b) => b.totalScore - a.totalScore).map(p => ({
    name: p.name,
    score: p.totalScore,
    roundScore: points[p.name],
    breakdown: pointBreakdown[p.name]
  }));

  if (!game.results[game.currentRound]) game.results[game.currentRound] = {};
  game.results[game.currentRound].winner = Object.entries(points).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  game.results[game.currentRound].scenario = scenario.scenario;
  game.results[game.currentRound].twist = game.currentTwist;
  game.results[game.currentRound].leaderboard = leaderboardData;

  io.to(roomCode).emit('roundResults', {
    winner: game.results[game.currentRound].winner,
    roundPoints: points,
    voteCount,
    leaderboard: leaderboardData,
    pointBreakdown,
    round: game.currentRound + 1
  });

  game.players.forEach(p => p.voteLocked = false);
  game.resultsReady = {};
}

function tallyFinalResults(io, roomCode) {
  const game = rooms[roomCode].gameState;

  const { points, bonuses, voteCount, pointBreakdown } = calculateFinalRoundBonuses(game);

  const leaderboardData = [...game.players].sort((a, b) => b.totalScore - a.totalScore).map(p => ({
    name: p.name,
    score: p.totalScore,
    roundScore: points[p.name],
    breakdown: pointBreakdown[p.name]
  }));

  io.to(roomCode).emit('finalRoundResults', {
    winner: Object.entries(points).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    roundPoints: points,
    voteCount,
    leaderboard: leaderboardData,
    pointBreakdown
  });

  setTimeout(() => endGame(io, roomCode), 3000);
}

function endGame(io, roomCode) {
  const room = rooms[roomCode];
  const game = room.gameState;
  const finalLeaderboard = [...game.players]
    .filter(p => !p.isBot)
    .sort((a, b) => b.totalScore - a.totalScore)
    .map(p => ({
      name: p.name,
      score: p.totalScore,
      breakdown: p.roundScores
    }));

  io.to(roomCode).emit('gameEnded', {
    finalLeaderboard,
    totalRounds: game.totalRounds,
    winner: finalLeaderboard[0]
  });

  room.isGameActive = false;
  setTimeout(() => {
    room.gameState = null;
  }, 10000);
}

module.exports = {
  rooms,
  voteTimeouts,
  initWordCache,
  getRandomWord,
  createRoom,
  startGame,
  startRound,
  revealPlotTwist,
  startFinalRound,
  tallyResults,
  tallyFinalResults,
  endGame
};
