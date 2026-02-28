# Socket Event Contract

Last updated: February 28, 2026

## Client -> Server

- `joinRoom` `{ name, room, joinAsHost }`
- `updateSettings` `settingsObject` (host only, lobby only)
- `toggleReady`
- `sendMessage` `string`
- `sendReaction` `string`
- `startGame` (host only)
- `draftCharacter` `string`
- `lockDraft`
- `requestDraftWaitPreview`
- `castVote` `playerName`
- `lockVote`
- `readyForNextRound`
- `evaluateRound4`
- `requestFinalResults`
- `playAgain`
- `queueNarratorVoice` `{ voiceId }`

## Server -> Client

Lobby/system:

- `roomData`
- `settingsUpdated`
- `settingsChangePing`
- `narratorVoiceQueued` (and legacy alias `kokoroNarratorQueued`)
- `joinError`
- `gameError`

Chat:

- `newMessage`

Gameplay:

- `gameStarting`
- `roundStart`
- `scenarioRevealed`
- `draftSuccess`
- `draftUpdate`
- `draftError`
- `playerLocked`
- `draftWaitIntelPreview`
- `plotTwistRevealed`
- `votingPhaseStart`
- `voteUpdate`
- `voteLockUpdate`
- `voteTallying`
- `voteTallyProgress`
- `roundResults`

Round 4 / final:

- `round4Start`
- `round4Evaluated`
- `round4EvaluationError`
- `finalResultsWaiting`
- `finalRoundResults`
- `gameEnded`

## Key Guarantees

- Server is authoritative for room state and scoring.
- `settingsUpdated` is full-state; `settingsChangePing` is change-notification metadata.
- Round 4 scoring is guarded against duplicate application.
- Final results emit only after all connected eligible players request them.

## Room Data Shape (high level)

`roomData` includes:

- `players`
- `host`
- `isGameActive`
- `settings`
- `messages`
- `voiceConfig`
- `packCatalog`
- `selectedPackMeta`

## Settings Notes

Settings currently include:

- `difficulty`
- `scenarioTheme`
- `contentPackId`
- `plotTwists`
- `customScenario`
- `maxPlayers`

Host changes are diffed server-side before `settingsChangePing` is emitted.
