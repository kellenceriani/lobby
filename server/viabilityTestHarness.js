const fs = require('fs');
const path = require('path');

const { fetchCharacterInfo } = require('./evaluator/index');
const { evaluateCharacter, getEvaluationEngineMode } = require('./services/entryEvaluationService');
const { resolveAudioBlurbBatch } = require('./services/audioBlurbResolverService');
const {
  summarizeContextDiagnostics,
  formatScalingDiagnostics,
  formatTitleDiffDiagnostics
} = require('./services/evaluation/diagnostics/telemetry');

const ALIAS_PROBES = [
  { input: 'Bats', expected: 'Batman' },
  { input: 'Supes', expected: 'Superman' },
  { input: 'Spidey', expected: 'Spider-Man' },
  { input: 'The Dark Knight', expected: 'Batman' },
  { input: 'The Boy Who Lived', expected: 'Harry Potter' },
  { input: 'wizard kid with scar', expected: 'Harry Potter' },
  { input: 'pirate king straw hat guy', expected: 'Monkey D. Luffy' },
  { input: 'guy from spy x family', expected: 'Loid Forger' },
  { input: 'Posedion', expected: 'Poseidon' },
  { input: 'Megan Trainer', expected: 'Meghan Trainor' },
  { input: 'Scooby', expected: 'Scooby-Doo' },
  { input: 'Ben10', expected: 'Ben 10' },
  { input: 'Pewdiepie', expected: 'PewDiePie' }
];

const SCENARIOS = [
  { name: 'city-defense', scenario: 'DEFEND A CITY POWER GRID', twist: 'WITH BURST POWER ONLY' },
  { name: 'mystery-heist', scenario: 'STOP A RELIC HEIST', twist: 'WHILE EVIDENCE SELF-DELETES' },
  { name: 'diplomacy', scenario: 'SECURE A PEACE DEAL', twist: 'WITHOUT DIRECT FORCE' },
  { name: 'survival-ocean', scenario: 'SURVIVE IN THE DEEP OCEAN', twist: 'AS FUEL DROPS BELOW 10%' },
  { name: 'first-contact', scenario: 'NEGOTIATE A FIRST-CONTACT SUMMIT', twist: 'WHILE TRANSLATIONS DROP MEANING' },
  { name: 'cyber-crisis', scenario: 'CONTAIN A GLOBAL CYBER PANIC', twist: 'WITH ANALOG BACKUPS ONLY' },
  { name: 'evacuation', scenario: 'EVACUATE A FLOATING CITY', twist: 'WITH ONE EXTRACTION WINDOW LEFT' },
  { name: 'infrastructure', scenario: 'REBUILD AFTER A MEGA WILDFIRE', twist: 'UNDER CONSTANT AFTERSHOCKS' },
  { name: 'space-colony', scenario: 'STABILIZE A SPACE COLONY', twist: 'WHILE COMMS LAG 90 SECONDS' },
  { name: 'medical-breach', scenario: 'CONTAIN A MEDICAL DATA BREACH', twist: 'UNDER LIVE GLOBAL BROADCAST' },
  { name: 'alliance', scenario: 'HOLD A FRACTURING ALLIANCE TOGETHER', twist: 'WHILE ALLIES SPLIT INTO RIVALS' },
  { name: 'drone-swarm', scenario: 'DISMANTLE A DRONE SWARM TAKEOVER', twist: 'AND CRITICAL TARGETS KEEP MOVING' },
  { name: 'timeline', scenario: 'REVERSE A TIME-LOOP DISASTER', twist: 'AS TIME DESYNC CREATES DUPLICATE THREATS' },
  { name: 'arctic-failure', scenario: 'REMEDIATE AN ARCTIC FACILITY FAILURE', twist: 'UNDER INTERMITTENT ZERO VISIBILITY' },
  { name: 'trade-blockade', scenario: 'BREAK A TRADE BLOCKADE', twist: 'WHILE OPPOSITION ADAPTS TO EACH WIN' }
];

