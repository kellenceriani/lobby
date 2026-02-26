const fs = require('fs/promises');
const path = require('path');

const { resolveAudioCalloutBatch } = require('../../services/audioCalloutResolverService');

const ROOT = path.join(__dirname, '..', '..', '..');
const UNUSED_AUDIO_CLIPS_DIR = null;
const OUTPUT_DIR = path.join(__dirname, 'output');
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'entry-samples.json');

function percentile(nums = [], p = 0.5) {
  const rows = nums.filter((n) => Number.isFinite(Number(n))).map(Number).sort((a, b) => a - b);
  if (!rows.length) return 0;
  if (rows.length === 1) return rows[0];
  const idx = Math.max(0, Math.min(rows.length - 1, Math.round((rows.length - 1) * p)));
  return rows[idx];
}

function mean(nums = []) {
  const rows = nums.filter((n) => Number.isFinite(Number(n))).map(Number);
  if (!rows.length) return 0;
  return Math.round(rows.reduce((sum, n) => sum + n, 0) / rows.length);
}

function parseArgs(argv = []) {
  const out = {
    limit: 18,
    includeLogExamples: true,
    noMarkdown: false
  };
  argv.forEach((arg) => {
    const raw = String(arg || '').trim();
    if (!raw) return;
    if (raw === '--noMarkdown' || raw === '--noMarkdown=true') out.noMarkdown = true;
    if (raw === '--includeLogExamples=false') out.includeLogExamples = false;
    if (raw.startsWith('--limit=')) {
      const n = Number(raw.split('=')[1]);
      if (Number.isFinite(n)) out.limit = Math.max(1, Math.min(48, Math.round(n)));
    }
  });
  return out;
}

