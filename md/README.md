# LobbyWARS Documentation Hub

This folder is now organized for fast execution when you need to make large, targeted changes (for example: "improve hybrid round scoring" or "retune Round 4 endgame scoring").

## Fast Start (Read in this order)

1. `GAME_DESIGN_DOCUMENT.md` — game rules and round-by-round behavior.
2. `ARCHITECTURE.md` — code-level architecture and ownership by folder.
3. `SOCKET_EVENT_CONTRACT.md` — real-time API between client/server.
4. `ROUND4_AI_EVALUATOR_SPEC.md` — Round 4 pipeline and result contract.
5. `EVALUATOR_TUNING_GUIDE.md` — exact knobs for OVR/relevance/chemistry changes.

## Operational Docs

- `RUNBOOK.md` — safe workflow for implementing major changes quickly.
- `IMPLEMENTATION_COMPLETE.md` — current implementation status and known limitations.
- `OVR_CHEMISTRY_IMPROVEMENTS.md` — tuning history and priority opportunities.

## What To Open For Common Requests

- **"Improve draft/voting/round pacing"**
	- `GAME_DESIGN_DOCUMENT.md`
	- `ARCHITECTURE.md` (game engine + socket flow)

- **"Improve AI evaluator quality (Rounds 1–4)"**
	- `ROUND4_AI_EVALUATOR_SPEC.md`
	- `EVALUATOR_TUNING_GUIDE.md`
	- `OVR_CHEMISTRY_IMPROVEMENTS.md`

- **"Change networking or UI transitions"**
	- `SOCKET_EVENT_CONTRACT.md`
	- `ARCHITECTURE.md`

- **"Ship quickly without regressions"**
	- `RUNBOOK.md`

## Source-of-Truth Rule

If docs and code diverge, code is authoritative. These docs are written to mirror the current implementation in `server/` and `public/js/` and should be updated alongside behavior changes.
