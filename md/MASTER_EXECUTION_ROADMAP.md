# LobbyWARS Master Execution Roadmap

Last updated: February 20, 2026  
Status: Reality-aligned, intent-driven execution view

## Core Intent (What this roadmap optimizes for)
This roadmap is built around your current practical intent:
1. Keep momentum by closing concrete quality risks instead of reopening finished work.
2. Make Round 4 feel like a true final act that still belongs to the same game as rounds 1–3.
3. Improve evaluator trust and scoring consistency before adding feature scope.
4. Keep UX friction low on mobile and first-session entry.

This document is intentionally execution-first: each active item has scope, success criteria, and a stop condition.

---

## A) Completely Done (Closed — do not re-open unless regression appears)

### A1. Fastest lock-time correctness fix
- **Outcome:** lock timing now resolves in a deterministic and fair way.
- **Why it matters:** prevents credibility loss in competitive outcomes.
- **Re-open only if:** new tie/edge-case evidence appears in live play logs.

### A2. Lobby/chat mobile spacing + viewport hardening
- **Outcome:** sticky action area and chat region no longer clip critical controls on constrained mobile viewports.
- **Why it matters:** prevents player drop-off during join/lobby dwell time.
- **Re-open only if:** QA or player reports show overlap/clipping regressions on specific devices.

### A3. Round 4 reveal timing retune (initial pass)
- **Outcome:** reveal cadence is now less draggy and more readable.
- **Why it matters:** controls perceived polish and endgame pacing.
- **Re-open only if:** after redesign pass, new timing mismatches emerge.

### A4. Scenario/twist generator brevity constraints (initial pass)
- **Outcome:** baseline prompt length controls are in place at generation level.
- **Why it matters:** keeps gameplay text scannable and punchy.
- **Re-open only if:** parser benchmarks or playtests show under/over-compression.
- **Extension completed (February 20, 2026):** final showdown generation now uses server-authoritative natural compression with strict caps (scenario: 4 words, twist: 5 words) to keep Round 4 prompts concise in live output.

### A5. `OVR CUM` semantics corrected
- **Outcome:** displayed cumulative OVR now equals true sum of team OVR values.
- **Why it matters:** avoids trust-breaking scoreboard ambiguity.
- **Re-open only if:** service payload and UI diverge again.

### A6. Runtime efficiency hardening (server + Round 4 loading CSS)
- **Outcome:** Express now serves compressed responses with conservative static caching, and Round 4 loading styles were pruned of dead header-phase overrides.
- **Why it matters:** lowers transfer overhead and reduces style-maintenance drift without changing UX behavior.
- **Re-open only if:** cache staleness or loading-phase visual regressions appear.

### A7. Round 4 fetch reliability + preload priming + server-stress controls
- **Outcome:** Round 4 evaluation now uses transient-aware retry/backoff, short-lived response cache + inflight dedupe, and one-pass low-confidence refinement; loading reveal waits for image decode preload + animation pipeline priming before unlock.
- **Why it matters:** improves trust in final scoring inputs, smooths first reveal frame quality, and reduces duplicate upstream request pressure under concurrent evaluations.
- **Re-open only if:** live telemetry shows excessive latency, stale fetch behavior, or reveal unlock timing regressions.
- **Completion notes (February 20, 2026):**
   - Server fetch hardening shipped in evaluator fetch path with force-refresh support and transient retry policy.
   - Round 4 service now performs capped targeted refinement (`MAX_REFINE_PER_TEAM = 1`) for low-confidence evaluations.
   - Client Round 4 loading now gates reveal on preload + profile prep + animation priming readiness.

---

## C) Immediate Revisit + Improve (Current Priority)
These are highest-impact next steps and should remain tightly sequenced.

### C1. Consolidate duplicate Round 4 leaderboard renderer
- **Target:** remove dual `renderFinalLeaderboard` implementations in `public/js/round4Eval.js`.
- **Problem:** duplicate render paths create override drift and maintenance risk.
- **Success criteria:**
   - Single canonical render function.
   - No behavior loss in sorting, labels, and reveal transitions.
   - No duplicate DOM writes for same frame/state transition.
- **Stop condition:** one renderer path in production code + smoke-tested final board output.
- **Status:** ✅ Completed (February 20, 2026)
- **Completion notes:**
   - Live runtime now uses one canonical `renderFinalLeaderboard` path.
   - Archived legacy snapshot keeps a non-canonical `renderLegacyLeaderboard` name to avoid symbol-level drift/confusion.

