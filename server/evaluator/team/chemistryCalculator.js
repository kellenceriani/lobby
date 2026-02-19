// Chemistry Bonus: Advanced Synergy Engine - NO DATABASE LOOKUPS

const CHEMISTRY_MIN = 0;
const CHEMISTRY_MAX = 25; // Increased from 15 for deeper synergies
const CHEMISTRY_BASE = 5;

// Relationship Database - Known Allies, Rivals, and Enemies
const RELATIONSHIPS = {
  allies: [
    { names: ['batman', 'robin', 'nightwing', 'batgirl', 'alfred'], bonus: 4, label: 'Bat-Family Alliance' },
    { names: ['iron man', 'captain america', 'thor', 'hulk', 'black widow', 'hawkeye'], bonus: 4, label: 'Original Avengers' },
    { names: ['harry potter', 'hermione', 'ron weasley'], bonus: 5, label: 'Golden Trio' },
    { names: ['frodo', 'sam', 'merry', 'pippin'], bonus: 4, label: 'Hobbit Fellowship' },
    { names: ['luke skywalker', 'han solo', 'princess leia', 'chewbacca'], bonus: 4, label: 'Rebel Alliance Core' },
    { names: ['gandalf', 'aragorn', 'legolas', 'gimli'], bonus: 4, label: 'Fellowship Warriors' },
    { names: ['naruto', 'sasuke', 'sakura', 'kakashi'], bonus: 4, label: 'Team 7' },
    { names: ['luffy', 'zoro', 'sanji', 'nami'], bonus: 4, label: 'Straw Hat Pirates Core' },
    { names: ['goku', 'vegeta', 'gohan', 'piccolo'], bonus: 4, label: 'Z-Fighters' },
    { names: ['sherlock', 'watson', 'john watson'], bonus: 5, label: 'Legendary Detectives' },
    { names: ['mario', 'luigi', 'princess peach', 'yoshi'], bonus: 4, label: 'Mushroom Kingdom Heroes' },
    { names: ['link', 'zelda'], bonus: 5, label: 'Eternal Champions' },
    { names: ['rick', 'morty'], bonus: 4, label: 'Interdimensional Duo' },
    { names: ['walter white', 'jesse pinkman'], bonus: 4, label: 'Cooking Partners' },
    { names: ['jon snow', 'daenerys', 'tyrion'], bonus: 3, label: 'Westeros Leaders' },
    { names: ['elsa', 'anna'], bonus: 5, label: 'Sisterly Bond' }
  ],
  rivals: [
    { names: ['batman', 'superman'], bonus: 2, label: 'Friendly Rivalry' },
    { names: ['goku', 'vegeta'], bonus: 3, label: 'Saiyan Rivalry' },
    { names: ['naruto', 'sasuke'], bonus: 3, label: 'Eternal Rivals' },
    { names: ['sonic', 'shadow'], bonus: 2, label: 'Speed Rivals' },
    { names: ['mario', 'sonic'], bonus: 2, label: 'Gaming Icons Rivalry' },
    { names: ['iron man', 'captain america'], bonus: 2, label: 'Civil Rivalry' }
  ],
  enemies: [
    { names: ['batman', 'joker'], penalty: -3, label: 'Arch-Nemesis: Dark Knight vs Clown' },
    { names: ['superman', 'lex luthor'], penalty: -3, label: 'Arch-Nemesis: Man of Steel vs Genius' },
    { names: ['spider-man', 'green goblin', 'venom'], penalty: -2, label: 'Spider-Foes' },
    { names: ['harry potter', 'voldemort'], penalty: -4, label: 'The Boy Who Lived vs Dark Lord' },
    { names: ['luke skywalker', 'darth vader'], penalty: -2, label: 'Father-Son Conflict' },
    { names: ['gandalf', 'saruman'], penalty: -3, label: 'Wizard War' },
    { names: ['frodo', 'sauron'], penalty: -3, label: 'Ring Bearer vs Dark Lord' },
    { names: ['goku', 'frieza'], penalty: -3, label: 'Saiyan vs Tyrant' },
    { names: ['naruto', 'orochimaru'], penalty: -2, label: 'Hidden Leaf vs Serpent' },
    { names: ['iron man', 'thanos'], penalty: -3, label: 'Avenger vs Mad Titan' },
    { names: ['thor', 'loki'], penalty: -1, label: 'Brother Rivalry' }
  ]
};

