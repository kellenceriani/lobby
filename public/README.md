# public/

Last updated: February 28, 2026

Frontend SPA assets served by Express.

- `index.html` - full screen/layout markup and script/style entrypoints.
- `css/` - feature-area styling.
- `js/` - client runtime orchestration.
- `img/` - static image assets.

Key behavior:

- Startup preflight runs before join unlock.
- Join-screen Eval plaques are staged/prewarmed during preflight.
- Lobby settings are host-authoritative and synced from socket events.
