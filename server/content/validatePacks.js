const fs = require('fs');
const path = require('path');
const { validatePackManifest } = require('./packSchema');

const PACKS_DIR = path.join(__dirname, 'packs');

function main() {
  if (!fs.existsSync(PACKS_DIR)) {
    console.error('No pack directory found:', PACKS_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(PACKS_DIR)
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));

  if (!files.length) {
    console.error('No pack manifests found in', PACKS_DIR);
    process.exit(1);
  }

  let errorCount = 0;
  let warningCount = 0;
  const seenIds = new Set();

  files.forEach((fileName) => {
    const fullPath = path.join(PACKS_DIR, fileName);
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (error) {
      errorCount += 1;
      console.error(`[ERROR] ${fileName}: JSON parse failed (${error.message})`);
      return;
    }

    const result = validatePackManifest(raw, { source: fileName });
    if (!result.ok || !result.pack) {
      result.errors.forEach((msg) => console.error(`[ERROR] ${msg}`));
      result.warnings.forEach((msg) => console.warn(`[WARN]  ${msg}`));
      errorCount += result.errors.length || 1;
      warningCount += result.warnings.length;
      return;
    }

    if (seenIds.has(result.pack.id)) {
      errorCount += 1;
      console.error(`[ERROR] ${fileName}: duplicate id "${result.pack.id}"`);
      return;
    }
    seenIds.add(result.pack.id);

    result.warnings.forEach((msg) => console.warn(`[WARN]  ${msg}`));
    warningCount += result.warnings.length;

    const scenarioCount = Array.isArray(result.pack.gameplay.scenarioCards)
      ? result.pack.gameplay.scenarioCards.length
      : 0;
    const twistAddCount = ['easy', 'normal', 'hard']
      .reduce((sum, key) => sum + ((result.pack.gameplay.twistAdds[key] || []).length), 0);
    console.log(`[OK]    ${fileName} -> ${result.pack.id} (${scenarioCount} scenarios, ${twistAddCount} twist adds)`);
  });

  console.log(`Pack validation summary: ${files.length} file(s), ${errorCount} error(s), ${warningCount} warning(s)`);
  if (errorCount > 0) process.exit(1);
}

main();
