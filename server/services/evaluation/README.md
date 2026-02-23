# Context Engine Scaffold

This folder is the new home for the non-LLM "AI-like" evaluation system.

Design goal:
- Keep gameplay fast and deterministic.
- Improve contextual judgment quality using structured rules, resolver quality, and reusable scoring modules.
- Make future upgrades easy by separating pipeline stages.

Current status:
- Scaffold only. Runtime still uses the legacy evaluator through `../entryEvaluationService.js`.

Planned flow:
1. `context/` parses scenario + twist into normalized requirements/constraints.
2. `resolver/` resolves entry identity and evidence from external sources + local knowledge.
3. `scoring/` computes sub-scores (fit/base/rarity/creativity/confidence).
4. `pipeline/` orchestrates round and final evaluation.
5. `explain/` builds UI-friendly breakdown payloads.
6. `diagnostics/` provides telemetry and replay benchmark summaries.