async function loadFixtureEntries(limit = 18) {
  const raw = await fs.readFile(FIXTURE_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const samples = Array.isArray(parsed && parsed.samples) ? parsed.samples : [];
  return samples.slice(0, limit).map((sample, index) => ({
    character: String(sample && sample.character || `Sample ${index + 1}`),
    resolvedTitle: String(sample && sample.character || `Sample ${index + 1}`),
    aliases: [],
    description: '',
    resolvedSource: 'tts-entry-quality-fixture',
    riskFlags: [],
    imageSynthetic: false,
    infoConfidence: 0.82,
    resolverConfidence: 0.82,
    ovr: 80
  }));
}

function getLogExampleEntries() {
  const names = [
    'Batman',
    'SpongeBob',
    'Tony Stark',
    'Master Chief',
    'Arthur Morgan',
    'Billie Eilish',
    'Sherlock Holmes',
    'Wonder Woman',
    'Harley Quinn',
    'HAL 9000',
    'Danny Phantom',
    'Doctor Doom'
  ];
  return names.map((character) => ({
    character,
    resolvedTitle: character,
    aliases: [],
    description: '',
    resolvedSource: 'tts-blurb-harness-log-seed',
    riskFlags: [],
    imageSynthetic: false,
    infoConfidence: 0.84,
    resolverConfidence: 0.84,
    ovr: 84
  }));
}

function getCalloutAccuracyProbeEntries() {
  return [
    {
      id: 'hero_batman',
      character: 'Batman',
      resolvedTitle: 'Batman',
      description: 'DC Comics superhero and vigilante hero of Gotham City.',
      expectedClassId: 'superhero',
      expectedVoiceStyle: 'heroic'
    },
    {
      id: 'hero_superman',
      character: 'Superman',
      resolvedTitle: 'Superman',
      description: 'DC Comics superhero with powers and heroic rescue role.',
      expectedClassId: 'superhero',
      expectedVoiceStyle: 'heroic'
    },
    {
      id: 'cartoon_spongebob',
      character: 'SpongeBob',
      resolvedTitle: 'SpongeBob SquarePants',
      description: 'Animated cartoon character from Nickelodeon.',
      expectedClassId: 'cartoon',
      expectedVoiceStyle: 'cartoon'
    },
    {
      id: 'robot_hal',
      character: 'HAL 9000',
      resolvedTitle: 'HAL 9000',
      description: 'AI computer system and sentient spacecraft assistant.',
      expectedClassId: 'robot',
      expectedVoiceStyle: 'robotic'
    },
    {
      id: 'detective_sherlock',
      character: 'Sherlock Holmes',
      resolvedTitle: 'Sherlock Holmes',
      description: 'Fictional detective and investigator.',
      expectedClassId: 'detective',
      expectedVoiceStyle: 'cinematic'
    },
    {
      id: 'athlete_lebron',
      character: 'LeBron James',
      resolvedTitle: 'LeBron James',
      description: 'Professional basketball player and athlete.',
      expectedClassId: 'athlete',
      expectedVoiceStyle: 'cinematic'
    },
    {
      id: 'villain_doom',
      character: 'Doctor Doom',
      resolvedTitle: 'Doctor Doom',
      description: 'Marvel supervillain and ruler with dark ambitions.',
      expectedClassId: 'villain',
      expectedVoiceStyle: 'villain'
    },
    {
      id: 'robot_adjacent_jarvis',
      character: 'JARVIS',
      resolvedTitle: 'JARVIS',
      description: 'AI system and virtual assistant for Iron Man.',
      expectedClassId: 'robot',
      expectedVoiceStyle: 'robotic'
    }
  ].map((row) => ({
    ...row,
    aliases: [],
    resolvedSource: 'tts-callout-accuracy-probe',
    riskFlags: [],
    imageSynthetic: false,
    infoConfidence: 0.9,
    resolverConfidence: 0.9,
    ovr: 86
  }));
}

function dedupeEntries(entries = []) {
  const out = [];
  const seen = new Set();
  (Array.isArray(entries) ? entries : []).forEach((row) => {
    if (!row) return;
    const character = String(row.character || '').trim();
    const resolvedTitle = String(row.resolvedTitle || '').trim();
    const key = `${character.toLowerCase()}|${resolvedTitle.toLowerCase()}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(row);
  });
  return out;
}

function analyzeCalloutAccuracyProbe(expectedEntries = [], batchPayload = null) {
  const expected = Array.isArray(expectedEntries) ? expectedEntries : [];
  const rows = Array.isArray(batchPayload && batchPayload.results) ? batchPayload.results : [];
  const byId = new Map(rows.map((row) => {
    const key = `${String(row && row.character || '').trim().toLowerCase()}|${String(row && row.resolvedTitle || '').trim().toLowerCase()}`;
    return [key, row];
  }));

  let classCorrect = 0;
  let styleCorrect = 0;
  let robotFalsePositives = 0;
  const samples = [];

  expected.forEach((entry) => {
    const key = `${String(entry.character || '').trim().toLowerCase()}|${String(entry.resolvedTitle || '').trim().toLowerCase()}`;
    const row = byId.get(key) || null;
    const classId = String(row && row.association && row.association.classId || '');
    const voiceStyle = String(row && row.speech && row.speech.voiceStyle || '');
    const classOk = classId === String(entry.expectedClassId || '');
    const styleOk = voiceStyle === String(entry.expectedVoiceStyle || '');
    if (classOk) classCorrect += 1;
    if (styleOk) styleCorrect += 1;
    if (voiceStyle === 'robotic' && String(entry.expectedVoiceStyle || '') !== 'robotic') {
      robotFalsePositives += 1;
    }
    samples.push({
      id: entry.id,
      character: entry.character,
      expectedClassId: entry.expectedClassId,
      actualClassId: classId || 'unknown',
      classOk,
      expectedVoiceStyle: entry.expectedVoiceStyle,
      actualVoiceStyle: voiceStyle || 'unknown',
      styleOk
    });
  });

  const total = expected.length;
  return {
    samples: total,
    classCorrect,
    classAccuracy: total ? Number((classCorrect / total).toFixed(3)) : 0,
    styleCorrect,
    styleAccuracy: total ? Number((styleCorrect / total).toFixed(3)) : 0,
    robotFalsePositives,
    robotFalsePositiveRate: total ? Number((robotFalsePositives / total).toFixed(3)) : 0,
    examples: samples
  };
}

function isBoilerplateSpeech(text = '') {
  const value = String(text || '').trim();
  if (!value) return true;
  if (/^identity confirmed:/i.test(value)) return true;
  if (/alias (for|match)/i.test(value)) return true;
  if (/resolved from/i.test(value)) return true;
  const words = value.split(/\s+/).filter(Boolean);
  return words.length <= 3;
}

function isSaySomethingLine(text = '') {
  const value = String(text || '').trim();
  if (!value || isBoilerplateSpeech(value)) return false;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 5) return false;
  return /\b(is|are|was|were|has|have|can|will|would|should|must|did|does|do|said|says|known|fights?|leads?|rules?|works?|lives?|builds?|creates?)\b/i.test(value);
}

function analyzeSpeechRows(rows = []) {
  const speechRows = (Array.isArray(rows) ? rows : []).filter((row) => row && row.speech && row.speech.text);
  const texts = speechRows.map((row) => String(row.speech.text || '').trim()).filter(Boolean);
  const wordCounts = texts.map((text) => text.split(/\s+/).filter(Boolean).length);
  const saySomethingCount = texts.filter(isSaySomethingLine).length;
  const boilerplateCount = texts.filter(isBoilerplateSpeech).length;
  return {
    speechCount: texts.length,
    quoteCount: speechRows.filter((row) => String(row.mode || '') === 'speech-quote').length,
    factCount: speechRows.filter((row) => String(row.mode || '') === 'speech-fact').length,
    boilerplateCount,
    boilerplateRate: texts.length ? Number((boilerplateCount / texts.length).toFixed(3)) : 0,
    saySomethingCount,
    saySomethingRate: texts.length ? Number((saySomethingCount / texts.length).toFixed(3)) : 0,
    avgWords: wordCounts.length ? Number((wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length).toFixed(1)) : 0,
    p50Words: percentile(wordCounts, 0.5),
    p95Words: percentile(wordCounts, 0.95),
    examples: speechRows.slice(0, 8).map((row) => ({
      character: row.character,
      mode: row.mode,
      source: row.speech && row.speech.source,
      text: String(row.speech && row.speech.text || '')
    }))
  };
}

function countSpeechSources(rows = []) {
  const counts = {};
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const source = String(row && row.speech && row.speech.source || '').trim();
    if (!source) return;
    counts[source] = (counts[source] || 0) + 1;
  });
  return Object.fromEntries(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .slice(0, 10)
  );
}

async function runAudioBlurbFetchHarness(options = {}) {
  const startedAt = Date.now();
  const fixtureEntries = await loadFixtureEntries(Number(options.limit) || 18);
  const entries = dedupeEntries([
    ...fixtureEntries,
    ...(options.includeLogExamples === false ? [] : getLogExampleEntries())
  ]).slice(0, Math.max(1, Math.min(48, Number(options.limit) || 18)));

  const coldStart = Date.now();
  const cold = await resolveAudioCalloutBatch(UNUSED_AUDIO_CLIPS_DIR, entries);
  const coldMs = Date.now() - coldStart;

  const warmStart = Date.now();
  const warm = await resolveAudioCalloutBatch(UNUSED_AUDIO_CLIPS_DIR, entries);
  const warmMs = Date.now() - warmStart;

  const replayMs = [];
  let replayCacheHits = 0;
  for (let i = 0; i < entries.length; i += 1) {
    await resolveAudioCalloutBatch(UNUSED_AUDIO_CLIPS_DIR, [entries[i]]);
    const t0 = Date.now();
    const replay = await resolveAudioCalloutBatch(UNUSED_AUDIO_CLIPS_DIR, [entries[i]]);
    replayMs.push(Date.now() - t0);
    if (replay && replay.cacheHit) replayCacheHits += 1;
  }

  const accuracyProbeEntries = getCalloutAccuracyProbeEntries();
  const accuracyProbePayload = await resolveAudioCalloutBatch(UNUSED_AUDIO_CLIPS_DIR, accuracyProbeEntries);
  const accuracyProbe = analyzeCalloutAccuracyProbe(accuracyProbeEntries, accuracyProbePayload);

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    input: {
      sampleCount: entries.length
    },
    cold: {
      elapsedMs: coldMs,
      cacheHit: Boolean(cold && cold.cacheHit),
      stats: cold && cold.stats ? cold.stats : {}
    },
    warm: {
      elapsedMs: warmMs,
      cacheHit: Boolean(warm && warm.cacheHit),
      stats: warm && warm.stats ? warm.stats : {}
    },
    replay: {
      runs: replayMs.length,
      p50Ms: percentile(replayMs, 0.5),
      p95Ms: percentile(replayMs, 0.95),
      avgMs: mean(replayMs),
      cacheHitRate: replayMs.length ? Number((replayCacheHits / replayMs.length).toFixed(3)) : 0
    },
    planning: {
      wikiquoteEligible: Number(cold && cold.stats && cold.stats.wikiquoteEligible) || 0,
      wikiquoteBudget: Number(cold && cold.stats && cold.stats.wikiquoteBudget) || 0,
      wikiquoteAllowed: Number(cold && cold.stats && cold.stats.wikiquoteAllowed) || 0,
      wikiquoteSkippedBudget: Number(cold && cold.stats && cold.stats.wikiquoteSkippedBudget) || 0,
      externalFactEligible: Number(cold && cold.stats && cold.stats.externalFactEligible) || 0,
      externalFactBudget: Number(cold && cold.stats && cold.stats.externalFactBudget) || 0,
      externalFactAllowed: Number(cold && cold.stats && cold.stats.externalFactAllowed) || 0,
      externalFactSkippedBudget: Number(cold && cold.stats && cold.stats.externalFactSkippedBudget) || 0,
      externalFactHits: Number(cold && cold.stats && cold.stats.externalFactHits) || 0,
      localFirstPlanned: Number(cold && cold.stats && cold.stats.localFirstPlanned) || 0
    },
    speechQuality: analyzeSpeechRows(cold && cold.results),
    speechSources: countSpeechSources(cold && cold.results),
    accuracyProbe,
    elapsedMs: Date.now() - startedAt
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(OUTPUT_DIR, `audio-callout-batch-harness-${stamp}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  if (!options.noMarkdown) {
    const mdPath = path.join(OUTPUT_DIR, `audio-callout-batch-harness-${stamp}.md`);
    const lines = [
      '# Audio Callout Batch Harness',
      '',
      `- Samples: ${report.input.sampleCount}`,
      `- Cold batch: ${report.cold.elapsedMs} ms (cacheHit=${report.cold.cacheHit})`,
      `- Warm batch: ${report.warm.elapsedMs} ms (cacheHit=${report.warm.cacheHit})`,
      `- Replay p50/p95: ${report.replay.p50Ms}/${report.replay.p95Ms} ms (cacheHitRate=${report.replay.cacheHitRate})`,
      `- Quote budget plan: eligible=${report.planning.wikiquoteEligible} allowed=${report.planning.wikiquoteAllowed}/${report.planning.wikiquoteBudget} skipped=${report.planning.wikiquoteSkippedBudget}`,
      `- External fact plan: hits=${report.planning.externalFactHits} allowed=${report.planning.externalFactAllowed}/${report.planning.externalFactBudget} eligible=${report.planning.externalFactEligible} skipped=${report.planning.externalFactSkippedBudget} localFirst=${report.planning.localFirstPlanned}`,
      `- Speech say-something rate: ${report.speechQuality.saySomethingRate}`,
      `- Boilerplate rate: ${report.speechQuality.boilerplateRate}`,
      `- Speech sources: ${Object.entries(report.speechSources).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'}`,
      `- Accuracy probe class/style: ${report.accuracyProbe.classAccuracy}/${report.accuracyProbe.styleAccuracy} (robot false+ ${report.accuracyProbe.robotFalsePositives})`,
      '',
      '## Examples',
      ...report.speechQuality.examples.map((ex) => `- ${ex.character} [${ex.mode}/${ex.source}]: ${ex.text}`)
    ];
    await fs.writeFile(mdPath, `${lines.join('\n')}\n`, 'utf8');
    return { report, files: { jsonPath, mdPath } };
  }
  return { report, files: { jsonPath } };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runAudioBlurbFetchHarness(options);
  const report = result.report;
  console.log('[callout-bench] complete');
  console.log(`  output: ${result.files.jsonPath}`);
  console.log(`  cold batch: ${report.cold.elapsedMs} ms (quoteAvg=${Number(report.cold.stats.quoteFetchMsAvg) || 0})`);
  console.log(`  warm batch: ${report.warm.elapsedMs} ms (cacheHit=${report.warm.cacheHit})`);
  console.log(`  replay p50/p95: ${report.replay.p50Ms}/${report.replay.p95Ms} ms cacheHitRate=${report.replay.cacheHitRate}`);
  console.log(`  quote budget: eligible=${report.planning.wikiquoteEligible} allowed=${report.planning.wikiquoteAllowed}/${report.planning.wikiquoteBudget} skipped=${report.planning.wikiquoteSkippedBudget}`);
  console.log(`  external facts: hits=${report.planning.externalFactHits} allowed=${report.planning.externalFactAllowed}/${report.planning.externalFactBudget} eligible=${report.planning.externalFactEligible} skipped=${report.planning.externalFactSkippedBudget} localFirst=${report.planning.localFirstPlanned}`);
  console.log(`  speech say-something rate: ${report.speechQuality.saySomethingRate} boilerplate=${report.speechQuality.boilerplateRate}`);
  console.log(`  speech quote/fact: ${report.speechQuality.quoteCount}/${report.speechQuality.factCount}`);
  console.log(`  speech sources: ${Object.entries(report.speechSources).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'}`);
  console.log(`  callout accuracy class/style: ${report.accuracyProbe.classAccuracy}/${report.accuracyProbe.styleAccuracy} robotFalse+=${report.accuracyProbe.robotFalsePositives}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[callout-bench] failed:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = {
  runAudioBlurbFetchHarness,
  runAudioCalloutBatchHarness: runAudioBlurbFetchHarness
};