const CHARACTER_BUCKETS = {
  mainstreamHeroes: ['Superman', 'Batman', 'Wonder Woman', 'Spider-Man', 'Iron Man', 'Captain America', 'Black Panther', 'Thor', 'Hulk', 'The Flash'],
  firstNamesOnly: ['Bugs', 'Harry', 'Eren', 'Hal', 'Bruce', 'Clark', 'Tony', 'Hermione', 'Luffy', 'Messi'],
  lastNamesOnly: ['Wick', 'Potter', 'Skywalker', 'Messi', 'Wayne', 'Stark', 'Kenobi', 'Holmes', 'Jordan', 'Gosling'],
  abbreviationsNicknames: ['Cap', 'CR7', 'The Rock', 'Mando', 'Bats', 'Supes', 'Spidey', 'TChalla', 'The Dark Knight', 'The Boy Who Lived'],
  proxyReferences: ['guy from spy x family', 'dragon ball luffys son', 'wizard kid with scar', 'dark knight from gotham', 'pirate king straw hat guy', 'girl from hunger games with bow', 'the witcher monster hunter guy', 'the office boss guy', 'green ogre from swamp movie', 'blue alien cat from pandora movie'],
  objects: ['Batarang', 'Mjolnir', 'One Ring', 'Elder Wand', 'Lightsaber', 'Infinity Gauntlet', 'Omnitrix', 'Pokeball', 'Sonic Screwdriver', 'Keyblade'],
  fictionalAnimals: ['Scooby-Doo', 'Pikachu', 'Stitch', 'Rocket Raccoon', 'Toothless', 'Puss in Boots', 'Appa', 'Momo (Avatar)', 'Aslan', 'Falkor'],
  detectivesMinds: ['Sherlock Holmes', 'Hercule Poirot', 'Nancy Drew', 'Benoit Blanc', 'L (Death Note)', 'Jessica Jones', 'Veronica Mars', 'Columbo', 'Detective Conan', 'Batman'],
  animeProtags: ['Naruto Uzumaki', 'Monkey D. Luffy', 'Ichigo Kurosaki', 'Edward Elric', 'Light Yagami', 'Eren Yeager', 'Tanjiro Kamado', 'Saitama', 'Spike Spiegel', 'Sailor Moon'],
  gamingIcons: ['Mario', 'Luigi', 'Link', 'Zelda', 'Master Chief', 'Lara Croft', 'Kratos', 'Sonic the Hedgehog', 'Samus Aran', 'Geralt of Rivia'],
  fantasyLegends: ['Gandalf', 'Aragorn', 'Legolas', 'Frodo Baggins', 'Daenerys Targaryen', 'Jon Snow', 'Yennefer of Vengerberg', 'Ciri', 'Albus Dumbledore', 'Hermione Granger'],
  sciFiIcons: ['Luke Skywalker', 'Leia Organa', 'Han Solo', 'Darth Vader', 'Ellen Ripley', 'Jean-Luc Picard', 'The Doctor', 'Sarah Connor', 'Neo', 'Spock'],
  marvelUniverse: ['Tony Stark', 'Steve Rogers', 'Natasha Romanoff', 'Wanda Maximoff', 'Doctor Strange', 'Peter Parker', 'TChalla', 'Carol Danvers', 'Loki', 'Thanos'],
  dcUniverse: ['Clark Kent', 'Bruce Wayne', 'Diana Prince', 'Barry Allen', 'Arthur Curry', 'Hal Jordan', 'Victor Stone', 'Raven', 'Harley Quinn', 'Lex Luthor'],
  disneyPixar: ['Mickey Mouse', 'Minnie Mouse', 'Donald Duck', 'Goofy', 'Elsa', 'Moana', 'Woody', 'Buzz Lightyear', 'Mulan', 'Simba'],
  cartoonClassics: ['Bugs Bunny', 'Daffy Duck', 'Scooby-Doo', 'Shaggy Rogers', 'SpongeBob SquarePants', 'Patrick Star', 'Finn the Human', 'Jake the Dog', 'Tom Cat', 'Jerry Mouse'],
  sitcomCrew: ['Michael Scott', 'Dwight Schrute', 'Leslie Knope', 'Ron Swanson', 'Chandler Bing', 'Monica Geller', 'Ted Mosby', 'Barney Stinson', 'Jake Peralta', 'Rosa Diaz'],
  actionStars: ['John Wick', 'Ethan Hunt', 'Jason Bourne', 'Sarah Connor', 'John McClane', 'Ellen Ripley', 'Rambo', 'Max Rockatansky', 'Furiosa', 'Beatrix Kiddo'],
  horrorIcons: ['Dracula', 'Frankenstein Monster', 'The Mummy', 'Freddy Krueger', 'Jason Voorhees', 'Michael Myers', 'Pennywise', 'Ghostface', 'Samara Morgan', 'Leatherface'],
  literaryClassics: ['Harry Potter', 'Katniss Everdeen', 'Atticus Finch', 'Elizabeth Bennet', 'Huckleberry Finn', 'Odysseus', 'Hamlet', 'Don Quixote', 'Jean Valjean', 'Bilbo Baggins'],
  mythicFigures: ['Zeus', 'Athena', 'Hercules', 'Achilles', 'Odin', 'Thor', 'Loki', 'Anubis', 'Ra', 'King Arthur'],
  historicalLeaders: ['Julius Caesar', 'Cleopatra', 'Napoleon', 'Joan of Arc', 'Genghis Khan', 'Alexander the Great', 'Winston Churchill', 'Abraham Lincoln', 'Nelson Mandela', 'Queen Elizabeth I'],
  scientistsInventors: ['Albert Einstein', 'Isaac Newton', 'Nikola Tesla', 'Marie Curie', 'Charles Darwin', 'Ada Lovelace', 'Alan Turing', 'Katherine Johnson', 'Rosalind Franklin', 'Galileo Galilei'],
  musicLegends: ['Taylor Swift', 'Beyonce', 'Freddie Mercury', 'Michael Jackson', 'Adele', 'Eminem', 'Bob Marley', 'Prince', 'Elvis Presley', 'Billie Eilish'],
  actorsDirectors: ['Leonardo DiCaprio', 'Meryl Streep', 'Denzel Washington', 'Keanu Reeves', 'Tom Hanks', 'Scarlett Johansson', 'Ryan Gosling', 'Christopher Nolan', 'Steven Spielberg', 'Pedro Pascal'],
  athletes: ['Lionel Messi', 'Cristiano Ronaldo', 'LeBron James', 'Michael Jordan', 'Serena Williams', 'Roger Federer', 'Usain Bolt', 'Simone Biles', 'Tom Brady', 'Shohei Ohtani'],
  spiesThieves: ['James Bond', 'Ethan Hunt', 'Carmen Sandiego', 'Lupin III', 'Black Widow', 'Catwoman', 'Arsene Lupin', 'Solid Snake', 'Vesper Lynd', 'The Pink Panther'],
  strategists: ['Lelouch Lamperouge', 'Erwin Smith', 'Light Yagami', 'Ender Wiggin', 'Grand Admiral Thrawn', 'Tyrion Lannister', 'Shikamaru Nara', 'Admiral Yi Sun-sin', 'Zhuge Liang', 'Petyr Baelish'],
  oneNameCelebs: ['Madonna', 'Cher', 'Zendaya', 'Shakira', 'Rihanna', 'Drake', 'Sting', 'Adele', 'Prince', 'Beyonce'],
  animalKingdom: ['African Elephant', 'Orca', 'Wolf', 'Falcon', 'Honey Badger', 'Cheetah', 'Octopus', 'Raven', 'Dolphin', 'Polar Bear'],
  pokemon: ['Pikachu', 'Charizard', 'Mewtwo', 'Lucario', 'Gengar', 'Greninja', 'Eevee', 'Snorlax', 'Dragonite', 'Garchomp'],
  avatarVerse: ['Aang', 'Korra', 'Zuko', 'Iroh', 'Katara', 'Sokka', 'Toph Beifong', 'Azula', 'Kuvira', 'Avatar Roku'],
  starWars: ['Obi-Wan Kenobi', 'Ahsoka Tano', 'Rey', 'Kylo Ren', 'Yoda', 'Mace Windu', 'Padme Amidala', 'Din Djarin', 'Grogu', 'Boba Fett'],
  lotrMiddleEarth: ['Sauron', 'Saruman', 'Galadriel', 'Elrond', 'Gimli', 'Boromir', 'Eowyn', 'Faramir', 'Arwen', 'Gollum'],
  villains: ['Joker', 'Magneto', 'Lex Luthor', 'Green Goblin', 'Darth Maul', 'Voldemort', 'Hannibal Lecter', 'Cersei Lannister', 'Homelander', 'Megatron'],
  internetWildcards: ['Shrek', 'Big Chungus', 'Doge', 'Grumpy Cat', 'Pepe the Frog', 'Giga Chad', 'Skibidi Toilet', 'Nyan Cat', 'Rick Astley', 'Keyboard Cat'],
  fightingGame: ['Ryu', 'Chun-Li', 'Ken Masters', 'Scorpion', 'Sub-Zero', 'Raiden', 'Kazuya Mishima', 'Heihachi Mishima', 'Terry Bogard', 'Sol Badguy']
};

