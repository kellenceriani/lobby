# Categories Mode Vision

Last updated: March 1, 2026

## Purpose

Define a Categories Mode system that is:

- clean in lobby UX
- highly playable/fun in social rounds
- deterministic/scalable for server-side evaluation
- powerful enough to materially affect scoring without breaking match fairness

This mode is intended to become a core default path (not an edge feature).

## Product Decisions (Locked)

1. Categories Mode is a default core game setting and a first-class scoring signal.
2. The current `customScenario` lobby slot is replaced by Categories Mode in primary settings UI.
3. `customScenario` moves to Advanced Settings and remains optional/non-default.
4. Category input is curated-list only (no free-text category creation by players in standard mode).
5. Host should not be forced to manually choose the category for a match everytime; random and vote flows are required.

## Design Constraints

- Keep rounds 1-3 socially readable and fast.
- Keep Round 4 deterministic/server-authoritative.
- Avoid unlimited taxonomy growth that outpaces wiki/evaluator reliability.
- Category impact must be large enough to matter, but bounded to avoid instant auto-win/auto-loss loops.
- Every category rule must degrade gracefully when confidence is low or data is sparse.

## Scope Boundaries

### In Scope

- curated category library
- lobby category selection behavior (manual/random/vote)
- category-aware scoring adjustments across all rounds, especially Round 4
- server-side category eligibility + confidence model
- explanation payloads so players understand score shifts
- telemetry for fairness/tuning

### Out of Scope (Initial Delivery)

- user-authored categories in default matchmaking
- live LLM category generation at runtime
- fully bespoke rule packs per category
- long-form category descriptions in round UI

## Category Library Architecture

Use a curated, versioned category registry.

## Targets

- Initial production target: 120-180 categories.
- Hard ceiling for short-term ops: 250 categories until retrieval confidence stays stable.
- Each category must map to a constrained concept profile that evaluator pipelines can resolve reliably.

## Category Object Shape

Each category entry should include:

- `id` (stable slug)
- `displayName`
- `family` (for diversity balancing)
- `aliases[]`
- `descriptionShort`
- `inclusionRules[]`
- `exclusionRules[]`
- `exampleEntriesStrong[]`
- `exampleEntriesWeak[]`
- `riskLevel` (low/med/high ambiguity)
- `enabled` flag
- `weightProfileId` (optional profile override)

## Category Families (Initial)

- real living beings
- fictional beings
- professions/roles
- objects/tools
- vehicles/travel
- locations/environments
- science/technology
- history/politics
- mythology/religion
- media/franchises
- sports/competition
- food/culture

Family balancing is required for randomization and vote candidate generation.

## Lobby UX Behavior

Categories replaces `customScenario` in primary settings with three modes:

1. Host Select
   - host picks 1 category from curated list.
2. Smart Random
   - system picks from curated list with anti-repeat + ambiguity balancing.
3. Group Vote
   - system proposes 3-5 candidates; players vote before Round 1 starts.

Advanced Settings:

- `customScenario` remains available in advanced section only.
- If `customScenario` is enabled, category still applies unless host explicitly disables Categories Mode.

## Match Lifecycle Integration

1. Lobby chooses/locks category source (host/random/vote).
2. Server emits locked category payload at game start.
3. Category context persists through rounds 1-4.
4. Evaluator computes category fit per entry as a mandatory sub-score.
5. Round results + Round 4 explain payload must show category impact summary.

## Scoring Architecture

Categories should affect scoring through two channels:

1. Eligibility Gate (can this entry reasonably belong?)
2. Category Strength (how strong is this entry within that category?)

This avoids binary only (in/out) and supports nuanced picks.

## Round 4 Weighting Proposal (V1)

Add `categoryFit` as a major deterministic component.

When final twist exists (example V1):

- Original scenario carryover: 11%
- Original twist carryover: 9%
- Final scenario fit: 11%
- Final twist fit: 9%
- Base ability: 20%
- Category fit: 30%
- Other restraints incl. chemistry: 10%

When no final twist (example V1):

- Original scenario carryover: 20%
- Final scenario fit: 20%
- Base ability: 20%
- Category fit: 30%
- Other restraints incl. chemistry: 10%

All sub-scores remain clamped `0-100` before weighted aggregation.

## Category Fit Composition

`categoryFit` is derived from:

- membership confidence (`0-100`)
- within-category power rank (`0-100`)
- ambiguity penalty (`0-100` inverse)

Recommended composition:

