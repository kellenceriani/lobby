# Round 4 Emotion Assets

This folder contains emotion icons used by Round 4 evaluation cards.

## Expected Filenames

- `mad.png`
- `disappointed.png`
- `confused.png`
- `neutral.png`
- `happy.png`
- `amazed.png`
- `mindBlown.png`

## Usage

- Primary lookup is by OVR-derived emotion in `public/js/round4Eval.js`.
- Client falls back to evaluator-provided `emotion` name if image lookup fails.

## Notes

- Keep names exactly aligned with emotion keys.
- Prefer transparent PNG for visual consistency.
