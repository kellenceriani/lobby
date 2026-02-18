// Chemistry Bonus: Name-pattern based, NO DATABASE LOOKUPS

function calculateChemistryDetails(characterNames) {
  // characterNames = ['Batman', 'Superman', 'Wonder Woman', ...]
  const normalized = characterNames.map(name => name.toLowerCase());
  const details = [];
  let bonus = 5; // Base: 5 points

  // Detect superhero theme
  const superheroMatches = characterNames.filter(name =>
    /man|woman|hero|spider|captain|iron|thor|flash|green|batman|superman|wonder/i.test(name)
  );
  if (superheroMatches.length >= 3) {
    bonus += 3;
    details.push({
      label: 'Superhero theme',
      bonus: 3,
      matches: superheroMatches
    });
  }

  // Detect historical/real figures
  const historicalMatches = characterNames.filter(name =>
    /einstein|leonardo|marie|abraham|george|thomas|washington|jefferson|lincoln/i.test(name)
  );
  if (historicalMatches.length >= 3) {
    bonus += 2;
    details.push({
      label: 'Historical figures',
      bonus: 2,
      matches: historicalMatches
    });
  }

  // Detect movie/fictional franchise (same keyword)
  const franchiseMatches = {};
  const franchiseList = ['harry potter', 'lord of the rings', 'marvel', 'dc', 'disney', 'star wars', 'avenger', 'x-men', 'star trek'];
  characterNames.forEach(name => {
    franchiseList.forEach(franchise => {
      if (name.toLowerCase().includes(franchise)) {
        franchiseMatches[franchise] = (franchiseMatches[franchise] || 0) + 1;
      }
    });
  });

  Object.entries(franchiseMatches).forEach(([franchise, count]) => {
    if (count >= 2) {
      bonus += 2;
      const matched = characterNames.filter(name => name.toLowerCase().includes(franchise));
      details.push({
        label: `Franchise: ${franchise}`,
        bonus: 2,
        matches: matched
      });
    }
  });

  // Penalty: All single-word names (likely lazy/unplanned)
  const allSingle = characterNames.every(name => name.split(/\s+/).length === 1);
  if (allSingle) {
    bonus -= 2;
    details.push({
      label: 'All single-word names',
      bonus: -2,
      matches: characterNames
    });
  }

  // Clamp to 0-10
  const finalBonus = Math.max(0, Math.min(10, Math.round(bonus * 10) / 10));
  return { bonus: finalBonus, details };
}

function calculateChemistryBonus(characterNames) {
  return calculateChemistryDetails(characterNames).bonus;
}

module.exports = { calculateChemistryBonus, calculateChemistryDetails };
