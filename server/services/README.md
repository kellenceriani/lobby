# server/services/

Last updated: February 28, 2026

Cross-cutting backend services.

- `roundEvaluationService.js` - rounds 1-3 contextual intel evaluation.
- `round4Service.js` - final roster evaluation and leaderboard shaping.
- `scoreScaling.js` - point conversion and weighting formulas.
- `entryEvaluationService.js` - central adapter into evaluation pipeline.
- `identityService.js` - guest/account identity and legacy-name resolution.
- `metaService.js` - profile/progression/xp/achievement orchestration.
- `soloEngineService.js` - deterministic solo daily mode lifecycle/scoring.
- `seasonService.js` - season lifecycle, league tracks, quests, and snapshots.
- `evaluation/` - context-engine pipeline modules (resolver/context/scoring/explain/cache).
