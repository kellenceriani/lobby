const { DEFAULT_EVAL_RESULT_SHAPE } = require('./contracts/resultShape');
const { buildWeightProfile, computeWeightedOverall } = require('./scoring/weightingModel');

module.exports = {
  DEFAULT_EVAL_RESULT_SHAPE,
  buildWeightProfile,
  computeWeightedOverall
};
