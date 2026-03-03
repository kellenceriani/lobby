const fs = require('fs');
const path = require('path');

process.env.EVAL_ENGINE_MODE = 'context';

const { evaluateCharactersBatch } = require('../../services/entryEvaluationService');
const { getEnabledCategories, resolveCategoryFit } = require('../../services/categoryRegistryService');

const PLAYER_NAMES = ['AAA', 'BBB', 'CCC'];
const REPORT_DIR = path.join(__dirname, '..', '..', '.runtime', 'harness', 'category-autorun');
const STATE_FILE = path.join(REPORT_DIR, 'category-autorun-state.json');
const CHECKLIST_MD = path.join(__dirname, '..', '..', '..', 'md', 'CATEGORY_AUTORUN_CHECKLIST.md');

const SCENARIO_TWIST_POOL = [
  { scenario: 'CONTAIN A GLOBAL CYBER PANIC', twist: 'WITH ANALOG BACKUPS ONLY' },
  { scenario: 'HOLD A FRACTURING ALLIANCE TOGETHER', twist: 'WITHOUT DIRECT FORCE' },
  { scenario: 'REDEPLOY A MISINFO PANIC', twist: 'UNDER A TOTAL PRIVACY MANDATE' },
  { scenario: 'REBUILD A MONITORING FAILURE', twist: 'ONE SHARED RESOURCE' },
  { scenario: 'DISMANTLE A DRONE SWARM TAKEOVER', twist: 'AND CRITICAL TARGETS KEEP MOVING' },
  { scenario: 'EVACUATE A FLOATING CITY', twist: 'AS FUEL IS CAPPED PER PHASE' }
];

const FIT_LIBRARY = {
  sports: ['Michael Jordan', 'Lionel Messi', 'LeBron James', 'Serena Williams', 'Tom Brady', 'Tiger Woods', 'Shohei Ohtani', 'Usain Bolt', 'Roger Federer', 'Simone Biles', 'Mookie Betts', 'George Kittle'],
  vehicles: ['Ferrari', 'Lamborghini', 'Maserati', 'Porsche 911', 'Formula One Car', 'NASCAR Stock Car', 'Ford Mustang', 'Chevrolet Corvette', 'Tesla Model S', 'Mini Van', 'Pickup Truck', 'Sports Car'],
  technology: ['Laptop', 'Supercomputer', 'Server Rack', 'Satellite', 'Quantum Processor', 'Firewall', 'Encryption Engine', 'Neural Network', 'Industrial Robot', 'AI Assistant', 'Drone Swarm Controller', 'Telemetry System'],
  science: ['Albert Einstein', 'Marie Curie', 'Nikola Tesla', 'Ada Lovelace', 'Alan Turing', 'Katherine Johnson', 'Rosalind Franklin', 'Richard Feynman', 'Isaac Newton', 'Galileo Galilei', 'Charles Darwin', 'Carl Sagan'],
  media: ['Batman', 'Spider-Man', 'Wonder Woman', 'Harry Potter', 'Sherlock Holmes', 'Naruto Uzumaki', 'Megan Fox', 'Gordon Ramsay', 'Darth Vader', 'Iron Man', 'Scooby-Doo', 'SpongeBob SquarePants'],
  default: ['Batman', 'Sherlock Holmes', 'Michael Jordan', 'Ferrari', 'Laptop', 'Albert Einstein', 'Doctor Strange', 'Megan Fox', 'Tom Brady', 'Pikachu', 'Gordon Ramsay', 'LeBron James']
};

