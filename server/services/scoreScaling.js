const ROUND_WEIGHTS = {
  1: 0.95,
  2: 1.1,
  3: 1.25,
  4: 1.85
};

const ROUND4_OVR_TO_POINTS = ROUND_WEIGHTS[4];
const ROUND4_BASE_MULTIPLIER = 2.35;
const ROUND4_COMPETITIVE_FLOOR = 60;
const ROUND4_COMPETITIVE_MULTIPLIER = 1.55;
const ROUND4_ELITE_FLOOR = 80;
const ROUND4_ELITE_CURVE = 0.2;

function getRoundWeight(roundNumber) {
  return ROUND_WEIGHTS[roundNumber] || 1;
}

function scaleRoundPoints(basePoints, roundNumber) {
  const safeBase = Math.max(0, Math.round(Number(basePoints) || 0));
  const weight = getRoundWeight(roundNumber);
  return Math.round(safeBase * weight);
}

function calculateRound4Points(teamOVR) {
  const safeOVR = Math.max(0, Math.round(Number(teamOVR) || 0));
  const basePoints = safeOVR * ROUND4_BASE_MULTIPLIER;
  const competitivePoints = Math.max(0, safeOVR - ROUND4_COMPETITIVE_FLOOR) * ROUND4_COMPETITIVE_MULTIPLIER;
  const eliteDelta = Math.max(0, safeOVR - ROUND4_ELITE_FLOOR);
  const elitePoints = eliteDelta * eliteDelta * ROUND4_ELITE_CURVE;
  return Math.round(basePoints + competitivePoints + elitePoints);
}

function describeRound4PointFormula(teamOVR) {
  const safeOVR = Math.max(0, Math.round(Number(teamOVR) || 0));
  const basePoints = Math.round(safeOVR * ROUND4_BASE_MULTIPLIER);
  const competitivePoints = Math.round(Math.max(0, safeOVR - ROUND4_COMPETITIVE_FLOOR) * ROUND4_COMPETITIVE_MULTIPLIER);
  const eliteDelta = Math.max(0, safeOVR - ROUND4_ELITE_FLOOR);
  const elitePoints = Math.round(eliteDelta * eliteDelta * ROUND4_ELITE_CURVE);
  const totalPoints = calculateRound4Points(safeOVR);
  return {
    safeOVR,
    basePoints,
    competitivePoints,
    elitePoints,
    totalPoints
  };
}

module.exports = {
  ROUND_WEIGHTS,
  ROUND4_OVR_TO_POINTS,
  getRoundWeight,
  scaleRoundPoints,
  calculateRound4Points,
  describeRound4PointFormula
};