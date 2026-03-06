# Phase 4 API Contracts (League + Seasonal Layer)

Date: March 6, 2026  
Status: Implemented

## Endpoints

### `GET /api/seasons/active`

Response:

```json
{
  "ok": true,
  "activeSeasonId": "season_2026_q1",
  "season": {}
}
```

### `GET /api/seasons/list?limit=20`

Response:

```json
{
  "ok": true,
  "activeSeasonId": "season_2026_q1",
  "seasons": []
}
```

### `GET /api/seasons/leaderboards/:trackId`

Track:

- `solo`
- `party`

Query:

- `seasonId` optional (defaults to active or latest season)
- `limit` optional (default `50`, max `200`)
- `userId` optional (include caller row as `userEntry`)

Response:

```json
{
  "ok": true,
  "seasonId": "season_2026_q1",
  "seasonStatus": "open",
  "trackId": "solo",
  "totalEntries": 42,
  "percentileBands": {},
  "entries": [],
  "userEntry": {}
}
```

### `GET /api/seasons/profile/:userId`

Query:

- `seasonId` optional
- `includeHistory` optional (`true` default)
- `historyLimit` optional (`5` default, max `20`)

Response:

```json
{
  "ok": true,
  "seasonId": "season_2026_q1",
  "seasonStatus": "open",
  "profile": {},
  "history": []
}
```

### `POST /api/seasons/party/results`

Request body:

```json
{
  "seasonId": "season_2026_q1",
  "eventId": "party_event_001",
  "matchId": "match_abc",
  "participants": [
    {
      "userId": "usr_...",
      "placement": 1,
      "teamworkScore": 8,
      "sportsmanshipScore": 5,
      "won": true
    }
  ]
}
```

Response:

- `201` on first apply
- `200` on idempotent replay
- `409` on event-id conflict payload mismatch

### `POST /api/seasons/quests/claim`

Request body:

```json
{
  "userId": "usr_...",
  "seasonId": "season_2026_q1",
  "milestoneId": "milestone_20",
  "idempotencyKey": "claim_001"
}
```

Response:

- `201` on first claim
- `200` on idempotent replay
- `429` when claim/day limits are exceeded

### `POST /api/seasons/admin/open`

Header:

- `x-season-admin-token` required when `SEASON_ADMIN_TOKEN` is configured.

Request body:

```json
{
  "seasonId": "season_2026_q2",
  "name": "Season 2026 Q2",
  "startsAtMs": 1775100000000,
  "endsAtMs": 1782866400000,
  "dryRun": true
}
```

Response:

- `201` on first open
- `200` on idempotent open
- `403` when admin token is invalid

### `POST /api/seasons/admin/close`

Header:

- `x-season-admin-token` required when `SEASON_ADMIN_TOKEN` is configured.

Request body:

```json
{
  "seasonId": "season_2026_q1",
  "dryRun": false
}
```

Response:

- `201` on first close
- `200` on idempotent close
- includes close payout summary

## Guardrails

- Seasonal layer is behind feature flag `SEASON_LAYER_ENABLED`.
- Solo finalize events bridge into seasonal solo league progression.
- Party result ingestion is idempotent by `eventId` and participant fingerprint.
- Promotion/demotion is points-threshold based.
- Daily decay is applied to inactive entries per track config.
- Milestone claims are idempotent and reward grants use deterministic grant IDs.
- Close rewards are deterministic per `seasonId + track + userId` to prevent duplicate payouts.
- Admin close/open supports dry-run mode for staging verification.
