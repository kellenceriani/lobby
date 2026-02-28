# LobbyWARS Game Design

Last updated: February 28, 2026

## Match Format

- Players: 3-6
- Structure: 3 social rounds + 1 AI final round

Rounds 1-3:

1. Pre-round countdown
2. Draft (2 picks per player)
3. Twist reveal
4. Voting
5. Round results (vote + contextual intel)

Round 4:

1. Build final 6-character roster from rounds 1-3
2. New final scenario + twist
3. Server-side Round 4 evaluation + chemistry
4. Final standings

## Scoring

Rounds 1-3:

- Team completion and vote-based points
- Non-voter penalty
- Contextual intel bonus from evaluator pipeline
- Round weight scaling

Round 4:

- Character OVR aggregation
- Team chemistry adjustments
- Nonlinear final-point conversion

## Settings Behavior (Authoritative)

- `difficulty`
- Changes twist intensity and draft/vote time pressure.

- `scenarioTheme`
- Biases scenario selection and adds theme pressure to twists.

- `contentPackId`
- Pack remains the primary source for scenarios/twists/finals.
- Theme selection biases pack output instead of bypassing pack identity.

- `customScenario`
- Injects a one-match scenario override.
- Does not persist across matches (resets at match end).

- `plotTwists`
- Enables/disables twist reveal phase.

## Player UX Goals

- Fast join to gameplay.
- Clear lobby ownership (host-only controls).
- Immediate feedback when settings change.
- Mobile-first readability and low-friction phase transitions.

## Round Results UX Direction

Current direction is the compact visual summary model:

- round-points emphasis first
- one-line key event summary
- contribution chips (`Vote`, `Intel`, `Core`)
- quick contribution split visualization
- short expandable notes instead of large raw breakdown blocks

Reason: it is the best readability/explainability balance for mobile and fast party pacing.

## Design Constraints

- Keep rounds 1-3 social and readable.
- Keep Round 4 deterministic and server-authoritative.
- Maintain replayability through pack/theme/difficulty combinations.
