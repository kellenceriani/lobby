# LobbyWARS Architecture Reference

Last updated: February 19, 2026

## 1) Runtime Topology

- **Server bootstrap**: `server.js`
  - Creates Express HTTP server.
  - Hosts static client from `public/`.
  - Attaches Socket.IO server.
  - Initializes random word cache via `initWordCache()`.
  - Registers all socket handlers via `registerSocketHandlers(io)`.

- **Client runtime**: `public/index.html` + `public/js/*.js`
  - Single-page UI with screen-based state transitions.
  - Main event orchestration in `public/js/app.js`.
  - Round 4 rendering/pacing in `public/js/round4Eval.js`.

## 2) Server Module Map

- `server/core/gameEngine.js`
  - Owns room/game lifecycle state.
  - Generates scenarios + twists.
  - Runs Rounds 1–3 phase transitions: PRE_ROUND -> DRAFT -> TWIST -> VOTING -> RESULTS.
  - Blends community voting with per-round contextual intel scoring.
  - Prepares Round 4 input rosters.

- `server/services/roundEvaluationService.js`
  - Evaluates current-round drafted picks (2 per player) with scenario/twist context.
  - Produces per-player intel summaries and bounded intel round bonus.
  - Emits lightweight telemetry for confidence/fetch latency.

- `server/socket/socketHandlers.js`
  - Validates all realtime actions.
  - Enforces join/message/draft rate limiting.
  - Applies authoritative state changes.
  - Triggers Round 4 evaluation and final results emission.

- `server/services/round4Service.js`
  - Evaluates each final roster character-by-character.
  - Adds chemistry bonus.
  - Converts team OVR into Round 4 points.
  - Produces `teamEvaluations`, `finalLeaderboard`, and point breakdowns.

- `server/evaluator/*`
  - Character validation, metadata lookup, relevance scoring, OVR calculation, notes/breakdowns, phrase generation.
  - Round-mode fetch path is lighter and context-prioritized (character/person-first).

- `server/services/scoreScaling.js`
  - Round weights + Round 4 point curve.

- `server/storage/statePersistence.js`
  - Serializes room snapshots into `.runtime/rooms.snapshot.json`.

## 3) Core Data Objects

- **Room** (`rooms[roomCode]`)
  - `players[]`, `host`, `settings`, `messages[]`, `gameState`, `isGameActive`.

- **GameState**
  - `players[]` (runtime player stats/team data), `currentRound`, `totalRounds`, `scenarios[]`, `activePhase`, `results[]`, `votes`, `voteLocks`, `draftEntries`, `allCharactersDrafted`, `roundResolutionLocks`.
  - Round 4 flags: `round4InProgress`, `round4Applied`, `round4Results`, `finalResultsReady`, `finalResultsEmitted`.

- **Round 4 Team Evaluation**
  - Per player: `evaluations[]` + `teamSummary`.
  - `teamSummary` includes `totalOVR`, `averageOVR`, `chemistryBonus`, `chemistryDetails`, `topPick`, `highestOVR`.

## 4) Phase Lifecycle (Authoritative)

1. `startGame` creates game instance and emits `gameStarting`.
2. `startRound` emits `roundStart`.
3. `revealScenario` emits `scenarioRevealed` and starts draft timer.
4. `revealPlotTwist` auto-fills missing picks, emits `plotTwistRevealed`.
5. `startVoting` emits `votingPhaseStart`.
6. `tallyResults` computes weighted voting points, applies intel bonus from `roundEvaluationService`, emits `roundResults`.
7. After round 3, `startFinalRound` compiles 6-char rosters and emits `round4Start`.
8. `evaluateRound4` computes final evaluation and emits `round4Evaluated`.
9. `requestFinalResults` synchronization emits `finalRoundResults` once all players are ready.

## 5) Critical Invariants

- Duplicate draft picks are replaced with random auto-fill words.
- Regular rounds require exactly 2 locked picks per player.
- Rounds 1–3 always score via both community vote and contextual intel bonus.
- Round 4 does **not** include drafting or voting.
- Round 4 scoring is applied once (`round4Applied` guard).
- Final results broadcast is one-time (`finalResultsEmitted` guard).

## 6) High-Impact Change Points

- **Scenario variety/pacing**: `generateScenario`, `generateTwists`, draft/vote timer helpers in `gameEngine.js`.
- **Voting economy**: `calculateRoundBonuses` in `gameEngine.js` + round weights in `scoreScaling.js`.
- **Round 4 competitiveness**: `calculateRound4Points` and formula constants in `scoreScaling.js`.
- **Character quality model**: `server/evaluator/index.js` + `server/evaluator/scoring/*`.
- **Chemistry volatility**: `server/evaluator/team/chemistryCalculator.js`.

## 7) Safety Notes

- Any change to socket event names must be mirrored in `public/js/app.js` and/or `public/js/round4Eval.js`.
- Any change to evaluator output shape must preserve UI expectations in `round4Eval.js`.
- Any change to score formula should be tested against multi-team and tie scenarios.