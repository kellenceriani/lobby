# Card Blurb Clip Manifest

Put short quote/audio source files in this folder (or subfolders) and register 1-2s snippets in `manifest.json`.

Example `manifest.json` clip entry:

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
- `file` is relative to `audio/clips/`
- `startMs` + `durationMs` are used to play a 1-2 second snippet
- Matching prefers exact `resolvedTitle`/character matches when AI confidence is high
- The system falls back to `audio/clips/<slug>.mp3` direct files if no manifest match exists
- You can also drop pre-cut quote files without a manifest using names like `batman__im-vengeance.mp3` or nested folders like `batman/im-vengeance.mp3`
- Nested folders are indexed and used as character hints to improve clip matching (faster + fewer failed probes)
