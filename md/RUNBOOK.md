# Engineering Runbook

Last updated: February 18, 2026

This runbook is for rapid, safe iteration when making major gameplay/evaluator changes.

## 1) Local Validation Commands

- Start server:
  - `npm start`

- Syntax check evaluator:
  - `node --check server/evaluator/index.js`

- Evaluator viability harness:
  - `node server/viabilityTestHarness.js`
  - `npm run eval:viability`

- Smoke module exports:
  - `node -e "const ev=require('./server/evaluator/index'); const ge=require('./server/core/gameEngine'); const sh=require('./server/socket/socketHandlers'); const r4=require('./server/services/round4Service'); console.log('ok', typeof ev.scoreCharacter, typeof ge.startGame, typeof sh, typeof r4.evaluateRound4FromGame);"`

## 2) Standard Change Workflow

1. Identify target subsystem in docs (`ARCHITECTURE.md`, `EVALUATOR_TUNING_GUIDE.md`).
2. Make smallest coherent code change.
3. Run targeted validation command(s).
4. Run a full gameflow smoke test.
5. Update relevant markdown docs in `md/`.

## 3) Manual E2E Smoke Test

1. Open 3 browser clients.
2. Join same room, set all ready, start game.
3. Complete rounds 1–3 with mixed draft quality.
4. Verify Round 4:
   - `round4Start` appears
   - evaluation renders all teams
   - final leaderboard displays
5. Verify final synchronization:
   - all players press continue
   - `finalRoundResults` shows once
   - game ends and can reset with `playAgain`

## 4) Regression Watchlist

- Socket event name mismatches between client/server.
- Round transition deadlocks (`resultsReady`, `finalResultsReady`).
- Duplicate scoring in Round 4 (missing `round4Applied` guard behavior).
- UI assumptions about evaluator payload fields.
- Score inflation causing impossible leaderboard swings.