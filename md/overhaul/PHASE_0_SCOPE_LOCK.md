# Phase 0 Scope Lock

Date: March 6, 2026  
Status: Approved for implementation baseline  
Owner: Engineering (LobbyWARS core runtime)

## Sign-off

| Role | Decision | Date |
| --- | --- | --- |
| Product Direction | Approved | March 6, 2026 |
| Engineering Lead | Approved | March 6, 2026 |
| Runtime/Infra | Approved | March 6, 2026 |

## Non-Negotiables

1. LobbyWARS must support two top-level products: `Solo Hub` and `Party Hub`.
2. Existing Party gameplay and socket contracts must not regress during overhaul phases.
3. Shared account/meta systems must remain additive behind feature flags until validated.
4. New telemetry must be schema-validated and production-safe.
5. Core reliability KPIs must be measurable before large refactors continue.
6. Rollback path must exist for every new runtime/system introduced.
7. Server-authoritative scoring and fairness controls remain mandatory.
8. Phase exit claims require evidence (files changed + validation commands).

## Explicit Out of Scope (Phase 0)

1. No Solo gameplay endpoint implementation.
2. No account/auth persistence implementation.
3. No UI hub redesign implementation.
4. No season/league runtime implementation.
5. No irreversible data migration.
6. No Party event contract removals or breaking payload changes.

## Scope Boundaries

- `In scope`: governance docs, architecture boundaries, migration strategy, Party baseline telemetry instrumentation, telemetry reporting automation, freeze policy, phase gate checklist.
- `Not in scope`: net-new player-facing functionality beyond telemetry visibility and low-risk logging hooks.

## Risk Register (Phase 0)

| Risk | Impact | Mitigation | Owner |
| --- | --- | --- | --- |
| Telemetry hook introduces runtime instability | High | Add lightweight adapter, schema validation, no gameplay mutation in hooks | Server runtime |
| Baseline data is not reproducible | Medium | Add deterministic sample-flow script + report generator | Tooling |
| Scope creep into Phase 1+ features | High | Freeze policy + gate checklist in every merge | Engineering lead |
| Hidden Party regressions during instrumentation | High | Keep hooks side-effect-free and verify core flow telemetry output | QA + runtime |

## Traceability to Phase 0 Ask Items

| Ask | Control in this file |
| --- | --- |
| Finalize vision + constraints | Non-Negotiables |
| Freeze risky refactors until harness exists | Out-of-scope and risk controls |

