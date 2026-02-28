# Future Implementations Roadmap

Last updated: February 28, 2026

## Priority 0 (Stability / Trust)

- Add automated integration tests for:
  - settings propagation
  - round transitions
  - final sync and replay paths
- Add contract-level payload validation for critical socket events in dev mode.
- Add deterministic seed mode for scenario/twist generation replay.
- Add telemetry regression tests for diagnostics classifiers (validation flags, title-diff risk classes, quality gates).

## Priority 1 (Gameplay Depth)

- Ship at least 2 additional curated content packs.
- Add host-visible presets (Casual / Standard / Chaos).
- Add optional no-voting and team modes behind explicit feature flags.

## Priority 2 (UX / Product)

- Expand onboarding/tutorial clarity for first-time players.
- Add clearer post-round explanations for score movement.
- Add accessibility pass (motion reduction, contrast, font scaling).

## Priority 3 (Operations)

- Add benchmark CI for context engine and TTS warmup latency.
- Add observability dashboards for round timing and evaluator confidence.
- Add stale-room cleanup and long-lived-room lifecycle guardrails.
- Add chemistry variance audits (Monte Carlo-style distribution checks) for post-tuning sanity.

## Not in Scope Right Now

- Live LLM runtime for scoring.
- Major new monetization systems.
- Full second-screen pairing protocol beyond existing visual placeholders.

## Success Criteria

- Faster time-to-first-match.
- Fewer support issues around settings and scoring transparency.
- Higher match completion and replay rates.
