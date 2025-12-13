# PRD — Pickleball Event Matchmaking & Ranking Platform (Vercel-Deployable)
Stack (fixed):
- Frontend: Vue (modern, TypeScript)
- Backend: Python FastAPI (serverless on Vercel Functions)
- Auth: Clerk (JWT)
- DB: Supabase Postgres (only)
Hosting goal: Deploy frontend + backend on Vercel (single repo or monorepo)

References (implementation feasibility):
- Vercel supports deploying FastAPI apps and Python runtime for Functions. :contentReference[oaicite:0]{index=0}
- Clerk supports manual JWT verification via JWKS endpoints. :contentReference[oaicite:1]{index=1}
- Supabase direct DB connections are ideal for persistent servers; for serverless environments you typically use Supabase’s pooling (Supavisor) / session modes rather than long-lived direct connections. :contentReference[oaicite:2]{index=2}

---

## 1) Product Overview
A web app for a single organizer to generate fair, rule-compliant 2v2 pickleball matchups for events, capture results, and maintain per-group ratings/rankings and history. Supports multiple groups (leagues), each with custom settings and rating system selection.

Core outcomes:
- Generate multi-court, multi-round schedules fast
- Enforce teammate/opponent constraints
- Enter scores quickly (ties allowed)
- Recalculate ratings and show rankings + win rate
- Persist full match history for future stats

---

## 2) Goals & Non-Goals

### MVP Goals
- Clerk-authenticated single owner account (one role)
- CRUD Groups with per-group settings
- Global Players library; ratings computed per group (GroupPlayer)
- Create ad-hoc Events with selected participants
- Generate schedules across Courts and Rounds
- Constraints (toggleable, default ON):
  - No repeated teammate within same event
  - No repeated teammate from previous event
  - No repeated opponent within same event
- Rating balance constraint with auto-relax:
  - abs(teamElo1 - teamElo2) / max(teamElo1, teamElo2) <= eloDiff
- Score entry (freeform numbers; ties allowed)
- Event completion triggers rating update
- Stats MVP:
  - Rankings table (per group)
  - Match history
  - Win rate

### Non-Goals (MVP)
- Multi-owner groups / invites
- Player self-accounts (players are not users in MVP)
- Global ELO across groups (future)
- Forfeit handling
- Rotations/sit-outs (MVP assumes participants = courts * 4)

---

## 3) Users & Permissions
Role: Owner only
Authorization rule: Any group-scoped operation must verify current user owns the group.

---

## 4) Key Concepts
- User: organizer (Clerk)
- Group: league configuration container (settings + roster + history)
- Player: global identity
- GroupPlayer: Player membership in a Group (per-group rating/stats)
- Event: a session (ad-hoc or scheduled)
- Round: simultaneous set of games across courts
- Game: one 2v2 match (court + round)
- Rating System: pluggable (Serious Elo / Catch-Up)

---

## 5) Primary Workflow
1) User logs in (Clerk)
2) User creates Group and configures settings
3) User creates Players (global) and adds to Group (GroupPlayer)
4) User creates Event:
   - selects participants (must equal courts * 4)
   - sets courts and rounds
5) Backend generates schedule
6) During play:
   - organizer can swap players within a round
   - organizer enters scores for each game (ties allowed)
7) Complete Event => rating updates + rankings refresh
8) View rankings, match history, win rate

---

## 6) Group Settings (Per Group)
- ratingSystem: SERIOUS_ELO | CATCH_UP
- initialRating: default 1000
- kFactor: default 32
- eloDiff: default 0.05
- toggles:
  - noRepeatTeammateInEvent: true
  - noRepeatTeammateFromPreviousEvent: true
  - noRepeatOpponentInEvent: true
- autoRelaxEloDiff: true
- autoRelaxStep: 0.01
- autoRelaxMaxEloDiff: 0.25

Settings edit UX:
- Show warning: "Changes affect future events; historical events remain recorded."
- Display current system and Elo constraints clearly.

---

## 7) Matchmaking Rules

### Hard Constraints (when toggles enabled)
- 2v2 only
- Each participant plays exactly once per round (given perfect fill)
- No repeated teammate within event
- No repeated teammate from previous event (previous event only)
- No repeated opponent within event

### Soft Constraint (rating balance)
Definitions:
- teamElo = (rating(p1) + rating(p2)) / 2

Rule:
- abs(teamElo1 - teamElo2) / max(teamElo1, teamElo2) <= eloDiff

Auto-relax:
- If no schedule exists with configured eloDiff, increase eloDiff by step until:
  - schedule found, OR
  - eloDiff > autoRelaxMaxEloDiff => fail with actionable message
- Never auto-relax teammate/opponent constraints in MVP.

### Output Format
- Round 1:
  - Court 1: A+B vs C+D
  - Court 2: E+F vs G+H
  - ...
- Round 2: new combinations, etc.

---

## 8) Match Generation Algorithm (Backend Only)

### Inputs
- participants: list[GroupPlayerId] size = courts*4
- courts: int >= 1
- rounds: int >= 1
- settings snapshot (saved into event.generation_meta)
- previous event teammate pairs (if exists)
- seed: eventId for reproducibility

