const https = require('https');

// Cache: { characterName: { data, timestamp } }
const FETCH_CACHE = new Map();
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

function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ');
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

// Enhanced Wikipedia fetch with better structured data extraction
async function fetchFromWikipediaEnhanced(character) {
  const normalized = normalizeName(character);
  const query = encodeURIComponent(normalized);
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${query}&prop=extracts|pageprops&explaintext=true&format=json&origin=*`;
  
  try {
    const json = await getJson(url);
    if (!json || !json.query || !json.query.pages) return null;

    const pages = json.query.pages;
    const firstPage = Object.values(pages)[0];

    if (firstPage && firstPage.extract && !firstPage.extract.includes('Disambiguation') && !firstPage.extract.includes('may refer to')) {
      const profession = extractProfessionFromWikipedia(firstPage.extract);
      return {
        source: 'wikipedia',
        description: firstPage.extract.substring(0, 500),
        title: firstPage.title,
        profession: profession,
        pageprops: firstPage.pageprops || {}
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
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&srlimit=3&format=json&origin=*`;

  try {
    const json = await getJson(url);
    const results = json && json.query && json.query.search ? json.query.search : [];
    
    // Try top 3 results
    for (const result of results) {
      if (result.title) {
        const pageResult = await fetchFromWikipediaEnhanced(result.title);
        if (pageResult) return pageResult;
      }
    }

    // Refined fallback: search with "character" context
    if (normalized.split(/\s+/).length <= 2 && results.length === 0) {
      const charQuery = encodeURIComponent(`${normalized} character fictional`);
      const charUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${charQuery}&srlimit=3&format=json&origin=*`;
      const charJson = await getJson(charUrl);
      const charResults = charJson && charJson.query && charJson.query.search ? charJson.query.search : [];
      
      for (const result of charResults) {
        if (result.title) {
          const pageResult = await fetchFromWikipediaEnhanced(result.title);
          if (pageResult) return pageResult;
        }
      }
    }

    // Try with quotes for exact phrase
    const exactQuery = encodeURIComponent(`"${normalized}"`);
    const exactUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${exactQuery}&srlimit=2&format=json&origin=*`;
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
    const description = (info.description + (info.title || '')).toLowerCase();
    const scenarioLower = scenario.toLowerCase();
    const twistLower = twist.toLowerCase();
    const keywords = description.split(/\s+/).filter(kw => kw.length > 4).slice(0, 60);
    const matchCount = keywords.filter(kw => scenarioLower.includes(kw) || twistLower.includes(kw)).length;
    // Removed "Low relevance" text - now in detailed breakdown modal
    const matchNote = matchCount >= 3 ? 'Strong match to scenario/twist.' : matchCount >= 1 ? 'Some relevance to scenario/twist.' : '';
    if (matchNote) notes.push(matchNote);
    notes.push(`Name signal: ${wordCount}-word pick.`);
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

function buildBreakdown({ validation, info, scenario, twist, score, nameSignals, relevance, ovrData, scoreBreakdownSteps }) {
  const breakdown = {
    characterSummary: '',
    scenarioRelevance: '',
    twistRelevance: '',
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
  if (relevance && relevance.points > 0) {
    const description = info ? `${info.description || ''} ${info.title || ''}`.toLowerCase() : '';
    const scenarioTokens = tokenize(scenario);
    const descriptionTokens = tokenize(description);
    const overlap = countOverlap(descriptionTokens, scenarioTokens);
    
    if (overlap >= 5) {
      breakdown.scenarioRelevance = `Excellent fit! Found ${overlap} keyword matches between character description and scenario. ${relevance.note || ''}`;
    } else if (overlap >= 3) {
      breakdown.scenarioRelevance = `Good fit. Found ${overlap} keyword matches with the scenario. ${relevance.note || ''}`;
    } else if (overlap >= 1) {
      breakdown.scenarioRelevance = `Moderate fit. Found ${overlap} keyword match(es) with the scenario. ${relevance.note || ''}`;
    } else {
      breakdown.scenarioRelevance = `Limited direct connection to scenario keywords, but may have thematic relevance. ${relevance.note || ''}`;
    }
  } else if (nameSignals && nameSignals.note && nameSignals.note.includes('name matches scenario')) {
    breakdown.scenarioRelevance = `Character name directly references scenario keywords, showing strong selection strategy.`;
  } else {
    breakdown.scenarioRelevance = info 
      ? `No strong keyword overlap with scenario. Character may still contribute through team dynamics or creative interpretation.`
      : `Unknown character with no database info to assess scenario fit. Scored on name structure alone.`;
  }

  // Twist Relevance
  if (relevance && relevance.points > 0) {
    const description = info ? `${info.description || ''} ${info.title || ''}`.toLowerCase() : '';
    const twistTokens = tokenize(twist);
    const descriptionTokens = tokenize(description);
    const overlap = countOverlap(descriptionTokens, twistTokens);
    
    if (overlap >= 5) {
      breakdown.twistRelevance = `Excellent twist synergy! Found ${overlap} keyword matches with the plot twist.`;
    } else if (overlap >= 3) {
      breakdown.twistRelevance = `Good twist alignment. Found ${overlap} keyword matches that complement the twist.`;
    } else if (overlap >= 1) {
      breakdown.twistRelevance = `Some twist relevance. Found ${overlap} keyword match(es) with the twist element.`;
    } else {
      const domains = getDomainMatches(scenario, twist, description);
      if (domains.length > 0) {
        breakdown.twistRelevance = `Thematic connection through ${domains.join(', ')} elements.`;
      } else {
        breakdown.twistRelevance = `No direct keyword overlap with twist, but character may adapt based on abilities.`;
      }
    }
  } else {
    breakdown.twistRelevance = info
      ? `Limited connection to twist keywords. Success may depend on creative strategy and team synergy.`
      : `Unknown character - cannot assess twist relevance from database.`;
  }

  // OVR Breakdown with percentages
  if (ovrData) {
    const baseOVR = Math.round((score / SCORE_MAX) * 70);
    const rarityBonus = detectRarity(ovrData.rarity);
    
    // Calculate attribute bonus
    const attributeValues = Object.values(ovrData.attributes || {});
    const topStats = attributeValues.sort((a, b) => b - a).slice(0, 3);
    const attributeBonus = topStats.length > 0 ? Math.round(topStats.reduce((sum, val) => sum + val, 0) / 3 * 0.15) : 0;
    
    const scenarioFit = calculateScenarioFitValue(info, scenario, twist);
    
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

function detectRarity(rarityTier) {
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
    'Rare': `Rare character with notable recognition (+${bonus})`,
    'Common': `Common/known character (+${bonus})`,
    'Bronze': `Unknown or unrecognized character (no bonus)`
  };
  return explanations[rarityTier] || `Character rarity: ${rarityTier} (+${bonus})`;
}

function calculateScenarioFitValue(info, scenario, twist) {
  if (!info) return 0.9;
  
  const description = `${info.description || ''} ${info.title || ''}`.toLowerCase();
  const scenarioTokens = tokenize(scenario);
  const twistTokens = tokenize(twist);
  const descriptionTokens = tokenize(description);
  const combinedTokens = scenarioTokens.concat(twistTokens);
  const overlap = countOverlap(descriptionTokens, combinedTokens);
  
  if (overlap >= 8) return 1.2;
  if (overlap >= 5) return 1.1;
  if (overlap >= 3) return 1.05;
  if (overlap >= 1) return 1.0;
  return 0.95;
}

function getScenarioFitExplanation(multiplier) {
  if (multiplier >= 1.2) return `Perfect scenario fit: 20% bonus multiplier`;
  if (multiplier >= 1.1) return `Excellent scenario fit: 10% bonus multiplier`;
  if (multiplier >= 1.05) return `Good scenario fit: 5% bonus multiplier`;
  if (multiplier >= 1.0) return `Neutral scenario fit: no penalty or bonus`;
  if (multiplier >= 0.95) return `Slight scenario mismatch: 5% penalty`;
  return `Poor scenario fit: ${Math.round((1 - multiplier) * 100)}% penalty`;
}

const TITLE_KEYWORDS = ['dr', 'doctor', 'professor', 'sir', 'lady', 'captain', 'king', 'queen', 'lord', 'saint', 'detective', 'agent'];
const ROLE_KEYWORDS = ['wizard', 'mage', 'ninja', 'samurai', 'pirate', 'soldier', 'knight', 'warrior', 'scientist', 'engineer', 'inventor', 'chef', 'pilot', 'spy', 'assassin'];
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

function scoreRelevance(info, scenario, twist) {
  if (!info) return { points: 0, note: null };
  const description = `${info.description || ''} ${info.title || ''}`.toLowerCase();
  const scenarioTokens = tokenize(scenario);
  const twistTokens = tokenize(twist);
  const descriptionTokens = tokenize(description);
  const overlap = countOverlap(descriptionTokens, scenarioTokens.concat(twistTokens));
  const overlapPoints = overlap >= 8 ? 8 : overlap >= 5 ? 6 : overlap >= 3 ? 4 : overlap >= 1 ? 2 : 0;
  const domains = getDomainMatches(scenario, twist, description);
  const domainPoints = Math.min(6, domains.length * 2);
  const total = overlapPoints + domainPoints;
  const note = domains.length
    ? `Relevance boost: ${domains.join(', ')} themes.`
    : overlap > 0
      ? 'Some direct overlap with scenario/twist.'
      : 'Limited direct overlap with scenario/twist.';
  return { points: total, note };
}

function scoreNameSignals(character, validation, scenario, twist) {
  const signals = [];
  let points = 0;
  const wordCount = validation.wordCount || 0;
  const trimmed = character.trim();
  const lower = trimmed.toLowerCase();

  if (wordCount === 2) { points += 3; signals.push('two-word name'); }
  else if (wordCount === 3) { points += 2; signals.push('three-word name'); }
  else if (wordCount >= 4) { points -= 2; signals.push('long name'); }

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
  const query = encodeURIComponent(normalizeName(character));
  const url = `https://www.wikidata.org/w/api.php?action=query&titles=${query}&format=json&origin=*`;
  const json = await getJson(url);
  if (!json || !json.query || !json.query.pages) return null;

  const pages = json.query.pages;
  const firstPage = Object.values(pages)[0];
  if (firstPage && firstPage.pageid) {
    return {
      source: 'wikidata',
      description: `Wikidata entry: ${normalizeName(character)}`,
      found: true
    };
  }

  return null;
}

async function fetchFromFandom(character) {
  const normalized = normalizeName(character);
  const searchUrl = `https://community.fandom.com/api/v1/Search/List?query=${encodeURIComponent(normalized)}&limit=1&ns=0`;
  const searchJson = await getJson(searchUrl);
  const item = searchJson && searchJson.items && searchJson.items[0];
  if (!item || !item.url) return null;

  try {
    const parsedUrl = new URL(item.url);
    const wikiIndex = parsedUrl.pathname.indexOf('/wiki/');
    if (wikiIndex === -1) return null;
    const articleTitle = decodeURIComponent(parsedUrl.pathname.slice(wikiIndex + 6));
    const apiUrl = `https://${parsedUrl.hostname}/api.php?action=query&titles=${encodeURIComponent(articleTitle)}&prop=extracts&explaintext=true&format=json&origin=*`;
    const pageJson = await getJson(apiUrl);
    if (!pageJson || !pageJson.query || !pageJson.query.pages) return null;
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
    return null;
  }

  return null;
}

// ========== STEP 4: TIERED FETCH ORCHESTRATION ==========
async function fetchCharacterInfo(character) {
  // Try cache first
  const cached = getCachedCharacter(character);
  if (cached) return cached;
  
  // Try enhanced tiers in order
  let result = await fetchFromWikipediaEnhanced(character);
  if (result) {
    setCachedCharacter(character, result);
    return result;
  }

  result = await fetchFromWikipediaSummary(character);
  if (result) {
    setCachedCharacter(character, result);
    return result;
  }

  result = await fetchFromWikipediaSearchEnhanced(character);
  if (result) {
    setCachedCharacter(character, result);
    return result;
  }

  result = await fetchFromFandom(character);
  if (result) {
    setCachedCharacter(character, result);
    return result;
  }
  
  result = await fetchFromOMDb(character);
  if (result) {
    setCachedCharacter(character, result);
    return result;
  }
  
  result = await fetchFromWikidata(character);
  if (result) {
    setCachedCharacter(character, result);
    return result;
  }
  
  return null; // All APIs failed
}

// ========== STEP 5: SCORING LOGIC ==========
// Called for EACH CHARACTER across ALL TEAMS (up to 36 times)
async function scoreCharacter(character, scenario, twist) {
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
        breakdown: buildBreakdown({ validation, info: null, scenario, twist, score: 0, nameSignals: null, relevance: null, ovrData: { ovr: mapScoreToOVR(0), tier: getOVRTier(mapScoreToOVR(0)), rarity: 'Bronze', type: 'balanced', attributes: {} } })
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
        breakdown: buildBreakdown({ validation, info: null, scenario, twist, score: 4, nameSignals: null, relevance: null, ovrData: { ovr: mapScoreToOVR(4), tier: getOVRTier(mapScoreToOVR(4)), rarity: 'Bronze', type: 'balanced', attributes: {} } })
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
  
  const relevance = scoreRelevance(info, scenario, twist);
  score += relevance.points;
  if (relevance.points !== 0) {
    scoreBreakdownSteps.push({ step: 'Scenario/Twist Relevance', points: relevance.points, description: relevance.note });
  }

  if (info && validation.wordCount > 1) {
    score += 2;
    scoreBreakdownSteps.push({ step: 'Multi-word Bonus', points: 2, description: 'Character has a multi-word name' });
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
      validation,
      info,
      scenario,
      twist,
      score: Math.round(score),
      nameSignals,
      relevance,
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
  
  // Wikipedia found: +4
  if (info && info.source === 'wikipedia') return 4;
  
  // Any info found: +2
  if (info) return 2;
  
  // Common/Unknown: +0
  return 0;
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
  const characterText = `${character} ${info ? info.description || '' : ''}`.toLowerCase();
  const profession = info ? info.profession || '' : '';
  
  // Token overlap (basic matching)
  const scenarioTokens = tokenize(scenarioText);
  const charTokens = tokenize(characterText);
  const overlap = countOverlap(charTokens, scenarioTokens);
  
  let multiplier = 1.0;
  
  // Perfect fit: 3+ token overlaps (e.g., "Batman" vs "Crime Fighting", "Gadgets")
  if (overlap >= 5) {
    multiplier = 1.25; // Increased from 1.2
  } 
  // Great fit: 2-3 overlaps
  else if (overlap >= 3) {
    multiplier = 1.18; // Increased from 1.15
  } 
  // Good fit: 1-2 overlaps
  else if (overlap >= 1) {
    multiplier = 1.1;
  }
  
  // Profession-based matching (new)
  if (profession) {
    const professionLower = profession.toLowerCase();
    // Check if profession keywords match scenario context
    const professionBonus = 0.05; // 5% bonus per profession match
    
    // Combat/Action scenarios
    if ((scenario.includes('DEFEAT') || scenario.includes('FIGHT') || scenario.includes('SURVIVE')) 
        && (professionLower.includes('warrior') || professionLower.includes('fighter') || professionLower.includes('warrior'))) {
      multiplier += professionBonus;
    }
    
    // Building/Creation scenarios
    if ((scenario.includes('BUILD') || scenario.includes('CREATE') || scenario.includes('DESIGN')) 
        && (professionLower.includes('engineer') || professionLower.includes('inventor') || professionLower.includes('scientist'))) {
      multiplier += professionBonus;
    }
    
    // Investigation/Strategy scenarios
    if ((scenario.includes('SOLVE') || scenario.includes('UNCOVER') || scenario.includes('STRATEGIZE')) 
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
