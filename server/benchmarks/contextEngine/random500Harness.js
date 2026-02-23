const fs = require('fs');
const path = require('path');
const { evaluateCharactersBatch } = require('../../services/entryEvaluationService');
const { resolveEntryIdentity } = require('../../services/evaluation/resolver/resolveEntryIdentity');
let generateFinalScenarioAndTwist = null;
try {
  ({ generateFinalScenarioAndTwist } = require('../../core/gameEngine'));
} catch (error) {
  generateFinalScenarioAndTwist = null;
}

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'random-500.txt');
const DEFAULT_RESOLVER_CACHE_PATH = path.join(__dirname, 'fixtures', 'random-500-resolver-cache.json');

const DEFAULT_SCENARIOS = [
  {
    id: 'food_rookies',
    scenario: 'SYNCHRONIZE A FOOD SHORTAGE',
    twist: 'WHILE HALF THE CREW ROOKIES'
  },
  {
    id: 'chem_aftershocks',
    scenario: 'OUTSMART A CHEMICAL SPILL',
    twist: 'UNDER CONSTANT AFTERSHOCKS'
  },
  {
    id: 'quantum_split',
    scenario: 'REMEDIATE A QUANTUM NET',
    twist: 'WITH TEAM SPLIT ACROSS ZONES'
  }
];

const CURATED_GAME_SCENARIOS = [
  { id: 'city-defense', scenario: 'DEFEND A CITY POWER GRID', twist: 'WITH BURST POWER ONLY' },
  { id: 'mystery-heist', scenario: 'STOP A RELIC HEIST', twist: 'WHILE EVIDENCE SELF-DELETES' },
  { id: 'diplomacy', scenario: 'SECURE A PEACE DEAL', twist: 'WITHOUT DIRECT FORCE' },
  { id: 'survival-ocean', scenario: 'SURVIVE IN THE DEEP OCEAN', twist: 'AS FUEL DROPS BELOW 10%' },
  { id: 'first-contact', scenario: 'NEGOTIATE A FIRST-CONTACT SUMMIT', twist: 'WHILE TRANSLATIONS DROP MEANING' },
  { id: 'cyber-crisis', scenario: 'CONTAIN A GLOBAL CYBER PANIC', twist: 'WITH ANALOG BACKUPS ONLY' },
  { id: 'evacuation', scenario: 'EVACUATE A FLOATING CITY', twist: 'WITH ONE EXTRACTION WINDOW LEFT' },
  { id: 'infrastructure', scenario: 'REBUILD AFTER A MEGA WILDFIRE', twist: 'UNDER CONSTANT AFTERSHOCKS' },
  { id: 'space-colony', scenario: 'STABILIZE A SPACE COLONY', twist: 'WHILE COMMS LAG 90 SECONDS' },
  { id: 'medical-breach', scenario: 'CONTAIN A MEDICAL DATA BREACH', twist: 'UNDER LIVE GLOBAL BROADCAST' },
  { id: 'alliance', scenario: 'HOLD A FRACTURING ALLIANCE TOGETHER', twist: 'WHILE ALLIES SPLIT INTO RIVALS' },
  { id: 'drone-swarm', scenario: 'DISMANTLE A DRONE SWARM TAKEOVER', twist: 'AND CRITICAL TARGETS KEEP MOVING' }
];

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) {
      out[arg.slice(2)] = 'true';
    } else {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    }
  }
  return out;
}

