# Future Implementations Roadmap (Reality-Aligned Product Roadmap)

Last updated: February 24, 2026
Status: Full core game loop is live; roadmap reset to optimize for fun, replayability, polish, and App Store readiness.

## 1) Why This Roadmap Was Rewritten

The previous version of this file was outdated because it treated Context Engine / AI-core migration as the main blocker for progress.

That is no longer true.

Current reality:
- The game is already playable end-to-end (lobby -> rounds 1-3 -> Round 4 AI -> final results).
- The AI/core evaluator stack is stable enough to support live gameplay and is no longer the top priority.
- Several items previously listed as "future" are already implemented (or implemented enough to move out of P0).
- The next major wins are product wins: playability, replayability, retention, fun factor, and marketability.

This rewrite reflects the actual state of the project and the actual business/game goal.

## 2) Product End Goal (North Star)

Build LobbyWARS into a marketable, profitable, highly replayable multiplayer party game that:
- Is fun and readable for first-time players
- Feels polished enough to ship on an App Store
- Has strong replayability (modes, content variety, social moments, "small wins")
- Can be maintained without constant firefighting
- Improves AI/evaluator quality over time without making the live game slow or expensive

## 3) Current Reality Snapshot (What Is Already Done)

## A) Core Gameplay Loop (Implemented)

- [x] Join flow (name + room code + host option)
- [x] Tutorial / how-to-play screen
- [x] Lobby tabs (players / settings / chat)
- [x] Host settings and readiness/start gating
- [x] Live chat + reactions
- [x] Rounds 1-3 full flow:
  - pre-round
  - draft
  - twist reveal
  - voting
  - tallying
  - results
- [x] Hybrid scoring in rounds 1-3 (community voting + contextual intel)
- [x] Round 4 final AI evaluation (server-authoritative)
- [x] Final results synchronization / ready-up gating before final emission
- [x] Play again / return to lobby flow

## B) UX / Design / Experience (Implemented)

- [x] Redesigned join, tutorial, lobby, voting, results, and Round 4 screens
- [x] PWA-oriented install/fullscreen prompt flow
- [x] Audio settings toggle (mute on/off) exposed in settings UI
- [x] Lobby chat unread ping badge
- [x] Creator credit/contact links in join + lobby
- [x] Credits/licensing disclosure drawers (join/settings)
- [x] Draft wait visual state while locked
- [x] "Early eval peek" draft wait preview (warm-cache preview during draft lock wait)
- [x] Round 4 cinematic loading + reveal ceremony flow
- [x] OVR breakdown modal with expanded breakdown visuals and mood cues
- [x] Round 4 section navigation / page-UI continuity improvements
- [x] Round 4 finale ceremony embedded in the Round 4 experience
- [x] Final archive bridge and back-path to Round 4 finale
- [x] "Elite Six" UX language updated to "Top 6 Profiles" (presentation layer)

## C) Backend / Systems / Reliability Foundations (Implemented)

- [x] Server-authoritative room/game lifecycle and phase transitions
- [x] Socket event validation and rate limiting on sensitive actions
- [x] Snapshot persistence for room state (`server/.runtime/rooms.snapshot.json`)
- [x] Round evaluation service (rounds 1-3 intel scoring)
- [x] Round 4 service (team evaluation, OVR, chemistry, final leaderboard payloads)
- [x] Modular evaluator stack under `server/evaluator/*`
- [x] Compression/static-serving efficiency improvements
- [x] Warm-cache support for evaluator prep during draft wait
- [x] Bench scripts exist for evaluator/context benchmarking (`bench:context`, `bench:random500`)

## D) AI Core / Evaluator Status (Implemented Enough for Current Priority)

- [x] AI-core / evaluator is stable for live use
- [x] Context/legacy mode support exists (`legacy`, `context_shadow`, `context`)
- [x] No live LLM runtime is required for match flow
- [x] Explainability/trust metadata exists in the pipeline (ongoing polish still useful)

Strategic note (important):
- Estimated current accuracy is roughly 60-70% (good enough to run the game, not yet "premium AI judge" level).
- Target accuracy remains 90-95%.
- Reaching 90-95% will require significant time/effort and should not be treated as the current main blocker.
- AI-core work should continue gradually and intentionally, while product/game quality improvements take priority.

## 4) Status Audit of the Previous "Future" Roadmap (What Should Be Marked Complete vs Reframed)

This section maps the old file's framing to current reality.

| Old ID | Old Initiative | Current Status | Action |
|---|---|---|---|
| F0 | Context Engine migration (non-LLM core) | Largely complete as a strategic direction and runtime baseline | Mark complete as a migration program; continue as low-priority tuning lane |
| F1 | Evaluator trust indicators + score trace UI | Partially complete / ongoing polish | Reclassify as incremental UX polish, not P0 blocker |
| F2 | Entries mobile input/accessibility | Partially complete | Keep active (high value) |
| F3 | Round 4 reveal ceremony smoothness | Substantially implemented | Mark complete for current phase; future work is optional polish |
| F4 | Round 4 -> Final Results narrative bridge | Implemented (Round 4 finale + archive bridge) | Mark complete |
| F5 | Final results "Elite Six" logic update | UX naming/presentation updated to "Top 6 Profiles"; logic should be regression-verified | Mark mostly complete; keep a verification task only |
| F6 | Resolver/alias/proxy curation tools | Not productized | Keep, but lower than retention/playability work |
| F7 | Replay benchmark + regression dashboard | Foundations/scripts exist; not full workflow | Keep as dev-ops quality track |
| F8 | Audio reliability and quality | Partial (controls exist; platform reliability/polish still open) | Keep active |
| F9 | Random API source indicator enhancement | Unknown / likely still open | Keep low-priority polish |
| F10 | App start loading/animation + preload stage | Partial (loading/install experience exists) | Reframe as onboarding polish, not core blocker |
| F11 | Advanced settings redesign + new modes | Not complete | Promote (high replayability/retention value) |
| F12 | Room recovery/reconnect durability | Partial (snapshot exists, full reconnect durability not done) | Keep active, high value |
| F13 | Competitive integrity layer | Mostly future | Keep later-stage |

