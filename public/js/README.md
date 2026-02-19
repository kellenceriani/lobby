# public/js

Client runtime scripts.

- `app.js`: primary socket event wiring and screen transitions
- `state.js`: in-memory client state + timer management
- `ui.js`: screen helpers, toasts, UI toggles, utility rendering
- `round4Eval.js`: Round 4 progressive reveal and final result sync UI

Important coupling:
- Socket event names must remain aligned with `server/socket/socketHandlers.js`