### C2. Round 4 redesign for continuity with rounds 1–3
- **Target:** align language, emotional arc, and visual information flow with existing game identity.
- **Problem:** Round 4 currently reads as stylistically detached from prior rounds.
- **Scope focus:**
   - Tone/wording consistency in headers, context labels, and status copy.
   - Clear scenario → twist → evaluation causality presentation.
   - Reduce “system dashboard” feel where it conflicts with party-game energy.
- **Success criteria:**
   - First-time players can explain why a team won in one read-through.
   - Copy style feels continuous with rounds 1–3.
   - Reveal remains dramatic without sacrificing clarity.
- **Stop condition:** redesigned pass accepted by internal playtest with no continuity objections.
- **Status:** ✅ Completed (February 20, 2026)
- **Completion notes:**
   - Round 4 header/loading/action copy rewritten from system-heavy phrasing to party-game showdown language.
   - Scenario/twist framing now reads as explicit causality in-line with earlier round context style.
   - Reveal/continue status messaging now follows same direct, player-facing cadence as rounds 1–3.

### C3. Evaluator constraint-parser v1 + benchmark harness
- **Target:** introduce robust parser layer for constraint extraction + measurable benchmark workflow.
- **Problem:** evaluator quality ceiling is limited without stronger structure around constraint handling.
- **Scope focus:**
   - Parser correctness on scenario/twist constraints.
   - Explicit benchmark set covering easy/normal/hard and weird edge prompts.
   - Stability checks for relevance + OVR interactions.
- **Success criteria:**
   - Benchmarks run repeatably and produce comparable outputs.
   - Parser meaningfully reduces obvious mis-scored cases.
   - Regression snapshot exists for future tuning.
- **Stop condition:** parser + benchmark tooling usable in routine tuning loop.

### C4. Round 4 brevity quality pass (post-parser)
- **Target:** tune brevity once parser behavior is stable, not before.
- **Problem:** premature brevity tuning can hide parser defects or force bad truncation tradeoffs.
- **Success criteria:**
   - Brevity remains concise without flattening useful context.
   - Team-level comparisons stay readable on mobile.
   - No repeated clipped fragments or awkward sentence tails.
- **Stop condition:** brevity tuned against parser-informed benchmark outputs.

---

## B) Still Needs Work (Hold until C stabilizes)
Important work, but intentionally deferred to avoid priority thrash.

1. Round 4 reveal timing retune (secondary polish pass after redesign)
2. Round 4 animation/theatrics production pass
3. Category-commit mode
4. Cleanup wave for oversized files/modules
5. Temp-folder retirement + broad docs synchronization *(artifact cleanup pass completed February 20, 2026; docs sync follow-up remains)*
6. Longer-horizon strategy threads (API economics, team-mode expansion, app-path decisions)

**Gate to start B:** C1–C3 must be complete and stable.

---

## D) Lower Priority (After C and critical B gates)
These are valid initiatives but intentionally suppressed until quality foundation is stable.

- Phase 4/5 structural strategy work beyond immediate evaluator and Round 4 continuity goals

**Gate to revisit D:** core scoring trust, Round 4 continuity, and benchmark loop all stable.

---

## Active Execution Queue (Operational)
1. Evaluator constraint-parser v1 + benchmark harness
2. Round 4 brevity quality pass (parser-informed)

---

## Verification Snapshot (February 20, 2026)
- Server module runtime sanity check completed for evaluator and Round 4 service paths.
- Round 4 evaluation smoke executed through `evaluateRound4FromGame` with multi-team mock payloads and successful leaderboard output.
- Live app smoke validated via browser/debug route with Round 4 assets returning `200` (`/`, `js/round4Eval.js`, `css/round4Eval.css`, `socket.io/socket.io.js`).
- Local startup note: default port `3000` may be occupied during development; validation run succeeded on alternate port `3100`.

---

## Execution Rules (to protect momentum)
- Do not pull completed A-items back into active work unless regression is demonstrated.
- Do not run major animation/theatrics work before parser benchmark foundation exists.
- Prefer server-authoritative fixes over UI-only patches when semantics are at stake.
- After each queue item, update this roadmap immediately so it stays reality-accurate.
