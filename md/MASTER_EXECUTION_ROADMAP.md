# LobbyWARS Master Execution Roadmap

Last updated: February 20, 2026
Status: Planning baseline aligned to current architecture

## Session Update (February 20, 2026)

### Completed in This Session
- ✅ Fastest lock-time correctness fix shipped end-to-end.
   - Server now avoids persisting invalid zero-time fastest locks when round start timing is unavailable.
   - Round 4 leaderboard only surfaces positive fastest-lock values.
   - Client formatter now renders missing/invalid values as `—` and avoids misleading zero displays.

- ✅ Lobby/chat space recovery work shipped.
   - Waiting status indicators were moved out of the sticky bottom action bar and into the Players tab.
   - This reduces bottom bar footprint and frees vertical space for chat on smaller screens.

### Notes
- The lock-time issue is considered resolved.
- Chat spacing was improved structurally by reclaiming layout space rather than forcing additional scroll behavior in the chat tab.

## Purpose
This document converts the raw to-do list into a prioritized, implementation-ready roadmap that fits the current codebase and product direction.

It covers:
- what gets done first,
- why each item is prioritized,
- how each item is implemented,
- where in code each change belongs,
- how success is measured.

---

## Ground Truth (Current State)

- Core game loop is live and stable: rounds 1–3 (draft/twist/vote/intel) + round 4 AI evaluation.
- Scenario and twist generation already exists for both normal rounds and final round.
- Evaluator already performs relevance/feasibility/twist-impact logic with modular scoring paths.
- Round 4 reveal system already has tiered profiles, timing controls, and animation hooks.
- Fastest draft lock is already tracked on the server (`fastestDraftLockMs`), but display can still fail in client UX paths.
- Biggest ongoing technical risk: complexity concentration in large files (`public/js/round4Eval.js`, `public/js/app.js`, `server/core/gameEngine.js`).

---

## Priority Model

### P0 — Must Fix Now (correctness + accessibility)
- Fastest lock time display bug (shows `0.00` unexpectedly).
- Lobby mobile chat spacing cut-off.

### P1 — High Impact / Low-Medium Risk (experience upgrades)
- Round 4 visual theme retune (color/transition/mood consistency).
- Round 4 reveal animation quality uplift (readability + spectacle).
- Scenario/twist text-size normalization rules (especially for final round).

### P2 — Strategic Feature Growth (core evaluator and game-mode expansion)
- Scenario/twist intelligence overhaul (constraint comprehension + better fit ranking).
- New category-commit mode where category fit is top OVR factor.

### P3 — Structural Quality and Scale Foundation
- Cleanup/refactor oversized files and dead code.
- Temp folder retirement policy.
- Documentation synchronization with implementation.

### P4 — Long-Horizon Product Strategy
- Free vs paid API strategy for evaluator quality.
- Team-vs-team / battle royale feasibility.
- Native app path and readiness criteria.

---

## Execution Roadmap (Phased)

## Phase 1 (Immediate: 1–4 days)
Goal: remove correctness and accessibility friction before adding complexity.

### 1. Fastest Lock Time Correctness (P0)
#### Why
Credibility issue in final leaderboard; data exists but presentation is inconsistent.

#### How
1. Trace round-4 leaderboard render path for `fastestLockMs` from socket payload to UI formatting.
2. Fix null/undefined and milliseconds-to-seconds formatting edge cases.
3. Add fallback label for no lock data (example: `—`) instead of `0.00`.
4. Verify multi-player runs where at least one user locks late and one user locks quickly.

#### Code Areas
- `server/socket/socketHandlers.js` (payload already includes `fastestLockMs`, verify shape consistency)
- `public/js/round4Eval.js` (display formatting path)
- `public/js/app.js` (if any mirrored final leaderboard renderer exists)

#### Acceptance Criteria
- Non-zero lock times display correctly for all players with valid data.
- No player with missing data is shown as fake `0.00`.
- Existing scoreboard ordering and totals remain unchanged.

---

### 2. Lobby Mobile Chat Spacing Fix (P0)
#### Why
Current chat area can be clipped on mobile; this is a direct usability blocker.

