const { scoreCharacter, fetchCharacterInfo } = require('./evaluator');

const SCENARIOS = [
  { name: 'combat-space', scenario: 'SAVE A CITY FROM A COSMIC THREAT', twist: 'IN ZERO GRAVITY' },
  { name: 'investigation', scenario: 'SOLVE A LOCKED-ROOM MYSTERY', twist: 'WHILE BLINDFOLDED' },
  { name: 'social', scenario: 'CONVINCE A WORLD LEADER TO COOPERATE', twist: 'WITHOUT SPEAKING' },
  { name: 'survival', scenario: 'SURVIVE A SHIPWRECK', twist: 'DURING A STORM' },
  { name: 'time', scenario: 'PREVENT A CATASTROPHE', twist: 'WHERE TIME MOVES BACKWARDS' }
];

const CHARACTER_BUCKETS = {
  mainstream: ['Superman', 'Batman', 'Sherlock Holmes', 'Tony Stark', 'Hermione Granger'],
  obscureAnime: ['Lain Iwakura', 'Boogiepop', 'Kaiji Itou', 'Ergo Proxy', 'Kino (Kino no Tabi)'],
  celebrities: ['Adele', 'Saoirse Ronan', 'Hideo Kojima', 'Frida Kahlo', 'Usain Bolt'],
  firstNames: ['Loid', 'Asta', 'Ayanokoji', 'Daenerys', 'Ichika'],
  randomNiche: ['The Noid', 'Cú Chulainn', 'Moomintroll', 'Vash the Stampede', 'Nico Robin'],
  obscureCartoons: ['Mao Mao', 'Kiff Chatterley', 'Top Cat', 'Snufkin', 'Yakko Warner'],
  historicalPeople: ['Boudica', 'Ibn Sina', 'Murasaki Shikibu', 'Suleiman the Magnificent', 'Thutmose III'],
  lastNames: ['Forger', 'Holmes', 'Skywalker', 'Targaryen', 'Pevensie'],
  animals: ['Axolotl', 'Tardigrade', 'Peregrine Falcon', 'Blue Whale', 'Honey Badger'],
  fictionalAnimals: ['Toothless', 'Appa', 'Scooby-Doo', 'Momo (Avatar)', 'Salem Saberhagen']
};

function flattenBuckets() {
  return Object.entries(CHARACTER_BUCKETS).flatMap(([bucket, names]) =>
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
    SCENARIOS.map(async ({ scenario, twist }) => scoreCharacter(entry.name, scenario, twist))
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
  const byBucket = Object.keys(CHARACTER_BUCKETS).map(bucket => {
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

(async () => {
  const entries = flattenBuckets();
  console.log(`Running viability harness for ${entries.length} entries across ${SCENARIOS.length} scenarios...`);

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
