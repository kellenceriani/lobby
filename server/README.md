# server/

Last updated: February 28, 2026

Backend runtime for LobbyWARS.

- `core/` - authoritative game lifecycle and scoring phase flow.
- `socket/` - realtime event handlers, validation, and rate limiting.
- `services/` - evaluation orchestration, scoring helpers, audio/voice services.
- `content/` - content pack schema/registry.
- `storage/` - room snapshot persistence.
- `evaluator/` - character/team evaluation model.

Canonical docs:

- `../md/ARCHITECTURE.md`
- `../md/SOCKET_EVENT_CONTRACT.md`
- `../md/ROUND4_AI_EVALUATOR_SPEC.md`