#### How
1. Add bottom spacing in lobby chat container equivalent to settings audio-button breathing room.
2. Validate on small-height viewports and mobile landscape.
3. Ensure no overlap with sticky controls or keyboard-open state.

#### Code Areas
- `public/css/lobby.css`
- possibly `public/css/base.css` if shared spacing utilities are used

#### Acceptance Criteria
- Last chat messages remain visible and tappable across target mobile sizes.
- No regression in desktop layout or settings tab spacing.

---

## Phase 2 (Near-Term: 1–2 weeks)
Goal: improve Round 4 perceived quality dramatically without destabilizing scoring logic.

### 3. Round 4 Theme/Mood Retune (P1)
#### Why
Final stage should feel like a climax; current tone is functional but not fully aligned with intended atmosphere.

#### How
1. Audit current round-4 color tokens, gradients, and transitions.
2. Define one cohesive tone profile for Round 4 (without creating a new global theme system).
3. Apply targeted style updates to existing classes only.
4. Validate readability/contrast on all card tiers and leaderboard rows.

#### Code Areas
- `public/css/round4Eval.css`
- optional minor class-state hooks in `public/js/round4Eval.js`

#### Acceptance Criteria
- Visual identity is clearly distinct and consistent for Round 4.
- Text remains legible at all reveal states.
- No new runtime errors or event-sequencing changes.

---

### 4. Round 4 Reveal Animation Overhaul (P1)
#### Why
Reveal pacing/theatrics currently under-deliver relative to user expectation and game climax positioning.

#### How
1. Rebalance reveal-tier profiles so low-tier cards still get enough on-screen dwell time.
2. Improve card-to-pool return transitions for smoother scale/position interpolation.
3. Add stronger cinematic timing arcs: intro beat -> impact beat -> settle beat.
4. Preserve existing preload/sync guards and timer cleanup logic.
5. Add optional reduced-motion compatibility path.

#### Code Areas
- `public/js/round4Eval.js` (`REVEAL_TIER_PROFILES`, sequencing timers, transition orchestration)
- `public/css/round4Eval.css` (keyframes, transition curves, tier-specific emphasis)

#### Acceptance Criteria
- Every tier is readable before transition-out.
- No reveal stalls, double-fires, or orphan timers.
- Users perceive clear quality uplift in spectacle and pacing.

---

### 5. Scenario/Twist Text Normalization (P1)
#### Why
Prompt brevity is essential for readability and for evaluator signal clarity.

#### How
1. Enforce concise templates for rounds 1–3 and final round separately.
2. Target twist length to short phrase constraints (4–6 words baseline) with graceful exceptions.
3. Keep broad diversity by separating compact surface text from deeper semantic metadata.

#### Code Areas
- `server/core/gameEngine.js` (scenario/twist template pools, final pattern generators)

#### Acceptance Criteria
- Final scenarios/twists are shorter but still diverse.
- Prompt brevity does not reduce evaluator ranking quality.

---

## Phase 3 (Core Intelligence Upgrade: 2–5 weeks)
Goal: move from broad keyword fit toward robust scenario/twist-aware evaluation.

### 6. Constraint-Aware Evaluator Expansion (P2)
#### Why
Current relevance model is solid but still too coarse for nuanced scenario/twist combinations.

#### Target Capability
For any scenario + twist pair, evaluator should:
- infer required capabilities,
- infer environmental constraints,
- infer anti-fit penalties,
- rank entries by both scenario and twist interaction quality.

#### How (Implementation Base)
1. **Structured Scenario/Twist Parser Layer**
   - Build parser output object:
     - `actionType`
     - `environmentTags`
     - `constraintTags`
     - `winCondition`
     - `failureRisks`
   - Keep parser deterministic and rule-first (no heavy model dependency).

2. **Capability Taxonomy Expansion**
   - Add richer trait map in relevance scoring (mobility type, endurance type, medium compatibility, precision/control, social/intellect fit, etc.).
   - Distinguish hard blockers vs soft penalties.

