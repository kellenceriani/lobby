const { scoreCharacter, fetchCharacterInfo } = require('./evaluator');

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

async function evaluateEntry(entry) {
  const info = await fetchCharacterInfo(entry.name);

  const scenarioResults = await Promise.all(
    ACTIVE_SCENARIOS.map(async ({ scenario, twist }) => scoreCharacter(entry.name, scenario, twist))
  );

  const feasibilityScores = scenarioResults
    .map(result => parseFeasibility(result.notes))
    .filter(value => typeof value === 'number');

  const avgFeasibility = feasibilityScores.length
    ? Number((feasibilityScores.reduce((sum, value) => sum + value, 0) / feasibilityScores.length).toFixed(2))
    : 0;

  const avgOVR = Number((scenarioResults.reduce((sum, result) => sum + (result.ovr || 0), 0) / scenarioResults.length).toFixed(2));
  const source = info && info.source ? info.source : 'none';
  const confidence = info && typeof info.confidence === 'number' ? Number(info.confidence.toFixed(3)) : 0;
  const rarity = scenarioResults[0] && scenarioResults[0].rarity ? scenarioResults[0].rarity : 'Bronze';

  return {
    bucket: entry.bucket,
    name: entry.name,
    source,
    confidence,
    rarity,
    avgOVR,
    avgFeasibility,
    resolved: confidence >= 0.35
  };
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
    rareOrHigher: results.filter(row => ['Rare', 'Epic', 'Legendary', 'Icon'].includes(row.rarity)).length,
    byBucket
  };
}

const RUN_CONFIG = resolveRunConfig();
const { scenarios: ACTIVE_SCENARIOS, buckets: ACTIVE_BUCKETS } = applyRunLimits(RUN_CONFIG);

(async () => {
  const entries = flattenBuckets(ACTIVE_BUCKETS);
  console.log(`Running viability harness (${RUN_CONFIG.mode}) for ${entries.length} entries across ${ACTIVE_SCENARIOS.length} scenarios...`);

  const results = [];
  for (const entry of entries) {
    try {
      const row = await evaluateEntry(entry);
      results.push(row);
      console.log(`${row.bucket.padEnd(12)} | ${row.name.padEnd(22)} | src=${row.source.padEnd(15)} conf=${row.confidence.toFixed(3)} ovr=${row.avgOVR.toFixed(2)} feas=${row.avgFeasibility.toFixed(2)} rarity=${row.rarity}`);
    } catch (error) {
      console.log(`${entry.bucket.padEnd(12)} | ${entry.name.padEnd(22)} | ERROR: ${error.message}`);
      results.push({
        bucket: entry.bucket,
        name: entry.name,
        source: 'error',
        confidence: 0,
        rarity: 'Bronze',
        avgOVR: 0,
        avgFeasibility: 0,
        resolved: false
      });
    }
  }

  const summary = summarize(results);
  console.log('\n=== SUMMARY ===');
  console.log(`Resolved >=0.35 confidence: ${summary.resolved}/${summary.total}`);
  console.log(`Average confidence: ${summary.avgConfidence}`);
  console.log(`Rare+ rarity count: ${summary.rareOrHigher}/${summary.total}`);
  summary.byBucket.forEach(bucket => {
    console.log(`- ${bucket.bucket}: resolved ${bucket.resolved}/${bucket.total}, avgConf ${bucket.avgConf}, avgOVR ${bucket.avgOVR}, rare+ ${bucket.rareOrHigher}/${bucket.total}`);
  });

  const qualityGatePassed =
    summary.resolved >= Math.ceil(summary.total * 0.8) &&
    summary.byBucket.every(bucket => bucket.resolved >= Math.ceil(bucket.total * 0.6));

  if (!qualityGatePassed) {
    console.error('\nQuality gate failed: insufficient coverage for broad-name retrieval.');
    process.exitCode = 1;
  }
})();
