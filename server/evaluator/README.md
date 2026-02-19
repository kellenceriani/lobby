# server/evaluator

Round 4 character and team evaluation system.

## Subsystems

- `index.js`: `scoreCharacter` orchestration entry
- `core/`: constants, validation, metadata fetchers, text/candidate utilities
- `scoring/`: relevance, feasibility, twist impact, OVR computation
- `presentation/`: emotion mapping, notes, breakdown payload, flavor phrases
- `team/`: chemistry bonus engine

Canonical specs:
- `../../md/ROUND4_AI_EVALUATOR_SPEC.md`
- `../../md/EVALUATOR_TUNING_GUIDE.md`
