# OVR & Chemistry Improvements - Current Snapshot

**Last updated:** February 18, 2026  
**Status:** Enhanced evaluator logic is integrated

## OVR Direction (Current)

- OVR is no longer treated as a flat direct map from a single score.
- Evaluation includes scenario relevance and character viability signals.
- Round 4 output surfaces both score context and presentation-friendly tiers.

## Chemistry Direction (Current)

- Team chemistry is calculated server-side during Round 4 evaluation.
- Chemistry contributes to final team standing alongside character OVR results.
- Logic is modularized to keep pattern/rule tuning isolated from socket flow.

## Code Locations

- `server/chemistryCalculator.js`
- `server/evaluator.js`
- `server/evaluator/ovr.js`
- `server/evaluator/relevance.js`
- `server/evaluator/candidateScoring.js`

## Practical Outcome

- Teams are judged with more context than pure popularity.
- Final leaderboard reflects both individual character quality and roster synergy.
