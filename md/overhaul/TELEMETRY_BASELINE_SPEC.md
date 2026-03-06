# Party Telemetry Baseline Spec (Phase 0)

Date: March 6, 2026  
Status: Active

## Goal

Establish a reproducible baseline for current Party reliability before major overhaul refactors.

## Scope

This baseline covers Party runtime events only:

- room creation
- player join
- player leave
- reconnect
- phase transition
- round completion
- final completion

## Data Pipeline

1. Runtime hooks emit validated telemetry envelopes.
2. Envelopes append to NDJSON log:
`.runtime/telemetry/party-events.ndjson`
3. Report script summarizes baseline metrics:
`server/tools/generatePartyTelemetryBaselineReport.js`
4. Report output:
`md/overhaul/reports/PHASE_0_TELEMETRY_BASELINE.md`
5. Dashboard snapshot output:
`md/overhaul/reports/PHASE_0_RELIABILITY_DASHBOARD.json`

## Event Envelope

Required global fields:

- `schemaVersion` (current: `1`)
- `eventType`
- `timestampMs`
- `timestampIso`
- `roomCode`

Per-event required fields are documented in:
`md/overhaul/TELEMETRY_EVENT_TAXONOMY.md`.

## Baseline KPI Set

1. Join events count
2. Leave events count
3. Reconnect count and reconnect rate (`reconnects / leaves`)
4. Phase transition volume
5. Round completion count and tie rate
6. Final completion count and tie rate
7. Average round duration (ms)
8. Average match duration (ms)

## Validation Rules

1. Unsupported event types are rejected.
2. Missing required fields are rejected.
3. Type/range checks are enforced for numeric and boolean fields.
4. Schema version mismatches are reported in baseline output.

## Run Commands

Baseline generation from real emitted telemetry:

```bash
npm run phase0:baseline
```

Standalone report refresh:

```bash
npm run telemetry:party:report
```
