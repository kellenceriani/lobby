# Phase 1 API Contracts (Identity + Meta)

Date: March 6, 2026  
Status: Implemented

## Endpoints

### `POST /api/identity/guest-session`

Request body:

```json
{
  "displayName": "Guest Name",
  "guestAlias": "device:abc123",
  "legacyName": "Optional Legacy Name"
}
```

Response:

- `201` when new guest created
- `200` when existing guest resolved by alias

```json
{
  "created": true,
  "user": {},
  "profile": {},
  "progression": {}
}
```

### `POST /api/identity/link-account`

Request body:

```json
{
  "userId": "usr_...",
  "provider": "discord",
  "providerAccountId": "acct_12345",
  "email": "user@example.com",
  "displayName": "Updated Name"
}
```

Response:

- `200` link success or idempotent relink
- `400` invalid payload
- `404` user not found
- `409` provider account already linked elsewhere

### `GET /api/meta/profile/:userId`

Response:

```json
{
  "user": {},
  "profile": {},
  "progression": {}
}
```

### `PATCH /api/meta/profile/:userId`

Request body (any subset):

```json
{
  "displayName": "New Name",
  "bio": "Bio text",
  "avatarId": "avatar_01"
}
```

Response:

- `200` profile updated
- `400` invalid patch
- `404` user/profile not found

### `GET /api/meta/progression/:userId`

Response:

```json
{
  "user": {},
  "progression": {}
}
```

### `POST /api/meta/xp-grants`

Request body:

```json
{
  "userId": "usr_...",
  "grantId": "grant_123",
  "source": "party_participation",
  "amount": 120,
  "reason": "match_complete",
  "metadata": { "matchId": "abc" },
  "occurredAtMs": 1772827083309
}
```

Compatibility fallback variant:

```json
{
  "legacyGuestName": "Legacy Host",
  "grantId": "grant_legacy_1",
  "source": "party_participation",
  "amount": 80
}
```

Response:

- `201` new applied grant
- `200` idempotent replay
- `403` progression flag disabled
- `404` user not found / legacy resolve failed
- `400` invalid payload

### `GET /api/meta/xp-ledger/:userId?limit=50`

Response:

```json
{
  "userId": "usr_...",
  "entries": []
}
```

### `GET /api/meta/achievements/:userId`

Response:

```json
{
  "definitions": [],
  "unlocks": []
}
```

### `GET /api/meta/flags`

Response:

```json
{
  "progressionEnabled": false,
  "achievementsEnabled": false
}
```

## Validation Layer

Request validation is implemented in:

- `server/services/metaApiValidation.js`

Validated payloads include:

- guest-session create
- account link
- profile patch
- XP grant (with idempotency grant id)

