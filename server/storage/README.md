# server/storage/

Last updated: February 28, 2026

Runtime snapshot persistence helpers.

- Snapshot file: `server/.runtime/rooms.snapshot.json`
- Writes are debounced to reduce I/O churn.
- Restores room metadata/state only (not live socket membership).
- Meta backbone store file: `server/.runtime/meta/meta.store.json`
- Meta adapter: `server/storage/metaStoreAdapter.js` (schema migration + atomic writes)
- Solo entities in meta store: `dailyChallenges`, `dailyAttempts`, `soloRuns`, `leaderboardSnapshots`
- Season entities in meta store: `seasonDefinitions`, `seasonRuntime`, `seasonSchemaVersion`

Operational notes:

- `EBUSY` write failures can occur on locked files in some local/dev environments; logging is retained so debugging context is not silently lost.
- Snapshot restore is intentionally metadata-only and never recreates live socket presence.