## 5) New Priority Rules (Product-First)

Priority order from this point forward:
1. Playability and session quality (fewer dead moments, fewer drop-offs, less confusion)
2. Replayability and fun expansion (modes, variety, social moments, "small victories")
3. App Store readiness and marketability (onboarding, polish, trust, compliance, retention hooks)
4. Maintainability and dev velocity (tests, modularization, observability)
5. AI-core accuracy improvement (slow compounding lane, not a blocker)

## 6) New Roadmap (Rewritten)

## P0: High-Impact Product Work (Current Focus)

### P0.1 Playability + Reliability Pass (finish the rough edges)

Goal:
- Make every full match feel smooth enough that players want an immediate rematch.

Scope:
- Mobile draft input ergonomics (keyboard, viewport, sticky context, safe areas)
- Reconnect/rejoin durability for refresh/drop cases
- Final results and Round 4 sync edge-case hardening
- Audio reliability pass (especially iOS unlock/resume behavior)
- Continue trimming "dead air" between phase transitions

Why now:
- This directly affects retention and whether groups finish the session.

Definition of done:
- Fewer broken/awkward moments in live playtests
- Mobile session completion noticeably improves
- Reconnect failures become uncommon enough for casual group use

### P0.2 Replayability Expansion (mode system + variety)

Goal:
- Increase "one more game" behavior and reduce match sameness.

Scope:
- Advanced settings redesign (clean mode hub, still host-friendly)
- New mode framework (without breaking the default flow)
- First replayability modes:
  - Category-first mode
  - No-voting mode (AI-only social experiment mode)
  - Player-authored scenario/twist mode (guardrailed)
  - Final mode selector (Chaos Final vs Draft Synthesis Final)
- Better surfacing of difficulty/theme differences so settings feel meaningful

Why now:
- This is one of the strongest paths to fun + replayability without requiring near-perfect AI accuracy.

Definition of done:
- Players can clearly understand and choose modes
- At least 2-3 new modes are stable and fun in repeated sessions
- Default mode remains simple and unaffected

### P0.3 "Small Victories" and Delight Layer

Goal:
- Add frequent dopamine hits and social payoff moments inside each match.

Scope:
- Round badges / micro-achievements (fast lock, upset win, clutch vote, best twist fit, chaos pick)
- End-of-round MVP callouts beyond raw points
- Session summary highlights ("Most Trusted Pick", "Biggest Swing", "Crowd Favorite")
- Shareable result cards/screenshots (basic local export first)

Why now:
- High perceived polish and replay value for relatively low implementation cost.

Definition of done:
- Each round gives at least one extra player-facing highlight beyond points
- Final session recap feels memorable even when a player loses

### P0.4 App Store Readiness Foundations (practical, not glamorous)

Goal:
- Move from "works locally / web-hostable" toward "shippable product".

Scope:
- Production error logging and crash reporting strategy
- Privacy/legal basics (privacy policy, terms, asset attribution cleanup, license clarity)
- Session analytics (funnel: join -> start -> round completion -> rematch)
- Device/browser QA matrix and minimum support policy
- Installation/onboarding polish (first-session clarity, permissions/audio/fullscreen guidance)

Why now:
- Marketability/profitability requires trust and operational visibility, not just game mechanics.

Definition of done:
- App has a measurable funnel
- Core policy/compliance docs exist
- App Store prep tasks are no longer vague

## P1: Maintainability + Scale-Safe Improvements (Should Run in Parallel)

### P1.1 Testing / Validation / Regression Infrastructure

Goal:
- Improve confidence when changing scoring, modes, and socket payloads.

Scope:
- Schema checks for socket event payloads in dev mode
- Match-flow smoke scripts (join -> rounds -> Round 4 -> final)
- Evaluator regression fixture set (golden cases + known-fail cases)
- Benchmark reports for latency/load changes

Why now:
- The codebase is already feature-rich; breakage risk is rising.

### P1.2 Module Cleanup for Long-Term Maintainability

Goal:
- Keep the app maintainable as more modes/features are added.

Scope:
- Break up oversized client files (`public/js/app.js`, `public/js/round4Eval.js`) into focused modules
- Isolate mode config and rules from UI orchestration
- Consolidate duplicated UI render helpers and constants
- Keep docs in sync with event contracts and payload shapes

Why now:
- Future features will become slower and riskier if this waits too long.

### P1.3 Evaluator Transparency Polish (Not Accuracy Overhaul)

Goal:
- Make existing evaluator decisions easier to trust and debug without major AI-core research work.

Scope:
- Cleaner trust labels and confidence/risk visual language
- Better wording for low-confidence/fallback paths
- Compact trace summaries in more result surfaces
- Debug toggle for deeper evaluator info in dev/test mode

Why now:
- Improves player trust and helps tuning, but does not require a big engine rewrite.