const FEATURE_RULES = [
  { key: 'superhero', label: 'Superhero theme', bonus: 4, min: 3, regex: /hero|superman|batman|spider|captain|iron|thor|flash|wonder|avenger|x[-\s]?men|justice league/i },
  { key: 'historical', label: 'Historical figures', bonus: 3, min: 3, regex: /einstein|leonardo|marie|abraham|george|thomas|washington|jefferson|lincoln|cleopatra|caesar|napoleon|gandhi|churchill/i },
  { key: 'magic', label: 'Magic affinity', bonus: 3, min: 2, regex: /wizard|mage|sorcerer|witch|spell|dragon|arcane|necromancer|warlock|paladin|druid|shaman/i },
  { key: 'tech', label: 'Tech affinity', bonus: 3, min: 2, regex: /robot|android|cyborg|ai|mech|engineer|inventor|hacker|pilot|astronaut|iron man|vision|ultron/i },
  { key: 'stealth', label: 'Stealth crew', bonus: 3, min: 2, regex: /ninja|assassin|spy|thief|rogue|shadow|agent|infiltrator|batman|black widow/i },
  { key: 'brawl', label: 'Brawler squad', bonus: 3, min: 2, regex: /fighter|warrior|soldier|knight|boxer|samurai|viking|gladiator|hulk|kratos|doomguy/i },
  { key: 'animals', label: 'Animal affinity', bonus: 3, min: 2, regex: /wolf|dragon|beast|horse|lion|tiger|hawk|bear|rider|tamer|trainer|ranger|tarzan|aquaman/i },
  { key: 'space', label: 'Space crew', bonus: 3, min: 2, regex: /space|galaxy|planet|alien|starship|astronaut|cosmic|star-lord|guardians|enterprise/i },
  { key: 'leadership', label: 'Natural leaders', bonus: 3, min: 3, regex: /captain|commander|general|king|queen|president|chief|director|leader|lord/i },
  { key: 'speedsters', label: 'Speed force', bonus: 4, min: 2, regex: /flash|quicksilver|sonic|dash|zoom|speedster/i },
  { key: 'titans', label: 'Titans/Giants', bonus: 3, min: 2, regex: /titan|giant|colossus|hulk|groot|godzilla|kong/i },
  { key: 'detectives', label: 'Master detectives', bonus: 3, min: 2, regex: /detective|sherlock|batman|commissioner|inspector|sleuth|poirot/i },
  { key: 'gods', label: 'Divine pantheon', bonus: 4, min: 2, regex: /god|zeus|thor|odin|athena|ares|poseidon|hades|anubis|ra/i }
];

const GOOD_KEYWORDS = [
  'hero', 'guardian', 'paladin', 'saint', 'angel', 'protector', 'savior', 'nurse', 'teacher', 'mentor',
  'doctor', 'dr ', 'medic', 'rescue', 'firefighter', 'knight', 'captain', 'leader', 'king', 'queen',
  'superman', 'spiderman', 'batman', 'wonder woman', 'goku', 'link', 'zelda', 'finn'
];

const EVIL_KEYWORDS = [
  'villain', 'evil', 'killer', 'assassin', 'thief', 'pirate', 'demon', 'vampire', 'necromancer', 'warlock',
  'overlord', 'tyrant', 'hitman', 'bandit', 'thanos', 'bowser', 'joker', 'vader', 'sauron', 'voldemort'
];

const ROLE_KEYWORDS = {
  brains: ['scientist', 'engineer', 'inventor', 'professor', 'genius', 'doctor'],
  brawn: ['warrior', 'soldier', 'knight', 'giant', 'strong', 'hulk', 'boxer', 'gladiator'],
  support: ['healer', 'medic', 'nurse', 'teacher', 'mentor', 'guide', 'cleric']
};

