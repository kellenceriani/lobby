# Evaluator Tuning Guide

Last updated: February 28, 2026

## Primary Tuning Surfaces

- Resolver/candidate quality:
  - `server/evaluator/core/fetchers.js`
  - `server/evaluator/core/candidateScoring.js`
  - `server/services/evaluation/resolver/*`

- Context parsing and signals:
  - `server/services/evaluation/context/parseRoundContext.js`
  - `server/services/evaluation/scoring/contextSignals.js`

- Scoring and weighting:
  - `server/evaluator/scoring/relevance.js`
  - `server/evaluator/scoring/ovr.js`
  - `server/services/evaluation/scoring/weightingModel.js`
  - `server/services/scoreScaling.js`

- Team chemistry:
  - `server/evaluator/team/chemistryCalculator.js`

## High-Impact, Low-Risk Sequence

1. Tune resolver confidence and fallback behavior.
2. Tune context fit weighting before changing OVR curves.
3. Tune Round 1-3 intel bonus caps.
4. Tune Round 4 point conversion.
5. Tune chemistry volatility last.

## Deterministic Scoring Model (Server Weights)

Round OVR (draft rounds):

- Keep weighting deterministic and scenario-led.
- Exact sub-score split can evolve as context parsing improves, but stays server-authoritative and replay-stable.

Final OVR (Round 4):

If final twist exists:

1. Original scenario carryover: 18%
2. Original twist carryover: 14.5%
3. Final scenario fit: 18%
4. Final twist fit: 14.5%
5. Base ability: 25%
6. Other restraints incl. chemistry: 10%

If no final twist:

1. Original scenario carryover: 32.5%
2. Final scenario fit: 32.5%
3. Base ability: 25%
4. Other restraints incl. chemistry: 10%

Rules:

- Compute final score/OVR server-side from clamped sub-scores (`0-100`).
- Keep original-context carryover meaningful but capped (`<=33%` per carryover lane).
- Tune weights in `server/services/evaluation/scoring/weightingModel.js`, never in client presentation code.

## Guardrails

- Keep payload shape stable for client renderers (`app.js`, `round4Eval.js`).
- Avoid over-rewarding low-confidence entries.
- Keep vote impact meaningful in rounds 1-3.
- Validate tie and edge-case ordering after each tuning pass.

## Chemistry Risk and Opportunity Map

Active risks:

- Rule interactions can over-stack without balance checks.
- Expanded keyword systems can overfit to popular franchises.
- Low-confidence resolver paths can leak into chemistry perception.

High-value follow-up:

1. Add Monte Carlo distribution tests for chemistry bonus variance.
2. Build confidence-calibration checks for candidate scoring.
3. Add profile presets (`balanced`, `chaotic`, `competitive`) behind explicit flags.
4. Capture evaluator telemetry snapshots for post-match diagnostics.

## Telemetry Focus for Tuning Runs

- `dangerous_title_diff` rate overall and by source (`wikipedia-search` is the primary watch bucket).
- Risky outliers (`risky60+`) and low-confidence elite outliers (`lowConf80+`).
- Synthetic image rate and backfill success by source.
- Resolver-side audio coverage versus client playback success/failure telemetry.

## Validation

- `npm run eval:viability`
- `npm run bench:context`
- `npm run bench:random500`

Use fixed sample sets before and after each tuning change so score shifts are explainable.
