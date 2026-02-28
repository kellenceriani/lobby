# server/core/

Last updated: February 28, 2026

`gameEngine.js` owns:

- room creation and game instance creation
- scenario/twist/final generation
- rounds 1-3 phase transitions
- vote+intel scoring application
- Round 4 prep and endgame finalization

Current generation behavior:

- Content pack remains primary source when available.
- Theme selection biases scenario/twist output.
- Difficulty affects twist intensity and round time pressure.

Match-end behavior:

- Room settings are reset to defaults for next match.