// Era/Time Period Synergy
const ERA_CLASSIFICATION = {
  ancient: { keywords: ['zeus', 'thor', 'odin', 'hercules', 'achilles', 'caesar', 'cleopatra', 'pharaoh', 'gladiator', 'sparta'], label: 'Ancient Era' },
  medieval: { keywords: ['knight', 'king', 'queen', 'castle', 'dragon', 'wizard', 'merlin', 'arthur', 'excalibur', 'crusader'], label: 'Medieval Era' },
  industrial: { keywords: ['sherlock', 'watson', 'edison', 'tesla', 'steampunk', 'victorian'], label: 'Industrial Era' },
  modern: { keywords: ['iron man', 'batman', 'captain america', 'james bond', 'john wick', 'jason bourne'], label: 'Modern Era' },
  future: { keywords: ['cyborg', 'android', 'robot', 'ai', 'space', 'star', 'galaxy', 'cyberpunk', 'terminator'], label: 'Future/Sci-Fi' },
  timeless: { keywords: ['immortal', 'eternal', 'god', 'deity', 'angel', 'demon', 'vampire', 'spirit'], label: 'Timeless Beings' }
};

// Narrative Arc Bonuses
const NARRATIVE_ARCS = {
  heroJourney: { keywords: ['luke', 'frodo', 'harry', 'aang', 'naruto', 'goku'], min: 2, bonus: 3, label: "Hero's Journey" },
  redemption: { keywords: ['vader', 'zuko', 'loki', 'snape', 'vegeta', 'kylo'], min: 2, bonus: 3, label: 'Redemption Arc' },
  fallen: { keywords: ['anakin', 'harvey dent', 'magneto', 'thanos'], min: 2, bonus: 2, label: 'Fallen Heroes' },
  mentorship: { keywords: ['yoda', 'gandalf', 'dumbledore', 'obi-wan', 'iroh', 'kakashi'], min: 2, bonus: 3, label: 'Wise Mentors' },
  chosen: { keywords: ['neo', 'harry', 'anakin', 'luke', 'jesus', 'avatar'], min: 2, bonus: 3, label: 'Chosen Ones' }
};

// Power Balance Analysis
const POWER_TIERS = {
  cosmic: ['galactus', 'thanos', 'darkseid', 'eternity', 'living tribunal', 'one above all'],
  godlike: ['thor', 'zeus', 'odin', 'superman', 'goku', 'saitama', 'dr manhattan'],
  superhuman: ['hulk', 'wonder woman', 'flash', 'vegeta', 'naruto'],
  enhanced: ['captain america', 'batman', 'black widow', 'iron man'],
  normal: ['sherlock', 'james bond', 'john wick', 'walter white']
};

const PROSTHETIC_KEYWORDS = ['cyborg', 'android', 'bionic', 'prosthetic', 'mech', 'robot', 'arm', 'hook', 'peg'];
const ANIMAL_BOND_NAMES = ['hiccup', 'daenerys', 'sansa', 'arya'];

