# Card Blurb Clip Manifest

Last updated: February 28, 2026

Store short quote source files in this folder and register clips in `manifest.json`.

Example clip entry:

```json
{
  "id": "batman-quote-1",
  "file": "batman/batman-quotes.mp3",
  "startMs": 12000,
  "durationMs": 1400,
  "keys": ["batman", "bruce-wayne"],
  "titles": ["Batman", "Bruce Wayne"],
  "resolvedTitles": ["Batman", "Batman (character)"],
  "gain": 1,
  "playbackRate": 1
}
```

Notes:

- `file` is relative to `audio/clips/`.
- Keep snippets short (roughly 1-2 seconds).
- Matching prefers high-confidence resolved titles first.
- Fallback direct file probes are still supported.
