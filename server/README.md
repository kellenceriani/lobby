# server

Backend runtime for LobbyWARS.

## Module ownership

- `core/` — game lifecycle, scenario/twist generation, round progression
- `socket/` — realtime event handlers, input sanitation, rate limiting
- `services/` — Round 4 orchestration and score-scaling formulas
- `storage/` — room snapshot persistence (`.runtime/rooms.snapshot.json`)
- `evaluator/` — character scoring, relevance, OVR, chemistry, presentation breakdowns

## Canonical docs

- `../md/ARCHITECTURE.md`
- `../md/ROUND4_AI_EVALUATOR_SPEC.md`
- `../md/EVALUATOR_TUNING_GUIDE.md`
- `../md/SOCKET_EVENT_CONTRACT.md`
