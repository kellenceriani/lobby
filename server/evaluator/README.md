# server/evaluator/

Last updated: February 28, 2026

Evaluator subsystem for character-level and team-level scoring.

Key modules:

- `index.js` - orchestration entrypoint.
- `core/` - validation, source fetch, normalization, candidate ranking.
- `scoring/` - relevance and OVR conversion.
- `presentation/` - human-readable summaries and phrases.
- `team/` - chemistry logic.

Contracts consumed by:

- `server/services/roundEvaluationService.js`
- `server/services/round4Service.js`