const NON_FIT_DIVERSE = [
  'Mount Everest',
  'Sushi',
  'Hammer',
  'Pikachu',
  'Laptop',
  'Tokyo',
  'Zeus',
  'Blue Whale',
  'Albert Einstein',
  'Mona Lisa',
  'Volcano',
  'Pizza',
  'Helicopter',
  'Barack Obama',
  'Octopus',
  'Eiffel Tower'
];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeCompact(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function seededHash(input) {
  const source = String(input || 'seed');
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRng(seed) {
  let state = seededHash(seed) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pickScenarioTwist(categoryId = '') {
  const rng = makeRng(`scenario:${categoryId}`);
  const index = Math.floor(rng() * SCENARIO_TWIST_POOL.length);
  return SCENARIO_TWIST_POOL[index] || SCENARIO_TWIST_POOL[0];
}

function inferDomainForCategory(category) {
  const id = String(category && category.id || '').toLowerCase();
  const family = String(category && category.family || '').toLowerCase();
  const displayName = String(category && category.displayName || '').toLowerCase();
  if (id.includes('leader') || family.includes('leader') || displayName.includes('leader')) return 'leaders';
  if (id.includes('medical-professional') || id.includes('medical') || displayName.includes('medical')) return 'medical';
  if (id.includes('detective') || id.includes('investigator') || displayName.includes('detective')) return 'detective';
  if (id.includes('firefighter') || id.includes('rescuer') || displayName.includes('rescue')) return 'rescue';
  if (id.includes('martial') || id.includes('combat-sports')) return 'sports';
  if (id.includes('sport') || id.includes('athlete') || family.includes('sports')) return 'sports';
  if (id.includes('musician') || id.includes('performer')) return 'music';
  if (id.includes('actor') || id.includes('entertainer')) return 'actor';
  if (id.includes('chef') || id.includes('culinary') || id.includes('cuisine')) return 'chef';
  if (id.includes('pilot') || id.includes('aviator')) return 'pilot';
  if (id.includes('explorer') || id.includes('adventurer')) return 'explorer';
  if (id.includes('superhero') || id.includes('marvel') || id.includes('dc')) return 'superheroes';
  if (id.includes('anime')) return 'anime';
  if (id.includes('villain') || id.includes('antagonist')) return 'villains';
  if (id.includes('magic')) return 'magic';
  if (id.includes('mecha')) return 'mecha';
  if (id.includes('monster')) return 'mythic';
  if (id.includes('tool')) return 'tools';
  if (id.includes('machinery')) return 'machinery';
  if (id.includes('firearm')) return 'firearms';
  if (id.includes('medical-equipment')) return 'medical_equipment';
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
  if (id.includes('revolution') || id.includes('conflict')) return 'leaders';
  if (id.includes('diplomacy') || id.includes('treaty')) return 'leaders';
  if (id.includes('deities') || id.includes('pantheon')) return 'deities';
  if (id.includes('mythic')) return 'mythic';
  if (id.includes('tech') || id.includes('cyber') || id.includes('robot') || id.includes('comput')) return 'technology';
  if (id.includes('science') || id.includes('scientist') || id.includes('inventor') || id.includes('quantum') || id.includes('bio') || id.includes('medical')) return 'science';
  if (id.includes('hero') || id.includes('anime') || id.includes('villain') || id.includes('franchise') || family.includes('media') || family.includes('fiction')) return 'media';
  return 'default';
}

Object.assign(FIT_LIBRARY, {
  leaders: ['Nelson Mandela', 'Winston Churchill', 'Abraham Lincoln', 'Angela Merkel', 'Jacinda Ardern', 'Theodore Roosevelt', 'Margaret Thatcher', 'Barack Obama', 'Lee Kuan Yew', 'Volodymyr Zelenskyy', 'Mahatma Gandhi', 'Franklin D. Roosevelt'],
  medical: ['Florence Nightingale', 'Jonas Salk', 'Anthony Fauci', 'Atul Gawande', 'Paul Farmer', 'Harvey Cushing', 'Virginia Apgar', 'Elizabeth Blackwell', 'Sanjay Gupta', 'Christiaan Barnard', 'Mae Jemison', 'Patch Adams'],
  detective: ['Sherlock Holmes', 'Hercule Poirot', 'Nancy Drew', 'Benoit Blanc', 'Jessica Fletcher', 'L', 'Columbo', 'Batman', 'Dick Tracy', 'Miss Marple', 'Philip Marlowe', 'Veronica Mars'],
  rescue: ['Firefighter', 'Paramedic', 'Rescue Helicopter', 'Coast Guard', 'Search and Rescue Dog', 'Hazmat Team', 'Emergency Dispatcher', 'Urban Rescue Team', 'Lifeguard', 'Ambulance Crew', 'Smoke Jumper', 'Disaster Response Unit'],
  music: ['Taylor Swift', 'Beyonce', 'Freddie Mercury', 'Mozart', 'Beethoven', 'Eminem', 'Adele', 'Bruno Mars', 'Ed Sheeran', 'Michael Jackson', 'Dua Lipa', 'Hans Zimmer'],
  actor: ['Tom Hanks', 'Meryl Streep', 'Denzel Washington', 'Leonardo DiCaprio', 'Scarlett Johansson', 'Ryan Reynolds', 'Emma Stone', 'Keanu Reeves', 'Morgan Freeman', 'Viola Davis', 'Brad Pitt', 'Natalie Portman'],
  chef: ['Gordon Ramsay', 'Massimo Bottura', 'Alice Waters', 'Anthony Bourdain', 'Jamie Oliver', 'Wolfgang Puck', 'Thomas Keller', 'Ina Garten', 'Jose Andres', 'Nobu Matsuhisa', 'Guy Fieri', 'Emeril Lagasse'],
  pilot: ['Amelia Earhart', 'Chuck Yeager', 'Sully Sullenberger', 'Wright Brothers', 'Bessie Coleman', 'Neil Armstrong', 'Yuri Gagarin', 'Test Pilot', 'Fighter Pilot', 'Commercial Pilot', 'Blue Angels Pilot', 'Helicopter Pilot'],
  explorer: ['Marco Polo', 'Roald Amundsen', 'Ernest Shackleton', 'Ibn Battuta', 'Jacques Cousteau', 'Tenzing Norgay', 'Edmund Hillary', 'Ferdinand Magellan', 'Neil Armstrong', 'Sally Ride', 'Bear Grylls', 'Dora the Explorer'],
  superheroes: ['Superman', 'Batman', 'Wonder Woman', 'Spider-Man', 'Iron Man', 'Captain America', 'Black Panther', 'Thor', 'Doctor Strange', 'The Flash', 'Hulk', 'Captain Marvel'],
  anime: ['Naruto Uzumaki', 'Monkey D. Luffy', 'Goku', 'Sailor Moon', 'Eren Yeager', 'Tanjiro Kamado', 'Gojo Satoru', 'Ichigo Kurosaki', 'Edward Elric', 'Lelouch Lamperouge', 'Mikasa Ackerman', 'Light Yagami'],
  villains: ['Darth Vader', 'Thanos', 'Joker', 'Voldemort', 'Sauron', 'Magneto', 'Loki', 'Frieza', 'Sephiroth', 'Cruella de Vil', 'Hannibal Lecter', 'Bowser'],
  magic: ['Merlin', 'Gandalf', 'Doctor Strange', 'Hermione Granger', 'Harry Potter', 'Scarlet Witch', 'Zatanna', 'Morgana', 'Dumbledore', 'Circe', 'Raven', 'Loki'],
  mecha: ['Gundam', 'Eva Unit-01', 'Jaeger', 'Optimus Prime', 'Megazord', 'Mazinger Z', 'Voltron', 'RX-78-2', 'Mech Suit', 'Titans Mech', 'Patlabor', 'Armored Core'],
  mythic: ['Dragon', 'Kraken', 'Minotaur', 'Phoenix', 'Hydra', 'Cerberus', 'Unicorn', 'Griffin', 'Cyclops', 'Werewolf', 'Vampire', 'Godzilla'],
  deities: ['Zeus', 'Athena', 'Odin', 'Thor', 'Ra', 'Anubis', 'Shiva', 'Vishnu', 'Poseidon', 'Ares', 'Hera', 'Loki'],
  tools: ['Hammer', 'Screwdriver', 'Wrench', 'Pliers', 'Saw', 'Drill', 'Chisel', 'Axe', 'Shovel', 'Socket Wrench', 'Multitool', 'Level'],
  machinery: ['Bulldozer', 'Excavator', 'Forklift', 'Crane', 'Tractor', 'Dump Truck', 'Cement Mixer', 'Industrial Press', 'Lathe Machine', 'Backhoe', 'Harvester', 'Road Roller'],
  firearms: ['AK-47', 'M4 Carbine', 'Glock 19', 'Sniper Rifle', 'Shotgun', 'Revolver', 'Crossbow', 'SMG', 'Light Machine Gun', 'Pistol', 'Rifle', 'Uzi'],
  medical_equipment: ['MRI Machine', 'Ventilator', 'Defibrillator', 'X-Ray Machine', 'Surgical Robot', 'Ultrasound Machine', 'ECG Monitor', 'Infusion Pump', 'Anesthesia Machine', 'Dialysis Machine', 'CT Scanner', 'Stethoscope'],
  aircraft: ['Boeing 747', 'F-16', 'AH-64 Apache', 'B-2 Spirit', 'Concorde', 'C-130 Hercules', 'MQ-9 Reaper', 'A-10 Warthog', 'SR-71 Blackbird', 'Eurofighter Typhoon', 'Boeing 787', 'Airbus A320'],
  spacecraft: ['Apollo Command Module', 'Space Shuttle', 'Falcon 9', 'Soyuz', 'International Space Station', 'Starship', 'Lunar Module', 'Voyager 1', 'Hubble Telescope', 'Crew Dragon', 'James Webb Space Telescope', 'Saturn V'],
  naval: ['Aircraft Carrier', 'Destroyer', 'Submarine', 'Battleship', 'Cruiser', 'Frigate', 'Patrol Boat', 'Nuclear Submarine', 'Corvette', 'Amphibious Assault Ship', 'Tugboat', 'Dreadnought'],
  trains: ['Bullet Train', 'Freight Train', 'Subway Train', 'Locomotive', 'Maglev Train', 'Tram', 'Metro Rail', 'High-Speed Rail', 'Commuter Train', 'Steam Engine', 'Monorail', 'Light Rail'],
  cities: ['New York City', 'Tokyo', 'London', 'Paris', 'Dubai', 'Singapore', 'Los Angeles', 'Seoul', 'Shanghai', 'Rome', 'Berlin', 'Sydney'],
  environments: ['Arctic', 'Sahara Desert', 'Deep Ocean', 'Volcano', 'Himalayas', 'Rainforest', 'Antarctica', 'Canyon', 'Tundra', 'Swamp', 'Jungle', 'Tornado Alley'],
  historical: ['Great Wall of China', 'Pyramids of Giza', 'Colosseum', 'Machu Picchu', 'Stonehenge', 'Acropolis', 'Angkor Wat', 'Petra', 'Taj Mahal', 'Roman Forum', 'Forbidden City', 'Eiffel Tower'],
  cyber: ['Firewall', 'SOC Analyst', 'Penetration Tester', 'Encryption Engine', 'Zero Trust Architecture', 'Intrusion Detection System', 'SIEM Platform', 'Threat Hunter', 'Incident Response Team', 'Red Team Operator', 'Blue Team Operator', 'Sandbox Analyzer'],
  aerospace: ['Jet Engine', 'Wind Tunnel', 'Rocket Nozzle', 'Aerospace Engineer', 'Composite Airframe', 'Flight Computer', 'Guidance System', 'Satellite Bus', 'Avionics Suite', 'Launch Vehicle', 'Orbital Mechanics Analyst', 'Propulsion Lab'],
  biotech: ['CRISPR', 'DNA Sequencer', 'Bioreactor', 'Gene Therapy', 'mRNA Platform', 'Biotech Lab', 'Genome Editor', 'Cell Culture System', 'Protein Engineer', 'Bioinformatics Pipeline', 'PCR Machine', 'Stem Cell Researcher'],
  quantum: ['Quantum Computer', 'Qubit Processor', 'Quantum Physicist', 'Particle Accelerator', 'CERN Scientist', 'Quantum Sensor', 'Superconducting Qubit', 'Ion Trap', 'Quantum Key Distribution', 'Schrodinger Equation', 'Entanglement Lab', 'Feynman Diagram']
});

function pickUniqueRandom(list, count, rng, blocked = new Set()) {
  const pool = (Array.isArray(list) ? list : [])
    .map(normalizeText)
    .filter(Boolean)
    .filter((entry) => !blocked.has(normalizeCompact(entry)));

  const chosen = [];
  const used = new Set();
  while (chosen.length < count && pool.length) {
    const idx = Math.floor(rng() * pool.length);
    const candidate = pool.splice(idx, 1)[0];
    const key = normalizeCompact(candidate);
    if (!key || used.has(key) || blocked.has(key)) continue;
    used.add(key);
    chosen.push(candidate);
  }
  return chosen;
}

function buildCategoryCandidatePool(category, domain) {
  const fromCategory = [
    ...(Array.isArray(category && category.exampleEntriesStrong) ? category.exampleEntriesStrong : []),
    ...(Array.isArray(category && category.aliases) ? category.aliases : []),
    ...(Array.isArray(category && category.inclusionRules) ? category.inclusionRules : [])
  ];
  const fromDomain = FIT_LIBRARY[domain] || [];
  const technicalDomains = new Set([
    'technology',
    'science',
    'cyber',
    'aerospace',
    'biotech',
    'quantum',
    'machinery',
    'medical_equipment',
    'aircraft',
    'spacecraft',
    'mecha',
    'vehicles'
  ]);

  const fromFallback = [
    ...(FIT_LIBRARY.default || []),
    ...NON_FIT_DIVERSE,
    ...(technicalDomains.has(domain) ? FIT_LIBRARY.science || [] : []),
    ...(technicalDomains.has(domain) ? FIT_LIBRARY.technology || [] : [])
  ];

  const unique = new Map();
  [...fromCategory, ...fromDomain, ...fromFallback].forEach((entry) => {
    const clean = normalizeText(entry);
    const key = normalizeCompact(clean);
    if (!clean || !key) return;
    if (!unique.has(key)) unique.set(key, clean);
  });
  return Array.from(unique.values());
}

function buildProtectedFitKeySet(category, domain) {
  const protectedTerms = [
    ...(Array.isArray(category && category.aliases) ? category.aliases : []),
    ...(Array.isArray(category && category.inclusionRules) ? category.inclusionRules : []),
    ...(Array.isArray(category && category.exampleEntriesStrong) ? category.exampleEntriesStrong : []),
    ...(Array.isArray(FIT_LIBRARY[domain]) ? FIT_LIBRARY[domain] : [])
  ];

  const keys = new Set();
  protectedTerms.forEach((entry) => {
    const key = normalizeCompact(entry);
    if (key) keys.add(key);
  });
  return keys;
}

function scoreCandidateForCategory(categoryId, category, candidate) {
  const result = resolveCategoryFit({
    categoryContext: {
      enabled: true,
      id: categoryId,
      name: String(category && category.displayName || categoryId),
      family: String(category && category.family || 'unknown'),
      version: 'v1'
    },
    rawEntryName: candidate,
    scoringInfo: {
      title: candidate,
      name: candidate,
      aliases: [],
      description: ''
    },
    subscores: {
      currentScenarioFit: 50,
      currentTwistFit: 50
    },
    confidenceOverall: 1,
    confidenceName: 1,
    riskFlags: []
  });

  return {
    candidate,
    netImpact: Number(result && result.netImpact) || 0,
    categoryFit: Number(result && result.categoryFit) || 0,
    membershipConfidence: Number(result && result.membershipConfidence) || 0
  };
}

function shuffleWithSeed(items, rng) {
  const out = Array.isArray(items) ? items.slice() : [];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function buildEntriesForCategory(category) {
  const categoryId = String(category && category.id || '').toLowerCase();
  const rng = makeRng(`entries:${categoryId}`);
  const domain = inferDomainForCategory(category);
  const protectedFitKeys = buildProtectedFitKeySet(category, domain);
  const candidatePool = buildCategoryCandidatePool(category, domain);
  const scored = shuffleWithSeed(candidatePool, rng)
    .map((candidate) => scoreCandidateForCategory(categoryId, category, candidate));

  const positiveStrong = scored.filter((row) => row.netImpact > 0);
  const positiveFallback = scored.filter((row) => row.netImpact === 0 && row.categoryFit >= 55);
  const negativeStrong = scored.filter((row) => row.netImpact < 0);
  const negativeFallback = scored.filter((row) => row.netImpact === 0 && row.categoryFit <= 45);

  const fitOrder = [
    ...scored
      .filter((row) => row.categoryFit >= 65)
      .sort((a, b) => b.categoryFit - a.categoryFit || b.membershipConfidence - a.membershipConfidence || b.netImpact - a.netImpact),
    ...scored
      .filter((row) => row.categoryFit >= 55)
      .sort((a, b) => b.categoryFit - a.categoryFit || b.netImpact - a.netImpact),
    ...positiveStrong.sort((a, b) => b.netImpact - a.netImpact || b.categoryFit - a.categoryFit),
    ...positiveFallback.sort((a, b) => b.categoryFit - a.categoryFit),
    ...scored.sort((a, b) => b.categoryFit - a.categoryFit)
  ];

  const fitEntries = [];
  const used = new Set();
  for (const row of fitOrder) {
    const key = normalizeCompact(row && row.candidate);
    if (!key || used.has(key)) continue;
    fitEntries.push(row.candidate);
    used.add(key);
    if (fitEntries.length >= 10) break;
  }

  const nonFitOrder = [
    ...scored
      .filter((row) => row.categoryFit <= 40)
      .sort((a, b) => a.categoryFit - b.categoryFit || a.netImpact - b.netImpact),
    ...negativeStrong.sort((a, b) => a.netImpact - b.netImpact || a.categoryFit - b.categoryFit),
    ...negativeFallback.sort((a, b) => a.categoryFit - b.categoryFit),
    ...scored.sort((a, b) => a.categoryFit - b.categoryFit)
  ];
  const nonFitEntries = [];
  for (const row of nonFitOrder) {
    const key = normalizeCompact(row && row.candidate);
    if (!key || used.has(key)) continue;
    if (protectedFitKeys.has(key)) continue;
    nonFitEntries.push(row.candidate);
    used.add(key);
    if (nonFitEntries.length >= 8) break;
  }

  const allEntries = [...fitEntries, ...nonFitEntries];
  return {
    fitEntries,
    nonFitEntries,
    allEntries,
    teams: {
      AAA: allEntries.filter((_, index) => index % 3 === 0),
      BBB: allEntries.filter((_, index) => index % 3 === 1),
      CCC: allEntries.filter((_, index) => index % 3 === 2)
    }
  };
}

function evaluateGate(name, passed, details = '') {
  return {
    name,
    passed: Boolean(passed),
    details: String(details || '')
  };
}

function getScoreMeta(row) {
  return row && row.scoreMeta && typeof row.scoreMeta === 'object' ? row.scoreMeta : {};
}

function getCategoryContext(row) {
  const scoreMeta = getScoreMeta(row);
  return scoreMeta.categoryContext && typeof scoreMeta.categoryContext === 'object' ? scoreMeta.categoryContext : null;
}

function getRiskFlags(row) {
  const scoreMeta = getScoreMeta(row);
  const signals = scoreMeta.contextSignals && typeof scoreMeta.contextSignals === 'object' ? scoreMeta.contextSignals : null;
  return Array.isArray(signals && signals.riskFlags) ? signals.riskFlags : [];
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { category: '', all: false, stopOnFail: true };
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || '').trim();
    if (token === '--all') {
      args.all = true;
      continue;
    }
    if (token === '--category') {
      args.category = String(argv[i + 1] || '').trim().toLowerCase();
      i += 1;
      continue;
    }
    if (token === '--continue-on-fail') {
      args.stopOnFail = false;
      continue;
    }
  }
  return args;
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return { categories: {} };
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { categories: {} };
  } catch (_error) {
    return { categories: {} };
  }
}

function saveState(state) {
  ensureDir(REPORT_DIR);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function buildChecklistMarkdown(state, categories) {
  const lines = [];
  lines.push('# Category Auto-Run Checklist');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Calibration Notes');
  lines.push('');
  lines.push('- Category fit should be treated as a dominant prior, not an always-final outcome.');
  lines.push('- A strong in-category entry can still end lower after scenario/twist mismatch, weak chemistry, rarity drag, or lower base ability.');
  lines.push('- Autorun PART2 therefore tracks both positive net impact and high category-fit-with-restraint evidence (suppressed fits are reported, not blindly failed).');
  lines.push('');
  lines.push('## Status');
  lines.push('');
  lines.push('| Category | Status | Attempts | Last Run | Last Outcome |');
  lines.push('|---|---:|---:|---|---|');

  categories.forEach((category) => {
    const id = String(category.id || '');
    const row = state.categories && state.categories[id] ? state.categories[id] : null;
    const status = row && row.status ? row.status : 'not_started';
    const attempts = Number(row && row.attempts) || 0;
    const lastRunAt = row && row.lastRunAt ? row.lastRunAt : '-';
    const lastOutcome = row && row.lastOutcome ? row.lastOutcome : '-';
    lines.push(`| ${id} | ${status} | ${attempts} | ${lastRunAt} | ${lastOutcome} |`);
  });

  lines.push('');
  lines.push('## Entry Sets (18 each)');
  lines.push('');

  categories.forEach((category) => {
    const id = String(category.id || '');
    const row = state.categories && state.categories[id] ? state.categories[id] : null;
    const entries = row && Array.isArray(row.entries) ? row.entries : [];
    lines.push(`### ${id}`);
    lines.push('');
    if (!entries.length) {
      lines.push('- (No entries generated yet)');
      lines.push('');
      return;
    }
    entries.forEach((entry, index) => {
      lines.push(`- ${index + 1}. ${entry}`);
    });
    lines.push('');
  });

  return `${lines.join('\n')}\n`;
}

function updateChecklistFile(state, categories) {
  const markdown = buildChecklistMarkdown(state, categories);
  const dir = path.dirname(CHECKLIST_MD);
  ensureDir(dir);
  fs.writeFileSync(CHECKLIST_MD, markdown);
}

function buildRunRows(entries, scenario, twist, categoryId) {
  return entries.map((character) => ({
    character,
    scenario,
    twist,
    options: {
      evaluationMode: 'final',
      categoryContext: {
        enabled: true,
        id: categoryId,
        name: categoryId,
        family: 'unknown',
        version: 'v1'
      },
      fetchContext: {
        scenario,
        twist,
        originalScenario: scenario,
        originalTwist: twist
      }
    }
  }));
}

async function buildRuntimeEntryPack(category, scenario, twist) {
  const categoryId = String(category && category.id || '').toLowerCase();
  const domain = inferDomainForCategory(category);
  const protectedFitKeys = buildProtectedFitKeySet(category, domain);
  const rng = makeRng(`runtime-entries:${categoryId}`);
  const candidatePool = buildCategoryCandidatePool(category, domain);
  const staticScored = candidatePool.map((candidate) => scoreCandidateForCategory(categoryId, category, candidate));

  const fitSeedCandidates = staticScored
    .filter((row) => row.categoryFit >= 55 || row.membershipConfidence >= 0.55)
    .sort((a, b) => b.categoryFit - a.categoryFit || b.membershipConfidence - a.membershipConfidence || b.netImpact - a.netImpact)
    .map((row) => row.candidate);

  const nonFitSeedCandidates = staticScored
    .filter((row) => row.categoryFit <= 45)
    .sort((a, b) => a.categoryFit - b.categoryFit || a.netImpact - b.netImpact)
    .map((row) => row.candidate);

  const allCandidates = shuffleWithSeed(
    Array.from(new Map([
      ...fitSeedCandidates.map((entry) => [normalizeCompact(entry), entry]),
      ...nonFitSeedCandidates.map((entry) => [normalizeCompact(entry), entry]),
      ...candidatePool.map((entry) => [normalizeCompact(entry), entry])
    ]).values()),
    rng
  );

  const scoredByKey = new Map();
  const chunkSize = 42;
  for (let offset = 0; offset < allCandidates.length; offset += chunkSize) {
    const chunk = allCandidates.slice(offset, offset + chunkSize);
    if (!chunk.length) break;
    const candidateRows = buildRunRows(chunk, scenario, twist, categoryId);
    const candidateEvaluated = await evaluateCharactersBatch(candidateRows, { concurrency: 6 });
    candidateEvaluated.forEach((row) => {
      const key = normalizeCompact(row && row.character);
      if (!key || scoredByKey.has(key)) return;
      const context = getCategoryContext(row);
      scoredByKey.set(key, {
        row,
        character: String(row && row.character || ''),
        key,
        netImpact: Number(context && context.netImpact) || 0,
        categoryFit: Number(context && context.categoryFit) || 0
      });
    });

    const scoredProgress = Array.from(scoredByKey.values());
    const positiveCount = scoredProgress.filter((entry) => entry.netImpact > 0).length;
    const negativeCount = scoredProgress.filter((entry) => entry.netImpact < 0).length;
    if (positiveCount >= 12 && negativeCount >= 10) break;
  }

  const scored = Array.from(scoredByKey.values()).map((entry) => {
    const row = entry.row;
    const context = getCategoryContext(row);
    return {
      row: entry.row,
      character: entry.character,
      key: entry.key,
      netImpact: Number(context && context.netImpact) || 0,
      categoryFit: Number(context && context.categoryFit) || 0
    };
  });

  const used = new Set();
  const fitOrder = [
    ...scored
      .filter((entry) => entry.categoryFit >= 70)
      .sort((a, b) => b.categoryFit - a.categoryFit || b.netImpact - a.netImpact),
    ...scored
      .filter((entry) => entry.categoryFit >= 60)
      .sort((a, b) => b.categoryFit - a.categoryFit || b.netImpact - a.netImpact),
    ...scored
      .filter((entry) => entry.categoryFit >= 50 && entry.netImpact > 0)
      .sort((a, b) => b.categoryFit - a.categoryFit || b.netImpact - a.netImpact),
    ...scored.sort((a, b) => b.categoryFit - a.categoryFit || b.netImpact - a.netImpact)
  ];
  const fitEntries = [];
  const fitRows = [];
  for (const entry of fitOrder) {
    if (used.has(entry.key)) continue;
    used.add(entry.key);
    fitEntries.push(entry.character);
    fitRows.push(entry.row);
    if (fitEntries.length >= 10) break;
  }

  const nonFitOrder = [
    ...scored
      .filter((entry) => entry.categoryFit <= 35)
      .sort((a, b) => a.categoryFit - b.categoryFit || a.netImpact - b.netImpact),
    ...scored
      .filter((entry) => entry.categoryFit <= 45)
      .sort((a, b) => a.categoryFit - b.categoryFit || a.netImpact - b.netImpact),
    ...scored
      .filter((entry) => entry.netImpact < 0)
      .sort((a, b) => a.netImpact - b.netImpact || a.categoryFit - b.categoryFit),
    ...scored.sort((a, b) => a.categoryFit - b.categoryFit || a.netImpact - b.netImpact)
  ];
  const nonFitEntries = [];
  const nonFitRows = [];
  for (const entry of nonFitOrder) {
    if (used.has(entry.key)) continue;
    if (protectedFitKeys.has(entry.key)) continue;
    used.add(entry.key);
    nonFitEntries.push(entry.character);
    nonFitRows.push(entry.row);
    if (nonFitEntries.length >= 8) break;
  }

  const allEntries = [...fitEntries, ...nonFitEntries];
  return {
    fitEntries,
    nonFitEntries,
    allEntries,
    teams: {
      AAA: allEntries.filter((_, index) => index % 3 === 0),
      BBB: allEntries.filter((_, index) => index % 3 === 1),
      CCC: allEntries.filter((_, index) => index % 3 === 2)
    },
    evaluatedRows: [...fitRows, ...nonFitRows]
  };
}

function summarizePart1(resultRows) {
  const infoResolved = resultRows.filter((row) => {
    const scoreMeta = getScoreMeta(row);
    const resolvedSource = String(scoreMeta.resolvedSource || '').trim();
    const infoSource = String(row && row.infoSource || '').trim();
    const resolvedTitle = String(scoreMeta.resolvedTitle || '').trim();
    return Boolean(resolvedSource || infoSource || resolvedTitle);
  }).length;
  const imagePresent = resultRows.filter((row) => Boolean(row && row.imageUrl)).length;
  const imageReal = resultRows.filter((row) => {
    const scoreMeta = getScoreMeta(row);
    return scoreMeta.imageSynthetic !== true && Boolean(row && row.imageUrl);
  }).length;

  const gates = [
    evaluateGate('part1_info_resolved_18of18', infoResolved === 18, `resolved=${infoResolved}/18`),
    evaluateGate('part1_image_present_18of18', imagePresent === 18, `imagePresent=${imagePresent}/18`),
    evaluateGate('part1_real_images_min6', imageReal >= 6, `realImages=${imageReal}/18`)
  ];

  return {
    metrics: { infoResolved, imagePresent, imageReal },
    gates
  };
}

function summarizePart2(rowsByName, fitEntries, nonFitEntries) {
  const fitRows = fitEntries.map((name) => rowsByName.get(normalizeCompact(name))).filter(Boolean);
  const nonFitRows = nonFitEntries.map((name) => rowsByName.get(normalizeCompact(name))).filter(Boolean);

  const fitContexts = fitRows.map(getCategoryContext).filter(Boolean);
  const nonFitContexts = nonFitRows.map(getCategoryContext).filter(Boolean);

  const fitPositive = fitContexts.filter((ctx) => Number(ctx.netImpact) > 0).length;
  const fitHighCategory = fitContexts.filter((ctx) => Number(ctx.categoryFit) >= 65).length;
  const fitSupported = fitContexts.filter((ctx) => Number(ctx.netImpact) > 0 || Number(ctx.categoryFit) >= 65).length;
  const fitSuppressedHighCategory = fitContexts.filter((ctx) => Number(ctx.categoryFit) >= 70 && Number(ctx.netImpact) <= 0).length;
  const nonFitNegative = nonFitContexts.filter((ctx) => Number(ctx.netImpact) < 0).length;
  const nonFitLowCategory = nonFitContexts.filter((ctx) => Number(ctx.categoryFit) <= 45).length;
  const nonFitSupported = nonFitContexts.filter((ctx) => Number(ctx.netImpact) < 0 || Number(ctx.categoryFit) <= 45).length;

  const fitAvgImpact = fitContexts.length
    ? fitContexts.reduce((sum, ctx) => sum + (Number(ctx.netImpact) || 0), 0) / fitContexts.length
    : 0;
  const nonFitAvgImpact = nonFitContexts.length
    ? nonFitContexts.reduce((sum, ctx) => sum + (Number(ctx.netImpact) || 0), 0) / nonFitContexts.length
    : 0;

  const breakdownEvidenceCount = [...fitRows, ...nonFitRows].filter((row) => {
    const breakdown = row && row.breakdown && typeof row.breakdown === 'object' ? row.breakdown : null;
    const hasCategoryLine = Boolean(breakdown && String(breakdown.categoryRelevance || '').trim());
    const hasCategoryStep = Boolean(
      breakdown
      && Array.isArray(breakdown.scoreBreakdown)
      && breakdown.scoreBreakdown.some((step) => String(step && step.step || '').toLowerCase() === 'category fit')
    );
    return hasCategoryLine && hasCategoryStep;
  }).length;

  const restraintEvidenceCount = [...fitRows, ...nonFitRows].filter((row) => {
    const scoreMeta = getScoreMeta(row);
    const subs = scoreMeta.contextSubscores && typeof scoreMeta.contextSubscores === 'object' ? scoreMeta.contextSubscores : null;
    return Boolean(subs && Number.isFinite(Number(subs.currentScenarioFit)) && Number.isFinite(Number(subs.currentTwistFit)));
  }).length;

  const riskyOutliers = [...fitRows, ...nonFitRows].filter((row) => {
    const infoConfidence = Number(getScoreMeta(row).infoConfidence) || 0;
    const ovr = Number(row && row.ovr) || 0;
    const flags = getRiskFlags(row);
    const highRisk = flags.includes('dangerous_title_diff_suspected') || flags.includes('high_candidate_ambiguity') || flags.includes('fast_round_timeout_fallback');
    return highRisk && infoConfidence < 0.6 && ovr >= 75;
  }).length;

  const gates = [
    evaluateGate(
      'part2_fit_entries_supported_8of10',
      fitSupported >= 8 && fitHighCategory >= 6,
      `fitSupported=${fitSupported}/10 fitPositive=${fitPositive}/10 fitHighCategory=${fitHighCategory}/10 suppressed=${fitSuppressedHighCategory} avgImpact=${fitAvgImpact.toFixed(2)}`
    ),
    evaluateGate(
      'part2_nonfit_entries_suppressed_6of8',
      nonFitSupported >= 6 && nonFitLowCategory >= 4,
      `nonFitSupported=${nonFitSupported}/8 nonFitNegative=${nonFitNegative}/8 nonFitLowCategory=${nonFitLowCategory}/8 avgImpact=${nonFitAvgImpact.toFixed(2)}`
    ),
    evaluateGate('part2_breakdown_evidence_18of18', breakdownEvidenceCount === 18, `breakdownEvidence=${breakdownEvidenceCount}/18`),
    evaluateGate('part2_restraint_scores_18of18', restraintEvidenceCount === 18, `restraintEvidence=${restraintEvidenceCount}/18`),
    evaluateGate('part2_scaling_no_risky_outliers', riskyOutliers === 0, `riskyOutliers=${riskyOutliers}`)
  ];

  return {
    metrics: {
      fitPositive,
      fitHighCategory,
      fitSupported,
      fitSuppressedHighCategory,
      nonFitNegative,
      nonFitLowCategory,
      nonFitSupported,
      fitAvgImpact: Number(fitAvgImpact.toFixed(3)),
      nonFitAvgImpact: Number(nonFitAvgImpact.toFixed(3)),
      breakdownEvidenceCount,
      restraintEvidenceCount,
      riskyOutliers
    },
    gates
  };
}

function computeOverall(part1, part2) {
  const allGates = [...part1.gates, ...part2.gates];
  const failed = allGates.filter((gate) => !gate.passed);
  const passed = failed.length === 0;

  const loftyThresholdPassed = (
    part1.metrics.infoResolved === 18
    && part1.metrics.imagePresent === 18
    && Number(part2.metrics.fitSupported) >= 9
    && Number(part2.metrics.fitHighCategory) >= 7
    && Number(part2.metrics.nonFitSupported) >= 7
    && part2.metrics.riskyOutliers === 0
  );

  return {
    passed,
    loftyThresholdPassed,
    failedGates: failed
  };
}

async function runCategory(category, options, state) {
  const categoryId = String(category && category.id || '').toLowerCase();
  const runStamp = new Date().toISOString();
  const { scenario, twist } = pickScenarioTwist(categoryId);
  const entryPack = await buildRuntimeEntryPack(category, scenario, twist);
  const evaluated = Array.isArray(entryPack.evaluatedRows) ? entryPack.evaluatedRows : [];

  const rowsByName = new Map();
  evaluated.forEach((row) => {
    const key = normalizeCompact(row && row.character);
    if (!key) return;
    rowsByName.set(key, row);
  });

  const part1 = summarizePart1(evaluated);
  const part1Failed = part1.gates.some((gate) => !gate.passed);

  let part2 = {
    metrics: {},
    gates: [evaluateGate('part2_skipped_due_to_part1_fail', false, 'Skipped due to PART 1 failure')]
  };

  if (!part1Failed) {
    part2 = summarizePart2(rowsByName, entryPack.fitEntries, entryPack.nonFitEntries);
  }

  const overall = computeOverall(part1, part2);
  const report = {
    generatedAt: runStamp,
    category: {
      id: categoryId,
      displayName: String(category && category.displayName || categoryId),
      family: String(category && category.family || 'unknown')
    },
    scenario,
    twist,
    players: PLAYER_NAMES,
    teams: entryPack.teams,
    fitEntries: entryPack.fitEntries,
    nonFitEntries: entryPack.nonFitEntries,
    part1,
    part2,
    overall,
    rows: evaluated.map((row) => {
      const scoreMeta = getScoreMeta(row);
      return {
        character: row && row.character,
        ovr: Number(row && row.ovr) || 0,
        score: Number(row && row.score) || 0,
        infoSource: row && row.infoSource ? String(row.infoSource) : '',
        hasImage: Boolean(row && row.imageUrl),
        imageSynthetic: scoreMeta.imageSynthetic === true,
        infoConfidence: Number(scoreMeta.infoConfidence) || 0,
        resolvedTitle: String(scoreMeta.resolvedTitle || ''),
        categoryContext: getCategoryContext(row),
        riskFlags: getRiskFlags(row)
      };
    })
  };

  ensureDir(REPORT_DIR);
  const safeCategoryFile = categoryId.replace(/[^a-z0-9-]/g, '_');
  const reportPath = path.join(REPORT_DIR, `${safeCategoryFile}-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const existing = state.categories && state.categories[categoryId] ? state.categories[categoryId] : {};
  const attempts = (Number(existing.attempts) || 0) + 1;
  state.categories = state.categories || {};
  state.categories[categoryId] = {
    status: overall.passed ? 'pass' : 'fail',
    attempts,
    lastRunAt: runStamp,
    lastOutcome: overall.passed
      ? (overall.loftyThresholdPassed ? 'PASS_LOFTY' : 'PASS_BASE')
      : 'FAIL',
    reportPath,
    scenario,
    twist,
    entries: entryPack.allEntries,
    fitEntries: entryPack.fitEntries,
    nonFitEntries: entryPack.nonFitEntries,
    failedGates: overall.failedGates.map((gate) => ({ name: gate.name, details: gate.details }))
  };

  return {
    categoryId,
    reportPath,
    passed: overall.passed,
    lofty: overall.loftyThresholdPassed,
    failedGates: overall.failedGates
  };
}

async function main() {
  const args = parseArgs();
  const allCategories = getEnabledCategories();
  if (!allCategories.length) {
    throw new Error('No enabled categories found in registry.');
  }

  const selected = args.all
    ? allCategories
    : allCategories.filter((category) => String(category.id || '').toLowerCase() === args.category);

  if (!selected.length) {
    throw new Error(`Category not found. Use --all or --category <id>.`);
  }

  ensureDir(REPORT_DIR);
  const state = loadState();
  state.categories = state.categories || {};

  allCategories.forEach((category) => {
    const categoryId = String(category && category.id || '').toLowerCase();
    if (!categoryId) return;
    const existing = state.categories[categoryId] || {};
    if (Array.isArray(existing.entries) && existing.entries.length === 18) return;
    const entryPack = buildEntriesForCategory(category);
    state.categories[categoryId] = {
      ...existing,
      status: existing.status || 'not_started',
      attempts: Number(existing.attempts) || 0,
      lastRunAt: existing.lastRunAt || '-',
      lastOutcome: existing.lastOutcome || '-',
      entries: entryPack.allEntries,
      fitEntries: entryPack.fitEntries,
      nonFitEntries: entryPack.nonFitEntries
    };
  });
  saveState(state);
  updateChecklistFile(state, allCategories);

  for (let i = 0; i < selected.length; i += 1) {
    const category = selected[i];
    const categoryId = String(category.id || '');
    console.log(`\n[Category autorun] ${i + 1}/${selected.length} -> ${categoryId}`);
    const result = await runCategory(category, args, state);
    saveState(state);
    updateChecklistFile(state, allCategories);

    if (result.passed) {
      console.log(`[PASS] ${result.categoryId} lofty=${result.lofty ? 'yes' : 'no'} report=${result.reportPath}`);
    } else {
      const failSummary = result.failedGates.map((gate) => `${gate.name}(${gate.details})`).join(' | ');
      console.log(`[FAIL] ${result.categoryId} ${failSummary}`);
      console.log(`[FAIL] report=${result.reportPath}`);
      if (args.stopOnFail) {
        process.exitCode = 2;
        return;
      }
    }
  }

  console.log(`\n[Category autorun] complete. checklist=${CHECKLIST_MD}`);
}

main().catch((error) => {
  console.error(`[Category autorun] failed: ${error && error.message ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
