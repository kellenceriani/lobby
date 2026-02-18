// Chemistry Bonus: Name-pattern based, NO DATABASE LOOKUPS

const CHEMISTRY_MIN = 0;
const CHEMISTRY_MAX = 15;
const CHEMISTRY_BASE = 5;

const FEATURE_RULES = [
  { key: 'superhero', label: 'Superhero theme', bonus: 3, min: 3, regex: /hero|superman|batman|spider|captain|iron|thor|flash|wonder|avenger|x[-\s]?men/i },
  { key: 'historical', label: 'Historical figures', bonus: 2, min: 3, regex: /einstein|leonardo|marie|abraham|george|thomas|washington|jefferson|lincoln|cleopatra/i },
  { key: 'magic', label: 'Magic affinity', bonus: 2, min: 2, regex: /wizard|mage|sorcerer|witch|spell|dragon|arcane|necromancer|warlock|paladin/i },
  { key: 'tech', label: 'Tech affinity', bonus: 2, min: 2, regex: /robot|android|cyborg|ai|mech|engineer|inventor|hacker|pilot|astronaut/i },
  { key: 'stealth', label: 'Stealth crew', bonus: 2, min: 2, regex: /ninja|assassin|spy|thief|rogue|shadow|agent/i },
  { key: 'brawl', label: 'Brawler squad', bonus: 2, min: 2, regex: /fighter|warrior|soldier|knight|boxer|samurai|viking|gladiator|hulk/i },
  { key: 'animals', label: 'Animal affinity', bonus: 2, min: 2, regex: /wolf|dragon|beast|horse|lion|tiger|hawk|bear|rider|tamer|trainer|ranger/i },
  { key: 'space', label: 'Space crew', bonus: 2, min: 2, regex: /space|galaxy|planet|alien|starship|astronaut|cosmic/i }
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

const PROSTHETIC_KEYWORDS = ['cyborg', 'android', 'bionic', 'prosthetic', 'mech', 'robot', 'arm', 'hook', 'peg'];
const ANIMAL_BOND_NAMES = ['hiccup', 'daenerys', 'sansa', 'arya'];

const FRANCHISE_LIST = [
  'harry potter', 'lord of the rings', 'marvel', 'dc', 'disney', 'star wars', 'avenger', 'x-men', 'star trek',
  'pokemon', 'naruto', 'one piece', 'dragon ball'
];

function extractMatches(characterNames, predicate) {
  return characterNames.filter(name => predicate(name.toLowerCase()));
}

function addDetail(details, label, bonus, matches) {
  if (!matches || matches.length === 0) return 0;
  details.push({ label, bonus, matches });
  return bonus;
}

function matchByKeywords(names, keywords) {
  return names.filter(name => keywords.some(kw => name.includes(kw)));
}

function calculateChemistryDetails(characterNames) {
  const normalized = characterNames.map(name => name.toLowerCase());
  const details = [];
  let bonus = CHEMISTRY_BASE;

  FEATURE_RULES.forEach(rule => {
    const matches = characterNames.filter(name => rule.regex.test(name));
    if (matches.length >= rule.min) {
      bonus += addDetail(details, rule.label, rule.bonus, matches);
    }
  });

  const goodMatches = matchByKeywords(normalized, GOOD_KEYWORDS);
  if (goodMatches.length >= 2) {
    bonus += addDetail(
      details,
      'Good-aligned synergy',
      goodMatches.length >= 3 ? 3 : 2,
      characterNames.filter(name => goodMatches.includes(name.toLowerCase()))
    );
  }

  const evilMatches = matchByKeywords(normalized, EVIL_KEYWORDS);
  if (evilMatches.length >= 2) {
    bonus += addDetail(
      details,
      'Villain synergy',
      evilMatches.length >= 3 ? 3 : 2,
      characterNames.filter(name => evilMatches.includes(name.toLowerCase()))
    );
  }

  if (goodMatches.length >= 2 && evilMatches.length >= 2) {
    bonus += addDetail(details, 'Polarized roster', -1, characterNames);
  }

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
    bonus += addDetail(details, 'Balanced roles (brains + brawn + support)', 3, comboMatches);
  }

  const riderMatches = extractMatches(characterNames, name => /rider|tamer|trainer|ranger/i.test(name));
  const beastMatches = extractMatches(characterNames, name => /dragon|wolf|beast|horse|lion|tiger|hawk|bear/i.test(name));
  if (riderMatches.length >= 1 && beastMatches.length >= 1) {
    bonus += addDetail(details, 'Rider/animal bond', 2, [...new Set([...riderMatches, ...beastMatches])]);
  }

  const prostheticMatches = extractMatches(characterNames, name => PROSTHETIC_KEYWORDS.some(kw => name.includes(kw)));
  if (prostheticMatches.length >= 2) {
    bonus += addDetail(details, 'Shared prosthetic/augments', 1, prostheticMatches);
  }

  const animalBondMatches = extractMatches(characterNames, name => ANIMAL_BOND_NAMES.some(kw => name.includes(kw)));
  if (animalBondMatches.length >= 2) {
    bonus += addDetail(details, 'Known animal-bond heroes', 2, animalBondMatches);
  }

  const franchiseMatches = {};
  characterNames.forEach(name => {
    FRANCHISE_LIST.forEach(franchise => {
      if (name.toLowerCase().includes(franchise)) {
        franchiseMatches[franchise] = (franchiseMatches[franchise] || 0) + 1;
      }
    });
  });

  Object.entries(franchiseMatches).forEach(([franchise, count]) => {
    if (count >= 2) {
      const matched = characterNames.filter(name => name.toLowerCase().includes(franchise));
      bonus += addDetail(details, `Franchise: ${franchise}`, 2, matched);
    }
  });

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
      bonus += addDetail(details, 'Shared surname/identity', 1, matched);
    }
  });

  const allSingle = characterNames.every(name => name.split(/\s+/).length === 1);
  if (allSingle) {
    bonus += addDetail(details, 'All single-word names', -2, characterNames);
  }

  const finalBonus = Math.max(CHEMISTRY_MIN, Math.min(CHEMISTRY_MAX, Math.round(bonus * 10) / 10));
  return { bonus: finalBonus, details };
}

function calculateChemistryBonus(characterNames) {
  return calculateChemistryDetails(characterNames).bonus;
}

module.exports = { calculateChemistryBonus, calculateChemistryDetails };