## P2: AI-Core Accuracy Improvement (Low Priority, Long-Horizon Lane)

This is intentionally deprioritized relative to product and replayability work.

Goal:
- Gradually improve evaluator quality from an estimated 60-70% toward a long-term 90-95% target while keeping:
  - low server stress
  - low latency
  - deterministic/consistent outputs
  - explainable scoring behavior

Guidance:
- Treat this as a compounding background lane, not the headline roadmap.
- Prioritize improvements with strong ROI:
  - resolver alias/proxy curation
  - better benchmark fixtures
  - targeted scoring rule fixes from real mis-score logs
  - confidence calibration improvements
- Avoid large rewrites unless data clearly shows a major ceiling.

Revisit threshold (when to make this a top priority again):
- After core playability/replayability/app-store foundations are stable
- After enough real-world mis-score examples are logged to guide focused tuning
- When a specific evaluator quality issue is proven to hurt retention

## 7) Strong Improvement / Stretch Goals (New)

These are intentionally ambitious and high-upside. They should not block P0 work, but they are strong candidates for marketability and differentiation.

### S1) Streamer / Audience Party Mode (High Upside)

Concept:
- Add a spectator/audience mode where viewers can react, vote on twist modifiers, or influence a "chaos meter" without breaking competitive scoring.

Why it is strong:
- Strong viral/share potential
- Makes LobbyWARS more stream-friendly and social
- Can create unique moments that drive replayability

Risks:
- Requires clean anti-spam/rate limiting and clear UI separation between players and audience

### S2) Daily Challenge + Seeded Match "Puzzle" Mode

Concept:
- A daily seeded scenario/twist set (solo or async comparison) where players compete on drafting quality / predicted AI outcomes.

Why it is strong:
- Gives the app a reason to open every day
- Adds replayability even without a full group
- Builds social sharing and leaderboard hooks

Risks:
- Requires deterministic seed handling and leaderboard validation rules

### S3) Pack System (Theme Packs / Event Packs / Seasonal Content)

Concept:
- Curated content packs for scenarios, twists, themes, and visual treatments (e.g., Horror Night, Anime Chaos, Retro Heroes, Office Disaster).

Why it is strong:
- Direct monetization path (premium packs or cosmetic/event bundles)
- Easy marketing hooks ("new pack this week")
- Increases content freshness without changing core rules

Risks:
- Requires a maintainable content authoring format and moderation/rights discipline

### S4) Async "League Night" / Club Rooms

Concept:
- Persistent room identity with recurring friend groups, season standings, and light progression (badges, win streaks, rivalry stats).

Why it is strong:
- High retention and social stickiness
- Converts one-off sessions into recurring habit behavior
- Creates a framework for monetization without pay-to-win mechanics

Risks:
- Requires account identity, persistence strategy, and stronger operational support

## 8) Release Waves (Recommended)

## Wave 1: Finish the Product Core (Now)

Focus:
- P0.1 Playability + reliability
- P0.3 Small victories
- P0.4 App Store readiness foundations
- P1.1 testing/validation basics

Outcome:
- The game feels consistently fun and less fragile in real group sessions.

## Wave 2: Replayability Push

Focus:
- P0.2 replayability/modes
- P1.2 modular cleanup (parallel)
- P1.3 evaluator transparency polish

Outcome:
- Stronger rematch behavior and clearer feature differentiation.

## Wave 3: Marketability + Monetization Readiness

Focus:
- Theme/content pack system foundations
- Analytics-informed onboarding improvements
- Optional daily challenge prototype

Outcome:
- Clearer path to App Store launch positioning and revenue experiments.

## Wave 4: High-Upside Expansion

Focus:
- Streamer/audience mode
- League Night / club rooms
- Competitive integrity upgrades (if needed by scale)

Outcome:
- Social growth and longer-term retention flywheel.

## 9) Success Metrics (What "Better" Means)

Track these before and after roadmap waves:
- Join-to-match-start conversion
- Match completion rate
- Rematch / play-again rate
- Average rounds completed before drop
- Reconnect recovery success rate
- Round 4/final screen dwell satisfaction (qualitative + event metrics)
- Mode adoption rate (once new modes ship)
- Daily/weekly return rate (if daily challenge or leagues ship)

## 10) Execution Rules (Protect Momentum)

- Do not treat AI-core accuracy as the blocker for fun/product progress right now.
- Ship small player-visible wins regularly (every sprint should include at least one).
- Prefer mode/content/value additions that increase replayability without exploding maintenance cost.
- Keep default mode clean and easy; complexity should be optional.
- When adding features, also add instrumentation and at least minimal regression coverage.
- Update this roadmap when major "future" items become real, so it does not drift again.

## 11) Deep Implementation Playbooks (Session-Executable Detail)

This section is intentionally explicit.

Purpose:
- Reduce ambiguity during future build sessions
- Make stretch goals implementable in one pass more often
- Prevent "mode idea drift" where the concept is clear but the implementation path is not

How to use this section in a build session:
1. Pick one blueprint only (do not mix multiple large efforts in one pass).
2. Complete Phase 0 (feature flag + data model shape) before UI polish.
3. Ship a vertical slice first, then expand.
4. Update this roadmap after each phase lands.

Implementation packet format used below:
- Product outcome
- Player-facing game flow
- Rules/constraints
- Data model + socket/API changes
- UI/UX surface changes
- Step-by-step implementation plan (explicit)
- Edge cases / abuse cases
- Validation checklist
- Rollout strategy

