# Future Implementations Roadmap (Context Engine Direction)

## 1) Direction Reset
This roadmap now assumes the project is **not** moving to a live LLM runtime.

Core foundation going forward:
- Deterministic Context Engine (AI-like contextual judgment, no live AI model in match flow)
- Fast resolver + cached source fetching
- Transparent scoring/explainability
- Replay benchmark tuning

This changes the order of several features because evaluator stability/performance is now the main blocker.

## 2) Ordering Rules
Features are ordered by:
1. Impact on game feel and retention
2. Dependency on evaluator foundation
3. Reliability risk reduction
4. Build effort

Priority legend:
1. P0 = immediate / blocking
2. P1 = next wave core improvements
3. P2 = expansion / premium polish

Effort legend:
1. S = 1-3 days
2. M = 4-10 days
3. L = 2-4+ weeks
4. XL = multi-phase program

## 3) Master Priority Table

| ID | Initiative | Source | Priority | Effort | Why now |
|---|---|---|---|---|---|
| F0 | Context Engine Migration (non-LLM core) | New direction | P0 | XL | Unblocks speed, reliability, no-voting, category mode, and trust |
| F1 | Evaluator Trust Indicators + Score Trace UI | Reframed (old AI explainability need) | P0 | M | Users must instantly see how/why entries were judged |
| F2 | Entries mobile input/accessibility | Your list | P0 | M | Impacts every player every round |
| F3 | Round 4 reveal ceremony smoothness | Your list | P0 | M | Biggest payoff moment, currently underdelivers |
| F4 | Round 4 -> Final Results narrative bridge | Your list | P0 | M | Improves flow clarity and ready-up conversion |
| F5 | Final Results Elite Six logic update | Your list | P0 | S | High fairness value, low risk |
| F6 | Resolver/Alias/Proxy curation tools | New | P1 | M | Big accuracy gains without runtime cost |
| F7 | Replay benchmark + regression dashboard | New | P1 | M | Keeps the new core measurable and safe to tune |
| F8 | iOS audio reliability + audio controls | Your list | P1 | M | Core immersion/platform parity issue |
| F9 | Random API source indicator enhancement | Your list | P1 | S | Small clarity win |
| F10 | App start loading/animation + preload | Your list | P1 | M | Better first impression and warm-up opportunities |
| F11 | Advanced Settings redesign + new modes | Your list | P1 | L | Strategic feature expansion depends on stable evaluator |
| F12 | Room recovery/reconnect durability | Added (kept) | P1 | L | Reliability and retention improvement |
| F13 | Competitive integrity layer | Added (kept) | P2 | M | Long-term fairness and anti-exploit support |

## 4) Detailed Breakdown

## F0) Context Engine Migration (Non-LLM Core)
Goal: replace the idea of "live AI runtime" with a deterministic, contextual scoring engine that is fast and reliable.

Scope:
1. Add `entryEvaluationService` adapter as the only evaluation entry point (done scaffold).
2. Implement Context Engine modules in `server/services/evaluation/*`:
- resolver
- context parser
- scoring
- explainability
- diagnostics
3. Add replay benchmark fixtures and regression checks in `server/benchmarks/contextEngine/*`.
4. Implement `EVAL_ENGINE_MODE=legacy|context_shadow|context` rollout.
5. Reuse round 1-3 evidence in Round 4 and score final context deterministically.

Definition of done:
1. Round/final loads consistently hit target latency (or close enough to target on production hardware).
2. Resolver accuracy and ranking consistency improve over baseline.
3. Users can understand score rationale at a glance.
4. No LLM runtime is required for live gameplay.

Likely files:
1. `server/services/entryEvaluationService.js`
2. `server/services/evaluation/*`
3. `server/benchmarks/contextEngine/*`
4. `server/services/roundEvaluationService.js`
5. `server/services/round4Service.js`