- 50% membership confidence
- 35% within-category power rank
- 15% ambiguity handling

## Debuff/Buff Rules

### Strong Out-of-Category Penalty

If membership confidence is below threshold, apply major debuff.

V1 guideline:

- confidence < 25: apply heavy penalty (target effective -50 to -70 OVR contribution window)
- confidence 25-45: apply moderate penalty
- confidence 45-60: soft caution penalty
- confidence >= 60: no eligibility penalty

### In-Category Upside (Bounded)

- Entries strongly aligned with category can gain meaningful upside, but cap the bonus so scenario/twist/chemistry still matter.
- Hard-cap category net impact per entry to prevent one signal from erasing all others.

## Guardrails Against Broken Outcomes

1. Never fully zero an entry unless confidence is near-impossible and high-certainty.
2. Add confidence floor fallback when data quality is poor.
3. Keep uncertainty visible in explain payload.
4. Cap per-entry category delta (positive and negative).
5. Use category-family-specific ambiguity thresholds.
6. Add manual denylist/allowlist override hooks for known edge cases.

## Evaluation System Changes

## New Core Components

- Category Registry Service (versioned source of truth)
- Category Membership Resolver
- Category Strength Ranker
- Category Explain Serializer

## Existing Surfaces to Extend

- evaluator scoring pipeline (`relevance`, `ovr`, round4 weighting)
- deterministic payload schema for round explanations
- precompute caching key expansion to include category ID/version

## Data and Contracts

## Settings Additions

- `categoriesMode`: `off | host_select | smart_random | group_vote`
- `categoryId`: nullable slug
- `categoryVoteOptions[]`: optional pre-round candidates
- `categoryVersion`: resolver registry version

## Backward Compatibility

- preserve legacy `customScenario` behavior via Advanced Settings
- old clients should fail safe with server defaults if new fields absent

## Socket Contract Additions (Proposed)

- settings payload includes category fields above
- optional `categoryVoteStart` and `categoryVoteUpdate` events (if group vote enabled)
- `roundStart`/`scenarioRevealed` context includes locked category summary
- `roundResults` and `round4Evaluated` include category impact explain blocks

## Anti-Abuse and Fairness

- Anti-repeat memory for recently used categories in same room.
- Weighted randomization to avoid high-ambiguity streaks.
- Host cannot change category once match starts.
- If category vote ties, deterministic tie-break (seeded RNG + anti-repeat).

## Telemetry / Tuning Requirements

Track per category:

- pick rate (manual/random/vote)
- in-category confidence distribution
- out-of-category penalty frequency
- average score volatility vs non-category baseline
- player vote completion and match completion deltas
- post-match replay intent proxy

Use telemetry to adjust:

- category weights
- ambiguity thresholds
- random pool eligibility

## Rollout Plan

## Phase 0 - Foundation

- add registry + schema + versioning
- introduce settings fields server-side behind feature flag
- move `customScenario` to Advanced Settings UI (no behavior loss)

## Phase 1 - MVP Categories Core

- host select + smart random
- category fit scoring in Round 4 only
- explain payload in final results
- telemetry baseline

## Phase 2 - Full Gameplay Integration

- category impact in rounds 1-3 contextual intel
- group vote mode
- anti-repeat and family balancing in production

## Phase 3 - Quality + Scale

- expand category library toward 180+
- category-specific tuning profiles
- curated edge-case override table

## Success Criteria

- Categories Mode used in majority of matches.
- Increased replay rate and vote participation.
- Higher perceived scoring fairness (fewer “this score makes no sense” complaints).
- No significant increase in stuck/loading incidents during Round 4.
- Category-enabled matches show improved fun/readability without large match-length inflation.

## Known Risks

1. Over-penalization creates feel-bad picks.
2. Ambiguous entities produce inconsistent category assignment.
3. Category signal can overpower scenario/twist if weights are too high.
4. Vote flow can add lobby friction if not time-bounded.
5. Registry growth can outpace evaluator reliability.

Mitigation is mandatory through caps, confidence-based fallbacks, and telemetry-driven retuning.

## Immediate Next Build Tasks

1. Define JSON schema for category registry and seed first 40-60 high-confidence categories.
2. Add settings fields and migration logic (`customScenario` UI relocation).
3. Implement category resolver + confidence score with deterministic output shape.
4. Integrate `categoryFit` weight into Round 4 evaluation stack behind feature flag.
5. Add round/final explain payload blocks and client display placeholders.
6. Start telemetry dashboards for category confidence and penalty rates.
