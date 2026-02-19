const { scoreCharacter } = require('../evaluator');
const { getRandomPhrase } = require('../evaluator/presentation/phraseGenerator');
const { calculateChemistryDetails } = require('../evaluator/team/chemistryCalculator');
const { calculateRound4Points, describeRound4PointFormula } = require('./scoreScaling');

async function mapWithConcurrency(items, concurrency, mapper) {
  const safeConcurrency = Math.max(1, Math.min(concurrency || 1, items.length || 1));
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: safeConcurrency }, () => worker()));
  return results;
}

async function evaluateRound4FromGame(game) {
  const scenario = game.currentScenario;
  const twist = game.currentTwist;

  const teams = game.players.map((player) => ({
    playerName: player.name,
    roster: Array.isArray(player.finalTeam) ? player.finalTeam.slice(0, 6) : [],
    draftMeta: Array.isArray(player.finalTeamDraftMeta) ? player.finalTeamDraftMeta : []
  }));

  const evaluatedTeams = await mapWithConcurrency(teams, 2, async ({ playerName, roster, draftMeta }) => {
    const evaluations = await mapWithConcurrency(roster, 3, async (char) => {
      const draftedMeta = draftMeta.find((entry) =>
        entry && entry.character && entry.character.toLowerCase() === String(char).toLowerCase()
      );

      const evalData = await scoreCharacter(char, scenario, twist, {
        originalScenario: draftedMeta && draftedMeta.originalScenario ? draftedMeta.originalScenario : scenario,
        originalTwist: draftedMeta && draftedMeta.originalTwist ? draftedMeta.originalTwist : twist
      });

      evalData.phrase = getRandomPhrase(evalData.emotion);
      return evalData;
    });

    const chemistryInfo = calculateChemistryDetails(roster);
    const chemistryBonus = chemistryInfo.bonus;
    const averageOVR = evaluations.length
      ? Math.round(evaluations.reduce((sum, e) => sum + e.ovr, 0) / evaluations.length)
      : 0;
    const teamOVR = Math.round(averageOVR + chemistryBonus);
    const topPickEval = evaluations.reduce((best, current) => {
      if (!best || current.ovr > best.ovr) return current;
      return best;
    }, null);

    return {
      playerName,
      evaluations,
      teamSummary: {
        totalOVR: teamOVR,
        chemistryBonus,
        chemistryDetails: chemistryInfo.details,
        chemistryRawScore: typeof chemistryInfo.rawScore === 'number' ? chemistryInfo.rawScore : null,
        chemistryBase: typeof chemistryInfo.base === 'number' ? chemistryInfo.base : null,
        averageOVR,
        topPick: topPickEval ? topPickEval.character : 'N/A',
        highestOVR: topPickEval ? topPickEval.ovr : 0,
        evaluationCount: evaluations.length
      }
    };
  });

  const teamEvaluations = {};
  const roundPoints = {};
  const pointBreakdown = {};

  evaluatedTeams.forEach(({ playerName, evaluations, teamSummary }) => {
    teamEvaluations[playerName] = { evaluations, teamSummary };
    const weightedRoundPoints = calculateRound4Points(teamSummary.totalOVR);
    const formula = describeRound4PointFormula(teamSummary.totalOVR);
    roundPoints[playerName] = weightedRoundPoints;
    pointBreakdown[playerName] = [
      `Team OVR: ${teamSummary.totalOVR}`,
      `Average OVR: ${teamSummary.averageOVR}`,
      `Chemistry Adjustment: ${teamSummary.chemistryBonus >= 0 ? '+' : ''}${teamSummary.chemistryBonus}`,
      ...(typeof teamSummary.chemistryRawScore === 'number' && typeof teamSummary.chemistryBase === 'number'
        ? [`Chemistry Raw Score: ${teamSummary.chemistryRawScore} (base ${teamSummary.chemistryBase})`]
        : []),
      `Round 4 Base (${formula.safeOVR} × 2.35): +${formula.basePoints}`,
      `Competitive Bonus (OVR > 60): +${formula.competitivePoints}`,
      `Elite Bonus (OVR > 80 curve): +${formula.elitePoints}`,
      `Round 4 Total: ${formula.totalPoints}`,
      `Top Pick: ${teamSummary.topPick}`
    ];
  });

  const finalLeaderboard = Object.entries(teamEvaluations)
    .map(([playerName, teamData]) => ({
      playerName,
      totalOVR: teamData.teamSummary.totalOVR,
      chemistryBonus: teamData.teamSummary.chemistryBonus,
      topPick: teamData.teamSummary.topPick,
      topPickImageUrl: (teamData.evaluations.find((entry) => entry.character === teamData.teamSummary.topPick) || {}).imageUrl || null
    }))
    .sort((a, b) => b.totalOVR - a.totalOVR);

  return {
    scenario,
    twist,
    teamEvaluations,
    finalLeaderboard,
    roundPoints,
    pointBreakdown
  };
}

module.exports = {
  evaluateRound4FromGame
};
