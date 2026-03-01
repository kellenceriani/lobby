# Round 4 Loading -> Ceremony Behavior Matrix (Deep Root-Cause Revision)

Last updated: February 28, 2026

## Objective

This revision addresses the real-world report:

> The game freezes consistently in Round 4 loading before reveal, and voice/audio-generation behavior is inconsistent/slow.

This document now reflects **actual code behavior** across:

- client: `public/js/app.js`, `public/js/round4Eval.js`, `public/js/round4EvalSharedAudio.js`, `public/js/audio/*`
- server: `server/core/gameEngine.js`, `server/socket/socketHandlers.js`, `server/services/round4Service.js`, `server/services/adaptiveTtsService.js`, `server/services/voiceCueFactory.js`

---

## Executive Findings

### What is truly happening

There are **two freeze classes**:

1. **Hard freeze (true deadlock risk):**
   - `evaluateRound4` has no global watchdog timeout around the full evaluation path.
   - If context/evaluation work never resolves, `round4Evaluated` never emits, client remains in loading.

2. **Perceived freeze (very frequent):**
   - Round 4 reveal is manual/local (`START REVEAL CEREMONY`), not auto.
   - Loading readiness is coupled to narration queue state and announcer warmup windows.
   - Final progression is all-player gated (`requestFinalResults`), so one lagging client stalls everyone.

### Bottom line

Current behavior is not one bug. It is a **pipeline coupling problem**:

- evaluation transport,
- voice/TTS prewarm,
- local reveal gating,
- global final-results gating,

all partially block each other and produce "stuck" outcomes.

---

## Canonical Flow vs Current Coupling

## Should flow

1. Server enters `AI_EVALUATION`, emits `round4Start` quickly.
2. Client emits `evaluateRound4`.
3. Server emits `round4Evaluated` as soon as scoring is ready.
4. Client loading finishes independently of narration quality.
5. Reveal starts (auto or bounded fallback).
6. Final lock is robust to idle/background clients.

## Current flow (important couplings)

1. `round4Start` and `round4Evaluated` are both emitted through server-side voice prewarm wrappers (`emitWithVoiceCuePrewarm` / `emitRoomEventWithVoiceCuePrewarm`) with timeout waits.
2. Client Round 4 loading readiness waits on:
   - asset preloads,
   - animation prime,
   - announcer warmup,
   - `waitForRevealLoadingNarrationToFinish` (global queue/speaking state),
   - minimum hold timer.
3. Reveal still requires manual click.
4. Final results require all eligible connected players to click continue.

---

## Root-Cause Matrix (Code-Backed)

| ID | Root cause | Evidence in code | User impact | Risk |
|---|---|---|---|---|
| R1 | No hard timeout for end-to-end Round 4 evaluation request lifecycle | `socketHandlers.js` `evaluateRound4` awaits `evaluateRound4FromGame(...)` / precompute promise without outer watchdog | If evaluator chain hangs, `round4Evaluated` never arrives; infinite loading | **Critical** |
| R2 | Server emit path waits for TTS prewarm before sending phase events | `emitWithVoiceCuePrewarm` + `emitRoomEventWithVoiceCuePrewarm` wraps `round4Start`, `round4Evaluated`, `finalRoundResults` | Adds avoidable latency under TTS slowness; can stack delays in every phase boundary | High |
| R3 | Loading readiness is coupled to global voice queue activity | `waitForRevealLoadingNarrationToFinish` checks `voiceState.speaking || queued > 0` | Unrelated queued cues can delay Start availability; users read this as freeze | High |
| R4 | Ready cue is awaited before enabling Start | `renderCinematicSequence` waits for `waitForSharedVoiceCueCompletion` for pending loading-ready cue before `setLoadingReadyState(true)` | Slow/noisy voice system delays reveal button activation | High |
| R5 | Manual reveal start only | `index.html` `evalStartRevealBtn` + `startRound4Reveal()` only on click | Many sessions stall on loading-ready screen waiting for player action | High |
| R6 | Global final lock requires every connected eligible player | `updateFinalResultsWaiting` + `requestFinalResults` all-ready gate | One player idle/backgrounded blocks finals for everyone | High |
| R7 | TTS provider chains have long failover windows | `adaptiveTtsService.js` provider timeouts (edge/bridge/piper up to tens of seconds) | Inconsistent narration responsiveness, warmup contention, queue churn | Medium-High |
| R8 | Client has no Round 4 loading watchdog/resync | `initRound4Evaluation` emits once; no periodic re-request when loading exceeds threshold | Packet loss/event miss can look like permanent freeze | Medium |
| R9 | UI messaging does not distinguish "waiting for click" vs "waiting for server" | Status text blends setup/wait states | Users interpret intentional waits as broken game | Medium |

---

## Scenario Outcomes (Revised)

