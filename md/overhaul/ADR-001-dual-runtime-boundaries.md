# ADR-001: Dual Runtime Boundaries

Date: March 6, 2026  
Status: Accepted  
Decision Drivers: Party stability, Solo scalability, migration safety, observability clarity

## Context

LobbyWARS is moving from a Party-first architecture toward a dual-product architecture (`Solo Hub` + `Party Hub`) with shared account/meta progression. The current runtime is Party-centric and tightly coupled to existing socket flow. Phase 0 requires explicit boundaries before feature expansion.

## Decision

Adopt a service-domain split with strict boundaries:

1. `party-engine`
- Owns room lifecycle, socket contracts, current rounds flow, and reconnect behavior.
- Backward compatibility required for existing clients.

2. `solo-engine`
- Owns deterministic daily challenge generation, validation, and scoring.
- No direct dependency on Party socket lifecycle.

3. `meta-service`
- Owns XP, levels, achievements, profile aggregates, and progression ledgers.
- Consumes server-authoritative completion events from Party/Solo domains.

4. `identity-service`
- Owns guest/auth identity mapping and link/upgrade workflows.

5. `leaderboard-service`
- Owns daily/seasonal ranking writes and snapshots.

## Boundary Rules

1. Party runtime cannot call Solo gameplay logic directly.
2. Cross-mode state changes must flow through explicit service contracts.
3. New domains must be feature-flagged by default until phase exit gates are met.
4. Shared data writes require idempotency keys on completion/claim paths.
5. Existing Party socket events remain stable until explicit deprecation phase.

## Contract Rules

1. New APIs/events are versioned.
2. All new payloads use explicit schema validation.
3. Cross-domain event payloads include trace identifiers for telemetry/audit.

## Consequences

Positive:

- Contains regression risk in Party path.
- Enables independent scaling and rollout of Solo runtime.
- Improves failure isolation and observability ownership.

Tradeoffs:

- Additional orchestration complexity.
- Requires stronger contract governance and test coverage.

## Verification

- Boundary reflected in `md/overhaul/ADR-002-migration-and-feature-flag-strategy.md`.
- Telemetry baseline added for Party path before major refactors.

