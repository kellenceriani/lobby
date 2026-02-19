const { MIN_INFO_CONFIDENCE } = require('./constants');
const { normalizeName, canonicalizeName, calculateNameSimilarity, parseCharacterQuery, resolveLikelyTypo } = require('./textUtils');

function normalizeInfoCandidate(candidate) {
  if (!candidate) return null;
  return {
    ...candidate,
    source: candidate.source || 'unknown',
    title: candidate.title || null,
    description: candidate.description || null,
    aliases: Array.isArray(candidate.aliases) ? candidate.aliases : [],
    categories: Array.isArray(candidate.categories) ? candidate.categories : []
  };
}

function extractProfessionFromWikipedia(extract) {
  if (!extract) return null;

  const firstParagraph = extract.split('\n')[0];
  const professionPatterns = [
    /(?:is a|was a|are) (?:an? )?([a-zA-Z\s]+?)(?:,| in| from|\.|$)/i,
    /\b(superhero|villain|character|actor|actress|musician|scientist|inventor|warrior|detective|assassin|spy|ninja|mage|wizard|robot|android|politician|athlete|entrepreneur)\b/gi
  ];

  for (const pattern of professionPatterns) {
    const match = firstParagraph.match(pattern);
    if (match && match[1]) return match[1].trim();
  }

  return null;
}

function scoreInfoCandidate(characterInput, candidate) {
  const normalized = normalizeInfoCandidate(candidate);
  if (!normalized) return { score: 0, confidence: 0, candidate: null };

  const queryProfile = parseCharacterQuery(characterInput || '');
  const query = normalizeName(queryProfile.baseName || characterInput || '');
  const typoFixed = resolveLikelyTypo(query);
  const queryVariants = Array.from(new Set([query, typoFixed].map(v => normalizeName(v)).filter(Boolean)));

  const title = normalizeName(normalized.title || '');
  const titleCompact = canonicalizeName(title);
  const aliasCompacts = normalized.aliases.map(alias => canonicalizeName(alias));
  const description = String(normalized.description || '').toLowerCase();
  const categories = normalized.categories.map(c => String(c || '').toLowerCase());
  const contextHints = queryProfile.contextHints.map(h => h.toLowerCase());

  let score = 0;
  const confidenceSignals = {
    sourceReliability: 0,
    nameMatch: 0,
    aliasMatch: 0,
    contextMatch: 0,
    quality: 0,
    penalties: 0
  };

  const sourceBase = {
    wikipedia: 0.3,
    wikidata: 0.24,
    fandom: 0.18,
    omdb: 0.1,
    unknown: 0.08
  };

  confidenceSignals.sourceReliability = sourceBase[normalized.source] || sourceBase.unknown;
  score += confidenceSignals.sourceReliability;

  let bestNameMatch = 0;
  let bestAliasMatch = 0;
  queryVariants.forEach(queryVariant => {
    const queryCompact = canonicalizeName(queryVariant);

    let variantNameMatch = 0;
    if (queryCompact && titleCompact && queryCompact === titleCompact) {
      variantNameMatch += 0.38;
    }

    const similarity = calculateNameSimilarity(queryVariant, title);
    variantNameMatch += Math.min(0.28, similarity * 0.4);

    let variantAliasMatch = 0;
    if (aliasCompacts.includes(queryCompact)) variantAliasMatch += 0.24;
    else if (aliasCompacts.some(alias => alias && queryCompact && (alias.includes(queryCompact) || queryCompact.includes(alias)))) {
      variantAliasMatch += 0.12;
    }

    if (description.includes(queryVariant.toLowerCase())) {
      variantAliasMatch += 0.08;
    }

    bestNameMatch = Math.max(bestNameMatch, variantNameMatch);
    bestAliasMatch = Math.max(bestAliasMatch, variantAliasMatch);
  });

  confidenceSignals.nameMatch += bestNameMatch;
  confidenceSignals.aliasMatch += bestAliasMatch;

  if (contextHints.length) {
    const body = `${title} ${description}`.toLowerCase();
    const contextMatches = contextHints.filter(hint => body.includes(hint.toLowerCase()));
    confidenceSignals.contextMatch += Math.min(0.18, contextMatches.length * 0.09);
    if (!contextMatches.length) {
      confidenceSignals.penalties -= 0.08;
    }
  }

  if (queryVariants.some(q => q && description.includes(q.toLowerCase()))) {
    confidenceSignals.quality += 0.08;
  }

  const categoryText = categories.join(' ');
  if (/fictional|character|superhero|villain|comic|manga|anime|mythology|historical|biography|actor|athlete|politician|scientist/.test(categoryText)) {
    confidenceSignals.quality += 0.1;
  }

  if ((normalized.description || '').length >= 400) {
    confidenceSignals.quality += 0.06;
  }

  const isCharacterListLike = /list of/i.test(String(normalized.title || '')) && /character|fictional/i.test(categoryText);
  if (/disambiguation|surname|given names|album|song|filmography|episode/.test(categoryText)) {
    confidenceSignals.penalties -= 0.18;
  } else if (/list of/.test(categoryText) && !isCharacterListLike) {
    confidenceSignals.penalties -= 0.12;
  }

  if (/(?:may refer to|disambiguation)/i.test(String(normalized.description || ''))) {
    confidenceSignals.penalties -= 0.25;
  }

  score += confidenceSignals.nameMatch;
  score += confidenceSignals.aliasMatch;
  score += confidenceSignals.contextMatch;
  score += confidenceSignals.quality;
  score += confidenceSignals.penalties;

  let confidence = Math.max(0, Math.min(1, score));
  const linkageScore = confidenceSignals.nameMatch + confidenceSignals.aliasMatch + confidenceSignals.contextMatch;
  if (linkageScore < 0.12) {
    confidence = Math.min(confidence, 0.34);
  } else if (linkageScore < 0.2) {
    confidence = Math.min(confidence, 0.45);
  }

  return {
    score,
    confidence,
    candidate: {
      ...normalized,
      confidence,
      confidenceSignals,
      confidenceBand: confidence >= 0.85 ? 'very-high' : confidence >= 0.7 ? 'high' : confidence >= 0.52 ? 'medium' : 'low'
    }
  };
}

function pickBestInfoCandidate(character, candidates) {
  const scored = (Array.isArray(candidates) ? candidates : [])
    .map(candidate => scoreInfoCandidate(character, candidate))
    .filter(entry => entry && entry.candidate)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  if (scored[0].confidence < MIN_INFO_CONFIDENCE) return null;
  return scored[0].candidate;
}

module.exports = {
  normalizeInfoCandidate,
  extractProfessionFromWikipedia,
  scoreInfoCandidate,
  pickBestInfoCandidate
};