const PRIORITY_BUCKET_ORDER = [
  'firstNamesOnly',
  'lastNamesOnly',
  'abbreviationsNicknames',
  'proxyReferences',
  'objects',
  'fictionalAnimals',
  'mainstreamHeroes',
  'detectivesMinds',
  'animeProtags',
  'gamingIcons',
  'fantasyLegends',
  'sciFiIcons'
];

const RUN_PROFILES = {
  quick: { scenarioLimit: 6, bucketLimit: 10, perBucketLimit: 6 },
  balanced: { scenarioLimit: 10, bucketLimit: 20, perBucketLimit: 8 },
  full: { scenarioLimit: Number.POSITIVE_INFINITY, bucketLimit: Number.POSITIVE_INFINITY, perBucketLimit: Number.POSITIVE_INFINITY }
};

const HARNESS_AUDIO_AUDIT_ENABLED = !['0', 'false', 'no', 'off'].includes(
  String(process.env.HARNESS_AUDIO_AUDIT || '1').toLowerCase()
);
const HARNESS_AUDIO_BATCH_SIZE = Math.max(1, Math.min(48, Number(process.env.HARNESS_AUDIO_BATCH_SIZE) || 24));
const HARNESS_AUDIO_BATCH_DELAY_MS = Math.max(0, Math.min(1000, Number(process.env.HARNESS_AUDIO_BATCH_DELAY_MS) || 80));
const HARNESS_AUDIO_AUDIT_MAX_ENTRIES = Math.max(0, Number(process.env.HARNESS_AUDIO_AUDIT_MAX_ENTRIES) || 220);
const HARNESS_EVALUATION_MODE = String(process.env.HARNESS_EVALUATION_MODE || 'final').toLowerCase();

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveRunConfig() {
  const mode = String(process.env.HARNESS_MODE || 'balanced').toLowerCase();
  const base = RUN_PROFILES[mode] || RUN_PROFILES.balanced;

  return {
    mode,
    scenarioLimit: parsePositiveInt(process.env.MAX_SCENARIOS) || base.scenarioLimit,
    bucketLimit: parsePositiveInt(process.env.MAX_BUCKETS) || base.bucketLimit,
    perBucketLimit: parsePositiveInt(process.env.MAX_PER_BUCKET) || base.perBucketLimit
  };
}

function applyRunLimits(config) {
  const scenarios = SCENARIOS.slice(0, config.scenarioLimit);
  const orderedBucketNames = [...new Set([...PRIORITY_BUCKET_ORDER, ...Object.keys(CHARACTER_BUCKETS)])]
    .filter(name => CHARACTER_BUCKETS[name]);
  const bucketEntries = orderedBucketNames
    .slice(0, config.bucketLimit)
    .map(name => [name, CHARACTER_BUCKETS[name]]);
  const buckets = Object.fromEntries(
    bucketEntries.map(([bucket, names]) => [bucket, names.slice(0, config.perBucketLimit)])
  );

  return { scenarios, buckets };
}

function flattenBuckets(buckets) {
  return Object.entries(buckets).flatMap(([bucket, names]) =>
    names.map(name => ({ bucket, name }))
  );
}

function parseFeasibility(notes) {
  const joined = Array.isArray(notes) ? notes.join(' | ') : '';
  const match = /Scenario feasibility: (?:can do|struggles) \((\d+)\/10\)/i.exec(joined);
  return match ? Number(match[1]) : null;
}

