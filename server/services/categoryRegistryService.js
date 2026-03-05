const fs = require('fs');
const path = require('path');

const REGISTRY_FILE = path.join(__dirname, '..', 'content', 'categories', 'registry.v1.json');
const CATEGORY_MODES = new Set(['off', 'host_select', 'smart_random', 'group_vote']);
const DEFAULT_CATEGORY_SETTINGS = Object.freeze({
  categoriesMode: 'smart_random',
  categoryId: null,
  categoryVoteOptions: [],
  categoryVersion: 'v1'
});

let REGISTRY_CACHE = null;
const RULE_MATCHER_CACHE = new Map();

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

function asSlug(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  return /^[a-z0-9-]{2,80}$/.test(normalized) ? normalized : '';
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
  athletes: Object.freeze({
    core: ['professional athlete', 'olympian', 'champion athlete', 'sports star'],
    related: ['competition performance', 'athletic training', 'season stats'],
    support: ['coach', 'trainer', 'sports staff']
  }),
  'combat-sports': Object.freeze({
    core: ['boxing', 'mma', 'kickboxing', 'muay thai', 'grappling', 'fight sport'],
    related: ['fight camp', 'weight class', 'combat league'],
    support: ['coach', 'cornerman', 'referee']
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
    core: ['head of state', 'prime minister', 'president', 'national leader'],
    related: ['state policy', 'international summit', 'government leadership'],
    support: ['diplomatic corps', 'cabinet']
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
    'Conor McGregor', 'Ronda Rousey', 'Khabib Nurmagomedov', 'Amanda Nunes', 'Floyd Mayweather', 'Jon Jones'
  ]),
  medical: Object.freeze([
    'Florence Nightingale', 'Jonas Salk', 'Anthony Fauci', 'Atul Gawande', 'Paul Farmer', 'Harvey Cushing',
    'Virginia Apgar', 'Elizabeth Blackwell', 'Sanjay Gupta', 'Christiaan Barnard', 'Mae Jemison', 'Patch Adams'
  ]),
  sports: Object.freeze([
    'Michael Jordan', 'Lionel Messi', 'LeBron James', 'Serena Williams', 'Tom Brady', 'Tiger Woods',
    'Shohei Ohtani', 'Usain Bolt', 'Roger Federer', 'Simone Biles', 'Mookie Betts', 'George Kittle'
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
    'Black Panther', 'Thor', 'Doctor Strange', 'The Flash', 'Hulk', 'Captain Marvel'
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
    'Zatanna', 'Morgana', 'Dumbledore', 'Circe', 'Raven', 'Loki'
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
    'Margaret Thatcher', 'Barack Obama', 'Lee Kuan Yew', 'Volodymyr Zelenskyy', 'Mahatma Gandhi', 'Franklin D. Roosevelt'
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
  if (id.includes('revolution') || id.includes('conflict') || id.includes('diplomacy') || id.includes('treaty')) return 'leaders';
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
  const modeRaw = String(safe.categoriesMode || DEFAULT_CATEGORY_SETTINGS.categoriesMode).trim().toLowerCase();
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
  const aliasHits = countRuleHits(corpusNormalized, category.aliases, { allowLooseStem: false });
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
  const primaryNameHits = Math.max(
    countRuleHits(rawNameNormalized, signalPack.primaryNameSignals || [], { allowLooseStem: false }),
    countRuleHits(resolvedNameNormalized, signalPack.primaryNameSignals || [], { allowLooseStem: false }),
    countRuleHits(aliasNameNormalized, signalPack.primaryNameSignals || [], { allowLooseStem: false })
  );
  const supportNameHits = Math.max(
    countRuleHits(rawNameNormalized, signalPack.supportNameSignals || [], { allowLooseStem: false }),
    countRuleHits(resolvedNameNormalized, signalPack.supportNameSignals || [], { allowLooseStem: false }),
    countRuleHits(aliasNameNormalized, signalPack.supportNameSignals || [], { allowLooseStem: false })
  );
  const derivedCoreHits = Math.max(0, coreHits - strictCoreHits);
  const positiveEvidenceHits = strictCoreHits + derivedCoreHits + relatedHits;
  const conflictHits = exclusionHits + weakExampleHits + negativeSignalHits;
  const strongMembershipEvidence =
    strictCoreHits >= 1
    || derivedCoreHits >= 2
    || (primaryNameHits >= 1 && (supportNameHits >= 1 || relatedHits >= 1));
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
  if (primaryNameHits > 0) membershipConfidence += 6;
  if (supportNameHits > 0) membershipConfidence += 4;
  if (!strongMembershipEvidence && relatedHits > 0) membershipConfidence -= 2;
  if (supportOnlyEvidence) membershipConfidence -= 6;
  if (positiveEvidenceHits <= 0) membershipConfidence -= 12;
  else if (positiveEvidenceHits === 1) membershipConfidence -= 6;
  if (lowEvidence) membershipConfidence -= positiveEvidenceHits >= 2 ? 2 : 5;
  if (safeConfidenceName < 0.72) membershipConfidence -= strongMembershipEvidence ? 3 : 8;
  if (riskSet.has('high_candidate_ambiguity')) membershipConfidence -= strongMembershipEvidence ? 4 : 10;
  if (riskSet.has('dangerous_title_diff_suspected')) membershipConfidence -= strongMembershipEvidence ? 8 : 16;
  if (riskSet.has('fast_round_timeout_fallback') && !strongMembershipEvidence) membershipConfidence -= 4;
  if (explicitNameAnchored && !supportOnlyEvidence) membershipConfidence = Math.max(membershipConfidence, 52);
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
  if (membershipConfidence >= 72 && withinCategoryPowerRank >= 40) inCategoryBonus = 14;
  else if (membershipConfidence >= 58 && withinCategoryPowerRank >= 34) inCategoryBonus = 8;
  else if (membershipConfidence >= 48 && withinCategoryPowerRank >= 30) inCategoryBonus = 4;
  if (!strongMembershipEvidence) {
    inCategoryBonus = Math.min(inCategoryBonus, relatedHits >= 2 ? 2 : 0);
  }
  if (supportOnlyEvidence) {
    inCategoryBonus = Math.min(inCategoryBonus, 1);
    if (eligibilityPenalty > -2) eligibilityPenalty = -2;
  }
  if (primaryNameHits > 0 && !supportOnlyEvidence) {
    inCategoryBonus = Math.max(inCategoryBonus, 4);
  }
  if (explicitNameAnchored && !supportOnlyEvidence) {
    inCategoryBonus = Math.max(inCategoryBonus, 6);
  }
  if (derivedCoreHits >= 3 && conflictHits === 0 && !supportOnlyEvidence) {
    inCategoryBonus = Math.max(inCategoryBonus, 6);
  }

  let netImpact = clamp(inCategoryBonus + eligibilityPenalty, -30, 20);
  let categoryFit = clamp(rawCategoryFit + netImpact, 0, 100);
  if (!strongMembershipEvidence) {
    categoryFit = Math.min(categoryFit, relatedHits >= 2 ? 68 : 40);
  }
  if (supportOnlyEvidence) {
    categoryFit = Math.min(categoryFit, 62);
  }
  if (primaryNameHits > 0 && !supportOnlyEvidence) {
    categoryFit = Math.max(categoryFit, 60);
  }
  if (explicitNameAnchored && !supportOnlyEvidence) {
    categoryFit = Math.max(categoryFit, 68);
  }
  if (supportNameHits > 0 && !strongMembershipEvidence) {
    categoryFit = Math.max(categoryFit, 45);
  }
  if (strictCoreHits >= 2 && primaryNameHits >= 1 && conflictHits === 0 && !supportOnlyEvidence) {
    categoryFit = Math.max(categoryFit, 70);
  } else if (strictCoreHits >= 1 && primaryNameHits >= 1 && conflictHits === 0 && !supportOnlyEvidence) {
    categoryFit = Math.max(categoryFit, 66);
  }

  let categoryStatus = 'not_in_category';
  let categoryStatusLabel = 'NOT IN CATEGORY';
  let categoryStatusTone = 'negative';
  let categoryStatusIcon = 'thumbs_down';
  const primaryNameQualified = primaryNameHits > 0 && categoryFit >= 60 && membershipConfidence >= 50;
  const derivedCoreQualified = derivedCoreHits >= 3 && conflictHits === 0 && categoryFit >= 66 && membershipConfidence >= 50;
  const strictCoreQualified = strictCoreHits >= 2 && conflictHits <= 1 && categoryFit >= 58 && membershipConfidence >= 46;
  if (
    (
      (categoryFit >= 67 && membershipConfidence >= 58 && netImpact >= 0)
      || primaryNameQualified
      || derivedCoreQualified
      || strictCoreQualified
    )
    && strongMembershipEvidence
    && anchorMembershipEvidence
    && conflictHits <= 2
    && !supportOnlyEvidence
    && !supportNameOnly
  ) {
    categoryStatus = 'in_category';
    categoryStatusLabel = 'IN CATEGORY';
    categoryStatusTone = 'positive';
    categoryStatusIcon = 'thumbs_up';
  } else if (
    (categoryFit >= 50 && membershipConfidence >= 36)
    || (strongMembershipEvidence && categoryFit >= 44 && membershipConfidence >= 30)
    || (primaryNameHits >= 1 && membershipConfidence >= 34)
    || supportNameHits >= 1
    || (supportNameHits >= 1 && relatedHits >= 1 && membershipConfidence >= 28)
    || (derivedCoreHits >= 2 && supportHits >= 1 && conflictHits <= 2)
    || (supportOnlyEvidence && categoryFit >= 55)
    || relatedHits >= 3
  ) {
    categoryStatus = 'borderline';
    categoryStatusLabel = 'BORDERLINE ENTRY';
    categoryStatusTone = 'neutral';
    categoryStatusIcon = 'meh';
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
    anchorInclusionHits,
    anchorAliasHits,
    explain: `Category ${category.displayName}: ${categoryStatusLabel} | fit ${categoryFit}/100, membership ${membershipConfidence}, rank ${withinCategoryPowerRank}, ambiguity ${ambiguityHandling}, impact ${netImpact >= 0 ? '+' : ''}${netImpact} (hits: strict ${strictCoreHits}, core ${coreHits}, related ${relatedHits}, support ${supportHits}, nameCore ${primaryNameHits}, nameSupport ${supportNameHits}, negSig ${negativeSignalHits}, inc ${anchorInclusionHits}, alias ${anchorAliasHits}, strong ${strongExampleHits}, weak ${weakExampleHits}, exc ${exclusionHits}).`
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
