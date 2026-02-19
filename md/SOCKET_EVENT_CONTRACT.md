# Socket Event Contract

Last updated: February 19, 2026

This document maps the current client/server event API used by Socket.IO.

## Client -> Server Events

- `joinRoom` `{ name, room }`
- `updateSettings` `settingsObject`
- `toggleReady`
- `sendMessage` `string`
- `sendReaction` `string`
- `startGame`
- `draftCharacter` `string`
- `lockDraft`
- `castVote` `playerName`
- `lockVote`
- `readyForNextRound`
- `evaluateRound4`
- `requestFinalResults`
- `playAgain`

## Server -> Client Events

- `roomData`
- `settingsUpdated`
- `newMessage`
- `gameStarting`
- `roundStart`
- `scenarioRevealed`
- `draftSuccess`
- `draftUpdate`
- `playerLocked`
- `plotTwistRevealed`
- `votingPhaseStart`
- `voteUpdate`
- `voteLockUpdate`
- `voteTallying`
- `roundResults`
- `round4Start`
- `round4Evaluated`
- `round4EvaluationError`
- `finalResultsWaiting`
- `finalRoundResults`
- `gameEnded`
- `joinError`
- `gameError`
- `draftError`

## Behavioral Guarantees

- `round4Evaluated` may be emitted to one requester first (cached replay path) or room-wide when freshly computed.
- `finalRoundResults` is room-wide and only sent after all active players emit `requestFinalResults`.
- `roomData` is the canonical lobby sync payload after join/ready/disconnect/playAgain changes.
- `roundResults` now includes both vote-driven points and intel-driven additions for rounds 1–3.
- `voteTallying` is emitted when voting closes (timer or all-lock), allowing clients to show a short tally/loading state before `roundResults`.

## Important Payload Notes

- `roundResults` includes:
	- `roundPoints`, `voteCount`, `leaderboard`, `pointBreakdown`, `round`
	- `roundIntelSummary` (per player):
		- `averageScore`, `averageOVR`, `averageRelevance`, `averageAdaptability`, `averageConfidence`, `averageFetchDurationMs`, `trustedCount`

## Error Surfaces

- `joinError`: invalid join payload, duplicate name, full room, active game, join rate limit.
- `gameError`: unauthorized host actions, start preconditions, chat message rate limit.
- `draftError`: draft rate limit, lock violations, insufficient picks to lock.
- `round4EvaluationError`: incorrect phase or evaluator execution failure.

## Change Protocol

If event names, payload shape, or sequencing changes:
1. Update this file.
2. Update `server/socket/socketHandlers.js`.
3. Update matching listeners/emitters in `public/js/app.js` and `public/js/round4Eval.js`.
4. Run end-to-end manual flow (join -> round 4 -> final results).