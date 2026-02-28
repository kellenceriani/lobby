# server/socket/

Last updated: February 28, 2026

- `socketHandlers.js` - authoritative Socket.IO event routing and state transitions.
- `inputValidation.js` - payload sanitization and basic rate limiting.

Settings sync behavior:

- Host updates are diffed server-side.
- Full settings state emits on `settingsUpdated`.
- Change metadata emits on `settingsChangePing`.

Contract reference: `../../md/SOCKET_EVENT_CONTRACT.md`.