function parseBool(value, defaultValue = false) {
  if (value == null) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function canonicalizeLoose(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(value) {
  return new Set(canonicalizeLoose(value).split(' ').filter(Boolean));
}

function tokenOverlapScore(a, b) {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (!setA.size || !setB.size) return 0;
  let overlap = 0;
  for (const token of setA) {
    if (setB.has(token)) overlap += 1;
  }
  return overlap / Math.max(1, Math.min(setA.size, setB.size));
}

const HARNESS_ALIAS_EQUIV = {
  h2o: ['water'],
  pbj: ['peanut butter and jelly', 'peanut butter and jelly sandwich'],
  shaq: ["shaquille o'neal", 'shaquille oneal'],
  biggiesmalls: ['the notorious b i g', 'notorious big', 'christopher wallace'],
  rbg: ['ruth bader ginsburg'],
  lasagne: ['lasagna'],
  katara: ['katara', 'avatar the last airbender'],
  spammusubi: ['spam musubi', 'musubi'],
  got: ['game of thrones'],
  rdr2: ['red dead redemption 2'],
  reddead: ['red dead redemption', 'red dead redemption 2'],
  tmnt: ['teenage mutant ninja turtles', 'tmnt'],
  crttv: ['cathode ray tube', 'cathode ray tube television'],
  crtmonitor: ['cathode ray tube', 'crt monitor'],
  lcdscreen: ['liquid crystal display'],
  lcd: ['liquid crystal display'],
  cpu: ['central processing unit', 'cpu'],
  n64: ['nintendo 64', 'n64'],
  themyscira: ['themyscira'],
  wakko: ['wakko warner', 'animaniacs'],
  winteriscoming: ['game of thrones', 'house stark'],
  bazinga: ['sheldon cooper', 'the big bang theory'],
  ufo: ['unidentified flying object'],
  thecapedcrusader: ['batman'],
  mrworldwide: ['pitbull rapper', 'pitbull'],
  sauruman: ['saruman'],
  iaminevitable: ['thanos'],
  maytheodds: ['the hunger games', 'katniss everdeen'],
  hakunamatata: ['the lion king', 'hakuna matata'],
  yabbadabbadoo: ['the flintstones', 'fred flintstone'],
  toinfinity: ['buzz lightyear', 'toy story'],
  theundertaker: ['undertaker', 'mark calaway'],
  ramentonkotsu: ['tonkotsu ramen'],
  churros: ['churro', 'churros'],
  caesaraugustus: ['augustus', 'caesar augustus'],
  bowserjr: ['bowser jr', 'bowser junior'],
  crocanimal: ['crocodile', 'croc'],
  colsanders: ['colonel sanders', 'kfc'],
  katniss: ['katniss everdeen'],
  ladygaga: ['lady gaga'],
  mountrainier: ['mount rainier'],
  poseidonstrident: ['poseidon trident', "poseidon's trident", 'trident'],
  quinoa: ['quinoa'],
  r2: ['r2 d2', 'artoo detoo'],
  baymax: ['baymax', 'big hero 6'],
  jeangrey: ['jean grey', 'phoenix'],
  johnwick: ['john wick'],
  krakenmyth: ['kraken'],
  sherlockh: ['sherlock holmes', 'sherlock'],
  simbajr: ['simba'],
  skyrim: ['the elder scrolls v skyrim', 'skyrim'],
  spam: ['spam food', 'spam'],
  storm: ['storm marvel', 'storm x men', 'ororo munroe'],
  thechosenone: ['chosen one', 'neo', 'anakin skywalker'],
  bugsbunnyjr: ['bugs bunny'],
  saitma: ['saitama', 'one punch man'],
  saymyname: ['breaking bad', 'walter white'],
  tonystark: ['iron man', 'tony stark'],
  magnetohelmet: ['magneto', 'magnetos helmet'],
  capncrunch: ['capn crunch', 'captain crunch'],
  billiee: ['billie eilish'],
  tpain: ['t pain'],
  pepsimax: ['pepsi max', 'pepsi zero sugar'],
  zeldabotw: ['breath of the wild', 'legend of zelda'],
  chosenone: ['neo', 'anakin skywalker', 'chosen one'],
  wakandan: ['wakanda', 'wakandan'],
  cybertron: ['cybertron', 'transformers']
};

function aliasAlignedTitle(entry, resolvedTitle) {
  const entryKey = canonicalizeLoose(entry).replace(/\s+/g, '');
  const titleKey = canonicalizeLoose(resolvedTitle);
  if (!entryKey || !titleKey) return false;

  const variants = [
    ...new Set([
      entry,
      ...String(entry || '').split(/\s+/).filter(Boolean),
      ...(HARNESS_ALIAS_EQUIV[entryKey] || [])
    ])
  ];

  // Common shorthand expansions that appear across the chaotic fixture.
  if (/\bmt\b/i.test(String(entry || ''))) variants.push(String(entry || '').replace(/\bMt\.?\b/gi, 'Mount'));
  if (/\bdr\b/i.test(String(entry || ''))) variants.push(String(entry || '').replace(/\bDr\.?\b/gi, 'Doctor'));
  if (/^\s*the\s+/i.test(String(entry || ''))) variants.push(String(entry || '').replace(/^\s*the\s+/i, ''));

  for (const variant of variants) {
    const overlap = tokenOverlapScore(variant, resolvedTitle);
    if (overlap >= 0.45) return true;
    const variantKey = canonicalizeLoose(variant).replace(/\s+/g, '');
    if (variantKey && (titleKey.replace(/\s+/g, '').includes(variantKey) || variantKey.includes(titleKey.replace(/\s+/g, '')))) {
      return true;
    }
  }

  return false;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashString(value) {
  const str = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const safe = Array.isArray(items) ? items : [];
  if (!safe.length) return [];
  const limit = clamp(Number(concurrency) || 1, 1, safe.length);
  const results = new Array(safe.length);
  let cursor = 0;

  async function worker() {
    while (cursor < safe.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(safe[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

function withTimeout(promise, timeoutMs, fallbackValue = null) {
  const ms = Math.max(50, Number(timeoutMs) || 0);
  if (!ms) return Promise.resolve(promise).catch(() => fallbackValue);
  return Promise.race([
    Promise.resolve(promise).catch(() => fallbackValue),
    new Promise((resolve) => setTimeout(() => resolve(fallbackValue), ms))
  ]);
}

function readFixture(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function safeJsonClone(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return null;
  }
}

function resolverCacheKey(entry) {
  return canonicalizeLoose(entry || '');
}

function loadResolverCache(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { version: 1, entries: {}, dirty: false };
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      version: Number(parsed && parsed.version) || 1,
      entries: parsed && parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
      dirty: false
    };
  } catch (error) {
    return { version: 1, entries: {}, dirty: false };
  }
}

function saveResolverCache(filePath, cache) {
  if (!cache || typeof cache !== 'object') return;
  const payload = {
    version: Number(cache.version) || 1,
    updatedAt: new Date().toISOString(),
    entries: cache.entries && typeof cache.entries === 'object' ? cache.entries : {}
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  cache.dirty = false;
}

function batchArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function scenarioKey(row) {
  return `${String(row && row.scenario || '').trim()} || ${String(row && row.twist || '').trim()}`;
}

function buildResolverSeedFromResolution(resolution, fallbackInput) {
  if (!resolution || typeof resolution !== 'object' || !resolution.scoringInfo) return null;
  const normalizedName = String(resolution.normalizedName || fallbackInput || '').trim() || String(fallbackInput || '');
  return {
    normalizedName,
    compactName: canonicalizeLoose(normalizedName).replace(/\s+/g, ''),
    infoConfidence: Number(resolution.infoConfidence) || 0,
    resolutionStatus: resolution.resolutionStatus || 'unknown',
    source: resolution.source || (resolution.scoringInfo && resolution.scoringInfo.source) || null,
    riskFlags: Array.isArray(resolution.riskFlags) ? resolution.riskFlags.slice(0, 12) : [],
    confidenceBand: resolution.confidenceBand || (resolution.scoringInfo && resolution.scoringInfo.confidenceBand) || null,
    lookupMeta: resolution.lookupMeta || (resolution.scoringInfo && resolution.scoringInfo.lookupMeta) || null,
    scoringInfo: resolution.scoringInfo,
    trustedInfo: Boolean(resolution.trustedInfo)
  };
}

function buildResolverPseudoResult(resolution) {
  if (!resolution || typeof resolution !== 'object' || !resolution.scoringInfo) return null;
  const scoringInfo = resolution.scoringInfo;
  const riskFlags = Array.isArray(resolution.riskFlags) ? resolution.riskFlags.slice(0, 12) : [];
  return {
    __resolverOnly: true,
    imageUrl: scoringInfo.imageUrl || null,
    scoreMeta: {
      imageSynthetic: Boolean(scoringInfo.imageSynthetic),
      infoConfidence: Number(resolution.infoConfidence) || 0,
      resolverConfidence: Number(resolution.infoConfidence) || 0,
      resolvedTitle: scoringInfo.title || scoringInfo.name || resolution.normalizedName || '',
      resolvedSource: scoringInfo.source || resolution.source || '',
      resolverResolutionSource: resolution.resolutionSource || scoringInfo.source || '',
      riskFlags
    },
    breakdown: {
      engineTrace: {
        riskFlags
      }
    }
  };
}

function slugifyScenarioId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'scenario';
}

function dedupeScenarios(rows) {
  const out = [];
  const seen = new Set();
  for (const row of rows || []) {
    if (!row || !row.scenario) continue;
    const key = scenarioKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: row.id || slugifyScenarioId(`${row.scenario}-${row.twist || 'no-twist'}`),
      scenario: String(row.scenario).trim(),
      twist: String(row.twist || '').trim() || 'NO PLOT TWIST'
    });
  }
  return out;
}

function buildGeneratedGameScenarios(count = 6) {
  if (typeof generateFinalScenarioAndTwist !== 'function') return [];
  const out = [];
  const difficulties = ['easy', 'normal', 'hard'];
  const target = Math.max(0, Math.min(60, Number(count) || 0));
  let guard = 0;
  while (out.length < target && guard < target * 8 + 20) {
    guard += 1;
    const difficulty = difficulties[guard % difficulties.length];
    const generated = generateFinalScenarioAndTwist(difficulty);
    if (!generated || !generated.scenario) continue;
    out.push({
      id: `gen-${difficulty}-${out.length + 1}`,
      scenario: generated.scenario,
      twist: generated.twist || 'NO PLOT TWIST'
    });
  }
  return dedupeScenarios(out);
}

function buildScenarioMatrix(args = {}) {
  const scenarioMode = String(args.scenarioMode || 'hybrid').toLowerCase();
  const generatedCount = Math.max(0, Math.min(60, Number(args.generatedScenarioCount) || 6));
  const includeNoTwistVariants = parseBool(args.includeNoTwistVariants, true);
  const noTwistVariantCap = Math.max(0, Math.min(20, Number(args.noTwistVariantCap) || 4));
  const customScenarioLimit = Math.max(1, Math.min(64, Number(args.scenarioLimit) || 9));

  let rows = [];
  if (scenarioMode === 'fixed') {
    rows = [...DEFAULT_SCENARIOS];
  } else if (scenarioMode === 'curated') {
    rows = [...DEFAULT_SCENARIOS, ...CURATED_GAME_SCENARIOS];
  } else if (scenarioMode === 'generated') {
    rows = buildGeneratedGameScenarios(generatedCount);
  } else {
    rows = [...DEFAULT_SCENARIOS, ...CURATED_GAME_SCENARIOS, ...buildGeneratedGameScenarios(generatedCount)];
  }

  rows = dedupeScenarios(rows).slice(0, customScenarioLimit);

  if (includeNoTwistVariants && rows.length) {
    const noTwistRows = rows
      .slice(0, noTwistVariantCap)
      .map((row, idx) => ({
        id: `${row.id || `s${idx + 1}`}-notwist`,
        scenario: row.scenario,
        twist: 'NO PLOT TWIST'
      }));
    rows = dedupeScenarios([...rows, ...noTwistRows]).slice(0, customScenarioLimit + noTwistVariantCap);
  }

  return rows;
}

function pickScenarioSampleForBatch(scenarios, batchIndex = 0, args = {}) {
  const safe = Array.isArray(scenarios) ? scenarios.filter(Boolean) : [];
  if (!safe.length) return { sampled: [], extras: [] };

  const sampleSize = clamp(Number(args.scalingScenarioSample) || Math.min(5, safe.length), 1, safe.length);
  const anchorCount = clamp(Number(args.anchorScenarioCount) || Math.min(2, sampleSize), 0, sampleSize);
  const stride = clamp(Number(args.scenarioStride) || 3, 1, Math.max(1, safe.length));

  const anchors = safe.slice(0, anchorCount);
  const pool = safe.slice(anchorCount);
  const picked = [...anchors];
  const pickedKeys = new Set(picked.map((s) => s.id || scenarioKey(s)));

  if (pool.length) {
    let idx = ((Number(batchIndex) || 0) * stride) % pool.length;
    let guard = 0;
    while (picked.length < sampleSize && guard < pool.length * 3) {
      const row = pool[idx % pool.length];
      const key = row.id || scenarioKey(row);
      if (!pickedKeys.has(key)) {
        picked.push(row);
        pickedKeys.add(key);
      }
      idx += stride;
      guard += 1;
    }
  }

  // Ensure at least one no-twist row is represented when available and sample is large enough.
  if (sampleSize >= 3) {
    const hasNoTwist = picked.some((row) => String(row && row.twist || '').toUpperCase() === 'NO PLOT TWIST');
    if (!hasNoTwist) {
      const noTwistRow = safe.find((row) => String(row && row.twist || '').toUpperCase() === 'NO PLOT TWIST');
      if (noTwistRow) {
        const replaceIndex = picked.length > anchorCount ? picked.length - 1 : picked.length;
        if (replaceIndex < picked.length) picked[replaceIndex] = noTwistRow;
        else picked.push(noTwistRow);
      }
    }
  }

  const sampled = dedupeScenarios(picked).slice(0, sampleSize);
  const sampledIds = new Set(sampled.map((s) => s.id || scenarioKey(s)));
  const extras = safe.filter((s) => !sampledIds.has(s.id || scenarioKey(s)));
  return { sampled, extras };
}

function removeEntriesOnce(sourceEntries, toRemove) {
  const remaining = Array.isArray(sourceEntries) ? sourceEntries.slice() : [];
  const counts = new Map();
  for (const entry of Array.isArray(toRemove) ? toRemove : []) {
    const key = String(entry);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const out = [];
  for (const entry of remaining) {
    const key = String(entry);
    const need = counts.get(key) || 0;
    if (need > 0) {
      counts.set(key, need - 1);
      continue;
    }
    out.push(entry);
  }
  return out;
}

function writeFixtureFile(filePath, entries) {
  const body = (Array.isArray(entries) ? entries : []).map((v) => String(v || '').trim()).filter(Boolean).join('\n');
  fs.writeFileSync(filePath, `${body}${body ? '\n' : ''}`);
}

function getImageStatus(evalData) {
  const synthetic = Boolean(evalData && evalData.scoreMeta && evalData.scoreMeta.imageSynthetic);
  if (evalData && evalData.imageUrl) return synthetic ? 'synthetic' : 'real';
  return 'none';
}

function getRiskFlags(evalData) {
  const traceFlags = Array.isArray(evalData && evalData.breakdown && evalData.breakdown.engineTrace && evalData.breakdown.engineTrace.riskFlags)
    ? evalData.breakdown.engineTrace.riskFlags
    : [];
  return traceFlags.map((f) => String(f || ''));
}

function getRawSubscores(evalData) {
  return (evalData && evalData.scoreMeta && evalData.scoreMeta.contextRawSubscores) || {};
}

function getCalibration(evalData) {
  return (evalData && evalData.scoreMeta && evalData.scoreMeta.contextOvrCalibration)
    || (evalData && evalData.breakdown && evalData.breakdown.ovrBreakdown && evalData.breakdown.ovrBreakdown.calibration)
    || {};
}

function pickOriginalScenarioForScaling(scenarios, currentScenarioIndex, entryIndex = 0, opts = {}) {
  const safe = Array.isArray(scenarios) ? scenarios : [];
  if (!safe.length) return { id: 'orig-fallback', scenario: 'TEST', twist: 'NO PLOT TWIST' };
  if (safe.length === 1) return safe[0];
  const stride = clamp(Number(opts && opts.originalScenarioStride) || 5, 1, 31);
  let candidateIndex = (Number(currentScenarioIndex) + stride + (Number(entryIndex) % 3)) % safe.length;
  if (candidateIndex === currentScenarioIndex) {
    candidateIndex = (candidateIndex + 1) % safe.length;
  }
  return safe[candidateIndex];
}

function classifyRecord(entry, perScenarioResults, resolverResolution = null) {
  const results = Array.isArray(perScenarioResults) ? perScenarioResults.filter(Boolean) : [];
  const resolverPseudo = buildResolverPseudoResult(resolverResolution);
  const infoResults = resolverPseudo ? [resolverPseudo, ...results] : results;
  if (!infoResults.length) {
    return {
      imagePass: false,
      infoPass: false,
      scalingPass: false,
      compositePass: false,
      reasons: ['no_results']
    };
  }

  const reasons = new Set();
  const imageStatuses = infoResults.map(getImageStatus);
  const hasRealImage = imageStatuses.includes('real');
  const hasAnyImage = imageStatuses.some((s) => s === 'real' || s === 'synthetic');
  const imagePass = hasRealImage || (hasAnyImage && infoResults.some((r) => {
    const sm = (r && r.scoreMeta) || {};
    const conf = Number(sm.infoConfidence) || 0;
    const resolverConf = Number(sm.resolverConfidence) || 0;
    const source = String(sm.resolvedSource || sm.resolverResolutionSource || '').toLowerCase();
    const flags = Array.isArray(sm.riskFlags) ? sm.riskFlags : [];
    const wikiLike = source.includes('wiki');
    const synthetic = getImageStatus(r) === 'synthetic';
    if (conf >= 0.82) return true;
    // Some legitimate wiki pages/phrases have no practical lead image; accept high-confidence synthetic in those cases.
    if (synthetic && wikiLike && conf >= 0.65 && resolverConf >= 0.74 && !flags.includes('fast_round_timeout_fallback')) return true;
    return false;
  }));
  if (!imagePass) reasons.add('image_missing_or_low_quality');

  const best = infoResults
    .slice()
    .sort((a, b) => {
      const aScore = (getImageStatus(a) === 'real' ? 4 : getImageStatus(a) === 'synthetic' ? 2 : 0)
        + ((Number(a?.scoreMeta?.infoConfidence) || 0) * 2)
        + ((Number(a?.scoreMeta?.resolverConfidence) || 0) * 2);
      const bScore = (getImageStatus(b) === 'real' ? 4 : getImageStatus(b) === 'synthetic' ? 2 : 0)
        + ((Number(b?.scoreMeta?.infoConfidence) || 0) * 2)
        + ((Number(b?.scoreMeta?.resolverConfidence) || 0) * 2);
      return bScore - aScore;
    })[0];

  const sm = (best && best.scoreMeta) || {};
  const flags = getRiskFlags(best);
  const infoConfidence = Number(sm.infoConfidence) || 0;
  const resolverConfidence = Number(sm.resolverConfidence) || 0;
  const resolvedTitle = String(sm.resolvedTitle || '').trim();
  const resolvedSource = String(sm.resolvedSource || sm.resolverResolutionSource || '').trim().toLowerCase();
  const overlap = tokenOverlapScore(entry, resolvedTitle);
  const titleDiffers = flags.includes('title_differs_from_input');
  const aliasAligned = aliasAlignedTitle(entry, resolvedTitle);
  const badFallback = flags.includes('fast_round_timeout_fallback') || resolvedSource.includes('fallback');
  const clearlyBadTitle = /disambiguation|may refer to|list of|given name|surname/i.test(resolvedTitle);

  let infoPass = true;
  if (!resolvedTitle || !resolvedSource) infoPass = false;
  if (badFallback) infoPass = false;
  if (clearlyBadTitle) infoPass = false;
  if (infoConfidence < 0.58) infoPass = false;
  if (resolverConfidence < 0.58) infoPass = false;
  if (titleDiffers && overlap < 0.34 && resolverConfidence < 0.84 && !aliasAligned) infoPass = false;
  if (!infoPass) {
    if (badFallback) reasons.add('resolver_fallback');
    if (clearlyBadTitle) reasons.add('bad_title_match');
    if (infoConfidence < 0.58 || resolverConfidence < 0.58) reasons.add('low_confidence');
    if (titleDiffers && overlap < 0.34 && resolverConfidence < 0.84 && !aliasAligned) reasons.add('weak_title_alignment');
  }

  const scalingRows = results.filter((r) => !(r && r.__resolverOnly));
  const scalingIssues = [];
  const carryoverWarnings = {
    neutralized: 0,
    equalScenarioNoOverlap: 0,
    equalTwistNoOverlap: 0
  };
  for (const r of scalingRows) {
    const score = Number(r && r.score) || 0;
    const ovr = Number(r && r.ovr) || 0;
    const raw = getRawSubscores(r);
    const cal = getCalibration(r);
    const sf = clamp(Number(raw.currentScenarioFit) || 50, 0, 100);
    const tf = clamp(Number(raw.currentTwistFit) || 50, 0, 100);
    const osf = clamp(Number(raw.originalScenarioFit) || 50, 0, 100);
    const otf = clamp(Number(raw.originalTwistFit) || 50, 0, 100);
    const baseAbility = clamp(Number(raw.baseAbility) || 50, 0, 100);
    const fitDelta = Number(cal.contextFitDelta) || 0;
    const currentScenarioId = String(r && r.__scenarioId || '');
    const originalScenarioId = String(r && r.__originalScenarioId || '');
    const distinctCarryoverContext = Boolean(currentScenarioId && originalScenarioId && currentScenarioId !== originalScenarioId);
    const carrySOverlap = Number(cal.originalScenarioIntentOverlap);
    const carryTOverlap = Number(cal.originalTwistIntentOverlap);

    if (!(ovr >= 0 && ovr <= 99 && score >= 0 && score <= 30)) scalingIssues.push('range');
    if (score <= 10 && ovr >= 90) scalingIssues.push('low_score_high_ovr');
    if (score >= 24 && ovr <= 20) scalingIssues.push('high_score_low_ovr');
    if (sf <= 38 && tf <= 40 && fitDelta > 12) scalingIssues.push('low_fit_positive_delta');
    if (sf >= 75 && tf >= 65 && fitDelta < -12) scalingIssues.push('high_fit_negative_delta');
    if (baseAbility <= 18 && ovr >= 95) scalingIssues.push('tiny_base_maxed_ovr');
    if (baseAbility >= 82 && sf <= 35 && tf <= 35 && fitDelta > 0) scalingIssues.push('power_not_penalized');
    if (distinctCarryoverContext && Math.abs(osf - 50) <= 4 && Math.abs(otf - 50) <= 4 && (Math.abs(sf - 50) >= 14 || Math.abs(tf - 50) >= 12)) {
      carryoverWarnings.neutralized += 1;
    }
    if (distinctCarryoverContext && Number.isFinite(carrySOverlap) && carrySOverlap < 0.15 && osf === sf && Math.abs(sf - 50) >= 10) {
      carryoverWarnings.equalScenarioNoOverlap += 1;
    }
    if (distinctCarryoverContext && Number.isFinite(carryTOverlap) && carryTOverlap < 0.15 && otf === tf && Math.abs(tf - 50) >= 10) {
      carryoverWarnings.equalTwistNoOverlap += 1;
    }
  }

  // Cross-scenario monotonic sanity: higher score should generally mean higher OVR.
  if (scalingRows.length >= 2) {
    const sortedByScore = scalingRows.slice().sort((a, b) => (Number(a.score) || 0) - (Number(b.score) || 0));
    let inversions = 0;
    for (let i = 1; i < sortedByScore.length; i += 1) {
      const prevScore = Number(sortedByScore[i - 1].score) || 0;
      const nextScore = Number(sortedByScore[i].score) || 0;
      const prevOvr = Number(sortedByScore[i - 1].ovr) || 0;
      const nextOvr = Number(sortedByScore[i].ovr) || 0;
      const scoreGap = nextScore - prevScore;
      const ovrDrop = prevOvr - nextOvr;
      const nearCapPair = prevOvr >= 96 || nextOvr >= 96;
      const nearFloorPair = prevOvr <= 5 || nextOvr <= 5;
      if (scoreGap < 2) continue;
      if (nearCapPair || nearFloorPair) continue;
      if (ovrDrop > 8) inversions += 1;
    }
    if (inversions >= 3) scalingIssues.push('score_ovr_inversion');
  }

  // Carryover equality/neutrality can be a false positive when the calibrated model saturates
  // or multiple context families legitimately converge. Treat as a hard scaling failure only when
  // the pattern repeats across the sampled scenario set.
  if (scalingRows.length >= 5) {
    if (carryoverWarnings.neutralized >= 3) scalingIssues.push('carryover_neutralized_pattern');
    if (carryoverWarnings.equalScenarioNoOverlap >= 4) scalingIssues.push('carryover_scenario_plateau_pattern');
    if (carryoverWarnings.equalTwistNoOverlap >= 4) scalingIssues.push('carryover_twist_plateau_pattern');
  }

  const scalingPass = scalingRows.length > 0 && scalingIssues.length === 0;
  if (!scalingPass) {
    reasons.add('scaling_sanity');
  }

  const compositePass = imagePass && infoPass && scalingPass;
  return {
    imagePass,
    infoPass,
    scalingPass,
    compositePass,
    reasons: Array.from(reasons),
    best: {
      resolvedTitle,
      resolvedSource,
      infoConfidence: Number(infoConfidence.toFixed(3)),
      resolverConfidence: Number(resolverConfidence.toFixed(3)),
      image: getImageStatus(best),
      overlap: Number(overlap.toFixed(2)),
      aliasAligned,
      flags: flags.slice(0, 8)
    },
    scalingIssues: scalingIssues.slice(0, 8),
    carryoverWarnings,
    scenarioRows: scalingRows.map((r) => {
      const raw = getRawSubscores(r);
      const cal = getCalibration(r);
      return {
        scenarioId: r.__scenarioId || 'unknown',
        originalScenarioId: r.__originalScenarioId || null,
        score: Number(r.score) || 0,
        ovr: Number(r.ovr) || 0,
        sf: Number(raw.currentScenarioFit) || 0,
        tf: Number(raw.currentTwistFit) || 0,
        osf: Number(raw.originalScenarioFit) || 0,
        otf: Number(raw.originalTwistFit) || 0,
        base: Number(raw.baseAbility) || 0,
        fitDelta: Number(cal.contextFitDelta) || 0,
        carrySOverlap: Number.isFinite(Number(cal.originalScenarioIntentOverlap)) ? Number(cal.originalScenarioIntentOverlap) : null,
        carryTOverlap: Number.isFinite(Number(cal.originalTwistIntentOverlap)) ? Number(cal.originalTwistIntentOverlap) : null
      };
    })
  };
}

async function runResolverPass(entries, resolverScenario, opts = {}) {
  const roundPool = entries.slice();
  const includeTeamContext = !(opts && opts.includeTeamContext === false);
  const teamPoolSize = Math.max(0, Math.min(12, Number(opts && opts.teamPoolSize) || 5));
  const concurrency = clamp(Number(opts && opts.resolverConcurrency) || Number(opts && opts.concurrency) || 4, 1, 16);
  const primaryResolveTimeoutMs = clamp(Number(opts && opts.resolverPrimaryTimeoutMs) || 5500, 400, 15000);
  const primaryAliasTimeoutMs = clamp(Number(opts && opts.resolverPrimaryAliasTimeoutMs) || 1200, 250, 5000);
  const resolverCache = opts && opts.resolverCache && typeof opts.resolverCache === 'object' ? opts.resolverCache : null;
  const resolverCacheMinConfidence = clamp(Number(opts && opts.resolverCacheMinConfidence) || 0.55, 0.2, 0.99);
  const resolverCacheAllowFallback = Boolean(opts && opts.resolverCacheAllowFallback);
  let cacheHits = 0;
  let cacheMisses = 0;
  let cacheStores = 0;

  function canUseCachedResolution(entry, resolution) {
    if (!resolution || typeof resolution !== 'object' || !resolution.scoringInfo) return false;
    const info = resolution.scoringInfo || {};
    const conf = Number(resolution.infoConfidence);
    if (!Number.isFinite(conf) || conf < resolverCacheMinConfidence) return false;
    const source = String(resolution.source || info.source || '').toLowerCase();
    const flags = Array.isArray(resolution.riskFlags) ? resolution.riskFlags : [];
    if (!resolverCacheAllowFallback && (source.includes('fallback') || flags.includes('fast_round_timeout_fallback'))) return false;
    if (!info.imageUrl && !info.imageSynthetic) return false;
    const title = String(info.title || info.name || resolution.normalizedName || '');
    const overlap = tokenOverlapScore(entry, title);
    const aliasAligned = aliasAlignedTitle(entry, title);
    if (flags.includes('title_differs_from_input') && overlap < 0.3 && !aliasAligned) return false;
    return true;
  }

  function readCachedResolution(entry) {
    if (!resolverCache || !resolverCache.entries) return null;
    const key = resolverCacheKey(entry);
    if (!key) return null;
    const row = resolverCache.entries[key];
    if (!row) return null;
    const resolution = safeJsonClone(row.resolution || row);
    if (!canUseCachedResolution(entry, resolution)) return null;
    cacheHits += 1;
    return resolution;
  }

  function writeCachedResolution(entry, resolution) {
    if (!resolverCache || !resolverCache.entries) return;
    if (!resolution || typeof resolution !== 'object' || !resolution.scoringInfo) return;
    const key = resolverCacheKey(entry);
    if (!key) return;
    resolverCache.entries[key] = {
      entry: String(entry || ''),
      cachedAt: Date.now(),
      resolution: safeJsonClone(resolution)
    };
    resolverCache.dirty = true;
    cacheStores += 1;
  }

  const started = Date.now();
  const primaryStarted = Date.now();
  let resolutions = await mapWithConcurrency(entries, concurrency, async (character, index) => {
    const cached = readCachedResolution(character);
    if (cached) return cached;
    cacheMisses += 1;
    let teamPool = [];
    if (includeTeamContext && teamPoolSize > 0 && entries.length > 1) {
      const others = entries.filter((_, j) => j !== index);
      const start = others.length ? (index % others.length) : 0;
      teamPool = others.slice(start, start + teamPoolSize);
      if (teamPool.length < teamPoolSize) {
        teamPool = [...teamPool, ...others.slice(0, teamPoolSize - teamPool.length)];
      }
    }
    try {
      const resolution = await resolveEntryIdentity({
        character,
        scenario: resolverScenario && resolverScenario.scenario,
        twist: resolverScenario && resolverScenario.twist,
        options: {
          evaluationMode: 'round',
          fastRoundMode: true,
          roundResolveTimeoutMs: primaryResolveTimeoutMs,
          roundAliasOverrideTimeoutMs: primaryAliasTimeoutMs,
          skipImageEnrichment: true,
          skipImageBackfill: true,
          skipIdentityUpgrade: false,
          skipSyntheticImageUpgrade: true,
          roundPool,
          teamPool,
          forceRefresh: Boolean(opts && opts.forceRefreshResolver)
        }
      });
      return resolution;
    } catch (error) {
      return {
        ok: false,
        input: String(character || ''),
        normalizedName: String(character || ''),
        scoringInfo: null,
        infoConfidence: 0,
        resolutionStatus: 'error',
        source: 'resolver-error',
        riskFlags: ['resolver_error'],
        error: error && error.message ? error.message : 'resolver failed'
      };
    }
  });
  const primaryMs = Date.now() - primaryStarted;

  const upgradeConcurrency = clamp(Number(opts && opts.resolverUpgradeConcurrency) || Math.max(4, Math.min(8, concurrency + 2)), 1, 16);
  const upgradeThreshold = clamp(Number(opts && opts.resolverUpgradeConfidenceThreshold) || 0.76, 0.2, 0.99);
  const upgradeTimeoutMs = clamp(Number(opts && opts.resolverUpgradeTimeoutMs) || 2500, 250, 15000);
  const maxUpgradeCount = clamp(
    Number(opts && opts.resolverUpgradeCap) || Math.min(10, Math.max(4, Math.ceil(entries.length * 0.5))),
    0,
    entries.length
  );

  function isUpgradeCandidate(entry, resolution) {
    if (!resolution || resolution.ok !== true || !resolution.scoringInfo) return true;
    const info = resolution.scoringInfo || {};
    const conf = Number(resolution.infoConfidence) || 0;
    const source = String(resolution.source || info.source || '').toLowerCase();
    const flags = Array.isArray(resolution.riskFlags) ? resolution.riskFlags : [];
    const title = String(info.title || info.name || resolution.normalizedName || '');
    const overlap = tokenOverlapScore(entry, title);
    const aliasAligned = aliasAlignedTitle(entry, title);
    if (!info.imageUrl || info.imageSynthetic) return true;
    if (conf < upgradeThreshold) return true;
    if (source.includes('fallback')) return true;
    if (flags.includes('fast_round_timeout_fallback')) return true;
    if (flags.includes('title_differs_from_input') && overlap < 0.34 && !aliasAligned) return true;
    return false;
  }

  function resolutionQualityScore(entry, resolution) {
    if (!resolution || resolution.ok !== true || !resolution.scoringInfo) return -999;
    const info = resolution.scoringInfo || {};
    const conf = Number(resolution.infoConfidence) || 0;
    const source = String(resolution.source || info.source || '').toLowerCase();
    const flags = Array.isArray(resolution.riskFlags) ? resolution.riskFlags : [];
    const title = String(info.title || info.name || resolution.normalizedName || '');
    const overlap = tokenOverlapScore(entry, title);
    const aliasAligned = aliasAlignedTitle(entry, title);
    let score = 0;
    score += info.imageUrl ? (info.imageSynthetic ? 1.5 : 4) : 0;
    score += conf * 4;
    if (resolution.trustedInfo) score += 1.5;
    if (aliasAligned) score += 1.25;
    score += overlap;
    if (flags.includes('title_differs_from_input') && overlap < 0.34 && !aliasAligned) score -= 2;
    if (flags.includes('fast_round_timeout_fallback')) score -= 3;
    if (source.includes('fallback')) score -= 2;
    return score;
  }

  const upgradeCandidates = entries
    .map((entry, index) => ({ entry, index, resolution: resolutions[index] }))
    .filter(({ entry, resolution }) => isUpgradeCandidate(entry, resolution))
    .sort((a, b) => {
      const aConf = Number(a.resolution && a.resolution.infoConfidence) || 0;
      const bConf = Number(b.resolution && b.resolution.infoConfidence) || 0;
      return aConf - bConf;
    })
    .slice(0, maxUpgradeCount);

  let upgradeMs = 0;
  if (upgradeCandidates.length) {
    const upgradeStarted = Date.now();
    const upgraded = await mapWithConcurrency(upgradeCandidates, upgradeConcurrency, async ({ entry, index }) => {
      let teamPool = [];
      if (includeTeamContext && teamPoolSize > 0 && entries.length > 1) {
        const others = entries.filter((_, j) => j !== index);
        const start = others.length ? (index % others.length) : 0;
        teamPool = others.slice(start, start + teamPoolSize);
        if (teamPool.length < teamPoolSize) {
          teamPool = [...teamPool, ...others.slice(0, teamPoolSize - teamPool.length)];
        }
      }
      try {
        const resolution = await withTimeout(resolveEntryIdentity({
          character: entry,
          scenario: resolverScenario && resolverScenario.scenario,
          twist: resolverScenario && resolverScenario.twist,
          options: {
            evaluationMode: 'final',
            fastRoundMode: false,
            skipImageEnrichment: false,
            skipImageBackfill: false,
            skipIdentityUpgrade: false,
            skipSyntheticImageUpgrade: false,
            roundPool,
            teamPool,
            forceRefresh: false
          }
        }), upgradeTimeoutMs, null);
        return { index, resolution };
      } catch (error) {
        return { index, resolution: null };
      }
    });
    upgraded.forEach((row) => {
      if (!row || row.index == null || !row.resolution) return;
      const entry = entries[row.index];
      const current = resolutions[row.index];
      if (resolutionQualityScore(entry, row.resolution) >= resolutionQualityScore(entry, current)) {
        resolutions[row.index] = row.resolution;
      }
    });
    upgradeMs = Date.now() - upgradeStarted;
  }

  resolutions.forEach((resolution, index) => {
    writeCachedResolution(entries[index], resolution);
  });

  const seeds = resolutions.map((resolution, index) => buildResolverSeedFromResolution(resolution, entries[index]));
  return {
    resolutions,
    seeds,
    elapsedMs: Date.now() - started,
    primaryMs,
    upgradeMs,
    upgradedCount: upgradeCandidates.length,
    primaryResolveTimeoutMs,
    primaryAliasTimeoutMs,
    cacheHits,
    cacheMisses,
    cacheStores
  };
}

async function runScalingScenarioSet(entries, scenarios, resolverSeeds, opts = {}) {
  const allResultsByScenario = new Map();
  const roundPool = entries.slice();
  const includeTeamContext = !(opts && opts.includeTeamContext === false);
  const teamPoolSize = Math.max(0, Math.min(12, Number(opts && opts.teamPoolSize) || 5));
  const concurrency = clamp(Number(opts && opts.scalingConcurrency) || Number(opts && opts.concurrency) || 6, 1, 16);
  const started = Date.now();

  for (let sIndex = 0; sIndex < scenarios.length; sIndex += 1) {
    const s = scenarios[sIndex];
    const rows = entries.map((character, index) => {
      const originalCtx = pickOriginalScenarioForScaling(scenarios, sIndex, index, opts);
      let teamPool = [];
      if (includeTeamContext && teamPoolSize > 0 && entries.length > 1) {
        const others = entries.filter((_, j) => j !== index);
        const start = others.length ? ((index + sIndex) % others.length) : 0;
        teamPool = others.slice(start, start + teamPoolSize);
        if (teamPool.length < teamPoolSize) {
          teamPool = [...teamPool, ...others.slice(0, teamPoolSize - teamPool.length)];
        }
      }
      return {
        character,
        scenario: s.scenario,
        twist: s.twist,
        options: {
          evaluationMode: 'final',
          originalScenario: originalCtx.scenario,
          originalTwist: originalCtx.twist,
          roundPool,
          teamPool,
          resolutionSeed: resolverSeeds[index] || undefined,
          forceRefresh: false,
          // Harness-only speed path: scaling checks do not need repeated image/identity upgrades.
          skipIdentityUpgrade: true,
          skipSyntheticImageUpgrade: true,
          skipImageEnrichment: true,
          skipImageBackfill: true,
          fastRoundMode: false
        }
      };
    });
    const out = await evaluateCharactersBatch(rows, { concurrency });
    out.forEach((result, index) => {
      if (result && typeof result === 'object') {
        const originalCtx = pickOriginalScenarioForScaling(scenarios, sIndex, index, opts);
        result.__scenarioId = s.id;
        result.__originalScenarioId = originalCtx.id || scenarioKey(originalCtx);
      }
    });
    allResultsByScenario.set(s.id, out);
  }

  return {
    allResultsByScenario,
    elapsedMs: Date.now() - started
  };
}

function mergeScenarioResultsForEntry(index, scenarios, resultMap, existing = []) {
  const out = Array.isArray(existing) ? existing.slice() : [];
  for (const s of scenarios || []) {
    const arr = resultMap.get(s.id) || [];
    const row = arr[index] || null;
    if (row) out.push(row);
  }
  return out;
}

async function runBatchFast(entries, scenarios, opts = {}) {
  const batchIndex = Number(opts && opts.batchIndex) || 0;
  const { sampled, extras } = pickScenarioSampleForBatch(scenarios, batchIndex, opts);
  const resolverScenario = sampled[0] || scenarios[0] || { id: 'resolver-fallback', scenario: 'TEST', twist: 'NO PLOT TWIST' };
  const adaptiveExtraScenarios = clamp(Number(opts && opts.adaptiveExtraScenarios) || 2, 0, Math.max(0, extras.length));

  const resolverPass = await runResolverPass(entries, resolverScenario, opts);
  const scalingPrimary = await runScalingScenarioSet(entries, sampled, resolverPass.seeds, opts);

  let records = entries.map((entry, index) => {
    const perScenario = mergeScenarioResultsForEntry(index, sampled, scalingPrimary.allResultsByScenario);
    return {
      entry,
      ...classifyRecord(entry, perScenario, resolverPass.resolutions[index] || null)
    };
  });

  let deepeningMs = 0;
  const usedExtraScenarios = [];
  if (adaptiveExtraScenarios > 0 && extras.length) {
    const failingIndexes = records
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !row.scalingPass || (!row.infoPass && row.imagePass))
      .map(({ index }) => index);

    if (failingIndexes.length) {
      const extraScenarioSlice = extras.slice(0, adaptiveExtraScenarios);
      usedExtraScenarios.push(...extraScenarioSlice);
      const subsetEntries = failingIndexes.map((i) => entries[i]);
      const subsetSeeds = failingIndexes.map((i) => resolverPass.seeds[i]);
      const deepenStarted = Date.now();
      const scalingExtra = await runScalingScenarioSet(subsetEntries, extraScenarioSlice, subsetSeeds, opts);
      deepeningMs = Date.now() - deepenStarted;

      records = records.map((row, index) => {
        const subsetIndex = failingIndexes.indexOf(index);
        if (subsetIndex === -1) return row;
        const priorScenarioRows = sampled.map((s) => {
          const arr = scalingPrimary.allResultsByScenario.get(s.id) || [];
          return arr[index] || null;
        }).filter(Boolean);
        const extraScenarioRows = mergeScenarioResultsForEntry(subsetIndex, extraScenarioSlice, scalingExtra.allResultsByScenario);
        return {
          entry: row.entry,
          ...classifyRecord(row.entry, [...priorScenarioRows, ...extraScenarioRows], resolverPass.resolutions[index] || null)
        };
      });
    }
  }

  return {
    records,
    meta: {
      executionMode: 'fast_hybrid',
      resolverScenarioId: resolverScenario.id || scenarioKey(resolverScenario),
      sampledScenarioIds: sampled.map((s) => s.id || scenarioKey(s)),
      extraScenarioIds: usedExtraScenarios.map((s) => s.id || scenarioKey(s)),
      timings: {
        resolverMs: resolverPass.elapsedMs,
        resolverPrimaryMs: resolverPass.primaryMs || 0,
        resolverUpgradeMs: resolverPass.upgradeMs || 0,
        resolverUpgradedCount: resolverPass.upgradedCount || 0,
        resolverCacheHits: resolverPass.cacheHits || 0,
        resolverCacheMisses: resolverPass.cacheMisses || 0,
        resolverCacheStores: resolverPass.cacheStores || 0,
        scalingMs: scalingPrimary.elapsedMs,
        deepeningMs
      }
    }
  };
}

async function runBatch(entries, scenarios, opts) {
  const allResultsByScenario = new Map();
  const roundPool = entries.slice();
  const includeTeamContext = !(opts && opts.includeTeamContext === false);
  const teamPoolSize = Math.max(0, Math.min(12, Number(opts && opts.teamPoolSize) || 5));

  for (let sIndex = 0; sIndex < scenarios.length; sIndex += 1) {
    const s = scenarios[sIndex];
    const rows = entries.map((character, index) => {
      let teamPool = [];
      if (includeTeamContext && teamPoolSize > 0 && entries.length > 1) {
        const others = entries.filter((_, j) => j !== index);
        const start = others.length ? (index % others.length) : 0;
        teamPool = others.slice(start, start + teamPoolSize);
        if (teamPool.length < teamPoolSize) {
          teamPool = [...teamPool, ...others.slice(0, teamPoolSize - teamPool.length)];
        }
      }
      return {
        character,
        scenario: s.scenario,
        twist: s.twist,
        options: {
          evaluationMode: 'final',
          originalScenario: s.scenario,
          originalTwist: s.twist,
          roundPool,
          teamPool,
          forceRefresh: sIndex === 0 && Boolean(opts.forceRefreshFirstScenario)
        }
      };
    });
    const out = await evaluateCharactersBatch(rows, { concurrency: opts.concurrency });
    out.forEach((result) => {
      if (result && typeof result === 'object') {
        result.__scenarioId = s.id;
      }
    });
    allResultsByScenario.set(s.id, out);
  }

  const records = entries.map((entry, index) => {
    const perScenario = scenarios.map((s) => {
      const arr = allResultsByScenario.get(s.id) || [];
      return arr[index] || null;
    });
    return {
      entry,
      ...classifyRecord(entry, perScenario)
    };
  });

  return { records };
}

function summarize(records) {
  const rows = Array.isArray(records) ? records : [];
  const totals = {
    total: rows.length,
    imagePass: 0,
    infoPass: 0,
    scalingPass: 0,
    compositePass: 0,
    realImage: 0,
    syntheticImageBest: 0,
    noImageBest: 0
  };
  const reasons = {};

  for (const row of rows) {
    if (row.imagePass) totals.imagePass += 1;
    if (row.infoPass) totals.infoPass += 1;
    if (row.scalingPass) totals.scalingPass += 1;
    if (row.compositePass) totals.compositePass += 1;
    const bestImage = row.best && row.best.image ? row.best.image : 'none';
    if (bestImage === 'real') totals.realImage += 1;
    else if (bestImage === 'synthetic') totals.syntheticImageBest += 1;
    else totals.noImageBest += 1;
    for (const reason of row.reasons || []) {
      reasons[reason] = (reasons[reason] || 0) + 1;
    }
  }

  const pct = (n) => rows.length ? Number(((n / rows.length) * 100).toFixed(1)) : 0;
  return {
    totals,
    percentages: {
      imagePass: pct(totals.imagePass),
      infoPass: pct(totals.infoPass),
      scalingPass: pct(totals.scalingPass),
      compositePass: pct(totals.compositePass),
      realImageBest: pct(totals.realImage)
    },
    reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count }))
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = args.file ? path.resolve(args.file) : FIXTURE_PATH;
  const batchSize = Math.max(1, Math.min(50, Number(args.batchSize) || 20));
  const concurrency = Math.max(1, Math.min(12, Number(args.concurrency) || 4));
  const executionMode = String(args.executionMode || 'fast_hybrid').toLowerCase();
  const resolverConcurrency = Math.max(1, Math.min(16, Number(args.resolverConcurrency) || Math.max(concurrency, 6)));
  const scalingConcurrency = Math.max(1, Math.min(16, Number(args.scalingConcurrency) || Math.max(concurrency, 6)));
  const resolverUpgradeConcurrency = Math.max(1, Math.min(16, Number(args.resolverUpgradeConcurrency) || Math.max(4, Math.min(8, Math.max(concurrency, 6) + 2))));
  const resolverUpgradeCap = Math.max(0, Math.min(50, Number(args.resolverUpgradeCap) || 10));
  const resolverUpgradeConfidenceThreshold = clamp(Number(args.resolverUpgradeConfidenceThreshold) || 0.76, 0.2, 0.99);
  const resolverUpgradeTimeoutMs = Math.max(250, Math.min(15000, Number(args.resolverUpgradeTimeoutMs) || 2500));
  const resolverPrimaryTimeoutMs = Math.max(400, Math.min(20000, Number(args.resolverPrimaryTimeoutMs) || 5500));
  const resolverPrimaryAliasTimeoutMs = Math.max(250, Math.min(6000, Number(args.resolverPrimaryAliasTimeoutMs) || 1200));
  const resolverCacheEnabled = parseBool(args.resolverCache, true);
  const resolverCacheWrite = parseBool(args.resolverCacheWrite, true);
  const resolverCacheAllowFallback = parseBool(args.resolverCacheAllowFallback, false);
  const resolverCacheMinConfidence = clamp(Number(args.resolverCacheMinConfidence) || 0.55, 0.2, 0.99);
  const resolverCacheFile = args.resolverCacheFile
    ? path.resolve(args.resolverCacheFile)
    : DEFAULT_RESOLVER_CACHE_PATH;
  const scalingScenarioSample = Math.max(1, Math.min(32, Number(args.scalingScenarioSample) || 5));
  const anchorScenarioCount = Math.max(0, Math.min(16, Number(args.anchorScenarioCount) || 2));
  const adaptiveExtraScenarios = Math.max(0, Math.min(12, Number(args.adaptiveExtraScenarios) || 2));
  const scenarioStride = Math.max(1, Math.min(64, Number(args.scenarioStride) || 3));
  const originalScenarioStride = Math.max(1, Math.min(64, Number(args.originalScenarioStride) || 5));
  const forceRefreshFirstScenario = String(args.forceRefreshFirstScenario || 'true').toLowerCase() !== 'false';
  const limit = args.limit ? Math.max(1, Number(args.limit)) : null;
  const verbose = parseBool(args.verbose, false);
  const scenarios = buildScenarioMatrix(args);
  const checkpointEvery = Math.max(1, Math.min(50, Number(args.checkpointEvery) || 5));
  const maxBatches = Math.max(0, Math.min(999, Number(args.maxBatches) || 0));
  const startBatch = Math.max(1, Math.min(999, Number(args.startBatch) || 1));
  const stopAfterCheckpoint = parseBool(args.stopAfterCheckpoint, false);
  const prunePassingBatches = parseBool(args.prunePassingBatches, false);
  const rewriteFixture = parseBool(args.rewriteFixture, prunePassingBatches);
  const passedFile = args.passedFile
    ? path.resolve(args.passedFile)
    : path.join(path.dirname(file), 'random-500-passed.txt');
  const checkpointReport = parseBool(args.checkpointReport, true);
  const includeTeamContext = parseBool(args.includeTeamContext, true);
  const teamPoolSize = Math.max(0, Math.min(12, Number(args.teamPoolSize) || 5));

  const allEntries = readFixture(file);
  const entries = limit ? allEntries.slice(0, limit) : allEntries;
  const batches = batchArray(entries, batchSize);
  const allRecords = [];
  let processedBatches = 0;
  let fixtureEntries = rewriteFixture ? readFixture(file) : null;
  const resolverCache = resolverCacheEnabled ? loadResolverCache(resolverCacheFile) : null;
  let prunedCount = 0;
  let checkpointStartIndex = 0;
  const scenarioCoverage = new Map();

  console.log(`[R500] entries=${entries.length} batchSize=${batchSize} concurrency=${concurrency} scenarios=${scenarios.length}`);
  console.log(`[R500] scenarios=${scenarios.map((s) => `${s.id}`).join(',')}`);
  console.log(
    `[R500] mode=${executionMode} resolverConcurrency=${resolverConcurrency} scalingConcurrency=${scalingConcurrency} ` +
    `resolverUpgradeConcurrency=${resolverUpgradeConcurrency} resolverUpgradeCap=${resolverUpgradeCap} resolverUpgradeThreshold=${resolverUpgradeConfidenceThreshold} resolverUpgradeTimeoutMs=${resolverUpgradeTimeoutMs} ` +
    `resolverPrimaryTimeoutMs=${resolverPrimaryTimeoutMs} resolverPrimaryAliasTimeoutMs=${resolverPrimaryAliasTimeoutMs} ` +
    `scalingScenarioSample=${scalingScenarioSample} anchorScenarioCount=${anchorScenarioCount} ` +
    `adaptiveExtraScenarios=${adaptiveExtraScenarios} scenarioStride=${scenarioStride} originalScenarioStride=${originalScenarioStride}`
  );
  if (resolverCacheEnabled) {
    console.log(
      `[R500] resolverCache=${path.basename(resolverCacheFile)} entries=${Object.keys((resolverCache && resolverCache.entries) || {}).length} ` +
      `minConf=${resolverCacheMinConfidence} allowFallback=${resolverCacheAllowFallback} write=${resolverCacheWrite}`
    );
  } else {
    console.log('[R500] resolverCache=disabled');
  }
  console.log(`[R500] checkpointEvery=${checkpointEvery} startBatch=${startBatch} maxBatches=${maxBatches || 'all'} prunePassingBatches=${prunePassingBatches} teamPoolSize=${includeTeamContext ? teamPoolSize : 0}`);

  for (let i = Math.max(0, startBatch - 1); i < batches.length; i += 1) {
    if (maxBatches > 0 && processedBatches >= maxBatches) break;
    const batch = batches[i];
    const started = Date.now();
    const runnerOptions = {
      concurrency,
      resolverConcurrency,
      scalingConcurrency,
      resolverUpgradeConcurrency,
      resolverUpgradeCap,
      resolverUpgradeConfidenceThreshold,
      resolverUpgradeTimeoutMs,
      resolverPrimaryTimeoutMs,
      resolverPrimaryAliasTimeoutMs,
      resolverCache,
      resolverCacheMinConfidence,
      resolverCacheAllowFallback,
      forceRefreshFirstScenario,
      includeTeamContext,
      teamPoolSize,
      batchIndex: i,
      scalingScenarioSample,
      anchorScenarioCount,
      adaptiveExtraScenarios,
      scenarioStride,
      originalScenarioStride
    };
    const batchRun = executionMode === 'full_matrix'
      ? await runBatch(batch, scenarios, runnerOptions)
      : await runBatchFast(batch, scenarios, runnerOptions);
    const records = batchRun && Array.isArray(batchRun.records) ? batchRun.records : [];
    const batchMeta = batchRun && batchRun.meta ? batchRun.meta : null;
    const elapsed = Date.now() - started;
    allRecords.push(...records);
    processedBatches += 1;
    const batchSummary = summarize(records);
    const batchPassed = Number(batchSummary.percentages.compositePass) >= 100;
    console.log(
      `[R500][Batch ${i + 1}/${batches.length}] n=${batch.length} ` +
      `composite=${batchSummary.percentages.compositePass}% ` +
      `image=${batchSummary.percentages.imagePass}% ` +
      `info=${batchSummary.percentages.infoPass}% ` +
      `scale=${batchSummary.percentages.scalingPass}% ` +
      `realImg=${batchSummary.percentages.realImageBest}% ` +
      `elapsed=${elapsed}ms` +
      (batchMeta && batchMeta.timings
        ? ` resolver=${batchMeta.timings.resolverMs}ms(primary=${batchMeta.timings.resolverPrimaryMs || 0}ms,upgrade=${batchMeta.timings.resolverUpgradeMs || 0}ms,n=${batchMeta.timings.resolverUpgradedCount || 0}) scaling=${batchMeta.timings.scalingMs}ms deepen=${batchMeta.timings.deepeningMs || 0}ms`
        : '') +
      (batchMeta && Array.isArray(batchMeta.sampledScenarioIds)
        ? ` sampledScenarios=${batchMeta.sampledScenarioIds.length}${(batchMeta.extraScenarioIds || []).length ? `+${batchMeta.extraScenarioIds.length}` : ''}`
        : '') +
      (batchMeta && batchMeta.timings
        ? ` cache=${batchMeta.timings.resolverCacheHits || 0}h/${batchMeta.timings.resolverCacheMisses || 0}m`
        : '')
    );
    if (batchMeta && Array.isArray(batchMeta.sampledScenarioIds)) {
      [...batchMeta.sampledScenarioIds, ...((batchMeta.extraScenarioIds) || [])].forEach((id) => {
        const key = String(id || 'unknown');
        scenarioCoverage.set(key, (scenarioCoverage.get(key) || 0) + 1);
      });
    }
    if (batchPassed && prunePassingBatches) {
      prunedCount += batch.length;
      if (rewriteFixture && Array.isArray(fixtureEntries)) {
        fixtureEntries = removeEntriesOnce(fixtureEntries, batch);
        writeFixtureFile(file, fixtureEntries);
      }
      fs.appendFileSync(passedFile, `${batch.join('\n')}\n`);
      console.log(`[R500][Batch ${i + 1}] pruned ${batch.length} passing entries${rewriteFixture ? ` -> ${path.basename(file)}` : ''}`);
    }
    if (verbose) {
      const worst = records.filter((r) => !r.compositePass).slice(0, 6);
      worst.forEach((row) => {
        console.log(`[R500][Fail] ${row.entry} reasons=${row.reasons.join(',')} best=${JSON.stringify(row.best)}`);
      });
    }

    const reachedCheckpoint = (processedBatches % checkpointEvery) === 0;
    if (reachedCheckpoint) {
      const checkpointRecords = allRecords.slice(checkpointStartIndex);
      const checkpointSummary = summarize(checkpointRecords);
      const checkpointBatchEnd = (startBatch - 1) + processedBatches;
      const checkpointBatchStart = Math.max(startBatch, checkpointBatchEnd - checkpointEvery + 1);
      console.log('[R500][Checkpoint]', JSON.stringify({
        batches: `${checkpointBatchStart}-${checkpointBatchEnd}`,
        processedEntries: checkpointRecords.length,
        summary: checkpointSummary,
        prunedCount,
        scenarioCoverage: {
          covered: scenarioCoverage.size,
          totalMatrix: scenarios.length,
          pct: scenarios.length ? Number(((scenarioCoverage.size / scenarios.length) * 100).toFixed(1)) : 0
        }
      }));
      if (checkpointReport && scenarioCoverage.size) {
        const topCoverage = Array.from(scenarioCoverage.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([id, count]) => ({ id, count }));
        console.log('[R500][CheckpointScenarioCoverage]', JSON.stringify(topCoverage));
      }
      if (checkpointReport) {
        const checkpointFailures = checkpointRecords
          .filter((r) => !r.compositePass)
          .sort((a, b) => (b.reasons.length - a.reasons.length) || a.entry.localeCompare(b.entry))
          .slice(0, 20);
        checkpointFailures.forEach((row) => {
          console.log(
            `[R500][CheckpointFail] ${row.entry} reasons=${row.reasons.join(',')} ` +
            `scaling=${JSON.stringify(row.scalingIssues || [])} best=${JSON.stringify(row.best)}`
          );
        });
      }
      if (resolverCacheEnabled && resolverCacheWrite && resolverCache && resolverCache.dirty) {
        saveResolverCache(resolverCacheFile, resolverCache);
        console.log(`[R500][Checkpoint] saved resolver cache -> ${path.basename(resolverCacheFile)} (${Object.keys(resolverCache.entries || {}).length} entries)`);
      }
      checkpointStartIndex = allRecords.length;
      if (stopAfterCheckpoint) {
        console.log(`[R500] stopping after checkpoint at batch ${processedBatches} (stopAfterCheckpoint=true)`);
        break;
      }
    }
  }

  const summary = summarize(allRecords);
  const failures = allRecords.filter((r) => !r.compositePass)
    .sort((a, b) => (b.reasons.length - a.reasons.length) || a.entry.localeCompare(b.entry))
    .slice(0, 40);

  console.log('[R500][Summary]', JSON.stringify(summary, null, 2));
  console.log('[R500][TopFailures]');
  failures.forEach((row) => {
    console.log(JSON.stringify({
      entry: row.entry,
      reasons: row.reasons,
      scalingIssues: row.scalingIssues || [],
      best: row.best,
      scenarios: row.scenarioRows
    }));
  });

  const outPath = path.join(__dirname, 'fixtures', 'random-500-last-report.json');
  if (resolverCacheEnabled && resolverCacheWrite && resolverCache && resolverCache.dirty) {
    saveResolverCache(resolverCacheFile, resolverCache);
    console.log(`[R500] saved resolver cache -> ${resolverCacheFile}`);
  }
  fs.writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    file,
    config: {
      batchSize,
      concurrency,
      executionMode,
      resolverConcurrency,
      scalingConcurrency,
      resolverUpgradeConcurrency,
      resolverUpgradeCap,
      resolverUpgradeConfidenceThreshold,
      resolverUpgradeTimeoutMs,
      resolverPrimaryTimeoutMs,
      resolverPrimaryAliasTimeoutMs,
      resolverCacheEnabled,
      resolverCacheWrite,
      resolverCacheAllowFallback,
      resolverCacheMinConfidence,
      resolverCacheFile,
      scalingScenarioSample,
      anchorScenarioCount,
      adaptiveExtraScenarios,
      scenarioStride,
      originalScenarioStride,
      forceRefreshFirstScenario,
      scenarios,
      checkpointEvery,
      maxBatches,
      stopAfterCheckpoint,
      prunePassingBatches,
      rewriteFixture,
      startBatch,
      includeTeamContext,
      teamPoolSize
    },
    run: {
      inputEntries: entries.length,
      processedBatches,
      processedEntries: allRecords.length,
      prunedCount,
      remainingFixtureEntries: Array.isArray(fixtureEntries) ? fixtureEntries.length : null
    },
    summary,
    failures,
    rows: allRecords
  }, null, 2));
  console.log(`[R500] wrote report ${outPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[R500] fatal', error);
    process.exitCode = 1;
  });
}