## 12) Tournament / Duel Modes Program (Explicit)

This is the detailed version of the mode-expansion roadmap. It is split into short, medium, and large sprints.

Important design principle:
- Duel/team modes should not break the simple default free-for-all flow.
- All mode work should be behind a mode rules object and feature flag so the base game remains stable.

### 12.1 Shared Prerequisite: Mode Rules Framework (Must Exist First)

Product outcome:
- The server and client can run different game rules without duplicating the whole game loop.

Player-facing effect:
- Hosts choose a mode, but the game still feels like the same LobbyWARS app.

Rules/constraints:
- Default mode remains the fallback if any mode config is invalid.
- Existing room lifecycle and Round 4 payloads must continue to work.
- Mode-specific behavior should be server-authoritative only.

Data model changes (recommended):
- Add `settings.gameMode` (string) to room settings.
- Add `settings.gameModeConfig` (object) for mode parameters.
- Add `gameState.modeRules` (resolved server rules snapshot for current match).
- Add `gameState.teams` (optional; only for team modes).
- Add `gameState.matchFormat` (e.g. `ffa`, `duel_2v2`, `duel_3v3`, `seeded_daily`).

Mode rules object (example shape to standardize early):
- `id`
- `label`
- `teamBased` (bool)
- `requiredPlayersMin`
- `requiredPlayersMax`
- `draftStructure` (per-round picks, shared/team behavior)
- `votePolicy` (`ffa_vote`, `disabled`, `prediction_only`, `team_vote`, etc.)
- `scoringPolicy` (weights/bonuses profile)
- `finalPolicy` (`chaos_final`, `draft_synthesis_final`, `hybrid`)
- `uiFlags` (show team panels, show team join UI, show prediction widgets)

UI/UX surfaces impacted:
- `public/index.html` (settings controls, team join panels, mode labels)
- `public/js/app.js` (mode-aware phase rendering and validation)
- `public/js/ui.js` (lobby tab transitions, team join widgets)
- `server/core/gameEngine.js` (resolved rules + phase behavior)
- `server/socket/socketHandlers.js` (host changes, join/team events)

Step-by-step implementation plan (10 steps):
1. Add `gameMode` and `gameModeConfig` to room settings with backward-compatible defaults.
2. Create a server-side mode registry module (single source of truth) returning validated mode rules.
3. Resolve mode rules at `startGame` and snapshot them into `gameState.modeRules`.
4. Add a safe fallback path: invalid mode -> `default_ffa`.
5. Pass mode metadata through `roomData`, `gameStarting`, `roundStart`, and `round4Start`.
6. Make client labels/context mode-aware (without changing logic yet).
7. Add dev logging showing resolved mode ID + rules for each match start.
8. Add smoke tests / manual checklist for default mode regression.
9. Hide unfinished modes behind a server flag (e.g. `ENABLE_EXPERIMENTAL_MODES`).
10. Document mode payload shapes in `md/SOCKET_EVENT_CONTRACT.md`.

Edge cases / abuse cases:
- Host selects mode with incompatible player count.
- Host changes mode while some players are ready.
- Legacy clients join a room with a newer mode setting (must degrade safely).
- Play-again in a mode room should preserve or intentionally reset mode selection (decide explicitly).

Validation checklist:
- Default FFA still starts/plays/finishes unchanged.
- Mode metadata survives reconnect and roomData refreshes.
- Invalid mode selection cannot crash match start.

Rollout strategy:
- Ship hidden mode framework first.
- Turn on one mode at a time.

### 12.2 Tournament / Duel Short Sprint A: 2v2 Duel Mode

Recommended mode identity:
- `duel_2v2_short`
- Positioning: "Fast team showdown for 4 players"

Product outcome:
- A shorter, team-based mode for exactly 4 players with fast rematch energy.

Player-facing game flow (proposed, explicit):
1. Lobby host selects `2v2 Duel (Short Sprint)`.
2. Players join Team A or Team B (2 players each).
3. Match starts when both teams are full and all 4 players are ready.
4. Each social round has a shared team draft:
   - each player contributes 1 pick
   - team total = 2 picks
5. Twist reveals.
6. Instead of traditional FFA voting, players submit a winner prediction + confidence (because direct voting is trivial with only 2 teams).
7. Server scores round using:
   - contextual intel team score
   - prediction bonus (reward correct confident calls)
   - team completion/lock speed bonuses
8. Run 2 or 3 short social rounds (configurable, start with 2 for true "short sprint").
9. Final Round (Round 4 variant) evaluates each team's accumulated roster and chemistry.
10. Show duo-focused finale with team MVP + synergy highlights.

Why this design (important):
- Normal voting breaks down in 2-team matches because "vote for the other team" becomes meaningless.
- Replacing it with prediction/confidence preserves player agency and social tension.

Rules/constraints to watch:
- Exactly 4 players required.
- Team size locked at 2.
- Each player can only draft for their own team.
- Shared team duplicate handling rules must be explicit:
  - duplicate inside same round team draft -> auto-reject or replace before lock
  - duplicate across prior rounds -> allowed (unless mode variant forbids repeats)
- AFK teammate fallback:
  - if teammate fails to submit, auto-fill one team slot and allow partner to lock with penalty or reduced bonus
- Prediction anti-cheese:
  - prevent changing prediction after lock window
  - no self-team confidence exploit if prediction always obvious (score calibration required)

Scoring model (first implementation recommendation):
- Social rounds:
  - `intelTeamScore` (primary)
  - `predictionBonus` (secondary)
  - `fastLockBonus` (small)
