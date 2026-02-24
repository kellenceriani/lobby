# Content Packs (S3 Pack System v1)

This folder contains the v1 content pack system for LobbyWARS.

## What ships in v1

- JSON pack manifests in `server/content/packs/*.json`
- Schema validation + QA warnings (`npm run packs:validate`)
- Server-side pack registry with fallback to `default`
- Pack selection via room settings (`settings.contentPackId`)
- Pack-aware scenario/twist/final prompt generation
- Pack metadata in socket payloads and final/results UI
- Lightweight per-pack metrics (match starts/completions/rematches)
- Debug endpoints:
  - `GET /api/packs`
  - `GET /api/packs/metrics`

## Manifest shape (schemaVersion 1)

Required top-level fields:

- `schemaVersion`: `1`
- `id`: slug (e.g. `retro-heroes`)
- `label`
- `description`
- `visuals`
  - `chipLabel`
  - `accentColor` (`#RRGGBB` or `#RGB`)
- `gameplay`
  - `allowedThemes` (optional but recommended)
  - `scenarioCards` (optional if `allowedThemes` is present)
  - `twistAdds` (`easy|normal|hard` arrays; optional)
  - `final`
    - `scenarioPool` (optional)
    - `twistPool.easy|normal|hard` (optional)

## Authoring checklist (content QA)

- Keep scenario cards readable on mobile (target ~4-10 words, avoid walls of text).
- Keep twist lines short and punchy (target <= 8 words, max ~10 before warnings).
- Avoid near-duplicate scenarios and minor wording variants.
- Ensure pack tone is consistent (e.g. all office/comedy vs mixed random prompts).
- Include enough variety to avoid repeats in back-to-back matches (10+ scenario cards recommended).
- Test on `easy`, `normal`, and `hard` to confirm twist additions still read clearly.
- Validate before commit: `npm run packs:validate`.

## Legal / rights review process (v1 manual)

- Do not use protected brand names, logos, or copyrighted character names in pack content.
- Prefer broad themes and original phrasing.
- If a pack is inspired by an external property/event, document inspiration separately and keep manifest text generic.
- Review `description`, `themeTags`, and scenario/twist text for trademark-heavy wording before release.

## Notes

- All packs are currently treated as unlocked (`availability` is an abstraction for future monetization/entitlements).
- Invalid pack manifests are skipped at server startup; the app falls back to `default`.
