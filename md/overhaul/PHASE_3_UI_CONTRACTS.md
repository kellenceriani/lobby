# Phase 3 UI Contracts (Front-End Hub Redesign)

Date: March 6, 2026  
Status: Implemented

## Top-Level Routes and Screens

New front-end route targets (screen IDs):

- `dualPathOnboarding` (first-launch path selection)
- `homeHub`
- `soloHub`
- `join` (Party Hub entry, preserves existing room join flow)
- `profileHub`
- `progressionHub`
- `achievementsHub`

Primary nav component:

- `#hubNav` with route buttons:
  - `data-route="home"`
  - `data-route="solo"`
  - `data-route="party"`
  - `data-route="profile"`
  - `data-route="progression"`
  - `data-route="achievements"`

## Onboarding Contract

- First-launch flow uses `dualPathOnboarding`.
- Copy must explain Solo vs Party quickly and present both actions immediately.
- Countdown auto-close target: `8` seconds.
- Completion persisted via local storage key:
  - `lobbywars_dual_hub_onboarding_done_v1`

## Solo Hub UI Contract

Solo hub uses Phase 2 server endpoints:

- `POST /api/solo/runs/start`
- `POST /api/solo/runs/submit`
- `POST /api/solo/runs/hint`
- `POST /api/solo/runs/finalize`
- `GET /api/solo/leaderboards/daily`

Required Solo UI sections:

- Daily reset countdown (UTC-based)
- Start daily / start practice controls
- Slot drafting controls (`lead`, `anchor`, `wildcard`, `closer`)
- Candidate grid interactions
- Attempt feedback log
- Post-run summary block
- Daily leaderboard list + refresh action

## Meta/Profile UI Contract

Meta-backed read surfaces:

- `GET /api/meta/profile/:userId`
- `GET /api/meta/achievements/:userId`
- `GET /api/meta/flags`
- `POST /api/identity/guest-session` for guest bootstrap identity

Required screens:

- Profile: identity + account summary + solo snapshot stats
- Progression: level/XP bar + solo progression counters
- Achievements: definitions + unlock status list

## Feature-Flag Contract

- Front-end dual-hub enable/disable is server-driven via `GET /api/meta/flags`:
  - `dualHubUiEnabled`
- Server env switch:
  - `DUAL_HUB_UI_ENABLED` (`true` default)

## iOS/Mobile Safety Contract

`css/dual-hub.css` must include:

- safe-area support: `env(safe-area-inset-top|right|bottom|left)`
- dynamic viewport support: `100dvh`
- touch target minimums: `min-height: 44px`
- mobile viewport media adaptation for nav/cards
- reduced-motion guardrail media query