### Approach
Seeded randomized constraint search + scoring + bounded backtracking:
- Deterministic with seed unless "Regenerate (new seed)" is used
- For each round:
  1) Create teammate pairs avoiding teammate constraints (event + previous event)
  2) Combine pairs into games avoiding opponent repeats
  3) Score candidate games by rating-diff penalty; pick best set
  4) Persist and proceed to next round
- If retry budget exhausted => relax eloDiff (if enabled) and restart

### Generation Metadata (store on Event)
- seedUsed
- eloDiffConfigured
- eloDiffUsed
- relaxIterations
- constraintToggleSnapshot
- attempts
- durationMs

Acceptance:
- Produces rounds*courts games, no constraint violations when toggles ON
- If only rating constraint prevents scheduling, auto-relax succeeds and records used eloDiff

---

## 9) Swaps & Score Entry

### Score Entry
- scoreTeam1: number | null
- scoreTeam2: number | null
- ties allowed
- result computed:
  - TEAM1_WIN if scoreTeam1 > scoreTeam2
  - TEAM2_WIN if scoreTeam2 > scoreTeam1
  - TIE if equal
  - UNSET if missing

### Swaps (Within a Round)
- Swap two players within the same round
- Backend enforces:
  - no duplicate players in that round after swap
- If swap creates cross-event constraint violations, show warnings (do not auto-fix in MVP)

---

## 10) Rating Systems (Pluggable, Backend Only)
Ratings are per-group (GroupPlayer.rating). Update occurs on event completion.

### 10.1 Serious Elo (Default)
Team average:
- Ra = (rA1 + rA2) / 2
- Rb = (rB1 + rB2) / 2

Expected:
- ExpectedA = 1 / (1 + 10^((Rb - Ra) / 400))

Actual:
- Win=1, Loss=0, Tie=0.5

Delta:
- deltaTeamA = K * (ActualA - ExpectedA)
- deltaTeamB = -deltaTeamA

Apply equal delta to each player on the team.

### 10.2 Catch-Up (Fun Mode)
Compute base Serious Elo deltaTeam first. Then adjust per player using group median rating:
- If below median, increase gains up to +50%
- If above median, reduce gains up to -30%
- Optionally slightly harsher losses for above-median players (cap +20%)

Acceptance:
- Catch-Up compresses rating spread over time vs Serious Elo
- Lower-rated winners climb faster

---

## 11) Stats (MVP)
- Rankings table:
  - rating, games played, W/L/T, win rate
- Match history:
  - event, round, court, teams, scores, result
- Win rate:
  - (wins + 0.5*ties) / gamesPlayed

All raw games stored to enable future stats (nemesis, teammate frequency, streaks, etc.)

---

## 12) Data Model (Supabase Postgres)

IMPORTANT: Frontend does NOT access Supabase directly in MVP. Backend owns data access.

Tables:

users
- id (uuid pk)
- clerk_user_id (text unique)
- created_at

groups
- id (uuid pk)
- owner_user_id (uuid fk users.id)
- name
- sport (default 'pickleball')
- settings_json (jsonb)
- created_at, updated_at

players (global)
- id (uuid pk)
- display_name
- notes nullable
- created_at, updated_at

group_players
- id (uuid pk)
- group_id (fk)
- player_id (fk)
- rating (numeric)
- games_played int
- wins int
- losses int
- ties int
- created_at, updated_at
- unique(group_id, player_id)

events
- id (uuid pk)
- group_id (fk)
- name nullable
- starts_at timestamptz
- courts int
- rounds int
- status: DRAFT | GENERATED | IN_PROGRESS | COMPLETED
- generation_meta jsonb
- created_at, updated_at

event_participants
- id (uuid pk)
- event_id (fk)
- group_player_id (fk)
- unique(event_id, group_player_id)

games
- id (uuid pk)
- event_id (fk)
- round_index int
- court_index int
- team1_p1 uuid fk group_players.id
- team1_p2 uuid fk group_players.id
- team2_p1 uuid fk group_players.id
- team2_p2 uuid fk group_players.id
- score_team1 numeric nullable
- score_team2 numeric nullable
- result: TEAM1_WIN | TEAM2_WIN | TIE | UNSET
- swapped boolean default false
- created_at, updated_at

rating_updates (audit)
- id (uuid pk)
- event_id (fk)
- group_player_id (fk)
- rating_before numeric
- rating_after numeric
- delta numeric
- system text
- created_at

audit_logs (recommended MVP)
- id (uuid pk)
- group_id uuid
- event_id uuid nullable
- action text: GENERATE | SWAP | SCORE_UPDATE | COMPLETE | SETTINGS_CHANGE
- payload jsonb
- actor_user_id uuid
- created_at

---

## 13) Security Model

### Auth (Clerk)
- Frontend: Clerk handles login/session
- Frontend sends Authorization: Bearer <JWT> to backend
- Backend verifies JWT signature using Clerk JWKS (manual verification supported). :contentReference[oaicite:3]{index=3}

