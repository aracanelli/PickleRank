# Architecture Overview

## System Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Clerk       │     │   Vue Frontend  │     │  FastAPI Backend│
│  (Auth Provider)│◄────┤   (Vercel CDN)  ├────►│ (Vercel Functions)│
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │    Supabase     │
                                                │   PostgreSQL    │
                                                └─────────────────┘
```

## Frontend Architecture (MVVM)

### Layers

1. **Views** (Components): Thin presentation layer
   - Render UI and bind to observables
   - No direct HTTP calls
   - No business logic

2. **ViewModels** (Facades): State management
   - Expose reactive state (refs, computed)
   - Handle loading/error states
   - Expose commands (methods)

3. **Services**: Data access
   - HTTP calls to backend API
   - No UI state management

4. **Models**: Domain types
   - DTOs for API communication
   - Domain models for business logic

### Directory Structure

```
src/
├── app/
│   ├── core/           # Cross-cutting concerns
│   │   ├── auth/       # Clerk integration
│   │   ├── http/       # API client
│   │   └── models/     # Shared DTOs
│   └── features/       # Feature modules
│       ├── groups/
│       ├── players/
│       ├── events/
│       └── rankings/
```

## Backend Architecture (Clean Layers)

### Layers

1. **API Layer** (`api/`): HTTP concerns only
   - Request/response validation
   - Route definitions
   - No business logic

2. **Application Layer** (`application/`): Use cases
   - Service orchestration
   - Transaction boundaries
   - Authorization enforcement

3. **Domain Layer** (`domain/`): Pure business rules
   - Matchmaking algorithms
   - Rating calculations
   - No external dependencies

4. **Infrastructure Layer** (`infrastructure/`): External I/O
   - Database repositories
   - External service integrations
   - Auth verification

### Directory Structure

```
app/
├── api/
│   ├── routers/        # FastAPI routes
│   ├── deps/           # Dependencies (auth, db)
│   └── schemas/        # Pydantic models
├── application/
│   ├── services/       # Use case handlers
│   └── policies/       # Authorization
├── domain/
│   ├── matchmaking/    # Scheduling logic
│   └── ratings/        # ELO calculations
└── infrastructure/
    ├── db/             # Database connection
    └── repositories/   # Data access
```

## Security Architecture

### Authentication Flow

1. User logs in via Clerk (frontend)
2. Clerk issues JWT
3. Frontend includes JWT in Authorization header
4. Backend verifies JWT via Clerk JWKS
5. Backend extracts user ID from token

### Authorization

- All group operations verify owner_user_id
- No RLS in Supabase (backend-only access)
- Strict input validation via Pydantic

### API Security

- CORS restricted to frontend origins
- Rate limiting per user/endpoint
- Security headers (HSTS, CSP, etc.)

