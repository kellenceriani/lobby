# server/storage

Runtime persistence helpers.

- Snapshot file: `server/.runtime/rooms.snapshot.json`
- Writes are debounced (`queueRoomsSnapshot`) to reduce I/O churn
- Restores room metadata/state, not live socket membership
