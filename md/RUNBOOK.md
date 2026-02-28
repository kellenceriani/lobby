# Engineering Runbook

Last updated: February 28, 2026

## Fast Validation

- Start server:
  - `npm start`

- Validate pack manifests:
  - `npm run packs:validate`

- Syntax checks (server files):
  - `node --check server/core/gameEngine.js`
  - `node --check server/socket/socketHandlers.js`

- Optional evaluator harness:
  - `npm run eval:viability`
  - `npm run bench:context`
  - `npm run bench:random500`

## Change Workflow

1. Locate ownership in `md/ARCHITECTURE.md`.
2. Apply smallest coherent change.
3. Run targeted validations.
4. Run manual multiplayer smoke test.
5. Update docs in `md/` and any impacted local READMEs.

## Manual Smoke Test

1. Open 3 clients in one room.
2. Confirm host and non-host settings views.
3. Change settings as host and verify:
   - all clients receive update
   - settings summary updates for all
   - ping/toast appears for all
4. Play through rounds 1-3 and Round 4.
5. Confirm final results and post-match settings reset.
6. Confirm `playAgain` returns lobby with default settings.

## Common Regression Watchlist

- Event mismatch between client and server.
- Host-only settings leaking to non-host write paths.
- Settings not applied to game instance generation.
- Round transition deadlocks (`resultsReady`, `finalResultsReady`).
- Duplicate Round 4 scoring application.

## AI-Core Regression Checklist

When touching resolver/scoring/diagnostics code, compare against a prior known-good artifact/log and verify:

- `dangerous_title_diff` rate does not regress (overall and by source).
- `risky60+` and `lowConf80+` outlier counts do not expand.
- synthetic image rate and image-backfill success do not regress materially.
- resolver-side audio coverage and quote/fact fallback latency remain stable.
- no false quality-gate failures from legacy-only metrics.

Keep machine-readable harness artifacts so runs can be diffed across sessions.

## Notes

- `npm test` is not implemented in this repository.
- If port 3000 is already in use, stop the existing process before `npm start`.
