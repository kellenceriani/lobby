# server/evaluator/scoring/

Last updated: February 28, 2026

- `relevance.js` - context fit, feasibility, twist impact.
- `ovr.js` - OVR shaping from base score + modifiers.

These files are the highest-impact area for score-behavior tuning.

Deterministic weighting notes:

- Final score/OVR composition is server-authoritative.
- Round 4 weighting references are documented in `../../md/ROUND4_AI_EVALUATOR_SPEC.md`.
- Global tuning workflow and guardrails are documented in `../../md/EVALUATOR_TUNING_GUIDE.md`.
