const {
  KEYWORD_STOPWORDS,
  CONTEXT_KEYWORD_GROUPS,
  CHARACTER_NAME_ALIASES,
  CHARACTER_ABILITY_HINTS,
  FRANCHISE_DATABASE,
  RARITY_KEYWORDS,
  POWER_LEVELS
} = require('./constants');

function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function canonicalizeName(name) {
  return normalizeName(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function stripDiacritics(value) {
  return normalizeName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function collapseRepeatTypos(value) {
  return normalizeName(value).replace(/([a-z])\1{2,}/gi, '$1$1');
}

function parseCharacterQuery(value) {
  const normalized = normalizeName(value);
  const parenthetical = [];
  normalized.replace(/\(([^)]+)\)/g, (_, inner) => {
    const clean = normalizeName(inner);
    if (clean) parenthetical.push(clean);
    return _;
  });

  const withoutParens = normalizeName(normalized.replace(/\([^)]*\)/g, ' '));
  const fragments = [withoutParens];
  if (withoutParens.includes(':')) fragments.push(normalizeName(withoutParens.split(':')[0]));
  if (withoutParens.includes('-')) fragments.push(normalizeName(withoutParens.replace(/-/g, ' ')));

  return {
    original: normalized,
    baseName: withoutParens || normalized,
    contextHints: parenthetical,
    compact: canonicalizeName(withoutParens || normalized),
    searchFragments: Array.from(new Set(fragments.filter(Boolean)))
  };
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 2);
}

function countOverlap(tokensA, tokensB) {
  const setB = new Set(tokensB);
  return tokensA.reduce((count, token) => count + (setB.has(token) ? 1 : 0), 0);
}

function normalizeKeywordToken(token) {
  if (!token) return '';
  const cleaned = String(token).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleaned) return '';
  if (cleaned.length <= 3) return cleaned;
  return cleaned
    .replace(/(ing|ers|ies|ied|ed|es|s)$/i, '')
    .replace(/(tion|ment|ness)$/i, '');
}

function getMeaningfulTokens(text, maxTokens = 120) {
  const raw = tokenize(text);
  const normalized = raw
    .map(normalizeKeywordToken)
    .filter(token => token.length >= 3 && !KEYWORD_STOPWORDS.has(token));
  return Array.from(new Set(normalized)).slice(0, maxTokens);
}

function expandKeywords(tokens) {
  const expanded = new Set(tokens);
  for (const [group, groupKeywords] of Object.entries(CONTEXT_KEYWORD_GROUPS)) {
    const normalizedGroupKeywords = groupKeywords.map(normalizeKeywordToken);
    if (tokens.some(token => normalizedGroupKeywords.includes(token))) {
      expanded.add(normalizeKeywordToken(group));
      normalizedGroupKeywords.forEach(keyword => expanded.add(keyword));
    }
  }
  return Array.from(expanded);
}

function getCanonicalTokenSet(value) {
  const normalized = normalizeName(String(value || '')).toLowerCase();
  const compact = canonicalizeName(normalized);
  return new Set(
    `${normalized} ${compact}`
      .split(/[^a-z0-9]+/)
      .filter(token => token && token.length > 1)
  );
}

