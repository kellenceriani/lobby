# LobbyWARS Architecture

Last updated: February 28, 2026

## Runtime

- `server.js` boots Express + Socket.IO, serves `public/`, and exposes pack/debug endpoints.
- Client is a single-page app (`public/index.html`) driven by `public/js/app.js`.

## Core Server Ownership

- `server/core/gameEngine.js`
- Owns room/game lifecycle and authoritative phase transitions.
- Generates scenarios/twists/final conditions with difficulty + theme + content pack influence.
- Resets room settings to defaults after match completion.

- `server/socket/socketHandlers.js`
- Owns socket event validation, mutation authorization, and event broadcast sequencing.
- Handles host-only settings updates with room-wide `settingsUpdated` and `settingsChangePing`.

- `server/services/roundEvaluationService.js`
- Rounds 1-3 contextual intel evaluation and intel bonus shaping.

- `server/services/round4Service.js`
- Round 4 full-roster evaluation, chemistry application, and final-team summaries.

- `server/content/packRegistry.js`
- Content pack loading, validation, featured selection, and pack metadata/metrics.

- `server/storage/statePersistence.js`
- Debounced room snapshot persistence.

## Core Client Ownership

- `public/js/app.js`
- Main state orchestration, socket bindings, lobby/game/final UI updates, audio control, startup preflight.

- `public/js/settings.js`
- Settings OS UI navigation and summary rendering.

- `public/js/joinEvalFallingPlaques.js`
- Join-screen Eval plaque layer creation + portrait prewarm bridge.
- Preloaded during startup preflight before join unlock.

- `public/js/round4Eval*.js`
- Round 4 reveal sequencing, shared audio hooks, cinematic states.

## Startup Preflight

Blocking startup tasks (before join unlock) include:

- Join Eval plaque staging + portrait decode prewarm.
- Adaptive voice router/cast warmup.
- Join/lobby music path verification.

Deferred tasks continue in background after join unlock.

## Deterministic Evaluation Architecture

Live evaluation follows a deterministic context-engine shape (no live LLM runtime in scoring paths):

1. Resolver:
- identity resolution, alias/typo handling, source ranking.
2. Context parser:
- parse scenario/twist into intents, constraints, and trait pressures.
3. Context judge:
- compute sub-scores (scenario/twist fit, base ability, confidence, risk flags).
4. Weight + explain:
- apply server-side weights and emit explainable payload fields.

Payload expectations:

- normalized identity + resolution confidence
- clamped sub-scores (`0-100`)
- explicit risk/confidence signals for diagnostics and UI trust messaging

## Evaluation Performance Strategy

- Batch and cache evidence lookups per normalized identity.
- Cache context-scored outputs by `(entry + scenario + twist + mode)`.
- Reuse rounds 1-3 evidence in Round 4 where possible.
- Precompute final evaluation during safe windows (for example, voting phase) to reduce end-round stalls.

## Settings Model

Room settings currently include:

- `difficulty`
- `scenarioTheme`
- `contentPackId`
- `plotTwists`
- `customScenario`
- `maxPlayers`

Behavior:

- Host changes are diffed server-side and broadcast to all players.
- Settings summary UI is refreshed for host and non-host clients.
- Match end resets settings to defaults for the next game.

## Invariants

- Server is authoritative for scoring and phase progression.
- Round 4 scoring is applied once (`round4Applied` guard).
- Final results sync waits for connected eligible players.
- If docs drift from implementation, trust code paths in `app.js`, `socketHandlers.js`, and `gameEngine.js`.
