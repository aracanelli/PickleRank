# API Contracts

Base URL: `/api`

All endpoints require `Authorization: Bearer <JWT>` header unless noted.

## Health Check

### GET /health
Public endpoint for health checks.

**Response** `200 OK`
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

---

## Groups

### POST /groups
Create a new group.

**Request**
```json
{
  "name": "Friday Night Picklers",
  "sport": "pickleball",
  "settings": {
    "ratingSystem": "SERIOUS_ELO",
    "initialRating": 1000,
    "kFactor": 32,
    "eloDiff": 0.05,
    "noRepeatTeammateInEvent": true,
    "noRepeatTeammateFromPreviousEvent": true,
    "noRepeatOpponentInEvent": true,
    "autoRelaxEloDiff": true,
    "autoRelaxStep": 0.01,
    "autoRelaxMaxEloDiff": 0.25
  }
}
```

**Response** `201 Created`
```json
{
  "id": "uuid",
  "name": "Friday Night Picklers",
  "sport": "pickleball",
  "settings": { ... },
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### GET /groups
List all groups owned by current user.

**Response** `200 OK`
```json
{
  "groups": [
    {
      "id": "uuid",
      "name": "Friday Night Picklers",
      "sport": "pickleball",
      "playerCount": 12,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### GET /groups/{groupId}
Get group details.

**Response** `200 OK`
```json
{
  "id": "uuid",
  "name": "Friday Night Picklers",
  "sport": "pickleball",
  "settings": { ... },
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

### PATCH /groups/{groupId}/settings
Update group settings.

**Request**
```json
{
  "ratingSystem": "CATCH_UP",
  "kFactor": 24
}
```

**Response** `200 OK`
```json
{
  "id": "uuid",
  "settings": { ... },
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

---

## Players

### POST /players
Create a global player.

**Request**
```json
{
  "displayName": "John Doe",
  "notes": "Left-handed"
}
```

**Response** `201 Created`
```json
{
  "id": "uuid",
  "displayName": "John Doe",
  "notes": "Left-handed",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### GET /players
Search global players.

**Query Parameters**
- `search`: Filter by name (optional)

**Response** `200 OK`
```json
{
  "players": [
    {
      "id": "uuid",
      "displayName": "John Doe",
      "notes": "Left-handed"
    }
  ]
}
```

### POST /groups/{groupId}/players
Add player to group.

**Request**
```json
{
  "playerId": "uuid",
  "membershipType": "PERMANENT"
}
```

Note: `membershipType` is optional, defaults to `"PERMANENT"`. Valid values: `"PERMANENT"`, `"SUB"`.

**Response** `201 Created`
```json
{
  "id": "uuid",
  "playerId": "uuid",
  "groupId": "uuid",
  "displayName": "John Doe",
  "membershipType": "PERMANENT",
  "rating": 1000,
  "gamesPlayed": 0,
  "wins": 0,
  "losses": 0,
  "ties": 0,
  "winRate": 0
}
```

### POST /groups/{groupId}/players/bulk
Add multiple players to group at once.

**Request**
```json
{
  "players": [
    { "playerId": "uuid1", "membershipType": "PERMANENT" },
    { "playerId": "uuid2", "membershipType": "SUB" }
  ]
}
```

**Response** `201 Created`
```json
{
  "added": [
    {
      "id": "uuid",
      "playerId": "uuid1",
      "groupId": "uuid",
      "displayName": "John Doe",
      "membershipType": "PERMANENT",
      "rating": 1000,
      "gamesPlayed": 0,
      "wins": 0,
      "losses": 0,
      "ties": 0,
      "winRate": 0
    }
  ],
  "skipped": ["uuid3"]
}
```

Note: `skipped` contains player IDs that were already in the group.

### GET /groups/{groupId}/players
List players in group with ratings.

**Response** `200 OK`
```json
{
  "players": [
    {
      "id": "uuid",
      "playerId": "uuid",
      "groupId": "uuid",
      "displayName": "John Doe",
      "membershipType": "PERMANENT",
      "rating": 1050,
      "gamesPlayed": 10,
      "wins": 6,
      "losses": 3,
      "ties": 1,
      "winRate": 0.65
    }
  ]
}
```

### PATCH /groups/{groupId}/players/{groupPlayerId}
Update a group player's membership type.

**Request**
```json
{
  "membershipType": "SUB"
}
```

**Response** `200 OK`
```json
{
  "id": "uuid",
  "playerId": "uuid",
  "groupId": "uuid",
  "displayName": "John Doe",
  "membershipType": "SUB",
  "rating": 1050,
  "gamesPlayed": 10,
  "wins": 6,
  "losses": 3,
  "ties": 1,
  "winRate": 0.65
}
```

---

## Events

### POST /groups/{groupId}/events
Create a new event.

**Request**
```json
{
  "name": "Friday Session",
  "startsAt": "2024-01-05T18:00:00Z",
  "courts": 2,
  "rounds": 4,
  "participantIds": ["uuid1", "uuid2", "..."]
}
```

**Response** `201 Created`
```json
{
  "id": "uuid",
  "name": "Friday Session",
  "status": "DRAFT",
  "courts": 2,
  "rounds": 4,
  "participantCount": 8
}
```

### GET /groups/{groupId}/events
List events in group.

**Query Parameters**
- `status`: Filter by status (optional)

**Response** `200 OK`
```json
{
  "events": [
    {
      "id": "uuid",
      "name": "Friday Session",
      "status": "COMPLETED",
      "startsAt": "2024-01-05T18:00:00Z",
      "courts": 2,
      "rounds": 4
    }
  ]
}
```

### GET /events/{eventId}
Get event details with games.

**Response** `200 OK`
```json
{
  "id": "uuid",
  "name": "Friday Session",
  "status": "IN_PROGRESS",
  "courts": 2,
  "rounds": 4,
  "generationMeta": {
    "seedUsed": "abc123",
    "eloDiffUsed": 0.07,
    "relaxIterations": 2
  },
  "games": [
    {
      "id": "uuid",
      "roundIndex": 0,
      "courtIndex": 0,
      "team1": [
        { "id": "uuid", "displayName": "John" },
        { "id": "uuid", "displayName": "Jane" }
      ],
      "team2": [
        { "id": "uuid", "displayName": "Bob" },
        { "id": "uuid", "displayName": "Alice" }
      ],
      "scoreTeam1": 11,
      "scoreTeam2": 9,
      "result": "TEAM1_WIN"
    }
  ]
}
```

### POST /events/{eventId}/generate
Generate match schedule.

**Request** (optional)
```json
{
  "newSeed": true
}
```

**Response** `200 OK`
```json
{
  "status": "GENERATED",
  "generationMeta": {
    "seedUsed": "abc123",
    "eloDiffConfigured": 0.05,
    "eloDiffUsed": 0.07,
    "relaxIterations": 2,
    "attempts": 15,
    "durationMs": 234
  },
  "games": [ ... ]
}
```

### POST /events/{eventId}/swap
Swap two players within a round.

**Request**
```json
{
  "roundIndex": 0,
  "player1Id": "uuid",
  "player2Id": "uuid"
}
```

**Response** `200 OK`
```json
{
  "success": true,
  "warnings": ["Swap creates teammate repeat from previous event"]
}
```

### PATCH /games/{gameId}/score
Update game score.

**Request**
```json
{
  "scoreTeam1": 11,
  "scoreTeam2": 9
}
```

**Response** `200 OK`
```json
{
  "id": "uuid",
  "scoreTeam1": 11,
  "scoreTeam2": 9,
  "result": "TEAM1_WIN"
}
```

### POST /events/{eventId}/complete
Complete event and update ratings.

**Response** `200 OK`
```json
{
  "status": "COMPLETED",
  "ratingUpdates": [
    {
      "playerId": "uuid",
      "displayName": "John",
      "ratingBefore": 1000,
      "ratingAfter": 1016,
      "delta": 16
    }
  ]
}
```

---

## Rankings

### GET /groups/{groupId}/rankings
Get group rankings.

**Response** `200 OK`
```json
{
  "rankings": [
    {
      "rank": 1,
      "playerId": "uuid",
      "displayName": "John Doe",
      "rating": 1150,
      "gamesPlayed": 24,
      "wins": 15,
      "losses": 7,
      "ties": 2,
      "winRate": 0.667
    }
  ]
}
```

### GET /groups/{groupId}/history
Get match history.

**Query Parameters**
- `from`: Start date (optional)
- `to`: End date (optional)
- `playerId`: Filter by player (optional)

**Response** `200 OK`
```json
{
  "matches": [
    {
      "eventId": "uuid",
      "eventName": "Friday Session",
      "date": "2024-01-05T18:00:00Z",
      "roundIndex": 0,
      "courtIndex": 0,
      "team1": ["John", "Jane"],
      "team2": ["Bob", "Alice"],
      "scoreTeam1": 11,
      "scoreTeam2": 9,
      "result": "TEAM1_WIN"
    }
  ]
}
   ]
 }


