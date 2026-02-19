# server/core

Core game loop engine.

`gameEngine.js` responsibilities:
- room and game instance state model
- scenario + twist generation pools
- phase transitions for rounds 1–3
- vote tally and weighted point application
- Round 4 team compilation and start trigger

Primary extension points:
- `generateScenario`, `generateTwists`
- draft/vote timer helpers
- `calculateRoundBonuses`
