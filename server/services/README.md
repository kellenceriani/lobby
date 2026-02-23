# server/services

Cross-cutting backend services.

- `entryEvaluationService.js`: stable adapter for all character evaluations (current legacy engine, future context engine)
- `evaluation/`: scaffold for the new deterministic Context Engine migration
- `round4Service.js`: evaluates complete final rosters with concurrency-limited mapping
- `roundEvaluationService.js`: evaluates rounds 1-3 and computes intel bonuses
- `scoreScaling.js`: round weights + nonlinear Round 4 points formula

Tuning reference:
- `../../md/EVALUATOR_TUNING_GUIDE.md`