const FRANCHISE_LIST = [
  // Expanded with subcategories
  { name: 'Marvel Cinematic Universe', keywords: ['iron man', 'captain america', 'thor', 'hulk', 'black widow', 'hawkeye', 'spider-man', 'doctor strange', 'black panther', 'ant-man', 'wasp', 'scarlet witch', 'vision', 'falcon', 'winter soldier', 'thanos', 'loki', 'nick fury', 'groot', 'rocket', 'star-lord', 'gamora', 'drax'], bonus: 3 },
  { name: 'X-Men Universe', keywords: ['wolverine', 'cyclops', 'storm', 'jean grey', 'professor x', 'magneto', 'rogue', 'gambit', 'beast', 'nightcrawler', 'deadpool'], bonus: 3 },
  { name: 'DC Universe', keywords: ['superman', 'batman', 'wonder woman', 'flash', 'green lantern', 'aquaman', 'cyborg', 'robin', 'nightwing', 'batgirl', 'joker', 'harley quinn', 'lex luthor', 'darkseid', 'deathstroke'], bonus: 3 },
  { name: 'Star Wars', keywords: ['luke skywalker', 'darth vader', 'han solo', 'princess leia', 'leia', 'obi-wan', 'yoda', 'anakin', 'qui-gon', 'mace windu', 'rey', 'kylo ren', 'finn', 'poe', 'chewbacca', 'r2-d2', 'c-3po', 'boba fett', 'jango fett', 'darth maul', 'count dooku', 'palpatine'], bonus: 3 },
  { name: 'Harry Potter', keywords: ['harry potter', 'hermione', 'ron weasley', 'dumbledore', 'voldemort', 'snape', 'hagrid', 'mcgonagall', 'sirius', 'lupin', 'draco', 'neville', 'luna', 'ginny', 'fred', 'george'], bonus: 3 },
  { name: 'Lord of the Rings', keywords: ['frodo', 'gandalf', 'aragorn', 'legolas', 'gimli', 'boromir', 'sam', 'merry', 'pippin', 'sauron', 'saruman', 'gollum', 'elrond', 'galadriel'], bonus: 3 },
  { name: 'Dragon Ball', keywords: ['goku', 'vegeta', 'gohan', 'piccolo', 'krillin', 'trunks', 'goten', 'frieza', 'cell', 'buu', 'beerus', 'whis', 'broly'], bonus: 3 },
  { name: 'Naruto', keywords: ['naruto', 'sasuke', 'sakura', 'kakashi', 'itachi', 'gaara', 'hinata', 'rock lee', 'neji', 'shikamaru', 'orochimaru', 'jiraiya', 'tsunade', 'madara', 'obito'], bonus: 3 },
  { name: 'One Piece', keywords: ['luffy', 'zoro', 'sanji', 'nami', 'usopp', 'chopper', 'robin', 'franky', 'brook', 'jinbe', 'ace', 'shanks', 'whitebeard', 'blackbeard'], bonus: 3 },
  { name: 'Pokemon', keywords: ['pikachu', 'charizard', 'mewtwo', 'ash', 'misty', 'brock', 'team rocket', 'gary', 'professor oak'], bonus: 2 },
  { name: 'The Legend of Zelda', keywords: ['link', 'zelda', 'ganondorf', 'ganon', 'epona', 'navi', 'midna', 'fi'], bonus: 3 },
  { name: 'Game of Thrones', keywords: ['jon snow', 'daenerys', 'tyrion', 'arya', 'sansa', 'cersei', 'jaime', 'ned stark', 'robb', 'theon', 'bran', 'hodor', 'night king'], bonus: 3 },
  { name: 'Breaking Bad', keywords: ['walter white', 'jesse pinkman', 'saul goodman', 'hank', 'skyler', 'gus fring', 'mike'], bonus: 3 },
  { name: 'Disney Classics', keywords: ['mickey mouse', 'donald duck', 'goofy', 'simba', 'aladdin', 'jasmine', 'belle', 'beast', 'ariel', 'mulan', 'moana', 'maui'], bonus: 2 },
  { name: 'Frozen', keywords: ['elsa', 'anna', 'kristoff', 'olaf', 'sven'], bonus: 3 },
  { name: 'Avatar: The Last Airbender', keywords: ['aang', 'katara', 'sokka', 'toph', 'zuko', 'iroh', 'azula'], bonus: 3 },
  { name: 'Sonic Universe', keywords: ['sonic', 'tails', 'knuckles', 'shadow', 'amy', 'eggman', 'robotnik'], bonus: 2 },
  { name: 'Super Mario', keywords: ['mario', 'luigi', 'peach', 'bowser', 'yoshi', 'toad', 'wario', 'waluigi'], bonus: 2 },
  { name: 'Final Fantasy', keywords: ['cloud', 'sephiroth', 'tifa', 'aerith', 'squall', 'rinoa', 'tidus', 'yuna'], bonus: 2 },
  { name: 'Street Fighter', keywords: ['ryu', 'ken', 'chun-li', 'guile', 'zangief', 'dhalsim', 'blanka', 'vega', 'bison'], bonus: 2 },
  { name: 'Mortal Kombat', keywords: ['scorpion', 'sub-zero', 'liu kang', 'raiden', 'sonya', 'johnny cage', 'kitana', 'mileena'], bonus: 2 },
  { name: 'The Matrix', keywords: ['neo', 'morpheus', 'trinity', 'agent smith', 'oracle'], bonus: 3 },
  { name: 'Transformers', keywords: ['optimus prime', 'bumblebee', 'megatron', 'starscream'], bonus: 2 },
  { name: 'Teenage Mutant Ninja Turtles', keywords: ['leonardo', 'raphael', 'donatello', 'michelangelo', 'splinter', 'shredder'], bonus: 3 },
  { name: 'Rick and Morty', keywords: ['rick', 'morty', 'summer', 'beth', 'jerry'], bonus: 3 },
  { name: 'The Witcher', keywords: ['geralt', 'ciri', 'yennefer', 'triss', 'dandelion'], bonus: 3 }
];

