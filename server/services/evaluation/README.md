# Context Evaluation Pipeline

Last updated: February 28, 2026

This directory contains the active deterministic evaluation pipeline used by runtime services.

Major areas:

- `context/` - parse scenario/twist into structured signals.
- `resolver/` - identity resolution and source adapters.
- `scoring/` - weighting model + context signal computation.
- `pipeline/` - entry batch orchestration.
- `cache/` - evaluation caching.
- `diagnostics/` - telemetry and explainability diagnostics.
- `explain/` - client-facing reason payload assembly.

Deterministic stage model:

1. Resolve identity and confidence.
2. Parse context constraints/signals.
3. Judge context fit into clamped sub-scores.
4. Apply authoritative weighting + explainability assembly.

No live LLM runtime is used in the critical scoring path.
