# public/css/

Last updated: February 28, 2026

- `base.css` - reset, tokens, shared components.
- `lobby.css` - join/lobby/chat/settings presentation.
- `settings.css` - Settings OS styles.
- `joinEvalFallingPlaques.css` - join-screen falling Eval plaques.
- `game.css` - rounds 1-3 gameplay screens.
- `results.css` - round/final results layouts.
- `round4Eval.css`, `round4Eval-ovr.css` - Round 4 and OVR modal styling.

When changing `index.html` IDs/classes, verify selectors across all files above.

Settings OS styling guardrails:

- Keep Settings selectors scoped under `.settings-os` to avoid bleed from `base.css` and `lobby.css`.
- Preserve modal/body scroll-lock behavior used by the settings sheet (`body.settings-sheet-open` flows).
- Prefer targeted selector edits over global overrides to avoid reintroducing transparency/stacking regressions.