## F1) Evaluator Trust Indicators + Score Trace UI
Goal: make evaluation handling instantly readable to users (and to you while tuning).

This replaces the old "AI explainability" concept with a broader trust/trace system that works with the Context Engine.

Scope:
1. Add clear status labels to cards/OVR modal (example: `Resolved`, `Low-confidence resolve`, `Fallback`, `Context override`).
2. Show top matched traits/intents and key risk flags.
3. Add a compact score trace row in round/final card views.
4. Keep UI readable and not too verbose.

Definition of done:
1. Every entry has visible evaluation status + confidence/trust indicator.
2. OVR breakdown clearly shows why the score moved.
3. Debugging "this felt wrong" becomes much easier.

Likely files:
1. `public/js/round4Eval.js`
2. `public/js/app.js`
3. `public/css/round4Eval.css`
4. `server/evaluator/presentation/presentation.js` or future `server/services/evaluation/explain/*`

## F2) Entries Mobile View / Accessibility
Goal: users can type entries while still seeing enough game context on mobile.

Scope:
1. Sticky compact top info bar while keyboard is open.
2. Condensed scenario/twist header mode on short viewports.
3. Input panel safe-area handling + reduced layout jump.
4. Better focus/scroll behavior.

Likely files:
1. `public/js/ui.js`
2. `public/js/app.js`
3. `public/css/game.css`

## F3) Round 4 Reveal Ceremony Smoothness
Goal: make the reveal ceremony feel premium, smooth, and readable.

Scope:
1. Timeline-based reveal states.
2. Better dwell timing per card.
3. Smooth return-to-slot animation.
4. Bottom leaderboard emoji support as intended.

Likely files:
1. `public/js/round4Eval.js`
2. `public/css/round4Eval.css`

## F4) Round 4 -> Final Results Narrative Bridge
Goal: make Round 4 and Final Results feel connected rather than redundant.

Scope:
1. Add bridge state or transition recap.
2. Clarify what unlocks in final results.
3. Preserve Round 4 exploration while making final screen meaningful.

Likely files:
1. `public/js/round4Eval.js`
2. `public/js/app.js`
3. `server/socket/socketHandlers.js`

## F5) Final Results "Elite Six" Logic Update
Goal: elite six should be the top six OVR entries globally, not just the winning team.

Scope:
1. Recompute top six from all final entries.
2. Update wording and labels.
3. Keep winner logic separate from elite showcase logic.

Likely files:
1. `server/services/round4Service.js`
2. `public/js/app.js`

## F6) Resolver / Alias / Proxy Curation Tools [NEW]
Goal: improve accuracy quickly by editing resolver knowledge without code changes.

Scope:
1. Curated alias/proxy pattern packs (CSV/JSON or admin UI later).
2. Local audit tool for misses (example: "office boss guy" -> Michael Scott).
3. Confidence/risk flag review output.

Why this matters:
1. Biggest low-cost accuracy lever in a non-LLM system.
2. Makes the engine feel smarter without runtime overhead.

Likely files:
1. `server/evaluator/core/fetchers.js` (initial extraction source)
2. `server/services/evaluation/resolver/*`
3. `server/benchmarks/contextEngine/*`

## F7) Replay Benchmark + Regression Dashboard [NEW]
Goal: tune the Context Engine with data, not vibes.

Scope:
1. Fixture format for seeded and real rounds.
2. Replay harness for latency/accuracy/ranking consistency.
3. Regression report output (CLI first, dashboard later).

Why this matters:
1. Prevents repeat of opaque evaluation regressions.
2. Makes rule-pack changes safe and fast.

Likely files:
1. `server/benchmarks/contextEngine/replayHarness.js`
2. `server/viabilityTestHarness.js` (ideas/logic reuse)
3. `md/AI_CORE_MIGRATION_PLAN.md`

## F8) Audio Reliability and Quality
Goal: audio works on iOS and adds controlled polish.