- Final round:
  - Round 4 evaluator + chemistry remains primary decider
- Keep the score economy simpler than FFA during v1

Data model changes:
- `gameState.teams = [{ id, name, members[], score, roundDraft[] }]`
- `gameState.teamDraftEntries[round][teamId]`
- `gameState.teamDraftLocks`
- `gameState.roundPredictions[playerName] = { predictedTeamId, confidence, lockedAt }`
- `gameState.modeStats` for mode-specific results (prediction accuracy, duo synergy)

Socket/API changes (proposed):
- Client -> Server:
  - `joinTeam` `{ teamId }`
  - `leaveTeam`
  - `submitPrediction` `{ predictedTeamId, confidence }`
  - `lockPrediction`
- Server -> Client:
  - `teamUpdate`
  - `predictionUpdate`
  - `predictionLockUpdate`
- Update `roomData` / `roundResults` payloads with mode-specific fields

UI/UX surfaces to add:
- Lobby team join panel (two columns, 2 slots each)
- Ready gating messaging ("Need 2 players on each team")
- Draft screen variant:
  - show teammate contribution status
  - show shared team draft card
- Prediction panel instead of standard vote grid
- Results screen:
  - team-vs-team scoreboard
  - prediction accuracy chips
  - "duo chemistry" micro-highlight

Step-by-step implementation plan (10 key steps):
1. Build team assignment state and lobby team join UI (no gameplay impact yet).
2. Add server validation for exact 2-per-team gating and match start preconditions.
3. Add mode-aware draft rules (1 pick per player per round in 2v2 mode).
4. Add shared team draft rendering on client.
5. Disable standard voting flow for this mode and route to prediction flow.
6. Implement prediction submission/lock state + UI.
7. Add mode-specific round scoring function in `gameEngine.js` (intel + prediction + small speed bonus).
8. Adapt Round 4 roster compilation to team-based final rosters (duo cumulative roster).
9. Build duo finale UI labels and results messaging.
10. Run balance pass on prediction bonus weights (ensure prediction bonus cannot overpower evaluator/intel).

Extra design / UX ideas (high-value polish):
- Team banners/colors and duo emblems
- Teammate "ready pulse" animation in draft
- "Clutch Duo" callout when a team wins after trailing entering final round
- Quick rematch button that preserves teams

Edge cases / abuse cases:
- 3 players ready and 4th disconnects right before start
- Team overfill race condition (two users click same slot simultaneously)
- One teammate griefs by never locking (need timeout policy and autofill behavior)
- Prediction always mirrors current score leader (may require hidden prediction submission until lock)

Validation checklist:
- Team join/leave sync works across all clients
- 2v2 match can complete end-to-end
- No standard FFA vote widgets appear in 2v2 mode
- Final results and play-again preserve/clear teams exactly as designed

Rollout strategy:
- Internal/experimental only first
- Require host flag to enable
- Track rematch rate vs default mode

### 12.3 Tournament / Duel Short Sprint B: 3v3 Duel Mode

Recommended mode identity:
- `duel_3v3_short`
- Positioning: "6-player team war"

Product outcome:
- A team-based mode for full 6-player lobbies with stronger social coordination than FFA.

Player-facing game flow (proposed):
1. Host selects `3v3 Duel`.
2. Players join Team A or Team B (3 each).
3. Match starts after teams are balanced and all 6 are ready.
4. Each social round is a shared team draft:
   - each teammate contributes 1 pick (team total 3 picks)
   - optionally use a short "captain lock" or automatic lock when all 3 submit
5. Twist reveals.
6. Players make round calls:
   - primary system: prediction + confidence (same reason as 2v2; direct voting is trivial in two-team matches)
   - optional variant later: "enemy weakest-link callout" bonus
7. Server computes team round scores using intel + prediction + coordination bonuses.
8. After social rounds, Round 4 final evaluates each team's cumulative roster.
9. Team finale UI presents team MVP, best synergy trio, and top-performing picks.
10. Show rematch options: same teams or reshuffle teams.

Rules/constraints to watch:
- Exactly 6 players for v1 (do not support 5-player substitute logic initially).
- Team size fixed at 3.
- Draft fairness:
  - each teammate gets one pick slot per round
  - lock requires all 3 slots filled or timeout fallback
- AFK policy:
  - after timeout, auto-fill missing pick(s)
  - team gets reduced lock bonus but can proceed
- Round pacing:
  - must remain faster than default FFA despite extra coordination UI

Recommended v1 scoring structure:
- `teamIntelScore` (primary)
- `predictionBonus` (secondary)
- `coordinationBonus` (small, based on all 3 picks submitted before timeout)
- `roundWeightScaling` (reuse existing infrastructure with a mode profile)

Data model changes (reuse + extend 2v2 structures):
- `gameState.teams` supports `maxMembers: 3`
- `gameState.teamRoundSubmissions[round][teamId] = [{ playerName, pick, locked }]`
- `gameState.teamRoundSummary[round][teamId]`
- `gameState.modeStats.teamPredictionAccuracy`

Socket/API changes:
- Reuse `joinTeam`, `leaveTeam`, prediction events from 2v2
- Add `teamMemberSubmissionUpdate` only if needed for granular UI updates
- Extend `roundResults` payload with team mode scoreboard + per-team round summaries

UI/UX surfaces to add:
- Team lobby panel for 3 slots each
- Draft UI:
  - teammate slot lanes (who already submitted / pending)
  - compact shared team board
