# Refactor Freeze Policy (Phase 0)

Date: March 6, 2026  
Status: Active until Phase 0 exit criteria are signed

## Policy Objective

Prevent high-risk structural churn until baseline telemetry and validation harnesses are in place.

## Freeze Rules

1. No large Party runtime rewrites before baseline telemetry is operational.
2. No breaking socket contract changes.
3. No unflagged cross-domain code paths (Solo/Meta into Party).
4. No schema-destructive migrations.
5. No unreviewed shared-state refactors in core room/game lifecycle modules.

## Allowed During Freeze

1. Telemetry hook additions and validation tooling.
2. Documentation, ADRs, and governance artifacts.
3. Bug fixes that are scoped, tested, and non-breaking.
4. Feature-flag scaffolding with default-off behavior.

## Merge Requirements During Freeze

1. PR describes risk level and rollback path.
2. Phase 0 checklist items are referenced.
3. Validation evidence is attached for touched runtime paths.
4. Reviewer confirms Party flow parity is preserved.

## Freeze Exit

Freeze can be relaxed only when:

1. `md/overhaul/reports/PHASE_0_TELEMETRY_BASELINE.md` is generated from emitted data.
2. ADR-001 and ADR-002 are accepted.
3. Phase gate checklist is marked complete for Phase 0.