### Authorization
- Backend checks group ownership for every group-scoped operation:
  - groups.owner_user_id == current_user_id

### Data Access (Supabase)
- Backend connects to Supabase Postgres.
- Because Vercel is serverless, avoid long-lived direct DB connections. Prefer Supabase pooling/session mechanisms appropriate for serverless as needed. :contentReference[oaicite:4]{index=4}
- Never expose Supabase service role key to the client.

### API Security
- Strict request validation (Pydantic models)
- Rate limiting (per user + endpoint)
- CORS allowlist: only Vercel frontend origin(s)
- Security headers

---

## 14) Architecture (MVVM + Split Frontend/Backend)

### Frontend: Vue MVVM (Facade Pattern)
Principles:
- Views (Components) are thin: render + bind to Observables
- ViewModels are Facade services:
  - expose state as Observables
  - expose commands: createEvent(), generate(), swap(), saveScore(), complete()
- Models:
  - API DTOs and domain models mapped in services

Suggested structure:
src/app/core
- auth (Clerk integration wrapper)
- http (ApiClient, interceptors)
- models (DTOs)
- utils

src/app/features/groups
- views (components)
- facades (GroupFacade)
- services (GroupApi)
- state (optional ComponentStore)

src/app/features/players
- views
- facades
- services

src/app/features/events
- views
- facades (EventFacade)
- services (EventApi)
- components (round/court cards, swap UI)

src/app/features/rankings
- views
- facades
- services

### Backend: FastAPI (Clean-ish Layers)
apps/api/main.py (FastAPI app)
apps/api/routes/*
apps/api/deps/* (auth dependency, db dependency)
apps/api/schemas/* (pydantic request/response)
apps/api/services/*
- matchmaking_service.py
- rating_service.py
apps/api/domain/*
- constraints.py
- generator.py
- ratings/*
apps/api/repositories/*
- groups_repo.py
- events_repo.py
- games_repo.py

Testing:
- domain/ logic pure unit tests (pytest)
- API integration tests (httpx TestClient)
- Determinism tests (seeded generation)

---

## 15) Backend API (REST)

Auth: Bearer JWT (Clerk)

Groups:
- POST /api/groups
- GET /api/groups
- GET /api/groups/{groupId}
- PATCH /api/groups/{groupId}/settings

Players:
- POST /api/players
- GET /api/players?search=
- POST /api/groups/{groupId}/players (add player to group)
- GET /api/groups/{groupId}/players

Events:
- POST /api/groups/{groupId}/events
- GET /api/groups/{groupId}/events
- GET /api/events/{eventId}
- POST /api/events/{eventId}/generate
- POST /api/events/{eventId}/swap
- PATCH /api/games/{gameId}/score
- POST /api/events/{eventId}/complete

Rankings:
- GET /api/groups/{groupId}/rankings
History:
- GET /api/groups/{groupId}/history?from=&to=

---

## 16) Vercel Deployment Plan (All-in-Vercel)

Monorepo recommended:
- /apps/web (Vue)
- /apps/api (FastAPI)

Vercel:
- Project 1 (frontend): Vue static build
- Project 2 (backend): FastAPI on Vercel Functions (Python runtime) :contentReference[oaicite:5]{index=5}
OR single Vercel project with routing rules:
- /api/* routed to Python functions
- /* to Vue static

Environment Variables:
Frontend:
- API_BASE_URL
- CLERK_PUBLISHABLE_KEY

Backend:
- SUPABASE_DB_URL (pooling/session connection string as appropriate)
- CLERK_JWKS_URL (or Clerk frontend API URL + /.well-known/jwks.json)
- CLERK_ISSUER
- CLERK_AUDIENCE
- ALLOWED_ORIGINS

Notes:
- Serverless cold starts are expected.
- Keep function bundle size under platform limits. :contentReference[oaicite:6]{index=6}

---

## 17) Testing & Quality Gates

Backend:
- Unit tests:
  - constraint logic
  - generator determinism and validity
  - rating updates for win/loss/tie
- Integration tests:
  - generate => games persisted
  - complete => rating_updates + group_players aggregates updated

Frontend:
- Unit tests for Facades with mocked API services
- E2E (Playwright):
  - create group -> add players -> create event -> generate -> score -> complete -> rankings update

---

## 18) MVP Acceptance Criteria
- Single owner can create groups and configure settings
- Players are global; ratings per group
- Event generation supports courts/rounds with participants = courts*4
- Constraints enforced (teammates/opponents rules + previous event teammate rule)
- Rating diff enforced with auto-relax
- Swap within round supported and persisted
- Score entry supports ties
- Completion updates:
  - ratings
  - rankings
  - win rate
  - match history
- Frontend has no Supabase access
- Backend verifies Clerk JWT and enforces group ownership

## 19) UX Design
- Responsive design
- Mobile-first
- Dark mode
- Clean, modern UI
- Professional look and feel
- Clear instructions
- Clear feedback
- Clear error messages
- Easy to use

END PRD