3. **Dual-Context Scoring Function**
   - score scenario fit and twist fit separately,
   - then compute interaction score:
     - `synergyBonus` when twist amplifies candidate strengths,
     - `frictionPenalty` when twist blocks scenario viability.

4. **Evidence-Coupled Explanations**
   - Ensure `notes`/`breakdown` explicitly references which constraints were met/failed.
   - Avoid generic “good fit” outputs.

5. **Regression Harness Upgrades**
   - Extend viability harness with focused scenario/twist matrix and expected ordering checks.
   - Add benchmark cases like the wave/lava example pattern.

#### Code Areas
- `server/evaluator/scoring/relevance.js` (main scoring logic)
- `server/evaluator/core/fetchers.js` + `candidateScoring.js` (higher-confidence profile extraction)
- `server/evaluator/core/constants.js` (thresholds)
- `server/viabilityTestHarness.js` (scenario matrix + ranking assertions)

#### Acceptance Criteria
- Scenario/twist ranking aligns with human intuition on curated benchmark sets.
- Explanations show specific constraint matching, not vague reasoning.
- No major increase in evaluator latency beyond acceptable room pacing.

---

### 7. Final Scenario/Twist Scale Architecture (P2)
#### Why
You want tiny text prompts that still map into very broad, random, and diverse challenge space.

#### How
1. Introduce a two-layer generation model:
   - **Display layer**: short prompt text.
   - **Semantic layer**: hidden structured tags used by evaluator.
2. Add scenario families (fight, race, build, negotiate, survive, explain, stealth, rescue, etc.).
3. For each family, support expansion sources (internal pools first; external APIs optional phase).
4. Use weighted randomness with novelty controls to avoid repetitive outputs.

#### Code Areas
- `server/core/gameEngine.js` (generation and metadata wiring)
- evaluator scoring inputs to consume semantic tags

#### Acceptance Criteria
- Prompt text remains concise.
- Variety increases without breaking evaluator consistency.
- Round 4 condition quality feels broader and less repetitive.

---

### 8. New Category-Commit Game Mode (P2)
#### Why
Adds strategic identity and creates a distinct “build around a category” play style.

#### Mode Definition
At game start, room chooses a category constraint (or each player gets one, depending on final design). Category fit becomes highest-weight OVR factor.

#### How
1. Add new lobby setting for mode toggle + category selection policy.
2. Store category mode in room/game settings and persist it.
3. Add category-fit scorer that runs before existing scenario/twist relevance contribution.
4. Reweight OVR formula so category-fit is primary factor in this mode only.
5. Surface category-fit feedback in round intel and final breakdown.

#### Code Areas
- `server/socket/inputValidation.js` (new settings fields)
- `server/core/gameEngine.js` (mode propagation)
- `server/services/roundEvaluationService.js` (round 1–3 weighting)
- `server/services/round4Service.js` + evaluator OVR path (final weighting)
- `public/js/app.js` + relevant CSS for settings UI

#### Acceptance Criteria
- Mode can be configured from lobby without breaking standard mode.
- Category fit visibly dominates scoring in this mode.
- Existing mode behavior remains unchanged when toggle is off.

---

## Phase 4 (Cleanup + Maintainability: 2–6 weeks, parallelizable)
Goal: lower maintenance risk while preserving behavior.

### 9. Code Cleanup Program (P3)
#### Why
Current functionality is rich; maintainability risk is rising due to size and duplication.

#### How
1. Run dead/duplicate code audit per subsystem (client UI, engine, evaluator, socket layer).
2. Split very large files into focused modules while keeping public contracts stable.
3. Add lightweight module boundaries and index exports for discoverability.
4. Remove stale branches only after behavior parity checks.

#### Focus Files (initial)
- `public/js/app.js`
- `public/js/round4Eval.js`
- `server/core/gameEngine.js`

#### Acceptance Criteria
- No feature regression in full manual match flow.
- Reduced file complexity and clearer ownership boundaries.

---

### 10. Temp Folder Retirement Plan (P3)
#### Why
Temp assets/docs can become long-term confusion if not lifecycle-managed.