| Scenario | Current outcome | Primary cause |
|---|---|---|
| Normal desktop room | Often succeeds but can stall on manual start/final lock | R5 + R6 |
| Mixed iOS + desktop | Higher stall probability; iOS unlock/background behavior increases friction | R5 + R6 + R3 |
| Voice unlocked late / unavailable | Usually recovers, but queue coupling can still hold readiness windows | R3 + R4 |
| Slow TTS providers | Phase emits and readiness feel slow/inconsistent | R2 + R7 |
| Evaluator upstream delay/hang | Hard freeze in loading (`round4Evaluated` absent) | **R1** |
| Event loss/client race | Client stays loading without resync path | R8 |

---

## Why Voice/Audio Is a Structural Problem Here

Voice is currently treated as both:

- a **presentation enhancement**, and
- a **readiness signal** for phase progression.

That dual role is the core flaw.

Specific coupling points:

1. Server waits before emitting gameplay events (prewarm wrappers).
2. Client waits for queue quiet state before enabling start.
3. Client may wait for a specific ready cue completion before enabling start.

Result: narration quality/performance degrades game-state responsiveness.

---

## Perfect Fix Plan (Prioritized, Implementation-Ready)

## Phase 0 (Hotfix, 1-2 days)

1. **Add hard watchdog around `evaluateRound4` server request path**
   - File: `server/socket/socketHandlers.js`
   - Wrap scoring await in bounded timeout (e.g., 12-20s configurable).
   - On timeout: emit deterministic fallback `round4Evaluated` payload (or retriable error + forced retry token).

2. **Decouple event emission from voice prewarm**
   - Files: `server/core/gameEngine.js`, `server/socket/socketHandlers.js`
   - Emit event immediately, run prewarm fire-and-forget.
   - Keep telemetry but never gate transport on narration warmup.

3. **Auto-start reveal fallback timer**
   - File: `public/js/round4Eval.js`
   - If loading is ready and no click within X seconds (e.g., 5-8s), auto-call `startRound4Reveal()`.
   - Keep manual button but remove perma-stall path.

4. **Add client Round 4 loading watchdog + re-sync**
   - File: `public/js/round4Eval.js`
   - If `round4Evaluated` not received within threshold, re-emit `evaluateRound4` with backoff.
   - If cached payload exists server-side, it already responds quickly.

## Phase 1 (Stability, 2-4 days)

5. **Stop readiness gating on global queue depth**
   - Files: `public/js/round4EvalSharedAudio.js`, `public/js/round4Eval.js`
   - Replace `speaking || queued > 0` gate with cue-scoped wait only (or fixed short grace window).
   - Never block Start on unrelated voice backlog.

6. **Do not await ready cue completion before enabling Start**
   - File: `public/js/round4Eval.js`
   - Set loading-ready immediately; play ready cue opportunistically.

7. **Bound final-results gate with host fail-safe**
   - File: `server/socket/socketHandlers.js`
   - Add policy: after reveal-complete + timeout, allow host continue or auto-advance.
   - Keep strict mode optional behind env flag if needed.

8. **Shorten TTS fallback failure budget for interactive phase cues**
   - File: `server/services/adaptiveTtsService.js`
   - Introduce cue class budget (phase cues low-latency, long-form allowed longer timeout).
   - Keep generation quality for non-blocking contexts.

## Phase 2 (Quality + Observability, 1 week)

9. **Add end-to-end Round 4 loading telemetry**
   - Client timestamps: `round4Start_rx`, `evaluateRound4_tx`, `round4Evaluated_rx`, `loading_ready`, `reveal_started`, `continue_tx`.
   - Server timestamps: request in, eval start/end, emit start/end, timeout/fallback counters.

10. **Add explicit UX states**
   - File: `public/js/round4Eval.js`
   - Distinguish:
     - waiting for server evaluation,
     - local prep in progress,
     - ready (tap or auto-start countdown),
     - waiting on other players.

11. **Create automated soak scenario for Round 4 loading**
   - Use/extend `server/viabilityTestHarness.js` + multiplayer script.
   - Include slow-provider simulation, mobile unlock-off, background-tab return, packet delay.

---

## Acceptance Criteria (Must Pass)

1. No session can remain in pre-reveal loading forever.
2. `round4Evaluated` always resolves to either success payload or explicit bounded fallback within timeout budget.
3. Reveal starts automatically when ready if no user click.
4. Voice queue backlog cannot block gameplay readiness.
5. Finals cannot stall indefinitely due to one idle connected user.
6. Telemetry can identify whether delay source is evaluator, transport, or voice.

---

## Configuration Recommendations (Default Targets)

- `ROUND4_EVAL_WATCHDOG_MS=16000`
- `ROUND4_AUTO_START_MS=6000`
- `ROUND4_FINAL_LOCK_TIMEOUT_MS=25000`
- `ROUND4_VOICE_READY_GRACE_MS=600` (cue-scoped, not global queue)
- `LOBBY_TTS_INTERACTIVE_TIMEOUT_MS=5000` (phase-critical cues)

---

## Final Assessment

The recurring "freeze before Round 4" is currently a mix of:

- one unbounded server path (critical), and
- multiple design-level coupling decisions where voice and manual actions gate progression.

Fixing this requires **decoupling gameplay state from voice readiness** and adding **hard watchdogs + auto-fallbacks** at both server and client boundaries.

