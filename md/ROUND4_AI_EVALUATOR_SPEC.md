# Round 4 AI Evaluator Specification

Last updated: February 18, 2026
Status: Canonical implementation in active use

## 1) Purpose

Round 4 is the final, server-authoritative evaluation phase that ranks each player's 6-character roster using character quality + team chemistry.

## 2) Inputs

- `scenario`: generated at start of final round
- `twist`: generated at start of final round
- `finalTeam` per player: collected from stored teams in rounds 1–3
- `finalTeamDraftMeta`: original draft context metadata per character where available

## 3) Processing Pipeline

1. `startFinalRound` compiles final teams and emits `round4Start`.
2. Client sends `evaluateRound4`.
3. `evaluateRound4FromGame(game)` orchestrates:
	- per-player roster evaluation (concurrency-limited)
	- per-character `scoreCharacter(...)`
	- phrase assignment by emotion
	- chemistry computation
	- team summary assembly
4. `calculateRound4Points(teamOVR)` maps team quality to Round 4 points.
5. Results are persisted in game state and emitted as `round4Evaluated`.

## 4) Character Evaluation Output Contract

Each evaluated character includes:
- `character`
- `emotion`
- `score` (0–30 style internal score)
- `ovr` (0–99)
- `ovrTier`
- `attributes`
- `rarity`
- `characterType`
- `reason`
- `notes[]`
- `breakdown` object
- `phrase`

## 5) Team Summary Contract

Per player `teamSummary`:
- `totalOVR`
- `chemistryBonus`
- `chemistryDetails[]`
- `averageOVR`
- `topPick`
- `highestOVR`
- `evaluationCount`

## 6) Round 4 Point Formula

From `server/services/scoreScaling.js`:

- Base points: `teamOVR * ROUND4_BASE_MULTIPLIER`
- Competitive bonus: `max(0, teamOVR - ROUND4_COMPETITIVE_FLOOR) * ROUND4_COMPETITIVE_MULTIPLIER`
- Elite curve bonus: `(max(0, teamOVR - ROUND4_ELITE_FLOOR)^2) * ROUND4_ELITE_CURVE`
- Total: rounded sum of components

Current constants are defined in `scoreScaling.js` and should be treated as economy knobs.

## 7) Server Safeguards

- `round4InProgress`: prevents duplicate concurrent evaluations.
- `round4Applied`: guarantees points are only added to totals once.
- Cached payload replay: if results already exist, requester receives existing payload.

## 8) Client Rendering Behavior

- `round4Eval.js` renders team-by-team, character-by-character with reveal delays.
- Team summary card is shown after each team’s character cards.
- Final Round 4 leaderboard appears after all cards render.
- Continue action triggers final synchronization via `requestFinalResults`.

## 9) Failure Modes

- Wrong phase request -> `round4EvaluationError`.
- Evaluator internal exception -> `round4EvaluationError` and no state mutation.
- Missing emotion icon -> client image fallback to alternate emotion path.

## 10) Extension Points

- Improve lookup precision: `server/evaluator/core/fetchers.js`, `candidateScoring.js`
- Improve scenario realism: `server/evaluator/scoring/relevance.js`
- Rebalance roster outcomes: `scoreScaling.js`
- Rebalance team synergy volatility: `server/evaluator/team/chemistryCalculator.js`