function extractMatches(characterNames, predicate) {
  return characterNames.filter(name => predicate(name.toLowerCase()));
}

function normalizeRosterName(name) {
  return String(name || '').trim().toLowerCase();
}

function calculateSetOverlapRatio(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  setA.forEach(item => {
    if (setB.has(item)) intersection += 1;
  });
  return intersection / Math.min(setA.size, setB.size);
}

function getOverlapFactor(overlapRatio) {
  if (overlapRatio >= 0.8) return 0.35;
  if (overlapRatio >= 0.6) return 0.55;
  if (overlapRatio >= 0.4) return 0.75;
  return 1;
}

function addDetail(details, label, bonus, matches, overlapTracker = null) {
  if (!matches || matches.length === 0) return 0;

  let adjustedBonus = bonus;
  const normalizedMatches = matches.map(normalizeRosterName);

  if (overlapTracker && bonus > 0) {
    const currentSet = new Set(normalizedMatches);
    const maxOverlap = overlapTracker.positiveSets.reduce((highest, previousSet) => {
      return Math.max(highest, calculateSetOverlapRatio(currentSet, previousSet));
    }, 0);

    const overlapFactor = getOverlapFactor(maxOverlap);
    adjustedBonus = Math.round((bonus * overlapFactor) * 10) / 10;

    if (adjustedBonus < 1) {
      return 0;
    }

    overlapTracker.positiveSets.push(currentSet);
    if (overlapFactor < 1) {
      label = `${label} (overlap-adjusted)`;
    }
  }

  details.push({ label, bonus: adjustedBonus, matches });
  return adjustedBonus;
}

function matchByKeywords(names, keywords) {
  return names.filter(name => keywords.some(kw => name.includes(kw)));
}

