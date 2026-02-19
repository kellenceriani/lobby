# LobbyWARS Game Design Document

Last updated: February 19, 2026
Status: Implemented in production flow (rounds 1–3 hybrid vote + contextual intel, plus server-authoritative Round 4 AI evaluation)

## 1) Product Intent

LobbyWARS is a real-time multiplayer party game where each player builds absurd two-character teams per round under scenario pressure. Rounds 1–3 are resolved by community voting plus contextual intel scoring; an AI evaluator resolves round 4 from full 6-character rosters.

Primary design pillars:
- Fast social drafting with visible live picks
- Chaotic scenario/twist combinations
- Human judgment + contextual intel in early rounds, full AI judgment in final round
- Competitive comeback potential through weighted scoring

## 2) Match Structure

- **Player count**: 3–6
- **Total rounds surfaced to player**: 4
	- Rounds 1–3: draft + twist + vote + contextual intel scoring
  - Round 4: AI evaluation only

### Round 1–3 Sequence

1. `PRE_ROUND` countdown
2. `DRAFT`
	- each player submits up to 2 characters
	- duplicates and invalid/empty submissions are auto-filled with random words
3. `TWIST`
	- one twist is revealed
	- missing slots are auto-filled before voting
4. `VOTING`
	- players vote for another player’s team
5. `TALLYING` (brief loading transition)
	- vote lock/timer closes phase
	- server finalizes vote + intel scoring
6. `RESULTS`
	- weighted vote points + contextual intel bonus are applied

### Round 4 Sequence

1. Build each player’s final 6-character roster from rounds 1–3 results.
2. Generate a fresh scenario + twist for final evaluation.
3. Evaluate each character server-side.
4. Aggregate team OVR + chemistry.
5. Convert team strength to round points and emit final results.

## 3) Scoring Design

### Rounds 1–3 (social rounds)

Scoring is generated from:
- Team completion bonus
- Most-voted winner bonus or tie bonus
- Runner-up bonus
- Non-voter penalty
- Contextual intel bonus (relevance, adaptability, confidence)
- Round weight scaling (`server/services/scoreScaling.js`)

### Round 4 (AI round)

Per team:
- Evaluate each character -> OVR
- Compute average OVR
- Add chemistry bonus
- Convert final team OVR to Round 4 points with nonlinear competitive + elite bonuses

## 4) Player-Facing Rules

- Duplicate picks are never accepted as-is; replacement is auto-generated.
- Players can lock draft only after 2 picks.
- Round progression can fast-forward when all required players lock/ready.
- Final result reveal is synchronized: all players must request final results before emit.

## 5) UX Surfaces

- Lobby tabs: players, settings, chat
- Draft UI: live picks, warnings, lock button
- Voting UI: selectable teams + lock vote
- Results UI: round leaderboard and breakdown
- Round 4 UI: sequential per-character cards, team summaries, leaderboard

## 6) Balance Levers

- Scenario generation pools and theme category mapping (`gameEngine.js`)
- Twist pool composition by difficulty
- Draft/vote timer durations
- Round weight multipliers
- Evaluator confidence thresholds and relevance heuristics
- Chemistry bonus cap/rules

## 7) Non-Functional Behavior

- Input sanitation for names, room codes, messages, reactions, and draft picks
- Socket-level rate limiting for spam-sensitive actions
- Snapshot persistence for room state (`server/storage/statePersistence.js`)

## 8) Design Constraints to Preserve

- Rounds 1–3 remain hybrid (vote + contextual intel), and Round 4 remains AI-evaluation-only (no voting fallback path)
- Server remains authoritative for state mutations and final scoring
- Payload shape compatibility for client screens must be preserved during refactors
