function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scoreKeywordOverlap(source = [], target = []) {
  const sourceSet = new Set((Array.isArray(source) ? source : []).map((v) => String(v || '').toLowerCase()).filter(Boolean));
  const targetSet = new Set((Array.isArray(target) ? target : []).map((v) => String(v || '').toLowerCase()).filter(Boolean));
  if (!sourceSet.size || !targetSet.size) return { overlap: 0, ratio: 0 };

  let overlap = 0;
  for (const token of sourceSet) {
    if (targetSet.has(token)) overlap += 1;
  }
  const ratio = overlap / Math.max(1, targetSet.size);
  return {
    overlap,
    ratio: Number(clamp(ratio, 0, 1).toFixed(3))
  };
}

module.exports = {
  scoreKeywordOverlap
};
