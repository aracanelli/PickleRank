# Repo Structure (Root-level Frontend + Backend)
Goal: Make the project immediately understandable to any developer, enforce a clean frontend/backend split, and support MVVM on the frontend with clean domain/service layering on the backend.

This structure assumes a single Git repo with two top-level folders:
- /frontend (Angular app)
- /backend (FastAPI app deployed on Vercel)

---

## Root
/
  README.md
  .gitignore
  .editorconfig
  .env.example
  docker-compose.dev.yml              # optional local dev (postgres via Supabase connection only; no extra DB)
  vercel.json                         # routing if using a single Vercel project
  docs/
    architecture.md
    api-contracts.md
    database-schema.md
    security.md
  frontend/
  backend/

---

## Frontend (Angular, MVVM-first)
/frontend
  package.json
  angular.json
  tsconfig.json
  .env.example                        # only public env (no secrets)
  src/
    main.ts
    styles.css
    index.html
    assets/
    environments/
      environment.ts                  # dev
      environment.prod.ts             # prod (API base url, Clerk publishable key)
    app/
      app.component.ts
      app.routes.ts
      app.config.ts

      core/                           # cross-cutting concerns (no feature logic)
        auth/                         # Clerk integration wrappers + guards
          clerk.service.ts
          auth.guard.ts
          tokens.interceptor.ts       # attaches Bearer token to API requests
        http/
          api-client.ts               # typed wrapper around HttpClient
          http-error.mapper.ts
        config/
          app-config.ts
        models/                       # shared DTOs + domain models used across features
          dto/
            group.dto.ts
            player.dto.ts
            event.dto.ts
            game.dto.ts
            ranking.dto.ts
          domain/
            group.model.ts
            player.model.ts
            event.model.ts
            game.model.ts
          mappers/
            group.mapper.ts
            event.mapper.ts
        ui/                           # shared UI primitives (buttons, cards, etc.)
          components/
          layout/
        util/
          date.util.ts
          math.util.ts

      features/                       # each feature is MVVM structured and isolated
        groups/
          views/                      # Views: components/pages only
            groups-page/
            group-detail-page/
            group-settings-panel/
          facades/                    # ViewModels: Facade services exposing Observables + commands
            groups.facade.ts
            group-detail.facade.ts
          services/                   # Data access + adapters (calls backend API)
            groups.api.ts
          state/                      # optional (ComponentStore, signals, etc.)
            groups.store.ts
          models/                     # feature-specific models (if needed)
            group-settings.model.ts
        players/
          views/
            players-page/
            player-profile-page/
          facades/
            players.facade.ts
            player-profile.facade.ts
          services/
            players.api.ts
          state/
        events/
          views/
            events-page/
            create-event-wizard/
            event-live-page/
          components/
            round-selector/
            court-game-card/
            swap-mode-banner/
            score-entry/
          facades/
            events.facade.ts
            event-live.facade.ts
          services/
            events.api.ts
          state/
        rankings/
          views/
            rankings-page/
          facades/
            rankings.facade.ts
          services/
            rankings.api.ts

      shared/                         # optional: shared feature helpers
        validators/
        pipes/
        directives/

  tests/
    unit/
    e2e/                              # Playwright (optional here; can also be at repo root)

Frontend MVVM Rules (developer clarity):
- Views do not call HttpClient directly.
- Views only bind to Observables/signals exposed by Facades.
- Facades orchestrate:
  - loading state
  - error state
  - derived view state
  - commands (generate, swap, complete)
- Services do HTTP only (no UI state).
- Domain mapping lives in mappers (DTO -> domain model).

---

## Backend (FastAPI, clean layering, Vercel deployable)
/backend
  requirements.txt
  pyproject.toml                      # optional (uv/poetry)
  .env.example                        # secrets live in Vercel env, not committed
  vercel.json                         # optional if deploying backend as its own Vercel project
  README.md

  app/
    main.py                           # FastAPI app entrypoint
    config.py                         # env parsing (Pydantic settings)
    logging_config.py
    exceptions.py                     # global exception types + handlers

    api/                              # HTTP layer only
      routers/
        health.py
        groups.py
        players.py
        events.py
        rankings.py
      deps/
        auth.py                       # Clerk JWT verification dependency (JWKS)
        db.py                         # DB session/connection acquisition (serverless-safe)
      middleware/
        cors.py
        rate_limit.py                 # optional MVP but recommended
      schemas/                        # Pydantic request/response models (DTOs)
        groups.py
        players.py
        events.py
        games.py
        rankings.py

    domain/                           # pure business rules (no FastAPI, no DB)
      matchmaking/
        constraints.py                # teammate/opponent rules, validation helpers
        generator.py                  # schedule generation algorithm
        scoring.py                    # rating-diff scoring utilities
      ratings/
        base.py                       # rating strategy interface
        serious_elo.py
        catch_up_elo.py
      models.py                       # lightweight domain dataclasses (optional)

    application/                      # use cases / orchestration (transaction boundaries)
      services/
        group_service.py
        player_service.py
        event_service.py              # create event, generate, swap, score, complete
        ranking_service.py
      policies/
        authorization.py              # ownership checks (group owner)
      validators/
        input_validators.py           # extra validation beyond Pydantic (if needed)

    infrastructure/                   # IO: database + external integrations
      db/
        connection.py                 # Supabase Postgres connection helpers (pooler-friendly)
        queries.py                    # shared SQL fragments/helpers
      repositories/
        groups_repo.py
        players_repo.py
        group_players_repo.py
        events_repo.py
        games_repo.py
        rankings_repo.py
        audit_repo.py
      auth/
        clerk_jwt.py                  # JWKS fetch/cache + token verify
      time/
        clock.py                      # injectable clock for testability

  tests/
    unit/
      test_constraints.py
      test_generator_determinism.py
      test_ratings_serious.py
      test_ratings_catchup.py
    integration/
      test_generate_event_persists_games.py
      test_complete_event_updates_ratings.py

Backend Layering Rules (developer clarity):
- Routers contain no business logic (just parse/validate + call Application services).
- Application services enforce authorization + transactions + audit logging.
- Domain is pure and heavily unit-tested.
- Infrastructure is the only layer that talks to Supabase Postgres.
- Auth verification is a dependency injected into routes (Clerk JWT).

---

## Vercel Deployment Layout Options

### Two Vercel Projects (still one repo)
- Project 1: /frontend
- Project 2: /backend
Pros: simplest builds, clean separation, clear logs, independent deploys.

---

## Root .env.example (for clarity only; real secrets live in Vercel)
# Frontend (public)
FRONTEND_API_BASE_URL=
FRONTEND_CLERK_PUBLISHABLE_KEY=

# Backend (server-only)
BACKEND_SUPABASE_DB_URL=
BACKEND_CLERK_JWKS_URL=
BACKEND_CLERK_ISSUER=
BACKEND_CLERK_AUDIENCE=
BACKEND_ALLOWED_ORIGINS=

---

## Developer Onboarding (what should be in README.md)
1) Setup Clerk keys (publishable on frontend, issuer/JWKS on backend)
2) Setup Supabase DB and set BACKEND_SUPABASE_DB_URL
3) Run locally:
   - frontend: npm install && npm run start
   - backend: python -m venv .venv && pip install -r requirements.txt && uvicorn app.main:app --reload
4) Confirm health:
   - GET backend /api/health
   - Login and fetch /api/groups

END STRUCTURE