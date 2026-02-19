# Round Results UI Blueprints

## Goal
Make post-vote results faster to scan, less text-heavy, and still transparent about why each player gained/lost points.

## Option A — Condensed Detailed Breakdown
- Keep per-player breakdown as the primary surface.
- Collapse raw line items behind a small disclosure.
- Add contribution grouping (Vote / Intel / Core) with net point chips.
- Best when users care about exact scoring logic every round.

## Option B — Compact Visual Summary (Implemented)
- Show one compact player card with:
  - Round points pill
  - One-line preview of the most important scoring event
  - Vote / Intel / Core contribution chips
  - Small contribution split bar
  - Minimal score notes disclosure (top 4–5 lines)
- Upgrade Intel Summary into metric cards with mini progress bars.
- Best for readability + speed while preserving explainability.

## Option C — Pure Visual (Pie/Donut First)
- Replace most text with per-player donut charts showing contribution composition.
- Keep only tiny labels and a hover/tap detail panel.
- Works great on desktop, but can reduce clarity on mobile and for accessibility if overused.

## Selection Rationale
Option B provides the best balance for this project right now:
- Less clutter than the old long breakdown blocks.
- Clearer at-a-glance understanding than text-only.
- No heavy chart dependency and still mobile-friendly.

## Implemented In
- `public/js/app.js` (round result rendering + intel summary rendering)
- `public/css/results.css` (compact cards, chips, bars, responsive behavior)
