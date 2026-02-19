# server/evaluator

Round 4 character and team evaluation system.

## Current Model (2026-02)

- Compact, parallel retrieval pipeline (`core/fetchers.js`) across Wikipedia, Wikidata, Fandom, OMDb, plus local alias/knowledge/name fallbacks
- Evidence-weighted candidate ranking (`core/candidateScoring.js`) with confidence bands and structured confidence signals
- Relevance + feasibility model (`scoring/relevance.js`) that combines semantic overlap, capability traits, scenario feasibility, and twist impact
- Rebalanced OVR scaling (`scoring/ovr.js`) with non-linear score curve, rarity/type attributes, confidence bonus, and scenario multiplier
- Stable outward contract: `scoreCharacter` still returns `score`, `ovr`, `notes`, and `breakdown` in the same payload shape

Recent upgrades:
- Broader retrieval query generation for ambiguous names (`character/person/historical/animal/species/surname/family-name` paths)
- Added entity-hint aware retrieval for nicknames, objects/artifacts, legends/mythology, and name/surname disambiguation
- Wikipedia search hardening with `intitle` enrichment, disambiguation-link expansion, fuzzy token rescue, and list-page rejection
- Contextual title probing for parenthetical/franchise-like inputs (e.g., `Name (Context)` forms)
- Increased upstream API resiliency (higher retry/timeout tolerance) for long evaluation batches
- Candidate scoring improvements for single-token ambiguity, media false-positive suppression, and richer entity-quality signals
- Trait/intent/domain expansion for modern scenarios (diplomacy, logistics, engineering, medicine, finance, cyber, ecology, infrastructure)
- Scenario OVR delta narrative in `breakdown.ovrBreakdown.scenarioDeltaNarrative` for user-facing "why OVR changed" explanations
- Expanded viability harness coverage for obscure cartoons, historical figures, last names, animals, and fictional animals

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