#### How
1. Label each temp artifact as active experiment vs deprecation candidate.
2. Migrate any still-needed assets into canonical paths.
3. Delete only after one release cycle with no references.

#### Acceptance Criteria
- No unresolved references to removed temp files.
- Cleaner project root with explicit experimental policy.

---

### 11. Documentation Sync Sweep (P3)
#### Why
Docs are strong but can drift quickly as evaluator and UI evolve.

#### How
1. Update architecture, socket contract, and evaluator tuning docs after each phase completion.
2. Maintain one canonical roadmap + changelog references.
3. Add “last validated” dates to key docs.

#### Acceptance Criteria
- Core docs reflect current event contracts and scoring behavior.
- New contributors can follow docs without code archaeology.

---

## Phase 5 (Product Strategy / Future Scope)
Goal: answer long-horizon decisions with evidence, not guesses.

### 12. Evaluator Economics: Free vs Paid APIs (P4)
#### Decision Framework
Measure three tracks:
1. **Free-only optimized** (current direction + better heuristics/cache).
2. **Hybrid** (free baseline + paid fallback for low-confidence cases).
3. **Paid-primary** (highest quality, highest cost).

#### Metrics
- ranking accuracy on benchmark sets,
- average latency,
- monthly cost at projected match volume,
- failure rate / outage resilience.

#### Output
A go/no-go recommendation with threshold gates (quality and budget).

---

### 13. Team-vs-Team / Battle Royale Feasibility (P4)
#### What to Validate
- socket scalability under larger concurrent state changes,
- scoring model support for team aggregation,
- UI complexity for larger brackets/feeds,
- match length tolerance.

#### Suggested Path
- prototype as limited team mode first,
- then expand to battle-royale format if pacing and clarity hold.

---

### 14. App Readiness Path (P4)
#### “Ready for App” Minimum Gates
- stable session lifecycle with low crash rate,
- deterministic scoring confidence in benchmark envelope,
- mobile UX parity for core flow,
- modular client architecture suitable for React Native/Flutter migration or PWA hardening.

#### Practical Sequence
1. Harden web app quality and telemetry.
2. Decide PWA-first vs native-first.
3. Extract shared game logic contracts (event payload schemas + scoring contracts).
4. Build thin mobile shell around stable APIs.

---

## Cross-Cutting Implementation Rules

- Preserve server-authoritative scoring and phase transitions.
- Preserve existing socket event names/payloads unless intentionally versioned.
- Avoid changing round economy and evaluator logic in the same PR without isolation.
- Add tuning changes behind explicit constants for quick rollback.
- For every scoring change, run benchmark harness before and after.

---

## Suggested Delivery Cadence

## Sprint A (Immediate)
- P0 fixes: fastest lock display + mobile chat spacing.
- Status: in progress (fastest lock fix complete; lobby layout space recovery complete; follow-up mobile viewport validation pending).

## Sprint B
- Round 4 visual/theme + animation uplift.
- Scenario/twist brevity normalization.

## Sprint C
- Constraint-aware evaluator phase 1.
- Final scenario/twist semantic layering.

## Sprint D
- Category-commit mode implementation.
- Cleanup wave 1 (file splits + duplicate removal).

## Sprint E
- Strategic experiments (API economics, team mode feasibility, app readiness).

---

## Definition of Done (Roadmap-Level)

This roadmap is considered successfully executed when:
- P0 and P1 items are shipped with no flow regressions.
- evaluator benchmark rankings materially improve for scenario/twist nuance.
- new category mode is playable and clearly differentiated.
- major files are decomposed enough to reduce maintenance risk.
- docs are synchronized and trusted as source-of-truth.

---

## Immediate Next Action Queue (Concrete)

1. Run focused mobile viewport validation pass for lobby/chat after Players-tab status relocation.
2. Tune Round 4 reveal tier timing profile values.
3. Introduce scenario/twist brevity constraints in generators.
4. Implement evaluator constraint-parser v1 and benchmark it.
5. Start cleanup wave planning for oversized files (`public/js/round4Eval.js`, `public/js/app.js`, `server/core/gameEngine.js`).
