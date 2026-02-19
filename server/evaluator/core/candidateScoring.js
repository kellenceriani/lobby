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

function classifyEntityPriority(candidate) {
  const title = String(candidate && candidate.title ? candidate.title : '').toLowerCase();
  const description = String(candidate && candidate.description ? candidate.description : '').toLowerCase();
  const categories = Array.isArray(candidate && candidate.categories) ? candidate.categories.map((c) => String(c || '').toLowerCase()).join(' ') : '';
  const snippet = String(candidate && candidate.searchSnippet ? candidate.searchSnippet : '').toLowerCase();
  const corpus = `${title} ${description} ${categories} ${snippet}`;

  const fictionalSignals = [
    /\bfictional\b/,
    /\bfictional character\b/,
    /\bcharacter in\b/,
    /\bprotagonist\b/,
    /\bantagonist\b/,
    /\bsuperhero\b/,
    /\bvillain\b/,
    /\banime\b/,
    /\bmanga\b/,
    /\bcomic(?:\s+book)?\b/,
    /\bcartoon\b/,
    /\btelevision character\b/,
    /\bvideo game character\b/
  ];

  const realPersonSignals = [
    /\b(?:is|was) an?\s+(?:american|british|japanese|korean|french|indian|canadian|australian)?\s*(?:actor|actress|athlete|footballer|musician|singer|rapper|composer|author|writer|scientist|historian|politician|philosopher|streamer|creator|youtuber)\b/,
    /\bbiography\b/,
    /\bborn\b/,
    /\bdied\b/,
    /\bhistorical figure\b/,
    /\bpublic figure\b/,
    /\bperson\b/
  ];

  const mediaObjectSignals = [
    /\b(?:film|movie|album|song|tv series|television series|video game|novel)\b/,
    /\b\d{4}\s+(?:film|album|song)\b/,
    /\bseason\s+\d+\b/,
    /\bepisode\b/
  ];

  const hasFictional = fictionalSignals.some((rx) => rx.test(corpus));
  if (hasFictional) return 'fictional';

  const hasRealPerson = realPersonSignals.some((rx) => rx.test(corpus));
  if (hasRealPerson) return 'real';

  const hasMediaObject = mediaObjectSignals.some((rx) => rx.test(corpus));
  if (hasMediaObject) return 'other';

  return 'other';
}