function calculateChemistryDetails(characterNames) {
  const normalized = characterNames.map(name => name.toLowerCase());
  const details = [];
  let bonus = CHEMISTRY_BASE;
  const overlapTracker = { positiveSets: [] };

  // ===== PHASE 1: RELATIONSHIP DETECTION =====
  // Check for known allies
  RELATIONSHIPS.allies.forEach(({ names, bonus: allyBonus, label }) => {
    const foundMembers = characterNames.filter(char => 
      names.some(allyName => char.toLowerCase().includes(allyName))
    );
    if (foundMembers.length >= 2) {
      bonus += addDetail(details, label, allyBonus, foundMembers, overlapTracker);
    }
  });

  // Check for rivals (positive chemistry)
  RELATIONSHIPS.rivals.forEach(({ names, bonus: rivalBonus, label }) => {
    const foundRivals = characterNames.filter(char => 
      names.some(rivalName => char.toLowerCase().includes(rivalName))
    );
    if (foundRivals.length >= 2) {
      bonus += addDetail(details, label, rivalBonus, foundRivals, overlapTracker);
    }
  });

  // Check for enemies (negative chemistry)
  RELATIONSHIPS.enemies.forEach(({ names, penalty, label }) => {
    const foundEnemies = characterNames.filter(char => 
      names.some(enemyName => char.toLowerCase().includes(enemyName))
    );
    if (foundEnemies.length >= 2) {
      bonus += addDetail(details, `⚠️ ${label}`, penalty, foundEnemies);
    }
  });

  // ===== PHASE 2: THEMATIC FEATURE RULES =====
  FEATURE_RULES.forEach(rule => {
    const matches = characterNames.filter(name => rule.regex.test(name));
    if (matches.length >= rule.min) {
      bonus += addDetail(details, rule.label, rule.bonus, matches, overlapTracker);
    }
  });

  // ===== PHASE 3: FRANCHISE SYNERGY (ENHANCED) =====
  FRANCHISE_LIST.forEach(({ name, keywords, bonus: franchiseBonus }) => {
    const franchiseMatches = characterNames.filter(char => 
      keywords.some(kw => char.toLowerCase().includes(kw))
    );
    if (franchiseMatches.length >= 2) {
      // Scale bonus with team size
      const scaledBonus = franchiseMatches.length >= 4 ? franchiseBonus + 1 : franchiseBonus;
      bonus += addDetail(details, `${name} Universe`, scaledBonus, franchiseMatches, overlapTracker);
    }
  });

  // ===== PHASE 4: ALIGNMENT SYNERGY =====
  const goodMatches = matchByKeywords(normalized, GOOD_KEYWORDS);
  if (goodMatches.length >= 2) {
    bonus += addDetail(
      details,
      'Good-aligned synergy',
      goodMatches.length >= 3 ? 3 : 2,
      characterNames.filter(name => goodMatches.includes(name.toLowerCase())),
      overlapTracker
    );
  }

  const evilMatches = matchByKeywords(normalized, EVIL_KEYWORDS);
  if (evilMatches.length >= 2) {
    bonus += addDetail(
      details,
      'Villain synergy',
      evilMatches.length >= 3 ? 3 : 2,
      characterNames.filter(name => evilMatches.includes(name.toLowerCase())),
      overlapTracker
    );
  }

  // Penalty for mixed alignment
  if (goodMatches.length >= 2 && evilMatches.length >= 2) {
    bonus += addDetail(details, '⚠️ Polarized roster (mixed morals)', -2, characterNames);
  }

  // ===== PHASE 5: ROLE DISTRIBUTION =====
  const brainMatches = matchByKeywords(normalized, ROLE_KEYWORDS.brains);
  const brawnMatches = matchByKeywords(normalized, ROLE_KEYWORDS.brawn);
  const supportMatches = matchByKeywords(normalized, ROLE_KEYWORDS.support);
  if (brainMatches.length >= 1 && brawnMatches.length >= 1 && supportMatches.length >= 1) {
    const comboMatches = characterNames.filter(name => {
      const lower = name.toLowerCase();
      return ROLE_KEYWORDS.brains.some(kw => lower.includes(kw)) ||
        ROLE_KEYWORDS.brawn.some(kw => lower.includes(kw)) ||
        ROLE_KEYWORDS.support.some(kw => lower.includes(kw));
    });
    bonus += addDetail(details, 'Balanced roles (brains + brawn + support)', 4, comboMatches, overlapTracker);
  }

  // ===== PHASE 6: ERA/TIME PERIOD SYNERGY =====
  Object.entries(ERA_CLASSIFICATION).forEach(([era, { keywords, label }]) => {
    const eraMatches = characterNames.filter(char => 
      keywords.some(kw => char.toLowerCase().includes(kw))
    );
    if (eraMatches.length >= 3) {
      bonus += addDetail(details, `${label} Cohesion`, 3, eraMatches, overlapTracker);
    }
  });

  // ===== PHASE 7: NARRATIVE ARC BONUSES =====
  Object.values(NARRATIVE_ARCS).forEach(({ keywords, min, bonus: arcBonus, label }) => {
    const arcMatches = characterNames.filter(char => 
      keywords.some(kw => char.toLowerCase().includes(kw))
    );
    if (arcMatches.length >= min) {
      bonus += addDetail(details, label, arcBonus, arcMatches, overlapTracker);
    }
  });

  // ===== PHASE 8: POWER BALANCE ANALYSIS =====
  const powerDistribution = {};
  Object.entries(POWER_TIERS).forEach(([tier, characters]) => {
    powerDistribution[tier] = characterNames.filter(char => 
      characters.some(powerful => char.toLowerCase().includes(powerful))
    );
  });

  // Bonus for power diversity
  const tierCount = Object.values(powerDistribution).filter(arr => arr.length > 0).length;
  if (tierCount >= 3) {
    bonus += addDetail(details, 'Power tier diversity', 2, characterNames, overlapTracker);
  }

  // Penalty for extreme power imbalance
  if (powerDistribution.cosmic && powerDistribution.cosmic.length >= 1 && 
      powerDistribution.normal && powerDistribution.normal.length >= 2) {
    bonus += addDetail(details, '⚠️ Extreme power imbalance (gods + mortals)', -2, 
      [...powerDistribution.cosmic, ...powerDistribution.normal]);
  }

  // ===== PHASE 9: SPECIAL COMBINATIONS =====
  const riderMatches = extractMatches(characterNames, name => /rider|tamer|trainer|ranger/i.test(name));
  const beastMatches = extractMatches(characterNames, name => /dragon|wolf|beast|horse|lion|tiger|hawk|bear/i.test(name));
  if (riderMatches.length >= 1 && beastMatches.length >= 1) {
    bonus += addDetail(details, 'Rider/animal bond', 3, [...new Set([...riderMatches, ...beastMatches])], overlapTracker);
  }

  const prostheticMatches = extractMatches(characterNames, name => PROSTHETIC_KEYWORDS.some(kw => name.includes(kw)));
  if (prostheticMatches.length >= 2) {
    bonus += addDetail(details, 'Shared prosthetic/augments', 2, prostheticMatches, overlapTracker);
  }

  const animalBondMatches = extractMatches(characterNames, name => ANIMAL_BOND_NAMES.some(kw => name.includes(kw)));
  if (animalBondMatches.length >= 2) {
    bonus += addDetail(details, 'Known animal-bond heroes', 2, animalBondMatches, overlapTracker);
  }

  // ===== PHASE 10: SURNAME/IDENTITY PATTERNS =====
  const surnameCounts = {};
  characterNames.forEach(name => {
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) return;
    const surname = parts[parts.length - 1].toLowerCase();
    surnameCounts[surname] = (surnameCounts[surname] || 0) + 1;
  });
  Object.entries(surnameCounts).forEach(([surname, count]) => {
    if (count >= 2) {
      const matched = characterNames.filter(name => name.toLowerCase().endsWith(` ${surname}`));
      bonus += addDetail(details, 'Shared surname/family', 2, matched, overlapTracker);
    }
  });

  // ===== PHASE 11: PENALTIES =====
  const allSingle = characterNames.every(name => name.split(/\s+/).length === 1);
  if (allSingle) {
    bonus += addDetail(details, '⚠️ All single-word names (low effort)', -2, characterNames);
  }

  // Duplicate detection (should be prevented but just in case)
  const uniqueNames = new Set(normalized);
  if (uniqueNames.size < characterNames.length) {
    bonus += addDetail(details, '⚠️ Contains duplicates', -5, characterNames);
  }

  // ===== FINAL CALCULATION =====
  const finalBonus = Math.max(CHEMISTRY_MIN, Math.min(CHEMISTRY_MAX, Math.round(bonus * 10) / 10));
  return { bonus: finalBonus, details };
}

function calculateChemistryBonus(characterNames) {
  return calculateChemistryDetails(characterNames).bonus;
}

module.exports = { calculateChemistryBonus, calculateChemistryDetails };
