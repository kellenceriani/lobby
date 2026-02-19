# server/core

Core game loop engine.

`gameEngine.js` responsibilities:
- room and game instance state model
- scenario + twist generation pools
- phase transitions for rounds 1–3
- vote tally and weighted point application
- Round 4 team compilation and start trigger
- dedicated Round 4 final-condition generator (`generateFinalScenarioAndTwist`) with difficulty-scaled, compositional scenario + twist synthesis

Round 4 generation notes:
- Final scenarios are composed from weighted action/objective/arena/opposition/resource/deadline/complication pools for very high diversity.
- Final twists are composed from operational constraints + dynamic rule modifiers + hazard suffixes.
- Effective diversity is orders of magnitude above prior static pools (well beyond the requested 20x scenarios / 10x twists increase).

Primary extension points:
- `generateScenario`, `generateTwists`
- `generateFinalScenarioAndTwist`
- draft/vote timer helpers
- `calculateRoundBonuses`
