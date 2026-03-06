# Party Telemetry Event Taxonomy (Phase 0)

Date: March 6, 2026  
Schema version: `1`

## Event Catalog

| Event Type | Purpose | Required Fields |
| --- | --- | --- |
| `room_created` | Track room lifecycle start | `roomCode`, `maxPlayers` |
| `player_joined` | Track room membership additions | `roomCode`, `playerName`, `playerCount` |
| `player_left` | Track room membership removals | `roomCode`, `playerName`, `playerCount` |
| `player_reconnected` | Track successful reconnects after disconnect | `roomCode`, `playerName`, `playerCount`, `reconnectWindowMs` |
| `phase_transition` | Track Party phase movement | `roomCode`, `fromPhase`, `toPhase`, `roundNumber`, `totalRounds`, `playerCount` |
| `round_completed` | Track round-level completion output | `roomCode`, `roundNumber`, `playerCount` |
| `final_completed` | Track match completion output | `roomCode`, `playerCount` |

## Common Envelope Fields

All events include:

- `schemaVersion`
- `eventType`
- `timestampMs`
- `timestampIso`
- `roomCode`

## Optional Fields by Event

`room_created`

- `categoriesMode`

`player_joined`

- `hostName`
- `joinAsHost`
- `isReconnect`

`player_left`

- `disconnectReason`
- `wasHost`

`phase_transition`

- `gameId`
- `phaseDurationMs`

`round_completed`

- `gameId`
- `winner`
- `isTie`
- `tiedCount`
- `roundDurationMs`

`final_completed`

- `gameId`
- `winner`
- `isTie`
- `roundsCompleted`
- `matchDurationMs`

## Phase Vocabulary

Current expected Party phase values:

- `PRE_ROUND`
- `CATEGORY_REVEAL`
- `DRAFT`
- `TWIST`
- `VOTING`
- `RESULTS`
- `AI_EVALUATION`

