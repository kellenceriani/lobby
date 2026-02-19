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
      })
    };
  }

  const info = validation.wordCount <= 4 ? await fetchCharacterInfo(character) : null;
  const infoConfidence = info && typeof info.confidence === 'number' ? info.confidence : 0;
  const trustedInfo = infoConfidence >= MIN_INFO_CONFIDENCE ? info : null;

  if (trustedInfo) {
    console.log(`✅ Found info for "${character}" from ${trustedInfo.source} (confidence ${Math.round(infoConfidence * 100)}%)`);
  } else {
    console.log(`⚠️ No trusted info found for "${character}"`);
  }

  let score = trustedInfo
    ? infoConfidence >= 0.86
      ? 16
      : infoConfidence >= 0.75
      ? 14
      : infoConfidence >= 0.62
      ? 12
      : 10
    : 8;

  const scoreBreakdownSteps = [];
  scoreBreakdownSteps.push({
    step: 'Base Score',
    points: score,
    description: trustedInfo
      ? `Character resolved via APIs (${Math.round(infoConfidence * 100)}% confidence, ${trustedInfo.confidenceBand || 'n/a'} band)`
      : 'Unknown or low-confidence match'
  });

  const nameSignals = scoreNameSignals(character, validation, scenario, twist);
  score += nameSignals.points;
  if (nameSignals.points !== 0) {
    scoreBreakdownSteps.push({ step: 'Name Signals', points: nameSignals.points, description: nameSignals.note });
  }

  const relevance = scoreRelevance(character, trustedInfo, scenario, twist);
  score += relevance.points;
  if (relevance.points !== 0) {
    scoreBreakdownSteps.push({ step: 'Scenario/Twist Relevance', points: relevance.points, description: relevance.note });
  }

  const draftedScenario = options.originalScenario || scenario;
  const draftedTwist = options.originalTwist || twist;
  const draftedFitBonus = calculateDraftedFitBonus(trustedInfo, draftedScenario, draftedTwist, character);
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

  if (trustedInfo && trustedInfo.source === 'wikipedia') {
    score += 2;
    scoreBreakdownSteps.push({ step: 'Wikipedia Source', points: 2, description: 'Found on Wikipedia (prestigious source)' });
  }

  if (!trustedInfo && validation.wordCount >= 3) {
    score -= 2;
    scoreBreakdownSteps.push({ step: 'Long Unknown Name', points: -2, description: '3+ words but not found in database' });
  }

  score = Math.max(SCORE_MIN, Math.min(SCORE_MAX, score));

  const ovrData = calculateAdvancedOVR(score, character, trustedInfo, scenario, twist);
  const roundedScore = Math.round(score);

  const result = {
    character,
    emotion: mapScoreToEmotion(roundedScore),
    score: roundedScore,
    ovr: ovrData.ovr,
    ovrTier: ovrData.tier,
    attributes: ovrData.attributes,
    rarity: ovrData.rarity,
    characterType: ovrData.type,
    reason: trustedInfo ? 'Evaluated' : 'Unknown character',
    notes: buildNotes({
      validation,
      info: trustedInfo,
      scenario,
      twist,
      score,
      scoreMeta: {
        relevanceNote: relevance.note || nameSignals.note,
        infoConfidence: trustedInfo ? infoConfidence : 0
      }
    }),
    breakdown: buildBreakdown({
      character,
      validation,
      info: trustedInfo,
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
    })
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
