# Round 4 AI Evaluator - Current Spec

**Last updated:** February 18, 2026  
**Status:** Canonical implementation (in use)

## Round 4 Contract

- Input: final 6-character team per player (compiled from Rounds 1-3)
- Processing: server-side evaluation of each character + team chemistry
- Output: ranked final leaderboard with per-team totals

## Runtime Flow

1. Server enters final round state.
2. Clients transition to Round 4 evaluator screen.
3. Server evaluates all teams.
4. Clients receive evaluation payload and render sequential results.
5. Final rankings are shown and game ends.

## Key Behaviors

- No Round 4 drafting
- No Round 4 voting
- Evaluation first, leaderboard second
- Emotion assets are used for character reaction display

## Files Involved

- `server/round4Service.js`
- `server/evaluator.js`
- `server/chemistryCalculator.js`
- `server/socketHandlers.js`
- `public/js/round4Eval.js`
- `public/css/round4Eval.css`
