# TTS Entry Quality Harnesses

Purpose:
- audit archetype cadence/vibe reference anchors
- compare current entry voice mapping vs variant subsets
- measure latency against prejoin-prewarm targets

Included harnesses:
1. `anchorAuditHarness.js`
2. `entryVoiceQualityHarness.js`
3. `runAll.js`

Key fixtures:
- `fixtures/entry-samples.json` (entry coverage samples)
- `fixtures/archetype-anchor-catalog.json` (current + candidate cadence anchors)
- `fixtures/latency-targets.json` (benchmarks/targets)

Usage:
1. `npm run bench:tts:anchors`
2. `npm run bench:tts:anchors -- --verifyUrls=true`
3. `npm run bench:tts:entry`
4. `npm run bench:tts:entry -- --limit=4 --candidateLimit=4`
5. `npm run bench:tts:entry -- --sampleIds=cartoon_spongebob,robotic_hal`
6. `npm run bench:tts:entry -- --noSynth=true` (analysis only; no provider required)
7. `npm run bench:tts:all`

Outputs:
- JSON reports in `server/benchmarks/ttsEntryQuality/output/`
- Markdown summaries in the same folder
- Optional audio sweeps in `server/benchmarks/ttsEntryQuality/output/audio-sweeps/`

How to use results:
1. Anchor audit: replace weak/high-risk current anchors with higher scoring candidates (or add better candidates).
2. Entry harness: inspect `deltaVsCurrent`, `bestPick`, and `recommendedSubsetAddition`.
3. Latency: compare `cold/warm p50/p95` and `estimatedPrejoinBatchMs` against `fixtures/latency-targets.json`.

Notes:
- The harness uses heuristic quality scoring plus real synth latency. It does not do automatic perceptual audio judgment.
- For final tuning, use the generated audio sweep clips to listen to the top 2-3 variants per sample.