function normalizeCompact(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function stdDev(values) {
  const nums = (Array.isArray(values) ? values : []).filter(v => Number.isFinite(v));
  if (nums.length <= 1) return 0;
  const mean = nums.reduce((sum, v) => sum + v, 0) / nums.length;
  const variance = nums.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / nums.length;
  return Number(Math.sqrt(variance).toFixed(3));
}

function extractStepPoints(result, stepName) {
  const steps = result && result.breakdown && Array.isArray(result.breakdown.scoreBreakdown)
    ? result.breakdown.scoreBreakdown
    : [];
  const step = steps.find(entry => String(entry.step || '').toLowerCase() === String(stepName || '').toLowerCase());
  return step && Number.isFinite(step.points) ? step.points : 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function getScoreMeta(result) {
  return result && result.scoreMeta && typeof result.scoreMeta === 'object'
    ? result.scoreMeta
    : {};
}

function getContextRiskFlags(result) {
  const scoreMeta = getScoreMeta(result);
  const flags = scoreMeta.contextSignals && Array.isArray(scoreMeta.contextSignals.riskFlags)
    ? scoreMeta.contextSignals.riskFlags
    : [];
  return Array.from(new Set(flags.map((f) => String(f || '').trim()).filter(Boolean)));
}

function getBestAudioMetaFromScenarioResults(character, scenarioResults = [], avgOvr = 0) {
  const rows = Array.isArray(scenarioResults) ? scenarioResults : [];
  if (!rows.length) {
    return {
      character,
      resolvedTitle: '',
      aliases: [],
      description: '',
      resolvedSource: '',
      riskFlags: [],
      imageSynthetic: false,
      infoConfidence: 0,
      resolverConfidence: 0,
      ovr: avgOvr || 0
    };
  }

  const best = rows
    .map((result) => {
      const scoreMeta = getScoreMeta(result);
      const source = String(scoreMeta.resolvedSource || result.infoSource || '').toLowerCase();
      const infoConfidence = Number(scoreMeta.infoConfidence) || 0;
      const resolverConfidence = Number(scoreMeta.resolverConfidence) || 0;
      const trustedBoost = scoreMeta.trustedInfo ? 2 : 0;
      const sourceBoost = source.includes('wikipedia') ? 0.2 : source.includes('local-index') ? 0.1 : 0;
      return {
        score: trustedBoost + infoConfidence + (resolverConfidence * 0.75) + sourceBoost,
        scoreMeta
      };
    })
    .sort((a, b) => b.score - a.score)[0];

  const scoreMeta = best && best.scoreMeta ? best.scoreMeta : {};
  return {
    character,
    resolvedTitle: String(scoreMeta.resolvedTitle || '').trim(),
    aliases: Array.isArray(scoreMeta.aliases) ? scoreMeta.aliases.slice(0, 16) : [],
    description: String(scoreMeta.resolvedDescriptionSnippet || '').trim(),
    resolvedSource: String(scoreMeta.resolvedSource || '').trim(),
    riskFlags: scoreMeta && scoreMeta.contextSignals && Array.isArray(scoreMeta.contextSignals.riskFlags)
      ? scoreMeta.contextSignals.riskFlags.slice(0, 16)
      : [],
    imageSynthetic: Boolean(scoreMeta.imageSynthetic),
    infoConfidence: Number(scoreMeta.infoConfidence) || 0,
    resolverConfidence: Number(scoreMeta.resolverConfidence) || 0,
    ovr: Number(avgOvr) || 0
  };
}

function isAliasResolutionMatch(info, expected) {
  if (!info) return false;

  const expectedCompact = normalizeCompact(expected);
  const titleCompact = normalizeCompact(info.title || '');
  if (titleCompact && (titleCompact.includes(expectedCompact) || expectedCompact.includes(titleCompact))) return true;

  const aliases = Array.isArray(info.aliases) ? info.aliases : [];
  return aliases.some(alias => {
    const aliasCompact = normalizeCompact(alias);
    return aliasCompact && (aliasCompact.includes(expectedCompact) || expectedCompact.includes(aliasCompact));
  });
}

async function runAliasResolutionAudit() {
  const rows = [];
  for (const probe of ALIAS_PROBES) {
    const info = await fetchCharacterInfo(probe.input);
    const passed = isAliasResolutionMatch(info, probe.expected);
    rows.push({
      input: probe.input,
      expected: probe.expected,
      passed,
      source: info && info.source ? info.source : 'none',
      title: info && info.title ? info.title : 'N/A',
      confidence: info && Number.isFinite(info.confidence) ? Number(info.confidence.toFixed(3)) : 0
    });
  }

  return {
    total: rows.length,
    passed: rows.filter(row => row.passed).length,
    rows
  };
}

async function evaluateEntry(entry) {
  const scenarioResults = await Promise.all(
    ACTIVE_SCENARIOS.map(async ({ scenario, twist }) => evaluateCharacter(entry.name, scenario, twist, {
      evaluationMode: HARNESS_EVALUATION_MODE
    }))
  );

  const feasibilityScores = scenarioResults
    .map(result => parseFeasibility(result.notes))
    .filter(value => typeof value === 'number');

  const avgFeasibility = feasibilityScores.length
    ? Number((feasibilityScores.reduce((sum, value) => sum + value, 0) / feasibilityScores.length).toFixed(2))
    : 0;

  const avgOVR = Number((scenarioResults.reduce((sum, result) => sum + (result.ovr || 0), 0) / scenarioResults.length).toFixed(2));
  const ovrStdDev = stdDev(scenarioResults.map(result => Number(result.ovr) || 0));
  const feasibilityStdDev = stdDev(feasibilityScores);
  const avgRelevancePoints = Number((scenarioResults.reduce((sum, result) => sum + extractStepPoints(result, 'Scenario/Twist Relevance'), 0) / scenarioResults.length).toFixed(2));
  const avgDraftedScenarioBonus = Number((scenarioResults.reduce((sum, result) => sum + extractStepPoints(result, 'Original Scenario Fit (Drafted)'), 0) / scenarioResults.length).toFixed(2));
  const avgDraftedTwistBonus = Number((scenarioResults.reduce((sum, result) => sum + extractStepPoints(result, 'Original Twist Fit (Drafted)'), 0) / scenarioResults.length).toFixed(2));

  const scoreMetas = scenarioResults.map((result) => getScoreMeta(result));
  const primaryMeta = scoreMetas[0] || {};
  const source = String(primaryMeta.resolvedSource || (scenarioResults[0] && scenarioResults[0].infoSource) || 'none');
  const confidence = Number((scoreMetas.reduce((sum, meta) => sum + (Number(meta.infoConfidence) || 0), 0) / Math.max(1, scoreMetas.length)).toFixed(3));
  const resolverConfidenceAvg = Number((scoreMetas.reduce((sum, meta) => sum + (Number(meta.resolverConfidence) || 0), 0) / Math.max(1, scoreMetas.length)).toFixed(3));
  const contextFitConfidenceAvg = Number((scoreMetas.reduce((sum, meta) => sum + (Number(meta.contextFitConfidence) || 0), 0) / Math.max(1, scoreMetas.length)).toFixed(3));
  const imageRealCount = scenarioResults.filter((result) => Boolean(result && result.imageUrl) && !Boolean(getScoreMeta(result).imageSynthetic)).length;
  const imageSyntheticCount = scenarioResults.filter((result) => Boolean(result && result.imageUrl) && Boolean(getScoreMeta(result).imageSynthetic)).length;
  const imageNoneCount = scenarioResults.filter((result) => !Boolean(result && result.imageUrl)).length;
  const riskFlagCounts = {};
  let titleDiffCount = 0;
  let dangerousTitleDiffSuspectedCount = 0;
  let dangerousTitleDiffRescuedCount = 0;
  scenarioResults.forEach((result) => {
    const flags = getContextRiskFlags(result);
    flags.forEach((flag) => {
      riskFlagCounts[flag] = (riskFlagCounts[flag] || 0) + 1;
    });
    if (flags.includes('title_differs_from_input')) titleDiffCount += 1;
    if (flags.includes('dangerous_title_diff_suspected')) dangerousTitleDiffSuspectedCount += 1;
    if (flags.includes('dangerous_title_diff_rescued')) dangerousTitleDiffRescuedCount += 1;
  });
  const rarity = scenarioResults[0] && scenarioResults[0].rarity ? scenarioResults[0].rarity : 'Bronze';
  const audioMeta = getBestAudioMetaFromScenarioResults(entry.name, scenarioResults, avgOVR);

  return {
    bucket: entry.bucket,
    name: entry.name,
    source,
    confidence,
    resolverConfidenceAvg,
    contextFitConfidenceAvg,
    rarity,
    avgOVR,
    ovrStdDev,
    avgFeasibility,
    feasibilityStdDev,
    avgRelevancePoints,
    avgDraftedScenarioBonus,
    avgDraftedTwistBonus,
    resolved: confidence >= 0.35,
    imageRealCount,
    imageSyntheticCount,
    imageNoneCount,
    titleDiffCount,
    dangerousTitleDiffSuspectedCount,
    dangerousTitleDiffRescuedCount,
    riskFlagCounts,
    evaluationPath: String(scenarioResults[0] && scenarioResults[0].evaluationPath || 'unknown'),
    engineMode: String(primaryMeta.evaluationEngineMode || getEvaluationEngineMode()),
    audioMeta,
    _scenarioResults: scenarioResults
  };
}

function analyzeBalance(results) {
  const all = Array.isArray(results) ? results : [];
  if (!all.length) return { warnings: [], critical: [] };

  const avgRelevance = Number((all.reduce((sum, row) => sum + (row.avgRelevancePoints || 0), 0) / all.length).toFixed(2));
  const avgDraftedScenario = Number((all.reduce((sum, row) => sum + (row.avgDraftedScenarioBonus || 0), 0) / all.length).toFixed(2));
  const avgDraftedTwist = Number((all.reduce((sum, row) => sum + (row.avgDraftedTwistBonus || 0), 0) / all.length).toFixed(2));
  const ovrSpread = stdDev(all.map(row => row.avgOVR));
  const feasibilitySpread = stdDev(all.map(row => row.avgFeasibility));

  const warnings = [];
  const critical = [];

  if (ovrSpread < 2.2) {
    warnings.push(`OVR spread is very flat (stddev ${ovrSpread}). Evaluations may be over-compressed.`);
  }
  if (feasibilitySpread < 1.1) {
    warnings.push(`Scenario feasibility spread is low (stddev ${feasibilitySpread}). Can-do vs struggles separation may be weak.`);
  }
  if (avgDraftedScenario > 2.1 || avgDraftedTwist > 2.1) {
    warnings.push(`Drafted fit bonuses are high on average (scenario ${avgDraftedScenario}, twist ${avgDraftedTwist}). Consider tightening bonus caps.`);
  }
  if (avgRelevance < 2.0) {
    critical.push(`Average scenario/twist relevance points are too low (${avgRelevance}). Relevance extraction may be underpowered.`);
  }

  return {
    metrics: {
      avgRelevance,
      avgDraftedScenario,
      avgDraftedTwist,
      ovrSpread,
      feasibilitySpread
    },
    warnings,
    critical
  };
}

function buildContextHarnessDiagnostics(allEvaluations = []) {
  const rows = Array.isArray(allEvaluations) ? allEvaluations.filter(Boolean) : [];
  if (!rows.length) {
    return {
      totalEvaluations: 0,
      titleDiffAudit: '',
      scalingAudit: '',
      dangerousBySource: [],
      qualityGates: [],
      summary: null
    };
  }

  const ctxDiag = summarizeContextDiagnostics(rows, { suspiciousLimit: 12 });
  const sourceTotals = {};
  const dangerousBySourceCounter = {};
  const syntheticBySourceCounter = {};
  const realImageBySourceCounter = {};
  const backfilledBySourceCounter = {};
  const dangerousByInputCounter = {};
  rows.forEach((entry) => {
    const scoreMeta = getScoreMeta(entry);
    const source = String(scoreMeta.resolvedSource || 'unknown');
    sourceTotals[source] = (sourceTotals[source] || 0) + 1;
    if (scoreMeta.imageSynthetic) syntheticBySourceCounter[source] = (syntheticBySourceCounter[source] || 0) + 1;
    else if (entry && entry.imageUrl) realImageBySourceCounter[source] = (realImageBySourceCounter[source] || 0) + 1;
    if (scoreMeta.imageBackfilled) backfilledBySourceCounter[source] = (backfilledBySourceCounter[source] || 0) + 1;
    const flags = getContextRiskFlags(entry);
    if (flags.includes('dangerous_title_diff_suspected')) {
      dangerousBySourceCounter[source] = (dangerousBySourceCounter[source] || 0) + 1;
      const inputName = String(
        entry && (entry.character || entry.name || entry.input)
        || scoreMeta.inputName
        || scoreMeta.resolvedTitle
        || 'unknown'
      ).trim();
      const key = inputName.toLowerCase();
      const row = dangerousByInputCounter[key] || {
        input: inputName,
        count: 0,
        sources: {},
        samples: new Set()
      };
      row.count += 1;
      row.sources[source] = (row.sources[source] || 0) + 1;
      if (row.samples.size < 3 && scoreMeta.resolvedTitle) row.samples.add(String(scoreMeta.resolvedTitle));
      dangerousByInputCounter[key] = row;
    }
  });

  const dangerousBySource = Object.entries(dangerousBySourceCounter)
    .map(([source, dangerous]) => ({
      source,
      dangerous,
      total: Number(sourceTotals[source]) || 0,
      pct: Number((((dangerous || 0) / Math.max(1, Number(sourceTotals[source]) || 0)) * 100).toFixed(1))
    }))
    .sort((a, b) => b.pct - a.pct || b.dangerous - a.dangerous || String(a.source).localeCompare(String(b.source)))
    .slice(0, 12);
  const syntheticBySource = Object.entries(sourceTotals)
    .map(([source, total]) => ({
      source,
      synthetic: Number(syntheticBySourceCounter[source]) || 0,
      real: Number(realImageBySourceCounter[source]) || 0,
      backfilled: Number(backfilledBySourceCounter[source]) || 0,
      total: Number(total) || 0,
      syntheticPct: Number((((Number(syntheticBySourceCounter[source]) || 0) / Math.max(1, Number(total) || 0)) * 100).toFixed(1)),
      backfilledPct: Number((((Number(backfilledBySourceCounter[source]) || 0) / Math.max(1, Number(total) || 0)) * 100).toFixed(1))
    }))
    .sort((a, b) => b.syntheticPct - a.syntheticPct || b.synthetic - a.synthetic || String(a.source).localeCompare(String(b.source)))
    .slice(0, 12);
  const dangerousByInput = Object.values(dangerousByInputCounter)
    .map((row) => ({
      input: row.input,
      count: row.count,
      sources: Object.entries(row.sources || {})
        .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
        .map(([source, count]) => `${source}:${count}`)
        .join(','),
      samples: Array.from(row.samples || []).slice(0, 3)
    }))
    .sort((a, b) => b.count - a.count || String(a.input).localeCompare(String(b.input)))
    .slice(0, 15);

  const qualityGates = Object.entries(ctxDiag.qualityGates || {})
    .filter(([, value]) => value === true)
    .map(([key]) => key);

  return {
    totalEvaluations: rows.length,
    titleDiffAudit: formatTitleDiffDiagnostics(ctxDiag.titleDiffDiagnostics, { exampleLimit: 6 }),
    scalingAudit: formatScalingDiagnostics(ctxDiag.scaling, { exampleLimit: 5 }),
    dangerousBySource,
    syntheticBySource,
    dangerousByInput,
    qualityGates,
    summary: {
      images: ctxDiag.images,
      counts: ctxDiag.counts,
      rates: ctxDiag.rates,
      validation: ctxDiag.validation,
      averages: ctxDiag.averages,
      topFlags: Object.entries(ctxDiag.flags || {})
        .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
        .slice(0, 12)
        .map(([flag, count]) => ({ flag, count })),
      scaling: ctxDiag.scaling,
      suspicious: Array.isArray(ctxDiag.suspicious) ? ctxDiag.suspicious.slice(0, 12) : []
    }
  };
}

async function runAudioBlurbHarnessAudit(audioMetaCandidates = []) {
  if (!HARNESS_AUDIO_AUDIT_ENABLED) {
    return { enabled: false, skipped: 'disabled' };
  }

  const clipsDir = path.join(__dirname, '..', 'audio', 'clips');
  const metas = (Array.isArray(audioMetaCandidates) ? audioMetaCandidates : [])
    .map((row) => row && typeof row === 'object' ? row : null)
    .filter(Boolean);
  const deduped = [];
  const seen = new Set();
  for (const meta of metas) {
    const key = `${String(meta.character || '').trim().toLowerCase()}|${String(meta.resolvedTitle || '').trim().toLowerCase()}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      character: String(meta.character || '').trim(),
      resolvedTitle: String(meta.resolvedTitle || '').trim(),
      aliases: Array.isArray(meta.aliases) ? meta.aliases.slice(0, 16) : [],
      description: String(meta.description || '').trim(),
      resolvedSource: String(meta.resolvedSource || '').trim(),
      riskFlags: Array.isArray(meta.riskFlags) ? meta.riskFlags.slice(0, 16) : [],
      imageSynthetic: Boolean(meta.imageSynthetic),
      infoConfidence: Number(meta.infoConfidence) || 0,
      resolverConfidence: Number(meta.resolverConfidence) || 0,
      ovr: Number(meta.ovr) || 0
    });
    if (HARNESS_AUDIO_AUDIT_MAX_ENTRIES > 0 && deduped.length >= HARNESS_AUDIO_AUDIT_MAX_ENTRIES) break;
  }

  const aggregate = {
    enabled: true,
    engineMode: getEvaluationEngineMode(),
    requestedEntries: deduped.length,
    batches: 0,
    cacheHits: 0,
    stats: {
      audioClip: 0,
      speechQuote: 0,
      speechFact: 0,
      misses: 0,
      libraryEmpty: 0,
      elapsedMsTotal: 0,
      quoteFetchMsWeightedAvg: 0
    },
    modeCounts: {},
    speechSourceCounts: {},
    sampleMisses: [],
    sampleSpeechQuotes: [],
    errors: []
  };

  if (!deduped.length) return { ...aggregate, skipped: 'no_entries' };

  let quoteFetchWeightedSum = 0;
  let quoteFetchWeight = 0;

  for (let start = 0; start < deduped.length; start += HARNESS_AUDIO_BATCH_SIZE) {
    const batch = deduped.slice(start, start + HARNESS_AUDIO_BATCH_SIZE);
    aggregate.batches += 1;
    try {
      const payload = await resolveAudioBlurbBatch(clipsDir, batch);
      if (payload && payload.cacheHit) aggregate.cacheHits += 1;
      const stats = payload && payload.stats && typeof payload.stats === 'object' ? payload.stats : {};
      aggregate.stats.audioClip += Number(stats.audioClip) || 0;
      aggregate.stats.speechQuote += Number(stats.speechQuote) || 0;
      aggregate.stats.speechFact += Number(stats.speechFact) || 0;
      aggregate.stats.misses += Number(stats.misses) || 0;
      aggregate.stats.libraryEmpty += Number(stats.libraryEmpty) || 0;
      aggregate.stats.elapsedMsTotal += Number(stats.elapsedMs) || 0;

      const resolvedSpeechCount = (Number(stats.speechQuote) || 0) + (Number(stats.speechFact) || 0);
      const quoteFetchAvg = Number(stats.quoteFetchMsAvg) || 0;
      if (resolvedSpeechCount > 0 && quoteFetchAvg > 0) {
        quoteFetchWeightedSum += resolvedSpeechCount * quoteFetchAvg;
        quoteFetchWeight += resolvedSpeechCount;
      }

      const rows = Array.isArray(payload && payload.results) ? payload.results : [];
      rows.forEach((row) => {
        const mode = String(row && row.mode || 'unknown');
        aggregate.modeCounts[mode] = (aggregate.modeCounts[mode] || 0) + 1;
        const speechSource = String(row && row.speech && row.speech.source || '').trim();
        if (speechSource) {
          aggregate.speechSourceCounts[speechSource] = (aggregate.speechSourceCounts[speechSource] || 0) + 1;
        }
        if ((mode === 'miss' || mode === 'speech-miss') && aggregate.sampleMisses.length < 20) {
          aggregate.sampleMisses.push({
            character: String(row && row.character || 'Unknown'),
            resolvedTitle: String(row && row.resolvedTitle || ''),
            clipLibraryEmpty: Boolean(row && row.clipLibraryEmpty)
          });
        }
        if (mode === 'speech-quote' && aggregate.sampleSpeechQuotes.length < 12) {
          aggregate.sampleSpeechQuotes.push({
            character: String(row && row.character || 'Unknown'),
            sourceTitle: String(row && row.speech && row.speech.sourceTitle || ''),
            text: String(row && row.speech && (row.speech.displayText || row.speech.text) || '')
          });
        }
      });

      console.log(
        `[Harness audio] batch ${aggregate.batches} size=${batch.length}` +
        ` clip=${Number(stats.audioClip) || 0}` +
        ` speechQ=${Number(stats.speechQuote) || 0}` +
        ` speechF=${Number(stats.speechFact) || 0}` +
        ` miss=${Number(stats.misses) || 0}` +
        ` cache=${payload && payload.cacheHit ? 'hit' : 'miss'}` +
        ` elapsedMs=${Number(stats.elapsedMs) || 0}`
      );
    } catch (error) {
      aggregate.errors.push({
        batch: aggregate.batches,
        start,
        size: batch.length,
        error: String(error && error.message || 'unknown error')
      });
      console.log(`[Harness audio] batch ${aggregate.batches} ERROR: ${String(error && error.message || 'unknown error')}`);
    }

    if (HARNESS_AUDIO_BATCH_DELAY_MS > 0 && (start + HARNESS_AUDIO_BATCH_SIZE) < deduped.length) {
      await sleep(HARNESS_AUDIO_BATCH_DELAY_MS);
    }
  }

  aggregate.stats.quoteFetchMsWeightedAvg = quoteFetchWeight
    ? Math.round(quoteFetchWeightedSum / quoteFetchWeight)
    : 0;

  return aggregate;
}

function summarize(results) {
  const byBucket = Object.keys(ACTIVE_BUCKETS).map(bucket => {
    const rows = results.filter(result => result.bucket === bucket);
    const resolved = rows.filter(result => result.resolved).length;
    const avgConf = Number((rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length).toFixed(3));
    const avgOVR = Number((rows.reduce((sum, row) => sum + row.avgOVR, 0) / rows.length).toFixed(2));
    const rareOrHigher = rows.filter(row => ['Rare', 'Epic', 'Legendary', 'Icon'].includes(row.rarity)).length;

    return { bucket, resolved, total: rows.length, avgConf, avgOVR, rareOrHigher };
  });

  return {
    total: results.length,
    resolved: results.filter(result => result.resolved).length,
    avgConfidence: Number((results.reduce((sum, row) => sum + row.confidence, 0) / results.length).toFixed(3)),
    avgRelevancePoints: Number((results.reduce((sum, row) => sum + row.avgRelevancePoints, 0) / results.length).toFixed(2)),
    rareOrHigher: results.filter(row => ['Rare', 'Epic', 'Legendary', 'Icon'].includes(row.rarity)).length,
    byBucket
  };
}

function sanitizeFileStamp(value) {
  return String(value || '')
    .replace(/[:.]/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
}

function buildHarnessArtifact({
  runConfig,
  scenarios,
  aliasAudit,
  results,
  summary,
  balance,
  qualityGatePassed,
  contextDiagnostics = null,
  audioBlurbAudit = null
}) {
  const sortedByOVR = [...results].sort((a, b) => (b.avgOVR || 0) - (a.avgOVR || 0) || String(a.name || '').localeCompare(String(b.name || '')));
  const sortedByConfidence = [...results].sort((a, b) => (a.confidence || 0) - (b.confidence || 0) || String(a.name || '').localeCompare(String(b.name || '')));
  const unresolved = sortedByConfidence.filter((row) => !row.resolved).slice(0, 25);

  return {
    generatedAt: new Date().toISOString(),
    runConfig,
    scenarios: Array.isArray(scenarios) ? scenarios.map((s) => ({ name: s.name, scenario: s.scenario, twist: s.twist })) : [],
    aliasAudit,
    summary,
    balance,
    contextDiagnostics,
    audioBlurbAudit,
    qualityGatePassed: Boolean(qualityGatePassed),
    diagnostics: {
      lowestConfidence: sortedByConfidence.slice(0, 20),
      highestOVR: sortedByOVR.slice(0, 20),
      lowestOVR: sortedByOVR.slice(-20).reverse(),
      unresolved
    },
    results
  };
}

function writeHarnessArtifact(artifact) {
  const writeEnabled = !['0', 'false', 'no', 'off'].includes(String(process.env.HARNESS_WRITE_JSON || '1').toLowerCase());
  if (!writeEnabled) return null;

  const configured = String(process.env.HARNESS_OUT_JSON || '').trim();
  let outputPath = configured;
  if (!outputPath) {
    const stamp = sanitizeFileStamp(new Date().toISOString());
    outputPath = path.join(__dirname, '.runtime', 'harness', `viability-${stamp}.json`);
  } else if (!path.isAbsolute(outputPath)) {
    outputPath = path.join(process.cwd(), outputPath);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2), 'utf8');
  return outputPath;
}

const RUN_CONFIG = resolveRunConfig();
const { scenarios: ACTIVE_SCENARIOS, buckets: ACTIVE_BUCKETS } = applyRunLimits(RUN_CONFIG);

(async () => {
  const entries = flattenBuckets(ACTIVE_BUCKETS);
  console.log(
    `Running viability harness (${RUN_CONFIG.mode}) for ${entries.length} entries across ${ACTIVE_SCENARIOS.length} scenarios...` +
    ` engineMode=${getEvaluationEngineMode()} evalMode=${HARNESS_EVALUATION_MODE}`
  );

  const aliasAudit = await runAliasResolutionAudit();
  console.log(`Alias resolution audit: ${aliasAudit.passed}/${aliasAudit.total} passed`);
  aliasAudit.rows.forEach(row => {
    const state = row.passed ? 'PASS' : 'FAIL';
    console.log(`[Alias:${state}] ${row.input} -> expected ${row.expected} | title=${row.title} | src=${row.source} | conf=${row.confidence.toFixed(3)}`);
  });

  const results = [];
  const allScenarioEvaluations = [];
  const audioMetaCandidates = [];
  for (const entry of entries) {
    try {
      const row = await evaluateEntry(entry);
      results.push(row);
      if (Array.isArray(row._scenarioResults)) {
        row._scenarioResults.forEach((result) => {
          allScenarioEvaluations.push({ ...(result || {}), __ownerName: row.bucket });
        });
      }
      if (row.audioMeta) audioMetaCandidates.push(row.audioMeta);
      console.log(`${row.bucket.padEnd(12)} | ${row.name.padEnd(22)} | src=${row.source.padEnd(15)} conf=${row.confidence.toFixed(3)} ovr=${row.avgOVR.toFixed(2)} feas=${row.avgFeasibility.toFixed(2)} rel=${row.avgRelevancePoints.toFixed(2)} ovrσ=${row.ovrStdDev.toFixed(2)} rarity=${row.rarity}`);
    } catch (error) {
      console.log(`${entry.bucket.padEnd(12)} | ${entry.name.padEnd(22)} | ERROR: ${error.message}`);
      results.push({
        bucket: entry.bucket,
        name: entry.name,
        source: 'error',
        confidence: 0,
        rarity: 'Bronze',
        avgOVR: 0,
        ovrStdDev: 0,
        avgFeasibility: 0,
        feasibilityStdDev: 0,
        avgRelevancePoints: 0,
        avgDraftedScenarioBonus: 0,
        avgDraftedTwistBonus: 0,
        resolved: false,
        resolverConfidenceAvg: 0,
        contextFitConfidenceAvg: 0,
        imageRealCount: 0,
        imageSyntheticCount: 0,
        imageNoneCount: ACTIVE_SCENARIOS.length,
        titleDiffCount: 0,
        dangerousTitleDiffSuspectedCount: 0,
        dangerousTitleDiffRescuedCount: 0,
        riskFlagCounts: {},
        evaluationPath: 'error',
        engineMode: getEvaluationEngineMode(),
        audioMeta: { character: entry.name, resolvedTitle: '', aliases: [], infoConfidence: 0, resolverConfidence: 0, ovr: 0 },
        _scenarioResults: []
      });
    }
  }

  const summary = summarize(results);
  const balance = analyzeBalance(results);
  const contextDiagnostics = buildContextHarnessDiagnostics(allScenarioEvaluations);
  console.log('\n=== SUMMARY ===');
  console.log(`Resolved >=0.35 confidence: ${summary.resolved}/${summary.total}`);
  console.log(`Average confidence: ${summary.avgConfidence}`);
  console.log(`Average relevance points: ${summary.avgRelevancePoints}`);
  console.log(`Rare+ rarity count: ${summary.rareOrHigher}/${summary.total}`);
  summary.byBucket.forEach(bucket => {
    console.log(`- ${bucket.bucket}: resolved ${bucket.resolved}/${bucket.total}, avgConf ${bucket.avgConf}, avgOVR ${bucket.avgOVR}, rare+ ${bucket.rareOrHigher}/${bucket.total}`);
  });

  console.log('\n=== BALANCE DIAGNOSTICS ===');
  console.log(`avgRelevance=${balance.metrics.avgRelevance} | avgDraftScenario=${balance.metrics.avgDraftedScenario} | avgDraftTwist=${balance.metrics.avgDraftedTwist}`);
  console.log(`ovrSpread(stddev)=${balance.metrics.ovrSpread} | feasibilitySpread(stddev)=${balance.metrics.feasibilitySpread}`);
  if (getEvaluationEngineMode() === 'context' && balance.metrics.avgRelevance === 0) {
    console.log('NOTE: avgRelevance metric is legacy-step based and is not a valid quality-gate signal for context engine runs.');
  }
  if (!balance.warnings.length && !balance.critical.length) {
    console.log('No major balance warnings detected.');
  } else {
    balance.warnings.forEach(msg => console.log(`WARN: ${msg}`));
    balance.critical.forEach(msg => console.log(`CRITICAL: ${msg}`));
  }

  console.log('\n=== CONTEXT DIAGNOSTICS (HARNESS) ===');
  console.log(`Total scenario evaluations: ${contextDiagnostics.totalEvaluations}`);
  if (contextDiagnostics.titleDiffAudit) {
    console.log(`TitleDiff Audit: ${contextDiagnostics.titleDiffAudit}`);
  }
  if (contextDiagnostics.scalingAudit) {
    console.log(`Scaling Audit: ${contextDiagnostics.scalingAudit}`);
  }
  if (Array.isArray(contextDiagnostics.dangerousBySource) && contextDiagnostics.dangerousBySource.length) {
    console.log(
      `Dangerous TitleDiff by Source: ${contextDiagnostics.dangerousBySource.map((row) => (
        `${row.source}:${row.dangerous}/${row.total} (${row.pct}%)`
      )).join(' | ')}`
    );
  }
  if (Array.isArray(contextDiagnostics.syntheticBySource) && contextDiagnostics.syntheticBySource.length) {
    console.log(
      `Synthetic/Backfill by Source: ${contextDiagnostics.syntheticBySource.map((row) => (
        `${row.source}:syn=${row.synthetic}/${row.total} (${row.syntheticPct}%) backfill=${row.backfilled}/${row.total} (${row.backfilledPct}%)`
      )).join(' | ')}`
    );
  }
  if (Array.isArray(contextDiagnostics.dangerousByInput) && contextDiagnostics.dangerousByInput.length) {
    console.log(
      `Top Dangerous Inputs: ${contextDiagnostics.dangerousByInput.slice(0, 8).map((row) => (
        `${row.input}:${row.count}${row.sources ? ` [${row.sources}]` : ''}${Array.isArray(row.samples) && row.samples.length ? ` -> ${row.samples.join(' / ')}` : ''}`
      )).join(' | ')}`
    );
  }
  if (Array.isArray(contextDiagnostics.qualityGates) && contextDiagnostics.qualityGates.length) {
    console.log(`Context Quality Gates Tripped: ${contextDiagnostics.qualityGates.join(', ')}`);
  }

  let audioBlurbAudit = null;
  if (HARNESS_AUDIO_AUDIT_ENABLED) {
    console.log('\n=== AUDIO BLURB AUDIT (HARNESS) ===');
    audioBlurbAudit = await runAudioBlurbHarnessAudit(audioMetaCandidates);
    if (audioBlurbAudit && audioBlurbAudit.enabled) {
      console.log(
        `Audio blurb stats: requested=${audioBlurbAudit.requestedEntries} batches=${audioBlurbAudit.batches}` +
        ` clip=${audioBlurbAudit.stats.audioClip}` +
        ` speechQ=${audioBlurbAudit.stats.speechQuote}` +
        ` speechF=${audioBlurbAudit.stats.speechFact}` +
        ` miss=${audioBlurbAudit.stats.misses}` +
        ` libraryEmpty=${audioBlurbAudit.stats.libraryEmpty}` +
        ` quoteFetchAvgMs=${audioBlurbAudit.stats.quoteFetchMsWeightedAvg}` +
        ` elapsedMsTotal=${audioBlurbAudit.stats.elapsedMsTotal}` +
        ` cacheHits=${audioBlurbAudit.cacheHits}`
      );
      const modeRows = Object.entries(audioBlurbAudit.modeCounts || {})
        .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
        .map(([mode, count]) => `${mode}:${count}`);
      if (modeRows.length) console.log(`Audio blurb modes: ${modeRows.join(' | ')}`);
      const speechSourceRows = Object.entries(audioBlurbAudit.speechSourceCounts || {})
        .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
        .map(([source, count]) => `${source}:${count}`);
      if (speechSourceRows.length) console.log(`Audio blurb speech sources: ${speechSourceRows.join(' | ')}`);
      if (Array.isArray(audioBlurbAudit.sampleMisses) && audioBlurbAudit.sampleMisses.length) {
        console.log(
          `Audio blurb sample misses: ${audioBlurbAudit.sampleMisses.slice(0, 8).map((row) => (
            `${row.character}${row.resolvedTitle ? `->${row.resolvedTitle}` : ''}${row.clipLibraryEmpty ? '[library-empty]' : ''}`
          )).join(' | ')}`
        );
      }
    }
  }

  const qualityGatePassed =
    summary.resolved >= Math.ceil(summary.total * 0.8) &&
    summary.byBucket.every(bucket => bucket.resolved >= Math.ceil(bucket.total * 0.6)) &&
    aliasAudit.passed >= Math.ceil(aliasAudit.total * 0.75) &&
    (() => {
      const effectiveCritical = getEvaluationEngineMode() === 'context'
        ? balance.critical.filter((msg) => !String(msg || '').includes('Average scenario/twist relevance points are too low (0)'))
        : balance.critical;
      return effectiveCritical.length === 0;
    })();

  if (!qualityGatePassed) {
    console.error('\nQuality gate failed: coverage, alias fidelity, or balance diagnostics did not meet thresholds.');
    process.exitCode = 1;
  }

  try {
    const artifactRows = results.map((row) => {
      const clone = { ...(row || {}) };
      delete clone._scenarioResults;
      return clone;
    });
    const artifact = buildHarnessArtifact({
      runConfig: RUN_CONFIG,
      scenarios: ACTIVE_SCENARIOS,
      aliasAudit,
      results: artifactRows,
      summary,
      balance,
      qualityGatePassed,
      contextDiagnostics,
      audioBlurbAudit
    });
    const artifactPath = writeHarnessArtifact(artifact);
    if (artifactPath) {
      console.log(`Harness JSON artifact written: ${artifactPath}`);
    }
  } catch (artifactError) {
    console.error(`Failed to write harness artifact: ${artifactError && artifactError.message ? artifactError.message : 'unknown error'}`);
  }
})();
