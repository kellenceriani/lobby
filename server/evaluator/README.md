# server/evaluator

Round 4 character and team evaluation system.

## Current Model (2026-02)

- Compact, parallel retrieval pipeline (`core/fetchers.js`) across Wikipedia, Wikidata, Fandom, OMDb, plus local alias/knowledge/name fallbacks
- Evidence-weighted candidate ranking (`core/candidateScoring.js`) with confidence bands and structured confidence signals
- Relevance + feasibility model (`scoring/relevance.js`) that combines semantic overlap, capability traits, scenario feasibility, and twist impact
- Rebalanced OVR scaling (`scoring/ovr.js`) with non-linear score curve, rarity/type attributes, confidence bonus, and scenario multiplier
- Stable outward contract: `scoreCharacter` still returns `score`, `ovr`, `notes`, and `breakdown` in the same payload shape

Design goals:
- Better character resolution coverage (including API failure fallbacks)
- Less code-path sprawl and clearer scoring composition
- More predictable OVR spread from low-confidence to high-confidence matches

## Subsystems

- `index.js`: `scoreCharacter` orchestration entry
- `core/`: constants, validation, metadata fetchers, text/candidate utilities
- `scoring/`: relevance, feasibility, twist impact, OVR computation
- `presentation/`: emotion mapping, notes, breakdown payload, flavor phrases
- `team/`: chemistry bonus engine

Canonical specs:
- `../../md/ROUND4_AI_EVALUATOR_SPEC.md`
- `../../md/EVALUATOR_TUNING_GUIDE.md`
