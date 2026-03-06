# server/

Last updated: February 28, 2026

Backend runtime for LobbyWARS.

- `core/` - authoritative game lifecycle and scoring phase flow.
- `socket/` - realtime event handlers, validation, and rate limiting.
- `services/` - evaluation orchestration, scoring helpers, audio/voice services.
- `content/` - content pack schema/registry.
- `storage/` - room snapshot persistence.
- `services/identityService.js` - guest session + account-link identity flow.
- `services/metaService.js` - progression/XP + achievement backend framework.
- `services/metaApiValidation.js` - API payload validators for identity/meta endpoints.
- `services/soloEngineService.js` - deterministic daily challenge runtime + scoring/leaderboards.
- `services/soloApiValidation.js` - API payload validators for solo endpoints.
- `services/seasonService.js` - season lifecycle, league tracks, quest rewards, and seasonal snapshots.
- `services/seasonApiValidation.js` - API payload validators for seasonal endpoints.
- `storage/metaStoreAdapter.js` - migration-safe file-backed meta store.
- `evaluator/` - character/team evaluation model.

Canonical docs:

- `../md/ARCHITECTURE.md`
- `../md/SOCKET_EVENT_CONTRACT.md`
- `../md/ROUND4_AI_EVALUATOR_SPEC.md`
