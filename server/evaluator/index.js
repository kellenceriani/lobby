const { SCORE_MIN, SCORE_MAX, MIN_INFO_CONFIDENCE } = require('./core/constants');
const { validateInput } = require('./core/validation');
const { fetchCharacterInfo } = require('./core/fetchers');
const { scoreRelevance, calculateDraftedFitBonus, scoreNameSignals } = require('./scoring/relevance');
const { calculateAdvancedOVR, mapScoreToOVR, getOVRTier } = require('./scoring/ovr');
const { mapScoreToEmotion, buildNotes, buildBreakdown } = require('./presentation/presentation');

async function scoreCharacter(character, scenario, twist, options = {}) {
  console.log(`🔍 Scoring character: "${character}"`);

  const validation = validateInput(character);
  if (!validation.valid) {
    console.log(`❌ Invalid character "${character}": ${validation.reason}`);

    const invalidScore = validation.tier === 'disappointed' ? 4 : 0;
    const reason = validation.tier === 'disappointed' ? 'Offensive content' : 'Invalid input';

    const fallbackOVR = mapScoreToOVR(invalidScore);
    const fallbackOVRData = {
      ovr: fallbackOVR,
      tier: getOVRTier(fallbackOVR),
      rarity: 'Bronze',
      type: 'balanced',
      attributes: {}
    };

    return {
      character,
      emotion: validation.tier,
      score: invalidScore,
      ovr: fallbackOVR,
      reason,
      notes: buildNotes({ validation, info: null, scenario, twist, score: invalidScore }),
      breakdown: buildBreakdown({
        character,
        validation,
        info: null,
        scenario,
        twist,
        score: invalidScore,
        nameSignals: null,
        relevance: null,
        ovrData: fallbackOVRData
      }),
      scoreMeta: {
        validation: {
          valid: false,
          reason: validation.reason || 'invalid',
          tier: validation.tier || 'invalid'
        },
        relevancePoints: 0,
        draftedFitTotal: 0,
        draftedScenarioBonus: 0,
        draftedTwistBonus: 0,
        infoConfidence: 0,
        trustedInfo: false,
        fetchDurationMs: 0
      }
    };
  }

  const fetchStartedAt = Date.now();
  const info = await fetchCharacterInfo(character, {
    mode: options && options.evaluationMode ? options.evaluationMode : 'default',
    forceRefresh: Boolean(options && options.forceRefresh),
    fetchCacheTtlMs: Number(options && options.fetchCacheTtlMs) || 0,
    contextHints: options && options.fetchContext && Array.isArray(options.fetchContext.contextHints)
      ? options.fetchContext.contextHints
      : [],
    entityHints: options && options.fetchContext && Array.isArray(options.fetchContext.entityHints)
      ? options.fetchContext.entityHints
      : [],
    scenario: options && options.fetchContext ? options.fetchContext.scenario : scenario,
    twist: options && options.fetchContext ? options.fetchContext.twist : twist,
    originalScenario: options && options.fetchContext ? options.fetchContext.originalScenario : (options.originalScenario || scenario),
    originalTwist: options && options.fetchContext ? options.fetchContext.originalTwist : (options.originalTwist || twist),
    draftedRound: options && options.fetchContext ? options.fetchContext.draftedRound : null
  });
  const fetchDurationMs = Math.max(0, Date.now() - fetchStartedAt);
  const infoConfidence = info && typeof info.confidence === 'number' ? info.confidence : 0;
  const trustedInfo = infoConfidence >= MIN_INFO_CONFIDENCE ? info : null;
  const scoringInfo = trustedInfo || info;

  if (trustedInfo) {
    console.log(`✅ Found info for "${character}" from ${trustedInfo.source} (confidence ${Math.round(infoConfidence * 100)}%)`);
  } else {
    console.log(`⚠️ No trusted info found for "${character}"`);
  }

  const infoRichness = scoringInfo
    ? Math.min(
      4,
      (scoringInfo.description && scoringInfo.description.length >= 600 ? 2 : 0) +
      (Array.isArray(scoringInfo.aliases) && scoringInfo.aliases.length >= 2 ? 1 : 0) +
      (Array.isArray(scoringInfo.categories) && scoringInfo.categories.length >= 3 ? 1 : 0)
    )
    : 0;

  let score = trustedInfo
    ? Math.round(7 + (infoConfidence * 9) + infoRichness)
    : 6;

  const scoreBreakdownSteps = [];
  scoreBreakdownSteps.push({
    step: 'Base Score',
    points: score,
    description: trustedInfo
      ? `Character resolved via APIs (${Math.round(infoConfidence * 100)}% confidence, ${trustedInfo.confidenceBand || 'n/a'} band, richness +${infoRichness})`
      : 'Unknown or low-confidence match'
  });

  const nameSignals = scoreNameSignals(character, validation, scenario, twist);
  score += nameSignals.points;
  if (nameSignals.points !== 0) {
    scoreBreakdownSteps.push({ step: 'Name Signals', points: nameSignals.points, description: nameSignals.note });
  }

  const relevance = scoreRelevance(character, scoringInfo, scenario, twist);
  score += relevance.points;
  if (relevance.points !== 0) {
    scoreBreakdownSteps.push({ step: 'Scenario/Twist Relevance', points: relevance.points, description: relevance.note });
  }

  const draftedScenario = options.originalScenario || scenario;
  const draftedTwist = options.originalTwist || twist;
  const draftedFitBonus = calculateDraftedFitBonus(scoringInfo, draftedScenario, draftedTwist, character);
  const draftedScenarioBonus = Math.min(3, draftedFitBonus.scenario || 0);
  const draftedTwistBonus = Math.min(3, draftedFitBonus.twist || 0);

  if (draftedScenarioBonus > 0) {
    score += draftedScenarioBonus;
    scoreBreakdownSteps.push({
      step: 'Original Scenario Fit (Drafted)',
      points: draftedScenarioBonus,
      description: `Draft-time scenario alignment bonus (+${draftedScenarioBonus}/3)`
    });
  }

  if (draftedTwistBonus > 0) {
    score += draftedTwistBonus;
    scoreBreakdownSteps.push({
      step: 'Original Twist Fit (Drafted)',
      points: draftedTwistBonus,
      description: `Draft-time twist alignment bonus (+${draftedTwistBonus}/3)`
    });
  }

  if (scoringInfo && scoringInfo.source === 'wikipedia') {
    score += 1;
    scoreBreakdownSteps.push({ step: 'Wikipedia Source', points: 1, description: 'Found on Wikipedia (high-trust source)' });
  }

  if (!trustedInfo && info) {
    const lowConfidencePenalty = infoConfidence < 0.2 ? -3 : infoConfidence < 0.3 ? -2 : -1;
    score += lowConfidencePenalty;
    scoreBreakdownSteps.push({
      step: 'Low Confidence Penalty',
      points: lowConfidencePenalty,
      description: `Low-confidence resolution (${Math.round(infoConfidence * 100)}%)`
    });
  }

  if (!trustedInfo && validation.wordCount >= 3) {
    score -= 1;
    scoreBreakdownSteps.push({ step: 'Long Unknown Name', points: -1, description: '3+ words but no trusted match' });
  }

  score = Math.max(SCORE_MIN, Math.min(SCORE_MAX, score));

  const ovrData = calculateAdvancedOVR(score, character, scoringInfo, scenario, twist);
  const roundedScore = Math.round(score);

  const result = {
    character,
    emotion: mapScoreToEmotion(roundedScore),
    score: roundedScore,
    ovr: ovrData.ovr,
    imageUrl: scoringInfo && scoringInfo.imageUrl ? scoringInfo.imageUrl : null,
    infoSource: scoringInfo && scoringInfo.source ? scoringInfo.source : null,
    ovrTier: ovrData.tier,
    attributes: ovrData.attributes,
    rarity: ovrData.rarity,
    characterType: ovrData.type,
    reason: scoringInfo ? (trustedInfo ? 'Evaluated' : 'Low-confidence character match') : 'Unknown character',
    notes: buildNotes({
      validation,
      info: scoringInfo,
      scenario,
      twist,
      score,
      scoreMeta: {
        relevanceNote: relevance.note || nameSignals.note,
        infoConfidence: scoringInfo ? infoConfidence : 0
      }
    }),
    breakdown: buildBreakdown({
      character,
      validation,
      info: scoringInfo,
      scenario,
      twist,
      score: roundedScore,
      nameSignals,
      relevance,
      draftedFitBonus: {
        scenario: draftedScenarioBonus,
        twist: draftedTwistBonus
      },
      ovrData,
      scoreBreakdownSteps
    }),
    scoreMeta: {
      relevancePoints: relevance.points,
      draftedFitTotal: draftedScenarioBonus + draftedTwistBonus,
      draftedScenarioBonus,
      draftedTwistBonus,
      infoConfidence: scoringInfo ? infoConfidence : 0,
      trustedInfo: Boolean(trustedInfo),
      fetchDurationMs
    }
  };

  console.log(`📊 "${character}" → Score: ${result.score}/30, OVR: ${result.ovr} [${ovrData.tier.label}], Type: ${ovrData.type}, Rarity: ${ovrData.rarity}, Emotion: ${result.emotion}`);

  return result;
}

module.exports = {
  scoreCharacter,
  validateInput,
  fetchCharacterInfo,
  mapScoreToEmotion,
  mapScoreToOVR
};