- Results UI:
  - team scoreline + per-player contribution tags
  - "best trio synergy" badge
- Finale UI:
  - team-focused podium and top 6 roster summaries (if desired)

Step-by-step implementation plan (10 key steps):
1. Generalize the 2v2 team model to support `teamSize = 2 | 3`.
2. Build shared team draft submission model for 3 participants.
3. Add 3v3 start gating and balance validation.
4. Reuse/adapt prediction flow from 2v2.
5. Add team round scoring formula and weight profile for 3v3.
6. Update round result rendering to support team-vs-team layout.
7. Adapt Round 4 roster assembly for 3-player team mode.
8. Add finale labels/stat callouts for 3v3 teams.
9. Add "rematch same teams / reshuffle" option.
10. Balance-test round timers and scoring so 3v3 does not feel slower than default.

Extra design / UX ideas:
- Team-specific sound cues
- Team huddle panel between rounds ("Need one tank pick", "High confidence this round")
- Team captain indicator (optional, cosmetic first)
- "Rivalry rematch" banner if same teams replay

Edge cases / abuse cases:
- Team stacking via host manipulation (consider optional auto-balance in future)
- Teammate disconnect during round
- One player repeatedly griefing team composition (need kick/replace/admin tools later if mode scales)

Validation checklist:
- Full 6-player 3v3 match completes end-to-end
- Team scoreboard and Round 4 points remain correct
- Play-again team reshuffle works consistently across clients

Rollout strategy:
- Launch after 2v2 mode stabilizes (reuse most of the infrastructure)

## 13) Tournament / Duel Medium Sprint: Lobby Mode Voting + Team Join System (Explicit)

This is the next layer after the basic team mode framework and at least one duel mode exists.

Product outcome:
- The lobby evolves from host-only settings into a smoother group decision system without becoming chaotic.

Player-facing experience (target):
- Host still controls the room, but players can vote on mode/theme/timers.
- Players can join teams intentionally with clear UI, or host can enable auto-balance.
- The lobby feels collaborative and modern rather than "host clicks dropdowns while everyone waits."

Key principle:
- Voting assists host decisions; it does not remove host authority in v1.

Detailed feature set (recommended v1):
- Mode ballot (players vote on 2-4 host-proposed modes)
- Theme ballot (optional)
- Team join panel (manual join/leave)
- Auto-balance button (host)
- Team lock button (host) before starting match
- Clear state transitions:
  - `open`
  - `voting`
  - `teams_open`
  - `teams_locked`
  - `ready_check`

Rules/constraints to watch:
- No mode vote changes after team assignment opens (unless host resets lobby state)
- Team joins cannot exceed team capacity
- Start button disabled unless team structure is valid for selected mode
- Host can override vote result but UI must show the override clearly

Data model changes:
- `room.modeVote = { status, options[], votesByPlayer, result, hostOverride }`
- `room.teamJoinState = { enabled, teamSize, teams[], locked }`
- `room.lobbyPhase = 'settings' | 'mode_vote' | 'team_join' | 'ready_check'`

Socket/API changes (proposed):
- Client -> Server:
  - `openModeVote`
  - `castModeVote` `{ optionId }`
  - `closeModeVote`
  - `applyModeVoteResult`
  - `joinTeam` / `leaveTeam` (reused)
  - `autoBalanceTeams`
  - `lockTeams`
- Server -> Client:
  - `modeVoteUpdated`
  - `teamJoinUpdated`
  - `lobbyPhaseUpdated`

UI/UX surfaces to add or refine:
- Settings tab:
  - host config block for "propose modes"
  - launch mode ballot button
- Players tab:
  - team join columns + slot occupancy
  - auto-balance and team-lock indicators
- Chat tab:
  - subtle system messages ("Mode vote opened", "Team B filled")
- Ready UI:
  - status text specific to lobby phase ("Waiting for team lock", "Need 1 player on Team A")

Step-by-step implementation plan (12 key steps):
1. Introduce explicit lobby phase state on the server (`lobbyPhase`) and broadcast it via `roomData`.
2. Build a mode vote data structure with validation and rate limiting.
3. Add host controls to open/close ballots and choose override behavior.
4. Render mode ballot UI for all players (read-only for non-voters after vote lock).
5. Add mode vote results summary and apply chosen mode into `settings.gameMode`.
6. Add team join state machine (`teams_open`, `teams_locked`) independent of match start.
7. Implement join/leave team validation with capacity checks and race-condition safety.
8. Add auto-balance algorithm (simple v1: random/shuffle while preserving host on chosen team if requested).
9. Add host "lock teams" control and prevent further team changes after lock.
10. Update ready/start gating to account for mode + team validity.
11. Add reset path: changing mode resets team assignment with a clear warning.
12. Update docs + run full lobby regression (FFA and team modes).

Extra design / UX ideas:
- Vote progress ring with "host tie-break" badge
- Team lane avatars and role labels (optional cosmetic)
- "Recommended mode for current player count" hint chip
- Quick buttons: "Same teams", "Shuffle teams", "Swap captains"

Abuse/risk cases:
- Vote spam / reopen spam by host (rate limit + cooldown)
- Team slot sniping / race conditions
- Players griefing by swapping teams during ready-up (teams_locked solves this)

Validation checklist:
- Host can still run a simple FFA match with zero extra friction
- Mode vote is optional and skippable
- Team join and team lock states survive room refresh/reconnect

Rollout strategy:
- Ship lobby phase state machine first, then mode voting, then team joins, then auto-balance

