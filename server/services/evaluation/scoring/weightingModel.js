function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toInt(value, fallback = 50) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.round(n), 0, 100);
}

function toPercent(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, 0, 1);
}

function hasUsableTwist(twist) {
  const normalized = String(twist || '').trim().toUpperCase();
  return normalized && normalized !== 'NO PLOT TWIST' && normalized !== 'NONE' && normalized !== 'N/A';
}

function buildWeightProfile({ evaluationMode = 'round', currentTwist, originalTwist } = {}) {
  const finalMode = evaluationMode === 'final';
  const hasCurrentTwist = hasUsableTwist(currentTwist);
  const hasOriginalTwist = hasUsableTwist(originalTwist);

  if (!finalMode) {
    return hasCurrentTwist
      ? {
        carryoverScenario: 0,
        carryoverTwist: 0,
        currentScenario: 0.4,
        currentTwist: 0.3,
        baseAbility: 0.2,
        restraints: 0.1
      }
      : {
        carryoverScenario: 0,
        carryoverTwist: 0,
        currentScenario: 0.7,
        currentTwist: 0,
        baseAbility: 0.2,
        restraints: 0.1
      };
  }

  return hasCurrentTwist
    ? {
      // Final mode (twist): context across original+final scenario/twist = 65% total.
      // If the drafted round had no twist, reallocate that carryover twist share to original scenario carryover.
      carryoverScenario: hasOriginalTwist ? 0.18 : 0.325,
      carryoverTwist: hasOriginalTwist ? 0.145 : 0,
      currentScenario: 0.18,
      currentTwist: 0.145,
      baseAbility: 0.25,
      restraints: 0.10
    }
    : {
      // Final mode (no final twist): scenario context remains 65% total, split evenly
      // between original drafted scenario carryover and current/final scenario fit.
      carryoverScenario: 0.325,
      carryoverTwist: 0,
      currentScenario: 0.325,
      currentTwist: 0,
      baseAbility: 0.25,
      restraints: 0.10
    };
}

function computeWeightedOverall(scores = {}, profile = {}) {
  const normalized = {
    currentScenarioFit: toInt(scores.currentScenarioFit, 50),
    currentTwistFit: toInt(scores.currentTwistFit, 50),
    baseAbility: toInt(scores.baseAbility, 55),
    rarity: toInt(scores.rarity, 50),
    creativity: toInt(scores.creativity, 50),
    chemistry: toInt(scores.chemistry, 50),
    originalScenarioFit: toInt(scores.originalScenarioFit, 50),
    originalTwistFit: toInt(scores.originalTwistFit, 50)
  };

  const restraintSource = Number(
    ((normalized.rarity + normalized.creativity + normalized.chemistry) / 3).toFixed(2)
  );

  const contributions = {
    carryoverScenario: normalized.originalScenarioFit * (Number(profile.carryoverScenario) || 0),
    carryoverTwist: normalized.originalTwistFit * (Number(profile.carryoverTwist) || 0),
    currentScenario: normalized.currentScenarioFit * (Number(profile.currentScenario) || 0),
    currentTwist: normalized.currentTwistFit * (Number(profile.currentTwist) || 0),
    baseAbility: normalized.baseAbility * (Number(profile.baseAbility) || 0),
    restraints: restraintSource * (Number(profile.restraints) || 0)
  };

  const overallPct = clamp(
    Number(Object.values(contributions).reduce((sum, v) => sum + (Number(v) || 0), 0).toFixed(2)),
    0,
    100
  );

  const carryoverScenarioWeight = Number(profile.carryoverScenario) || 0;
  const carryoverTwistWeight = Number(profile.carryoverTwist) || 0;
  const currentScenarioWeight = Number(profile.currentScenario) || 0;
  const currentTwistWeight = Number(profile.currentTwist) || 0;
  const totalScenarioWeight = carryoverScenarioWeight + currentScenarioWeight;
  const totalTwistWeight = carryoverTwistWeight + currentTwistWeight;
  const hasCarryoverWeights = carryoverScenarioWeight > 0 || carryoverTwistWeight > 0;
  const blendedScenarioFit = totalScenarioWeight > 0
    ? (
      ((normalized.originalScenarioFit * carryoverScenarioWeight) + (normalized.currentScenarioFit * currentScenarioWeight))
      / totalScenarioWeight
    )
    : normalized.currentScenarioFit;
  const blendedTwistFit = totalTwistWeight > 0
    ? (
      ((normalized.originalTwistFit * carryoverTwistWeight) + (normalized.currentTwistFit * currentTwistWeight))
      / totalTwistWeight
    )
    : normalized.currentTwistFit;
  const baselineScenarioWeight = hasCarryoverWeights
    ? ((currentTwistWeight > 0 || carryoverTwistWeight > 0) ? 0.45 : 0.75)
    : (currentTwistWeight > 0 ? 0.4 : 0.7);
  const baselineTwistWeight = hasCarryoverWeights
    ? ((currentTwistWeight > 0 || carryoverTwistWeight > 0) ? 0.35 : 0)
    : (currentTwistWeight > 0 ? 0.3 : 0);

  const scenarioWeightScale = totalScenarioWeight > 0
    ? Math.min(1.75, totalScenarioWeight / baselineScenarioWeight)
    : 0;
  const twistWeightScale = totalTwistWeight > 0 && baselineTwistWeight > 0
    ? Math.min(1.75, totalTwistWeight / baselineTwistWeight)
    : 0;
  const baseCurve = Math.pow(Math.max(0, overallPct) / 100, 0.78) * 99;
  const fitDelta =
    ((blendedScenarioFit - 50) * 0.16 * scenarioWeightScale) +
    ((blendedTwistFit - 50) * 0.12 * twistWeightScale) +
    ((normalized.baseAbility - 55) * 0.1) +
    ((restraintSource - 50) * 0.03);
  let synergyBonus = 0;
  if (normalized.baseAbility >= 65 && normalized.currentScenarioFit >= 65) synergyBonus += 3;
  if ((Number(profile.currentTwist) || 0) > 0 && normalized.baseAbility >= 60 && normalized.currentTwistFit >= 60) synergyBonus += 2;
  if (normalized.currentScenarioFit >= 78 && normalized.currentTwistFit >= 68) synergyBonus += 3;
  if (normalized.currentScenarioFit < 45 && normalized.currentTwistFit < 45) synergyBonus -= 4;
  if (normalized.baseAbility < 45 && overallPct < 50) synergyBonus -= 3;
  const ovr99 = clamp(Math.round(baseCurve + fitDelta + synergyBonus), 0, 99);

  return {
    scores: normalized,
    profile,
    contributions,
    overallPct,
    score30: clamp(Math.round((overallPct / 100) * 30), 0, 30),
    ovr99,
    ovrCalibration: {
      baseCurve: Number(baseCurve.toFixed(2)),
      fitDelta: Number(fitDelta.toFixed(2)),
      synergyBonus,
      scenarioWeightScale: Number(scenarioWeightScale.toFixed(2)),
      twistWeightScale: Number(twistWeightScale.toFixed(2)),
      totalScenarioWeight: Number(totalScenarioWeight.toFixed(3)),
      totalTwistWeight: Number(totalTwistWeight.toFixed(3)),
      blendedScenarioFit: Number(blendedScenarioFit.toFixed(2)),
      blendedTwistFit: Number(blendedTwistFit.toFixed(2))
    }
  };
}

module.exports = {
  buildWeightProfile,
  computeWeightedOverall,
  toPercent
};
