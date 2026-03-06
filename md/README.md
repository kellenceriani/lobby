# LobbyWARS Docs

Last updated: February 28, 2026

This folder contains active, maintained project documentation.

## Read First

1. `ARCHITECTURE.md` - current runtime architecture and ownership map.
2. `GAME_DESIGN_DOCUMENT.md` - current game rules, rounds, and settings behavior.
3. `SOCKET_EVENT_CONTRACT.md` - authoritative realtime event contract.
4. `RUNBOOK.md` - safe workflow and validation checklist.

## Evaluator / Scoring

- `ROUND4_AI_EVALUATOR_SPEC.md` - Round 4 evaluation contract and flow.
- `EVALUATOR_TUNING_GUIDE.md` - high-impact tuning surfaces.

## Product Planning

- `FUTURE_IMPLEMENTATIONS_ROADMAP.md` - active roadmap only.
- `CATEGORIES_MODE_VISION.md` - core design vision and rollout plan for Categories Mode.
- `DUAL_MODE_OVERHAUL_MASTER_PLAN.md` - master vision and phased implementation plan for Solo + Party overhaul.

## Deployment Planning

- `RENDER_FREE_WEB_SERVICE_PLAN.md` - fallback migration plan for moving from Railway trial to Render Free.

## Notes

- Historical one-off migration/changelog docs were removed to avoid stale guidance.
- Useful content from removed docs was consolidated into:
  - `ARCHITECTURE.md` (deterministic evaluation architecture/performance strategy)
  - `EVALUATOR_TUNING_GUIDE.md` and `ROUND4_AI_EVALUATOR_SPEC.md` (scoring model references)
  - `RUNBOOK.md` (AI-core regression checklist)
- If docs and code diverge, code is authoritative.