## 14) Tournament / Duel Large Sprint: Larger Lobbies + Multi-Instance Path (Explicit)

This is a large strategic sprint. It should not start until core retention and mode replayability work are stable.

Product outcome:
- LobbyWARS can support more concurrent users and match discovery patterns without relying on one server process or one manual room-code path.

This is not just "bigger lobbies."
This is an architecture + product shift:
- multiple server instances
- match routing
- queue/discovery concepts
- operational observability

Recommended scope split:
- Phase L1: Multi-instance support (same game)
- Phase L2: Discovery/queue systems
- Phase L3: Larger social surfaces / fill-a-lobby features

### 14.1 Phase L1: Multi-Instance Operational Foundation

Product outcome:
- Multiple game servers can run simultaneously and safely host different rooms.

Core requirements:
- Room affinity (all players in a room must route to same instance)
- Shared or coordinated room discovery registry
- Heartbeats / health checks per instance
- Instance metadata (region, capacity, active rooms)

Architecture additions (high-level):
- Match registry service (lightweight first; Redis or DB-backed later)
- Server instance registration + heartbeat
- Room record includes `instanceId`
- Join flow resolves room code -> target instance

Implementation steps (10 key steps):
1. Define `instanceId` and inject it into each server process at boot.
2. Add instance heartbeat metadata (rooms, player count, health status).
3. Create a registry abstraction (in-memory local adapter first, shared adapter later).
4. On room creation, persist room -> instance mapping.
5. On join, resolve room location before socket room join logic.
6. Add stale room cleanup / lease expiry policy.
7. Add operational logging for room placement and join routing failures.
8. Add a "same-process fallback" path for local development.
9. Write admin debug view/CLI for active instances and room mappings.
10. Load-test many small rooms (not gameplay quality yet, just placement/routing correctness).

Rules/constraints:
- Do not break manual room-code flow.
- Maintain local dev simplicity.
- Prefer stateless client assumptions; server routing should be transparent to players.

### 14.2 Phase L2: Match Discovery / "Ping Me Into a Game" System

Product outcome:
- Players can opt into being matched into appealing game modes without manually coordinating room codes every time.

Player-facing concept (proposed):
- "Queue for a game" preferences:
  - preferred mode(s)
  - player count preference
  - region / ping sensitivity
  - casual vs competitive
- App can ping the user when a suitable lobby needs players.

Dependencies:
- Multi-instance registry (L1)
- Push/ping notification strategy (web + app wrapper later)
- Basic identity/account system (lightweight acceptable for v1)

Implementation steps (12 key steps):
1. Define queue preferences schema and storage.
2. Create queue service that tracks waiting players and open lobbies by mode.
3. Add host "request players" action for eligible public lobbies.
4. Matchmaker ranks candidates by mode preference, region, and lobby fill urgency.
5. Send in-app ping first (push later).
6. Reserve a slot briefly to prevent race conditions.
7. Add accept/decline flow and timeout handling.
8. Add fallback search expansion if exact mode match is unavailable.
9. Add abuse controls (queue spam, repeated no-shows).
10. Add queue metrics (wait time, accept rate, fill rate).
11. Add UI for queue preferences and open lobby calls.
12. Soft-launch as "beta public lobbies" separate from private rooms.

Design/UI ideas:
- "Need 1 more for 3v3 Duel" live card
- "Mode you like is starting" alert
- One-tap join from notification

### 14.3 Phase L3: Larger Social Surfaces (Not necessarily bigger in-match player count)

Important clarification:
- "Larger lobbies" should not immediately mean "12 players in one match."
- The better first move is larger social surfaces around 3-6 player matches.

Recommended v1 large-lobby features:
- Public lounge / queue board
- Spectator slots (non-player audience)
- Bench/substitute slots for recurring groups
- Multi-room club or league hub

Why this is smarter than jumping straight to 8-12 player matches:
- Preserves core game pacing and clarity
- Avoids redesigning every round UI at once
- Still increases retention and social stickiness

If true larger in-match player counts are later attempted:
- Do it as a separate mode family with entirely different pacing/timers/UI
- Expect major UI redesign and scoring rebalance

Validation checklist for large sprint:
- Room routing survives instance restarts/failures gracefully
- Queue fill system does not create ghost reservations
- Private room flow remains simpler than public queue flow

Rollout strategy:
- Internal load tests -> closed beta public queue -> optional app push notifications

## 15) Detailed Stretch Goal Playbooks (Explicit)

These are the expanded implementation outlines for the stretch goals listed earlier.

### 15.1 S1 Streamer / Audience Party Mode

Product outcome:
- Makes matches watchable and participatory without undermining player fairness.

Player/audience flow (v1):
1. Host enables audience mode.
2. Audience joins as spectators (not players).
3. Audience can react and vote on one controlled "chaos meter" action per round.
4. Chaos meter triggers cosmetic or bounded gameplay effects (never hard pay-to-win).
5. Final screen shows audience impact recap.

Rules/constraints:
- Audience cannot directly cast player votes in ranked/serious modes.
- Audience actions must be capped and rate limited.
- Chaos effects must be bounded and readable.

Implementation steps (10 key steps):
1. Add spectator role in join flow (`joinRoom` payload extension).
2. Add server-side permission model (player vs spectator capabilities).
3. Add spectator count and audience panel in lobby/game UI.
4. Add audience reactions stream (rate limited, aggregated).
5. Implement chaos meter vote collection and round-limited effects.
6. Add host control to enable/disable audience mode.
7. Build spectator-safe result UI and no-input views.
8. Add anti-spam throttling and moderation tools.
9. Instrument engagement metrics (spectators per match, chaos participation).
10. Launch as unranked/casual-only mode.