Scope:
1. iOS audio unlock flow fix.
2. Mute/music/SFX controls.
3. Round 4 reveal SFX hooks.
4. Optional background music channel with sane defaults.

Likely files:
1. `public/js/audio.js` (create if missing)
2. `public/js/app.js`
3. `public/css/game.css`

## F9) Random API Generator Source Indicator
Goal: show which fallback source was selected (example: `API 2/7`).

Scope:
1. Add index/total to source label.
2. Keep it visually subtle.

Likely files:
1. `server/core/gameEngine.js`
2. `public/js/app.js`
3. `public/index.html`

## F10) App Start Loading/Animation + Preload Stage
Goal: branded start screen that also warms assets/state safely.

Scope:
1. Intro screen with continue CTA.
2. Preload critical assets during intro.
3. Avoid hurting first interactive time.

Likely files:
1. `public/index.html`
2. `public/js/app.js`
3. `public/css/game.css`

## F11) Advanced Settings Redesign + New Modes
Goal: full-screen advanced control center with scalable mode system.

Important note (changed):
- This should be built **after** Context Engine stabilization because multiple planned modes depend on evaluator hooks and new constraints.

Modes/features to support:
1. Teams Mode (2x2 vs 3x3)
2. No Voting Mode (pure Context Engine)
3. Category-first mode
4. Player-authored scenario/twist mode
5. Final Mode selector:
- `Chaos Final` (current Round 4 final generated scenario/twist)
- `Draft Synthesis Final` (no new Round 4 scenario/twist; final scoring synthesizes original drafting contexts + chemistry/team composition)
6. Dev/Test mode with dummy info
7. TV companion / Jackbox-style version (coming soon stub)

Likely files:
1. `public/js/app.js`
2. `public/js/ui.js`
3. `public/css/game.css`
4. `server/core/gameEngine.js`
5. `server/socket/inputValidation.js`

## F12) Room Recovery and Reconnect Durability
Goal: prevent match loss from refresh/drop and improve reliability.

Scope:
1. Recoverable room snapshots.
2. Rejoin tokens / role restoration.
3. Host migration or timeout policy.

Likely files:
1. `server/storage/statePersistence.js`
2. `server/core/gameEngine.js`
3. `server/socket/socketHandlers.js`
4. `public/js/state.js`

## F13) Competitive Integrity Layer
Goal: reduce exploitability as the game becomes more competitive.

Scope:
1. Duplicate/alias abuse detection
2. Vote anomaly heuristics
3. Configurable flags / penalties / admin logs

Likely files:
1. `server/socket/inputValidation.js`
2. `server/core/gameEngine.js`
3. `server/services/security/*`

## 5) Recommended Release Waves (Updated)

### Wave A (Foundation + trust, immediate)
1. F0 Context Engine migration (Phase 0-3 minimum viable)
2. F1 Evaluator trust indicators + score trace UI
3. F2 Entries mobile accessibility
4. F5 Elite six logic update

### Wave B (Gameplay payoff polish)
1. F3 Round 4 reveal ceremony smoothness
2. F4 Round4 -> final narrative bridge
3. F8 Audio reliability and controls
4. F9 Random API source indicator
5. F10 App start loading + preload

### Wave C (Accuracy compounding + mode expansion)
1. F6 Resolver curation tools
2. F7 Replay benchmark/regression dashboard
3. F11 Advanced settings + new modes
4. F12 Room recovery/reconnect durability
5. F13 Competitive integrity layer

## 6) Critical Dependencies and Notes
1. F11 (advanced modes) depends heavily on F0 Context Engine hooks.
2. F1 should ship early because it speeds up evaluator tuning and user trust.
3. F6/F7 are compounding features: they make the Context Engine better over time without raising runtime cost.
4. F3/F4/F5 should be coordinated so the Round 4 + Final payoff feels like one polished sequence.

This roadmap now matches the realistic path: a fast, contextual, deterministic engine with transparent scoring and a premium gameplay experience.
