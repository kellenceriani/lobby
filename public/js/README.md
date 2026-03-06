# public/js/

Last updated: February 28, 2026

- `app.js` - main client orchestrator: socket events, phase UI, audio controls, startup preflight.
- `settings.js` - Settings OS navigation and summary rendering.
- `dualHub.js` - Phase 3 dual-hub UX layer (Home/Solo/Party/Profile/Progression/Achievements + onboarding + Solo API UI flow).
- `joinEvalFallingPlaques.js` - join-screen Eval plaque layer + portrait prewarm bridge.
- `state.js` - shared in-memory client state.
- `ui.js` - generic UI helpers and screen/tab switches.
- `round4Eval.js`, `round4EvalRevealCinematics.js`, `round4EvalSharedAudio.js` - Round 4 flow.

Event coupling must stay aligned with `server/socket/socketHandlers.js` and `md/SOCKET_EVENT_CONTRACT.md`.

Settings OS integration contract:

- Do not remove/rename compatibility IDs consumed by `app.js` and `settings.js` without coordinated updates.
- Critical IDs include:
  - `settingsContent`, `settingsReadonlyHome`, `hostNote`, `hostBadge`
  - `difficulty`, `scenarioTheme`, `contentPack`, `customScenario`, `plotTwists`
  - `nowModeLabel`, `nowDifficultyLabel`, `nowPackLabel`
- `settingsUpdated` and `settingsChangePing` handling must stay in sync with server payload shape.
