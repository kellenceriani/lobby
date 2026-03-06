# Phase 0 Telemetry Baseline Report

Generated at: 2026-03-06T19:58:04.656Z
Source log: `C:\Users\kmcer\OneDrive\Desktop\Lobby\.runtime\telemetry\party-events.ndjson`
Dashboard snapshot: `C:\Users\kmcer\OneDrive\Desktop\Lobby\md\overhaul\reports\PHASE_0_RELIABILITY_DASHBOARD.json`
Schema version expected: `1`
Dashboard status: **Operational**

## Sample Window

- First event: 2026-03-06T19:58:03.309Z
- Last event: 2026-03-06T19:58:03.783Z
- Window duration (ms): 474

## Baseline KPIs

- Total events: 15
- Rooms observed: 1
- Joins: 4
- Leaves: 4
- Reconnects: 1 (25% of leaves)
- Round completions: 1 (tie rate 100%)
- Final completions: 1 (tie rate 100%)
- Avg round duration (ms): 0
- Avg match duration (ms): 442

## Event Counts

| Event Type | Count |
| --- | ---: |
| `player_joined` | 4 |
| `player_left` | 4 |
| `phase_transition` | 3 |
| `final_completed` | 1 |
| `player_reconnected` | 1 |
| `room_created` | 1 |
| `round_completed` | 1 |

## Phase Transition Counts

| Transition | Count |
| --- | ---: |
| `LOBBY->PRE_ROUND` | 1 |
| `PRE_ROUND->RESULTS` | 1 |
| `RESULTS->AI_EVALUATION` | 1 |

## Schema and Coverage Checks

- Invalid schema version events: 0
- Parse errors: 0
- Missing required event types: None

## Operational Notes

- Baseline generated from emitted Party telemetry events.
- Report generation is repeatable via `npm run telemetry:party:report`.
- Full baseline refresh flow: `npm run phase0:baseline`.
