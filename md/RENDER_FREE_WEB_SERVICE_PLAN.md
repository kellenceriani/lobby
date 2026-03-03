# Render Free Web Service Migration Plan (Post-Railway)

Last updated: March 3, 2026

## Purpose

This document is the likely fallback path if Railway free access ends.

Goal: move the existing Node + Express + Socket.IO app to Render Free with the smallest possible change surface, clear tradeoffs, and a realistic runway estimate.

## Executive Summary

- Migration difficulty: **low** (mostly platform/DNS/env changes, minimal app changes).
- Runtime compatibility: **high** (app already uses `process.env.PORT`, serves static assets, and runs Socket.IO on `/socket.io`).
- Main risk on Render Free: **service spin-down + ephemeral filesystem**.
- Expected user impact: occasional cold starts (~1 minute) and possible monthly suspension if free limits are exceeded.

## Current App Fit (Why this is easy)

The current repo already aligns with Render Web Service requirements:

- Start command exists: `npm start` -> `node server.js`.
- Server binds to dynamic port: `const PORT = process.env.PORT || 3000`.
- Single Node process serves API + static assets + Socket.IO.
- No required Railway-specific config files were found in the repo.

## Render Free Limits That Matter Most

From Render free docs (as of this plan date):

- Free web service spins down after ~15 minutes with no inbound traffic.
- Spin-up on next request/connection can take about ~1 minute.
- 750 free instance hours per workspace per calendar month.
- If free hours are exhausted, free web services are suspended until next month.
- Free service filesystem is ephemeral (changes are lost on restart/redeploy/spin-down).
- Outbound bandwidth/build minutes have included limits; exceeding without payment method can suspend/limit behavior.

## Daily Usage Breakdown (Practical Forecast)

Assumptions for quick planning:

- One Render Free web service only.
- Month length: 30 days for budgeting.
- Compute budget per day = $750 / 30 = 25$ instance-hours/day average.

### Scenario A: Always-on traffic (worst-case for free-hour burn)

- Service runs nearly 24h/day.
- Daily burn: ~24 instance-hours/day.
- Monthly burn: ~$24 \times 30 = 720$ hours.
- Result: usually fits within 750, with ~30h monthly buffer.

### Scenario B: Medium usage, idle overnight

- Active 8-14h/day; spins down outside activity.
- Daily burn: ~8 to 14h.
- Monthly burn: ~240 to 420h.
- Result: comfortably inside free-hour budget.

### Scenario C: Spiky hobby usage (weekend-heavy)

- Weekdays ~2-4h/day, weekends ~10-16h/day equivalent runtime.
- Typical monthly burn: ~140 to 300h.
- Result: strong free-tier fit.

### What this means in plain terms

- **Compute-hours are likely okay** unless sustained near-24/7 activity.
- **Cold-start UX is the bigger day-to-day pain** than raw compute-hour exhaustion.
- **Bandwidth can become the hidden limiter** if TTS/audio payload volume grows.

## Pros vs Cons

## Pros

- Very quick path from current repo to hosted service.
- Native support for Node web services and WebSockets.
- Git-connected deploy flow is simple and repeatable.
- Free tier likely adequate for hobby/early-stage usage.
- Easy domain mapping from current registrar/host.

## Cons

- Idle spin-down causes cold-start delay for first returning user.
- Free monthly limits can suspend service before month-end if usage spikes.
- Ephemeral filesystem conflicts with local generated assets/cache persistence.
- Free tier is not production-grade reliability (restarts, limited features, single instance).
- No horizontal scaling on free instance type.

## Critical Risk: Ephemeral Filesystem and TTS Cache

This app writes generated TTS cache files under `audio/generated-tts`.

On Render Free, local filesystem changes are not durable across spin-down/restart/redeploy.

Impact:

- cache warm state is lost repeatedly,
- first-hit latency for regenerated clips can increase,
- disk-based cache effectiveness drops.

Mitigation options (priority order):

1. Accept ephemeral cache in free mode (simplest, no code changes).
2. Keep generated audio in external object storage (best durability, more setup).
3. Add stricter cache controls + browser fallback paths for non-critical narration.

## What We Replace

Railway-to-Render cutover mainly replaces infrastructure components:

- Hosting platform: Railway service -> Render Web Service.
- Deployment wiring: Railway project settings -> Render service settings.
- DNS target records: old host target -> Render target.

What remains unchanged:

- Application code structure, routes, and Socket.IO contract.
- `package.json` scripts and runtime entrypoint (`server.js`).
- Frontend origin-based socket connection strategy (`window.location.origin`).

## Implementation Plan (Exact Steps)

1. Create Render Web Service from the existing Git repo.
2. Configure:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: `NODE_ENV=production`
3. Add required environment variables currently used in production (copy from Railway).
4. Deploy and verify logs show: `LobbyWARS Server running on port ...`.
5. Run smoke test on Render URL:
   - load app,
   - create/join room,
   - play through one match,
   - verify Socket.IO stability,
   - verify TTS route behavior and fallbacks.
6. Map custom domain from hosting provider DNS to Render endpoint.
7. Re-run smoke test on custom domain.
8. Keep Railway as rollback for 24-72 hours after cutover.

## Validation Checklist (Cutover Day)

- HTTP: `/` and static assets return successfully.
- API: `/api/packs`, `/api/categories`, `/api/tts/catalog` return expected payloads.
- Socket.IO: room join/game events function with multiple clients.
- Round progression: R1 -> R4 -> final results completes without stalls.
- TTS: synth endpoint works or degrades gracefully when provider unavailable.
- Cold-start behavior: first-hit latency is acceptable and communicated.

## Cost / Limit Monitoring Plan

Track these weekly (or daily near limit):

- remaining free instance hours,
- outbound bandwidth usage,
- build pipeline minutes,
- number/timing of service suspensions or unexpected restarts,
- TTS/audio response latency trends after idle periods.

Decision trigger to leave Free:

- repeated month-end suspensions,
- unacceptable cold-start experience for active users,
- bandwidth overages becoming frequent,
- need for durable local persistence or scaling.

## Future Viability Outlook

### 0-3 months (high viability)

- Good fit for current “hobby/early traffic” profile.
- Fastest safety net if Railway trial ends suddenly.

### 3-12 months (conditional viability)

- Still viable if user traffic remains moderate and tolerance for occasional cold starts remains high.
- May degrade if TTS/audio volume or concurrency increases significantly.

### 12+ months (likely transition period)

- Expect pressure to move to paid instance or hybrid architecture for reliability.
- Main pressure points: uptime expectations, low-latency first join, durable cache/storage.

## Next-Step Architecture Ideas

If usage grows, move incrementally:

1. Keep web app on Render; externalize generated audio/cache storage.
2. Add explicit rate/usage guardrails and a friendly limit page.
3. Move to paid instance when cold-start/availability become user-visible pain.
4. Optionally split heavy auxiliary services (TTS pipelines) from realtime game path.

## Migration Effort Estimate

- Initial deploy + env setup: ~30-90 minutes.
- Full smoke + DNS cutover: ~30-120 minutes (DNS timing dependent).
- Rollback readiness: immediate if Railway left intact during transition window.

Overall effort: **easy**, low-code, mostly operational.
