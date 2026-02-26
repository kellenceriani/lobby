const { resolveAudioBlurbBatch } = require('./audioBlurbResolverService');

async function resolveAudioCalloutBatch(clipsDir, entries = [], options = {}) {
  return resolveAudioBlurbBatch(clipsDir, entries, options);
}

module.exports = {
  resolveAudioCalloutBatch,
  resolveAudioBlurbBatch: resolveAudioCalloutBatch
};
