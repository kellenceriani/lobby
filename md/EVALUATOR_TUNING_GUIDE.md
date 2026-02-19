# Evaluator Tuning Guide

Last updated: February 19, 2026

Use this guide when the request is "improve evaluator quality quickly".

## 1) Tuning Surface Map

- **Input validation**: `server/evaluator/core/validation.js`
- **Lookup confidence and candidate ranking**:
  - `server/evaluator/core/fetchers.js`
  - `server/evaluator/core/candidateScoring.js`
  - `server/evaluator/core/constants.js`
- **Relevance / feasibility / twist impact**: `server/evaluator/scoring/relevance.js`
- **OVR conversion and rarity/type bonuses**: `server/evaluator/scoring/ovr.js`
- **Presentation text and breakdown shape**: `server/evaluator/presentation/presentation.js`
- **Team chemistry**: `server/evaluator/team/chemistryCalculator.js`
- **Rounds 1–3 intel bonus economy**: `server/services/roundEvaluationService.js`
- **Round 4 point economy**: `server/services/scoreScaling.js`

## 2) Fastest High-Impact Knobs

- Increase/decrease metadata trust gate:
  - `MIN_INFO_CONFIDENCE` in `constants.js`

- Change Round 4 point inflation/deflation:
  - `ROUND4_BASE_MULTIPLIER`
  - `ROUND4_COMPETITIVE_MULTIPLIER`
  - `ROUND4_ELITE_CURVE`
  - in `scoreScaling.js`

- Change rounds 1–3 intel impact (without overpowering voting):
  - `ROUND_INTEL_TUNING` in `roundEvaluationService.js`
  - especially `maxIntelBonus`, `relevanceWeight`, `confidenceWeight`, `trustedRatioWeight`

- Make scenario fit more/less strict:
  - `mapFitCountToPoints`, capability scoring, feasibility thresholds in `relevance.js`

- Make chemistry more/less swingy:
  - `CHEMISTRY_MAX`, `CHEMISTRY_BASE`, relationship bonuses/penalties in `chemistryCalculator.js`

## 3) Recommended Change Sequence (Large Retune)

1. Adjust **rounds 1–3 intel economy** (`roundEvaluationService.js`) to keep vote impact primary.
2. Adjust **Round 4 point economy** (`scoreScaling.js`) to target endgame impact.
3. Adjust **individual skill model** (`relevance.js`, `ovr.js`) to improve ranking quality.
4. Adjust **chemistry volatility** to avoid overpowering individual OVR.
5. Validate with a scenario matrix (action, mystery, building, social, absurd).
6. Ensure no ties/regressions in final leaderboard generation.

## 4) Stability Constraints

- Keep evaluator response shape stable for UI:
  - `emotion`, `score`, `ovr`, `ovrTier`, `rarity`, `characterType`, `notes`, `breakdown`, `phrase`.
- Keep `teamSummary` fields stable for Round 4 cards and leaderboard.
- Keep round result intel summary fields stable (`averageRelevance`, `averageAdaptability`, `averageConfidence`, `averageFetchDurationMs`, `trustedCount`).
- Preserve one-time application guard (`round4Applied`) in socket layer.

## 5) Quality Checklist

- Known characters should outperform unknown random strings.
- Scenario fit should noticeably affect OVR and notes.
- Twist impacts should produce both positive and negative outcomes.
- Chemistry should be meaningful but not dominate all outcomes.
- Round 1–3 intel bonuses should reward quality without nullifying vote outcomes.
- Round 4 points should create decisive but believable leaderboard movement.

## 6) Telemetry During Tuning

- Compact per-round telemetry is always logged from `roundEvaluationService.js`.
- Optional per-player verbose telemetry:
  - Set `INTEL_TELEMETRY_VERBOSE=true`
  - Truthy values supported: `1`, `true`, `yes`, `on`