# Context Engine Benchmarks

Last updated: February 28, 2026

Harnesses in this folder validate deterministic evaluation behavior and latency.

- `replayHarness.js` - compare runtime modes on fixed fixtures.
- `random500Harness.js` - larger random scenario stress run.
- `identitySourceEnrichmentHarness.js` - resolver/source quality checks.

Examples:

- `npm run bench:context`
- `npm run bench:random500`
- `npm run bench:context:identity-sources`

Key quality metrics to track run-over-run:

- dangerous title-diff rate (overall and by source)
- risky outlier counts (`risky60+`, `lowConf80+`)
- synthetic image rate + image-backfill success
- resolver confidence distribution and fallback rates
- latency spread (especially final-mode precompute windows)
