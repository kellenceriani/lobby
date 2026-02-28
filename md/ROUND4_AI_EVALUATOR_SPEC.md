# Round 4 Evaluator Spec

Last updated: February 28, 2026

## Purpose

Round 4 is the server-authoritative final roster evaluation phase.

## Inputs

- Final scenario and twist (prepared server-side)
- Each player's 6-character final roster
- Draft metadata from rounds 1-3

## Pipeline

1. `startFinalRound` compiles final rosters and emits `round4Start`.
2. Client requests evaluation with `evaluateRound4`.
3. Server evaluates entries via `round4Service` (+ evaluator stack).
4. Server applies chemistry and Round 4 point conversion.
5. Server emits `round4Evaluated`.
6. Final sync waits for `requestFinalResults` from all eligible players.

## Scoring Weights (Deterministic)

Final OVR uses server-side sub-scores and deterministic weights.

If final twist exists:

1. Original scenario carryover: 18%
2. Original twist carryover: 14.5%
3. Final scenario fit: 18%
4. Final twist fit: 14.5%
5. Base ability: 25%
6. Other restraints incl. chemistry: 10%

If no final twist:

1. Original scenario carryover: 32.5%
2. Final scenario fit: 32.5%
3. Base ability: 25%
4. Other restraints incl. chemistry: 10%

All sub-scores are clamped to `0-100` and recomputed server-side before point conversion.

## Output Contract

`round4Evaluated` includes:

- `evaluationId`
- `allTeamEvaluations`
- `finalLeaderboard`
- `revealTimeline`
- tie metadata (`isTie`, `tiedPlayers`)
- optional `voiceCues`

Each team evaluation includes:

- `evaluations[]` (character-level output)
- `teamSummary` (`totalOVR`, `averageOVR`, `chemistryBonus`, etc.)

## Invariants

- Round 4 points are applied once per match (`round4Applied`).
- Cached/in-flight precompute can be reused but must preserve deterministic payload shape.
- Final-round emit sequence must not bypass final-results synchronization.
