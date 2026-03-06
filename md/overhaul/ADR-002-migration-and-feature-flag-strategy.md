# ADR-002: Migration and Feature-Flag Strategy

Date: March 6, 2026  
Status: Accepted  
Decision Drivers: zero-regression Party continuity, staged rollout, rollback safety

## Context

The overhaul introduces new service layers and UX entry points while preserving live Party gameplay. Migration must avoid breaking current room/join flows and allow quick rollback of new paths.

## Decision

Use a staged expand-contract migration pattern with feature-flag-first releases.

## Rollout Strategy

1. Baseline and instrument existing Party flow (Phase 0).
2. Add new services behind flags (`solo_hub`, `meta_progression`, `league_mode`) with default `off`.
3. Introduce write-safe data model additions with backward-compatible reads.
4. Dark-launch internal accounts first, then canary cohorts.
5. Decommission legacy single-player settings path only after Solo Hub parity and stability gates pass.

## Flag and Rollback Rules

1. Every net-new module must have a runtime kill switch.
2. Flag-off behavior must preserve legacy Party behavior.
3. Rollback must not require destructive migrations.
4. Deploys that fail phase gate checks must not progress.

## Migration Rules

1. `Expand`: add new columns/tables/endpoints without removing legacy paths.
2. `Dual-read/dual-write` only where required, with audit logging.
3. `Contract`: remove legacy paths only after successful gated validation over stable windows.

## Operational Controls

1. Canary windows with telemetry SLO watch.
2. Alerting on latency, error-rate, reconnect success, and match completion.
3. Mandatory rollback drill before broad rollout.

## Consequences

Positive:

- Lowers blast radius of new systems.
- Keeps Party runtime stable while expanding product scope.
- Enables measurable, evidence-based promotion decisions.

Tradeoffs:

- More temporary compatibility code.
- Additional deployment and QA discipline required.