function calculateNameSimilarity(a, b) {
  const tokensA = getCanonicalTokenSet(a);
  const tokensB = getCanonicalTokenSet(b);
  if (!tokensA.size || !tokensB.size) return 0;

  let intersection = 0;
  tokensA.forEach(token => {
    if (tokensB.has(token)) intersection += 1;
  });

  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

function levenshtein(a, b) {
  const s = canonicalizeName(a);
  const t = canonicalizeName(b);
  if (!s || !t) return 99;

  const dp = Array.from({ length: s.length + 1 }, () => Array(t.length + 1).fill(0));
  for (let i = 0; i <= s.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= t.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[s.length][t.length];
}

function buildKnownNameIndex() {
  const names = new Set();
  Object.keys(CHARACTER_NAME_ALIASES).forEach(name => names.add(normalizeName(name)));
  Object.values(CHARACTER_NAME_ALIASES).flat().forEach(name => names.add(normalizeName(name)));
  Object.values(RARITY_KEYWORDS).flat().forEach(name => names.add(normalizeName(name)));
  Object.values(POWER_LEVELS).flat().forEach(name => names.add(normalizeName(name)));
  Object.values(FRANCHISE_DATABASE).forEach(entry => {
    const members = Array.isArray(entry) ? entry : entry.members;
    members.forEach(name => names.add(normalizeName(name)));
  });
  return Array.from(names).filter(Boolean);
}

const KNOWN_NAME_INDEX = buildKnownNameIndex();
const KNOWN_TOKEN_INDEX = Array.from(new Set(
  KNOWN_NAME_INDEX
    .flatMap(name => normalizeName(name).toLowerCase().split(/\s+/))
    .filter(token => token && token.length >= 3)
));

function bestTokenTypoCandidate(token) {
  let best = null;
  let bestDistance = Infinity;

  KNOWN_TOKEN_INDEX.forEach(candidate => {
    if (!candidate || candidate[0] !== token[0]) return;
    const dist = levenshtein(token, candidate);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = candidate;
    }
  });

  if (!best) return null;
  const maxDistance = token.length <= 5 ? 1 : 2;
  return bestDistance <= maxDistance ? best : null;
}

function resolveLikelyTypo(name) {
  const normalized = normalizeName(name).toLowerCase();
  if (!normalized) return null;

  const collapsed = collapseRepeatTypos(normalized);
  if (KNOWN_NAME_INDEX.includes(collapsed)) return collapsed;

  let best = null;
  let bestDistance = Infinity;

  KNOWN_NAME_INDEX.forEach(candidate => {
    const dist = levenshtein(normalized, candidate);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = candidate;
    }
  });

  if (!best) return null;
  const maxDistance = normalized.length <= 6 ? 1 : 2;
  if (bestDistance <= maxDistance) return best;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const correctedTokens = tokens.map(token => {
    if (token.length < 4 || KNOWN_TOKEN_INDEX.includes(token)) return token;
    return bestTokenTypoCandidate(token) || token;
  });

  const corrected = correctedTokens.join(' ').trim();
  return corrected !== normalized ? corrected : null;
}

function getCharacterNameVariants(name) {
  const profile = parseCharacterQuery(name);
  const normalized = profile.original;
  if (!normalized) return [];

  const lower = normalized.toLowerCase();
  const compact = canonicalizeName(profile.baseName || normalized);
  const baseName = profile.baseName || normalized;
  const variants = new Set([normalized, baseName, ...profile.searchFragments]);

  const deaccented = stripDiacritics(baseName);
  if (deaccented && canonicalizeName(deaccented) !== canonicalizeName(baseName)) {
    variants.add(deaccented);
  }

  const baseTokens = baseName.split(/\s+/).filter(Boolean);
  if (baseTokens.length >= 2) {
    variants.add(baseTokens[0]);
    variants.add(baseTokens[baseTokens.length - 1]);
    variants.add(baseTokens.slice(0, 2).join(' '));
  }

  const aliasCandidates = [
    ...(CHARACTER_NAME_ALIASES[lower] || []),
    ...(CHARACTER_NAME_ALIASES[compact] || [])
  ];

  aliasCandidates.forEach(alias => variants.add(normalizeName(alias)));

  if (profile.contextHints.length) {
    profile.contextHints.forEach(context => {
      variants.add(`${profile.baseName} ${context}`);
      variants.add(`${profile.baseName} (${context})`);
      variants.add(`${context} ${profile.baseName}`);
    });
  }

  const typoFix = resolveLikelyTypo(baseName);
  if (typoFix && canonicalizeName(typoFix) !== canonicalizeName(baseName)) {
    variants.add(typoFix);
  }

  if (normalized.includes('-')) variants.add(normalized.replace(/-/g, ' '));
  if (normalized.includes(' ')) variants.add(normalized.replace(/\s+/g, '-'));

  return Array.from(variants).map(normalizeName).filter(Boolean);
}

function getCharacterAbilityHints(character = '', info = null) {
  const candidates = new Set([
    canonicalizeName(character),
    canonicalizeName(info && info.title ? info.title : ''),
    ...(Array.isArray(info && info.aliases) ? info.aliases.map(canonicalizeName) : [])
  ]);

  const hints = new Set();
  candidates.forEach(candidate => {
    if (!candidate) return;
    const mapped = CHARACTER_ABILITY_HINTS[candidate];
    if (Array.isArray(mapped)) mapped.forEach(hint => hints.add(hint));
  });

  return Array.from(hints);
}

module.exports = {
  normalizeName,
  canonicalizeName,
  parseCharacterQuery,
  resolveLikelyTypo,
  tokenize,
  countOverlap,
  normalizeKeywordToken,
  getMeaningfulTokens,
  expandKeywords,
  calculateNameSimilarity,
  getCharacterNameVariants,
  getCharacterAbilityHints
};
