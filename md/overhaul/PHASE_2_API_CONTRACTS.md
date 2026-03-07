# Phase 2 API Contracts (Solo Engine MVP)

Date: March 6, 2026  
Status: Implemented

## Endpoints

### `POST /api/solo/runs/start`

Request body:

```json
{
  "userId": "usr_...",
  "modeId": "daily_cipher_clash",
  "practice": false,
  "clientStartedAtMs": 1772827083309
}
```

Response:

- `201` new run created
- `200` existing active scored run returned idempotently
- `403` solo engine disabled
- `404` user not found

Returns run metadata plus deterministic challenge payload for the UTC day (scenario, twist, twist rule, category lock, and slot prompts).

### `POST /api/solo/runs/submit`

Request body:

```json
{
  "userId": "usr_...",
  "runId": "run_...",
  "idempotencyKey": "submit_001",
  "clientSubmittedAtMs": 1772827083401,
  "entries": {
    "lead": "Batman",
    "anchor": "Sherlock Holmes",
    "wildcard": "Wonder Woman",
    "closer": "Spider-Man"
  }
}
```

Response:

- `200` success (first or idempotent replay)
- `400` validation/timestamp guard failure
- `404` run not found
- `409` run not active or already ready to finalize

Returns evaluated slot feedback (`Perfect|Strong|Weak|Miss`) with OVR values, team summary, trend/clue line, and updated run state. Current default attempt cap is `2` per run.

### `POST /api/solo/runs/hint`

Request body:

```json
{
  "userId": "usr_...",
  "runId": "run_...",
  "idempotencyKey": "hint_001",
  "clientRequestedAtMs": 1772827083502
}
```

Response:

- `200` success (first or idempotent replay)
- `400` invalid payload/timestamp guard
- `404` run not found
- `409` run not active or hint limit reached

### `POST /api/solo/runs/finalize`

Request body:

```json
{
  "userId": "usr_...",
  "runId": "run_...",
  "idempotencyKey": "finalize_001",
  "clientFinalizedAtMs": 1772827083603
}
```

Response:

- `201` first successful finalization
- `200` idempotent replay for already-finalized run
- `400` invalid payload/timestamp guard
- `404` run not found
- `409` run not yet complete

Returns post-run summary:

- `outcome` (`solved` or `failed`)
- `scoreBreakdown` (`baseQuality`, `attemptEfficiencyBonus`, `hintConservationBonus`, `streakBonus`, `finalScore`)
- `streak`
- `xp` bridge status
- `leaderboard` rank snapshot metadata
- anti-cheat flags

### `GET /api/solo/leaderboards/daily`

Query:

- `modeId` (optional; default `daily_cipher_clash`)
- `dateKey` (optional UTC date key `YYYY-MM-DD`; default today UTC)
- `limit` (optional; default `50`, max `200`)
- `userId` (optional; include caller's row in `userEntry`)

Response:

```json
{
  "modeId": "daily_cipher_clash",
  "dateKey": "2026-03-06",
  "totalEntries": 42,
  "percentileBands": {
    "top_1": 1,
    "top_10": 4,
    "top_25": 11,
    "top_50": 9,
    "lower_50": 17
  },
  "entries": [],
  "userEntry": {}
}
```

## Guardrails

- Deterministic daily challenge generation keyed by UTC day + mode.
- One scored run per user/mode/day enforced server-side.
- Idempotency keys required for submit/hint/finalize.
- Timestamp guards reject out-of-bounds and non-monotonic client timestamps.
- Suspicious patterns are flagged on run anti-cheat metadata.
