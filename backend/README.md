# Pickleball API Backend

FastAPI backend for the Pickleball Event Matchmaking & Ranking Platform.

## Setup

### 1. Create Virtual Environment

```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `SUPABASE_DB_URL`: Your Supabase PostgreSQL connection string
- `CLERK_JWKS_URL`: Clerk JWKS endpoint for JWT verification
- `CLERK_ISSUER`: Clerk issuer URL
- `ALLOWED_ORIGINS`: Comma-separated list of allowed frontend origins

### 4. Run Development Server

```bash
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.
- API docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/api/health`

## Testing

Run all tests:

```bash
pytest
```

Run with coverage:

```bash
pytest --cov=app --cov-report=html
```

## Project Structure

```
app/
├── api/                 # HTTP layer (routes, schemas)
│   ├── deps/           # Dependencies (auth, db)
│   ├── middleware/     # CORS, security headers
│   ├── routers/        # API endpoints
│   └── schemas/        # Pydantic models
├── application/        # Use cases / services
│   └── services/       # Business logic orchestration
├── domain/             # Pure business rules
│   ├── matchmaking/    # Schedule generation
│   └── ratings/        # ELO calculations
└── infrastructure/     # External integrations
    ├── auth/           # Clerk JWT verification
    ├── db/             # Database connection
    └── repositories/   # Data access
```

## API Overview

### Authentication
All endpoints (except `/api/health`) require a valid Clerk JWT in the `Authorization: Bearer <token>` header.

### Main Endpoints

- `POST /api/groups` - Create a group
- `GET /api/groups` - List your groups
- `POST /api/players` - Create a global player
- `POST /api/groups/{id}/players` - Add player to group
- `POST /api/groups/{id}/events` - Create event
- `POST /api/events/{id}/generate` - Generate schedule
- `PATCH /api/games/{id}/score` - Update score
- `POST /api/events/{id}/complete` - Complete event & update ratings
- `GET /api/groups/{id}/rankings` - Get rankings

## Deployment

The app is configured for Vercel deployment. See `vercel.json` for configuration.



