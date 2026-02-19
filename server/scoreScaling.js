const ROUND_WEIGHTS = {
  1: 0.95,
  2: 1.1,
  3: 1.25,
  4: 1.85
};

const ROUND4_OVR_TO_POINTS = ROUND_WEIGHTS[4];

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
  return Math.round(safeOVR * ROUND4_OVR_TO_POINTS);
}

module.exports = {
  ROUND_WEIGHTS,
  ROUND4_OVR_TO_POINTS,
  getRoundWeight,
  scaleRoundPoints,
  calculateRound4Points
};