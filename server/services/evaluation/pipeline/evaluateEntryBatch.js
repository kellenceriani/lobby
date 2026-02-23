const { evaluateEntryContext } = require('./evaluateEntryContext');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function evaluateEntryBatch(entries = [], options = {}) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  if (!safeEntries.length) return [];

  const concurrency = clamp(Number(options && options.concurrency) || 2, 1, 8);
  const results = new Array(safeEntries.length);
  let cursor = 0;

  async function worker() {
    while (cursor < safeEntries.length) {
      const index = cursor;
      cursor += 1;
      const entry = safeEntries[index];
      try {
        results[index] = await evaluateEntryContext(entry);
      } catch (error) {
        results[index] = {
          ok: false,
          error: {
            code: error && error.code ? error.code : 'CONTEXT_ENGINE_ERROR',
            message: error && error.message ? error.message : 'Unknown context engine error'
          }
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, safeEntries.length) }, () => worker()));
  return results;
}

module.exports = {
  evaluateEntryBatch
};