### 15.2 S2 Daily Challenge + Seeded Puzzle Mode

Product outcome:
- Gives solo/asynchronous players a reason to return daily and compare outcomes.

Player flow (v1):
1. App shows "Daily Challenge."
2. Player receives fixed seed(s) for scenario/twist and constraints.
3. Player drafts solo or simulated squad according to challenge rules.
4. Evaluator scores the run.
5. Player sees result tier and optional leaderboard placement.
6. Share result card.

Rules/constraints:
- Deterministic seeds and evaluator mode versioning must be recorded.
- Daily leaderboard must store mode version and score formula version.
- Prevent easy score spoofing (server-authoritative evaluation).

Implementation steps (10 key steps):
1. Create seed generation/versioning strategy.
2. Define challenge payload schema (seed, mode rules, time window).
3. Build a daily challenge endpoint/service.
4. Add a client entry point and dedicated challenge flow UI.
5. Reuse evaluator and scoring paths server-side with challenge mode rules.
6. Store submissions with anti-duplicate policy.
7. Add leaderboard API and simple UI.
8. Add share card/export summary.
9. Add reset/rotation scheduler and archival of prior challenges.
10. Track retention metrics (DAU lift, repeat participation).

### 15.3 S3 Pack System (Theme/Event/Seasonal Content)

Product outcome:
- A scalable content and monetization layer that increases freshness without rewriting core systems.

Product design goals:
- Content packs should feel meaningful, not just cosmetic labels.
- Packs should be easy to author and test.
- Monetization should not alter competitive fairness.

Pack system components:
- Pack manifest format (metadata, visuals, scenarios, twist pools, theme tags)
- Entitlement model (free/unlocked/premium/event)
- Rotation schedule support
- Validation tooling for content quality and legal review

Implementation steps (12 key steps):
1. Define a pack manifest schema (JSON) and validation script.
2. Refactor scenario/twist generation to accept pack filters.
3. Add pack registry loading on server startup.
4. Add pack selection UI in advanced settings and/or lobby mode flow.
5. Add fallback behavior when a pack is missing/invalid.
6. Build content QA checklist (length, duplication, readability, safety).
7. Add pack metadata in results/finale screens for branding/theming continuity.
8. Add entitlement abstraction (even if all packs are free initially).
9. Build "featured pack" rotation support.
10. Add analytics by pack (match starts, completion, rematch).
11. Add authoring docs and sample packs.
12. Add legal/rights review process for names/images/assets tied to packs.

### 15.4 S4 Async League Night / Club Rooms

Product outcome:
- Converts one-off friend sessions into recurring groups with identity and progression.

Player flow (v1):
1. Group creates a club room / league name.
2. Members join recurring sessions under that club.
3. Match results roll into season standings and club stats.
4. Players earn badges/streaks/non-gameplay progression.
5. Next session resumes with club context intact.

Rules/constraints:
- No pay-to-win mechanics tied to standings.
- League stats must tolerate missed sessions and reconnect issues.
- Season resets/archives need clear UX.

Implementation steps (12 key steps):
1. Introduce basic identity/accounts (lightweight auth first).
2. Add persistent club/league data model.
3. Add membership and invite flow.
4. Add season configuration (length, scoring aggregation rules).
5. Store match results with league linkage.
6. Compute standings and historical stats.
7. Build club dashboard UI (standings, badges, history).
8. Add recurring schedule/reminder hooks (in-app first).
9. Add moderation/ownership transfer policies.
10. Add archived season views.
11. Add retention analytics for club users vs non-club users.
12. Pilot with a small closed group before wide rollout.

## 16) "One Session Completion" Templates (How to Actually Finish a Stretch Goal Slice)

These templates are included so future build sessions can complete a meaningful slice instead of stalling in planning.

### 16.1 Short Session (2-4 hours) Template

Use for:
- one UI surface
- one socket event addition
- one mode rule backend slice

Checklist:
1. Add data shape + default value (server first).
2. Emit payload via existing event.
3. Render minimal UI (no polish).
4. Handle one happy path end-to-end.
5. Add guard for invalid state.
6. Update docs (`SOCKET_EVENT_CONTRACT`, roadmap status).

Definition of success:
- Feature exists behind a flag and works once end-to-end.

### 16.2 Medium Session (1-2 focused days) Template

Use for:
- lobby mode voting v1
- team join system v1
- prediction flow for duel modes

Checklist:
1. Implement server state machine and validations.
2. Add client rendering and local state sync.
3. Add reconnect/refresh handling.
4. Add rate limits for new interactive events.
5. Run full-room manual smoke test.
6. Record known gaps and explicitly defer polish.

Definition of success:
- Core feature works for the target player count without breaking default mode.

### 16.3 Large Session / Program Template (multi-day)

Use for:
- 2v2 mode full vertical slice
- 3v3 mode full vertical slice
- queue/discovery prototype

Checklist:
1. Phase 0: data model + flags + event contract
2. Phase 1: happy-path backend rules
3. Phase 2: minimal UI for all impacted screens
4. Phase 3: scoring/balance tuning
5. Phase 4: edge-case hardening (disconnects, reconnects, timeouts)
6. Phase 5: instrumentation + docs + rollout notes

Definition of success:
- A complete vertical slice is playable and measurable, even if polish is deferred.

