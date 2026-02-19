# OVR & Chemistry Improvement Log

Last updated: February 18, 2026
Status: advanced evaluator and chemistry systems active

## Implemented Improvements

### OVR System

- Moved beyond flat score-to-OVR mapping into composite model:
	- base score contribution
	- rarity/franchise signal bonuses
	- attribute-based bonus
	- scenario fit multiplier
- Added tiered OVR labels (Bronze -> Icon) for clearer UX interpretation.
- Added expanded breakdown payload so UI can explain score composition.

### Relevance + Viability

- Added intent/domain/trait matching for scenario and twist.
- Added scenario feasibility scoring (`canDo`/`thrive`) logic.
- Added twist impact model (helps/hurts/neutral with reasons).

### Chemistry System

- Upgraded from simple bonus to multi-phase synergy engine:
	- relationships (allies/rivals/enemies)
	- thematic feature rules
	- franchise universe cohesion
	- alignment and role composition
	- era/narrative/power-balance checks
	- penalty rules and overlap-adjusted stacking

## Current Risk Areas

- Chemistry rule interactions can over-stack without continuous balance checks.
- Expanded keyword systems may overfit to famous franchises.
- Lookup confidence and typo recovery can cause occasional false positives.

## Next High-Value Opportunities

1. Add Monte Carlo distribution tests for chemistry bonus variance.
2. Add confidence calibration dataset for candidate scoring.
3. Add configurable weighting profile presets (`balanced`, `chaotic`, `competitive`).
4. Add evaluator telemetry snapshots for post-match diagnostics.

## Primary Code Paths

- OVR: `server/evaluator/scoring/ovr.js`
- Relevance/feasibility: `server/evaluator/scoring/relevance.js`
- Candidate quality/confidence: `server/evaluator/core/candidateScoring.js`
- Chemistry: `server/evaluator/team/chemistryCalculator.js`
- Point economy: `server/services/scoreScaling.js`