function scoreInfoCandidate(characterInput, candidate) {
  const normalized = normalizeInfoCandidate(candidate);
  if (!normalized) return { score: 0, confidence: 0, candidate: null };

  const queryProfile = parseCharacterQuery(characterInput || '');
  const query = normalizeName(queryProfile.baseName || characterInput || '');
  const typoFixed = resolveLikelyTypo(query);
  const queryVariants = Array.from(new Set([query, typoFixed].map(v => normalizeName(v)).filter(Boolean)));
  const entityHints = Array.isArray(queryProfile.entityHints) ? queryProfile.entityHints.map(h => String(h || '').toLowerCase()) : [];

  const title = normalizeName(normalized.title || '');
  const titleCompact = canonicalizeName(title);
  const aliasCompacts = normalized.aliases.map(alias => canonicalizeName(alias));
  const description = String(normalized.description || '').toLowerCase();
  const categories = normalized.categories.map(c => String(c || '').toLowerCase());
  const categoryText = categories.join(' ');
  const snippet = String(normalized.searchSnippet || '').toLowerCase();
  const contextHints = queryProfile.contextHints.map(h => h.toLowerCase());
  const isSingleTokenQuery = queryVariants.some(queryVariant => queryVariant.split(/\s+/).filter(Boolean).length === 1);
  const entityPriority = classifyEntityPriority(normalized);

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
    'wikipedia-search': 0.28,
    'wikidata+wiki': 0.28,
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
    const queryTokens = queryVariant.toLowerCase().split(/\s+/).filter(Boolean);
    const titleTokens = title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const isSingleToken = queryTokens.length === 1;

    let variantNameMatch = 0;
    if (queryCompact && titleCompact && queryCompact === titleCompact) {
      variantNameMatch += 0.38;
    }

    const hasTokenMatch = isSingleToken
      ? titleTokens.includes(queryTokens[0])
      : (queryCompact && titleCompact && (titleCompact.includes(queryCompact) || queryCompact.includes(titleCompact)));

    if (hasTokenMatch) {
      variantNameMatch += 0.08;
    }

    if (queryTokens.length === 1 && title.toLowerCase().startsWith(`${queryTokens[0]} (`)) {
      variantNameMatch += 0.06;
    }

    if (isSingleToken && !titleTokens.includes(queryTokens[0])) {
      const hasDisambiguatingHints = contextHints.length > 0 || entityHints.length > 0;
      confidenceSignals.penalties -= hasDisambiguatingHints ? 0.04 : 0.12;
    }

    const similarity = calculateNameSimilarity(queryVariant, title);
    variantNameMatch += Math.min(0.28, similarity * 0.4);

    let variantAliasMatch = 0;
    if (aliasCompacts.includes(queryCompact)) variantAliasMatch += 0.24;
    else if (!isSingleToken && aliasCompacts.some(alias => alias && queryCompact && (alias.includes(queryCompact) || queryCompact.includes(alias)))) {
      variantAliasMatch += 0.12;
    }

    if (
      queryTokens.length === 1 &&
      queryCompact &&
      titleCompact &&
      (queryCompact.startsWith(titleCompact) || titleCompact.startsWith(queryCompact))
    ) {
      variantAliasMatch += 0.16;
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

  if (entityHints.length) {
    const corpus = `${title} ${description} ${categoryText}`.toLowerCase();
    const entityHintRegex = {
      person: /person|biography|historical|actor|athlete|scientist|politician|author/,
      character: /character|fictional|hero|villain/,
      nickname: /nickname|alias|epithet|also known as/,
      object: /object|artifact|device|vehicle|tool|machine/,
      species: /animal|species|genus|taxonomy|organism/,
      legend: /myth|mythology|deity|legend|folklore/,
      name: /surname|family name|given name|name disambiguation/
    };
    const hintMatches = entityHints.reduce((count, hint) => {
      const rx = entityHintRegex[hint];
      return rx && rx.test(corpus) ? count + 1 : count;
    }, 0);
    if (hintMatches > 0) {
      confidenceSignals.contextMatch += Math.min(0.16, hintMatches * 0.06);
    }
  }

  if (queryVariants.some(q => q && description.includes(q.toLowerCase()))) {
    confidenceSignals.quality += 0.08;
  }

  if (/fictional|character|superhero|villain|comic|manga|anime|mythology|historical|biography|actor|athlete|politician|scientist|animal|species|genus|family\s*name|surname|given\s*name|artifact|object|vehicle|deity|folklore|nickname|epithet/.test(categoryText)) {
    confidenceSignals.quality += 0.1;
  }

  if (/fictional|character|mythology|historical|animal|species|surname|given name|artifact|object|deity|nickname/.test(snippet)) {
    confidenceSignals.quality += 0.05;
  }

  if (entityPriority === 'fictional') {
    confidenceSignals.quality += 0.24;
    confidenceSignals.nameMatch += 0.05;
  } else if (entityPriority === 'real') {
    confidenceSignals.quality += 0.12;
  } else {
    confidenceSignals.penalties -= 0.04;
  }

  if ((normalized.description || '').length >= 400) {
    confidenceSignals.quality += 0.06;
  }

  if (isSingleTokenQuery && /surname|given names?|family name/.test(categoryText)) {
    confidenceSignals.quality += 0.08;
  }

  if (isSingleTokenQuery) {
    if (/fictional character|mythology|deity|folklore|cryptid|legend|species|animal/.test(`${categoryText} ${description}`)) {
      confidenceSignals.quality += 0.08;
      confidenceSignals.nameMatch += 0.04;
    }
    if (/\((?:character|mythology|folklore|cryptid|legend|animal|species)\)/i.test(String(normalized.title || ''))) {
      confidenceSignals.quality += 0.06;
    }
  }

  const titleLower = String(normalized.title || '').toLowerCase();
  const mediaLikeTitle = /\((?:\d{4} film|film|album|song|tv series|television series|video game)\)/.test(titleLower);
  const mediaLikeDescription = /\bis a (?:\d{4}\s+)?(?:american|british|japanese|french|indian)?\s*(film|album|song|television series|video game)\b/.test(description);
  const queryLooksMedia = queryVariants.some(queryVariant => /film|movie|album|song|series|show/.test(queryVariant.toLowerCase()));
  const queryLooksEntitySpecific = entityHints.some(hint => ['object', 'legend', 'name', 'person', 'nickname', 'species'].includes(hint));
  if (isSingleTokenQuery && !queryLooksMedia && !queryLooksEntitySpecific && (mediaLikeTitle || mediaLikeDescription)) {
    confidenceSignals.penalties -= 0.2;
  }

  if ((mediaLikeTitle || mediaLikeDescription) && entityPriority !== 'fictional') {
    confidenceSignals.penalties -= 0.12;
  }

  const isCharacterListLike = /list of/i.test(String(normalized.title || '')) && /character|fictional/i.test(categoryText);
  if (/disambiguation|album|song|filmography|episode/.test(categoryText)) {
    confidenceSignals.penalties -= 0.18;
  }

  if (/surname|given names?/.test(categoryText) && !/(surname|family name|last name|given name)/.test((queryProfile.baseName || '').toLowerCase())) {
    confidenceSignals.penalties -= 0.1;
  } else if (/list of/.test(categoryText) && !isCharacterListLike) {
    confidenceSignals.penalties -= 0.12;
  }

  if (/(?:may refer to|disambiguation)/i.test(String(normalized.description || ''))) {
    confidenceSignals.penalties -= 0.25;
  }

  if (/\((?:character|mythology|historical figure|actor|singer|writer|athlete)\)/i.test(String(normalized.title || ''))) {
    confidenceSignals.quality += 0.04;
  }

  score += confidenceSignals.nameMatch;
  score += confidenceSignals.aliasMatch;
  score += confidenceSignals.contextMatch;
  score += confidenceSignals.quality;
  score += confidenceSignals.penalties;

  let confidence = Math.max(0, Math.min(1, score));
  const linkageScore = confidenceSignals.nameMatch + confidenceSignals.aliasMatch + confidenceSignals.contextMatch;
  if (linkageScore < 0.09) {
    confidence = Math.min(confidence, 0.36);
  } else if (linkageScore < 0.16) {
    confidence = Math.min(confidence, 0.48);
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
