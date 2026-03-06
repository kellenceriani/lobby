# Overhaul Phase Gate Checklist

Date: March 6, 2026  
Status: Active

## Global Gate Rules

1. Every phase ask item has explicit evidence.
2. Validation commands are run and captured.
3. Exit criteria are marked `COMPLETE`, `PARTIAL`, or `FAILED`.
4. Rollback path is documented for new runtime behavior.

## Phase 0 Gate Checklist

| Item | Required Evidence | Status |
| --- | --- | --- |
| Scope lock approved | `md/overhaul/PHASE_0_SCOPE_LOCK.md` | Complete |
| Architecture boundaries documented | `md/overhaul/ADR-001-dual-runtime-boundaries.md` | Complete |
| Migration and flag strategy documented | `md/overhaul/ADR-002-migration-and-feature-flag-strategy.md` | Complete |
| Telemetry baseline spec documented | `md/overhaul/TELEMETRY_BASELINE_SPEC.md` | Complete |
| Telemetry taxonomy documented | `md/overhaul/TELEMETRY_EVENT_TAXONOMY.md` | Complete |
| Runtime hooks implemented | `server/core/gameEngine.js`, `server/socket/socketHandlers.js`, `server/telemetry/partyTelemetry.js` | Complete |
| Baseline report generated | `md/overhaul/reports/PHASE_0_TELEMETRY_BASELINE.md` | Complete |
| Freeze policy active | `md/overhaul/REFACTOR_FREEZE_POLICY.md` | Complete |

## Validation Command Set (Phase 0)

```bash
node --check server/telemetry/partyTelemetry.js
node --check server/core/gameEngine.js
node --check server/socket/socketHandlers.js
node --check server/tools/runPhase0PartyTelemetrySample.js
node --check server/tools/generatePartyTelemetryBaselineReport.js
npm run phase0:baseline
```

## Notes

- Do not claim Phase 0 complete until baseline report generation succeeds.
- If any required telemetry event type is missing, Phase 0 status must be `PARTIAL` or `FAILED`.

## Phase 1 Gate Checklist

| Item | Required Evidence | Status |
| --- | --- | --- |
| Identity and meta services implemented | `server/services/identityService.js`, `server/services/metaService.js` | Complete |
| Migration-safe storage adapter implemented | `server/storage/metaStoreAdapter.js` | Complete |
| API contracts and validators added | `server.js`, `server/services/metaApiValidation.js`, `md/overhaul/PHASE_1_API_CONTRACTS.md` | Complete |
| XP + level progression behind feature flag | `META_PROGRESS_ENABLED`, `server/services/metaService.js` | Complete |
| Achievement framework behind feature flag | `META_ACHIEVEMENTS_ENABLED`, `server/services/metaService.js` | Complete |
| Migration + legacy guest compatibility added | `server/tools/migratePhase1MetaStore.js` | Complete |
| Integration tests added and passing | `server/tests/phase1.integration.test.js`, `server/tests/phase1.api.integration.test.js` | Complete |
| Party no-regression check with flags off | `server/tests/phase1.party-regression.test.js` | Complete |

## Phase 2 Gate Checklist

| Item | Required Evidence | Status |
| --- | --- | --- |
| Solo engine module implemented | `server/services/soloEngineService.js` | Complete |
| Solo API validators and contracts added | `server/services/soloApiValidation.js`, `md/overhaul/PHASE_2_API_CONTRACTS.md` | Complete |
| Daily run lifecycle endpoints wired | `server.js` | Complete |
| One scored run per user/mode/day enforced | `server/services/soloEngineService.js` | Complete |
| Scoring + streak + XP bridge implemented | `server/services/soloEngineService.js`, `server/services/metaService.js` | Complete |
| Leaderboard snapshots with percentile bands | `server/services/soloEngineService.js` | Complete |
| Anti-cheat checks active (idempotency/timestamp/impossible-pattern) | `server/services/soloEngineService.js` | Complete |
| Solo migration script/report added | `server/tools/migratePhase2SoloStore.js`, `md/overhaul/reports/PHASE_2_MIGRATION_REPORT.md` | Complete |
| End-to-end solo tests added and passing | `server/tests/phase2.integration.test.js`, `server/tests/phase2.api.integration.test.js` | Complete |
| Party no-regression check with Solo flag off | `server/tests/phase2.party-regression.test.js` | Complete |

