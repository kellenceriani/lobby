# LobbyWARS - Game Design (Current)

**Last updated:** February 18, 2026  
**Status:** Production gameplay loop implemented (Rounds 1-3 + AI-evaluated Round 4)

## Core Game Loop

1. Players join a room (3-6 players).
2. Rounds 1-3 repeat: `Draft -> Plot Twist -> Vote -> Results`.
3. Round 4 uses final rosters from earlier rounds and runs AI evaluation (no drafting/voting).
4. Final leaderboard ranks teams using OVR + chemistry.

## System Architecture

### Frontend (`public/`)
- `index.html`: single-page shell and game screens
- `js/app.js`: socket event flow + gameplay transitions
- `js/state.js`: client-side state containers
- `js/ui.js`: UI helpers and screen utilities
- `js/round4Eval.js`: Round 4 evaluation presentation
- `css/*.css`: split styling by feature area

### Backend (`server/`)
- `server.js`: express + socket bootstrapping
- `gameEngine.js`: game lifecycle, rounds, scoring data/state
- `socketHandlers.js`: realtime handlers and room events
- `round4Service.js`: Round 4 orchestration
- `evaluator.js` + `evaluator/`: character relevance, viability, OVR, presentation helpers

## Gameplay Notes

- Character drafting supports duplicate protection and auto-fill handling.
- Room/lobby includes chat, reactions, ready state, and host settings.
- Input sanitization and rate limiting are active in socket handlers.
- State persistence support exists via server-side persistence helpers.

## Operational Notes

- Start command: `npm start`
- Runtime dependencies: `express`, `socket.io`
- Current project uses no formal automated test suite in `package.json`.
