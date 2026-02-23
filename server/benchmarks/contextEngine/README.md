# Context Engine Benchmarks

Implemented now:
1. Replay harness (`replayHarness.js`) for latency + output comparisons across `legacy`, `context_shadow`, and `context`
2. Seeded fixture set (`fixtures/seeded-mini.json`) for quick regression checks

Planned next:
1. Resolver benchmark (alias/typo/proxy reference resolution accuracy)
2. Scoring regression benchmark (known expected rank ordering per scenario)
3. Load benchmark (multi-room simulated concurrency)

Usage:
1. `npm run bench:context`
2. `npm run bench:context -- --modes=legacy,context --repeats=2`
3. `npm run bench:context -- --batch=true --batchConcurrency=3`

Keep fixtures small, deterministic, and git-tracked.