## Validation Command Set (Phase 2)

```bash
node --check server/services/soloEngineService.js
node --check server/services/soloApiValidation.js
node --check server/tools/migratePhase2SoloStore.js
node --check server/tests/phase2.integration.test.js
node --check server/tests/phase2.api.integration.test.js
node --check server/tests/phase2.party-regression.test.js
node --check server.js
npm run migrate:phase2
npm run test:phase2
```

## Phase 3 Gate Checklist

| Item | Required Evidence | Status |
| --- | --- | --- |
| Top-level Solo/Party split navigation added | `public/index.html`, `public/js/dualHub.js`, `public/css/dual-hub.css` | Complete |
| New Home/Profile/Progression/Achievements screens implemented | `public/index.html`, `public/js/dualHub.js`, `md/overhaul/PHASE_3_UI_CONTRACTS.md` | Complete |
| Solo daily flow UI wired to Phase 2 APIs | `public/js/dualHub.js` | Complete |
| Party create/join flow preserved | `public/index.html` (`#join`), `server/tests/phase3.party-regression.test.js` | Complete |
| Shared UI tokens + primitives for hubs added | `public/css/dual-hub.css` | Complete |
| iOS-safe layout constraints implemented | `public/css/dual-hub.css` | Complete |
| Onboarding path flow added | `public/index.html` (`#dualPathOnboarding`), `public/js/dualHub.js` | Complete |
| E2E/UI integration checks added for mobile/iOS + party no-regression | `server/tests/phase3.ui.integration.test.js`, `server/tests/phase3.party-regression.test.js` | Complete |

## Validation Command Set (Phase 3)

```bash
node --check public/js/bootstrap.js
node --check public/js/dualHub.js
node --check server/tests/phase3.ui.integration.test.js
node --check server/tests/phase3.party-regression.test.js
node --check server.js
npm run test:phase3
npm run test:phase2
```

## Phase 4 Gate Checklist

| Item | Required Evidence | Status |
| --- | --- | --- |
| Season lifecycle state machine + runtime orchestration implemented | `server/services/seasonService.js` | Complete |
| Seasonal storage schema and migration-safe adapter updates implemented | `server/storage/metaStoreAdapter.js`, `server/tools/migratePhase4SeasonStore.js` | Complete |
| Phase 4 API contracts and validators added | `md/overhaul/PHASE_4_API_CONTRACTS.md`, `server/services/seasonApiValidation.js`, `server.js` | Complete |
| Solo + Party league progression tracks with promotion/decay implemented | `server/services/seasonService.js`, `server/services/soloEngineService.js` | Complete |
| Seasonal quest engine + milestone reward claim flow implemented | `server/services/seasonService.js`, `server.js` | Complete |
| Anti-abuse controls active (daily caps/event idempotency/claim limits) | `server/services/seasonService.js` | Complete |
| Seasonal profile + leaderboard views (live + historical snapshot) implemented | `server/services/seasonService.js`, `server.js` | Complete |
| Admin-safe season open/close scripts with dry-run added | `server/tools/seasonAdminOpen.js`, `server/tools/seasonAdminClose.js` | Complete |
| Boundary tests for rollover/reward integrity/no duplicate payouts added and passing | `server/tests/phase4.boundary.integration.test.js` | Complete |
| Phase 4 API/integration/party-regression tests added and passing | `server/tests/phase4.integration.test.js`, `server/tests/phase4.api.integration.test.js`, `server/tests/phase4.party-regression.test.js` | Complete |

## Validation Command Set (Phase 4)

```bash
node --check server/services/seasonService.js
node --check server/services/seasonApiValidation.js
node --check server/tools/migratePhase4SeasonStore.js
node --check server/tools/seasonAdminOpen.js
node --check server/tools/seasonAdminClose.js
node --check server/tests/phase4.integration.test.js
node --check server/tests/phase4.api.integration.test.js
node --check server/tests/phase4.boundary.integration.test.js
node --check server/tests/phase4.party-regression.test.js
node --check server.js
npm run migrate:phase4
npm run season:open
npm run season:close
npm run test:phase4
npm run test:phase3
npm run test:phase2
npm run test:phase1
```
