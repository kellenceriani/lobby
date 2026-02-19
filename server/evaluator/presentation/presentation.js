const { SCORE_MAX } = require('../core/constants');
const { calculateScenarioFitValue, getScenarioFitExplanation } = require('../scoring/relevance');

function mapScoreToEmotion(score) {
  if (score === 0) return 'mad';
  if (score <= 5) return 'disappointed';
  if (score <= 10) return 'confused';
  if (score <= 18) return 'neutral';
  if (score <= 23) return 'happy';
  if (score <= 27) return 'amazed';
  return 'mindBlown';
}

function buildNotes({ validation, info, scenario, twist, scoreMeta }) {
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
    if (scoreMeta && typeof scoreMeta.infoConfidence === 'number' && scoreMeta.infoConfidence > 0) {
      notes.push(`Match confidence: ${Math.round(scoreMeta.infoConfidence * 100)}% (${info.confidenceBand || 'unknown'}).`);
    }
    if (info.confidenceSignals) {
      const s = info.confidenceSignals;
      notes.push(`Confidence signals: source ${Math.round((s.sourceReliability || 0) * 100)}%, name ${Math.round((s.nameMatch || 0) * 100)}%, alias/context ${Math.round(((s.aliasMatch || 0) + (s.contextMatch || 0)) * 100)}%.`);
    }
    if (scoreMeta && scoreMeta.relevanceNote) notes.push(scoreMeta.relevanceNote);
    return notes;
  }

  if (wordCount > 3) notes.push('Lookup skipped: long name (4+ words).');
  else notes.push('Lookup attempted: no direct match found.');

  notes.push(`Heuristic score from name length (${wordCount} words).`);
  if (scoreMeta && scoreMeta.relevanceNote) notes.push(scoreMeta.relevanceNote);
  notes.push('Tip: well-known names score higher.');
  return notes;
}

function getRarityBonusFromTier(rarityTier) {
  const rarityMap = {
    Icon: 15,
    Legendary: 12,
    Epic: 9,
    Rare: 6,
    Common: 2,
    Bronze: 0
  };
  return rarityMap[rarityTier] || 0;
}

function getRarityExplanation(rarityTier, bonus) {
  const explanations = {
    Icon: `Icon-tier character from legendary franchise/history (+${bonus})`,
    Legendary: `Legendary character with massive cultural impact (+${bonus})`,
    Epic: `Epic-tier character, well-known and powerful (+${bonus})`,
    Rare: `Rare or niche pull with standout uniqueness (+${bonus})`,
    Common: `Common/known character (+${bonus})`,
    Bronze: 'Unknown or unrecognized character (no bonus)'
  };
  return explanations[rarityTier] || `Character rarity: ${rarityTier} (+${bonus})`;
}

function buildBreakdown({ character, validation, info, scenario, twist, score, nameSignals, relevance, draftedFitBonus, ovrData, scoreBreakdownSteps }) {
  const breakdown = {
    characterSummary: '',
    scenarioRelevance: '',
    twistRelevance: '',
    keywordMatches: { scenario: [], twist: [] },
    draftedFitBonus: draftedFitBonus || { scenario: 0, twist: 0 },
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

  if (!validation.valid) {
    breakdown.characterSummary = validation.reason === 'invalid'
      ? 'Invalid input detected. This is not a valid character name.'
      : validation.reason === 'offensive'
      ? 'This input contains blocked content and cannot be scored normally.'
      : 'This input did not pass validation checks.';
  } else if (info) {
    const descPreview = info.description ? `${info.description.substring(0, 200)}...` : 'No detailed description available.';
    const source = info.source === 'wikipedia' ? 'Wikipedia' : info.source;
    breakdown.characterSummary = `Found in ${source}${info.title ? ` as "${info.title}"` : ''}. ${descPreview}`;
  } else {
    breakdown.characterSummary = 'Character not found in our database. Scored based on name structure and heuristics. This might be an obscure character, original creation, or misspelled name.';
  }

  if (relevance && relevance.scenario) {
    const scenarioKeywords = relevance.scenario.matchedKeywords || [];
    breakdown.keywordMatches.scenario = scenarioKeywords;
    const feasibilityScore = relevance.scenario.feasibilityScore || 0;

    if (relevance.scenario.thrive) breakdown.scenarioRelevance = `Can do scenario confidently and likely thrives (${feasibilityScore}/10 feasibility).`;
    else if (relevance.scenario.canDo) breakdown.scenarioRelevance = `Can do scenario with workable fit (${feasibilityScore}/10 feasibility).`;
    else breakdown.scenarioRelevance = `Likely cannot execute scenario reliably (${feasibilityScore}/10 feasibility).`;

    if ((draftedFitBonus && draftedFitBonus.scenario) > 0) breakdown.scenarioRelevance += ` Drafted-fit bonus: +${draftedFitBonus.scenario}/3.`;
  } else if (nameSignals && nameSignals.note && nameSignals.note.includes('name matches scenario')) {
    breakdown.scenarioRelevance = 'Character name directly references scenario keywords, showing strong selection strategy.';
  } else {
    breakdown.scenarioRelevance = info
      ? 'No strong keyword overlap with scenario. Character may still contribute through team dynamics or creative interpretation.'
      : 'Unknown character with no database info to assess scenario fit. Scored on name structure alone.';
  }

  if (relevance && relevance.twist) {
    const twistKeywords = relevance.twist.matchedKeywords || [];
    breakdown.keywordMatches.twist = twistKeywords;
    const twistImpactScore = relevance.twist.impactScore || 0;

    if (relevance.twist.helps) breakdown.twistRelevance = `Twist helps this character (${twistImpactScore} impact).`;
    else if (relevance.twist.hurts) breakdown.twistRelevance = `Twist hurts this character (${twistImpactScore} impact).`;
    else breakdown.twistRelevance = `Twist impact is mostly neutral (${twistImpactScore} impact).`;

    if ((draftedFitBonus && draftedFitBonus.twist) > 0) breakdown.twistRelevance += ` Drafted-fit bonus: +${draftedFitBonus.twist}/3.`;
  } else {
    breakdown.twistRelevance = info
      ? 'Limited connection to twist keywords. Success may depend on creative strategy and team synergy.'
      : 'Unknown character - cannot assess twist relevance from database.';
  }

  if (ovrData) {
    const baseOVR = Math.round((score / SCORE_MAX) * 70);
    const rarityBonus = getRarityBonusFromTier(ovrData.rarity);
    const attributeValues = Object.values(ovrData.attributes || {});
    const topStats = attributeValues.sort((a, b) => b - a).slice(0, 3);
    const attributeBonus = topStats.length > 0 ? Math.round(topStats.reduce((sum, val) => sum + val, 0) / 3 * 0.15) : 0;
    const scenarioFit = calculateScenarioFitValue(character, info, scenario, twist);
    const preMultiplier = baseOVR + rarityBonus + attributeBonus;

    breakdown.ovrBreakdown = {
      baseFromScore: baseOVR,
      rarityBonus,
      attributeBonus,
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

module.exports = {
  mapScoreToEmotion,
  buildNotes,
  buildBreakdown
};
