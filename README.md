# Pickleball Event Matchmaking & Ranking Platform

A web application for organizing 2v2 pickleball matchups, managing events, tracking ratings, and maintaining rankings across multiple groups/leagues.

## Tech Stack

- **Frontend**: Vue 3 + TypeScript + Vite
- **Backend**: Python FastAPI (Vercel Functions)
- **Authentication**: Clerk (JWT)
- **Database**: Supabase Postgres

## Features

- 🏓 Multi-group support with custom settings per group
- 📊 Two rating systems: Serious Elo & Catch-Up mode
- 🎯 Smart matchmaking with teammate/opponent constraints
- 📈 Rankings, match history, and win rate tracking
- 🔄 Real-time event management with player swaps
- 📱 Responsive, mobile-first design with dark mode

## Project Structure

```
/
├── frontend/          # Vue 3 + TypeScript application
├── backend/           # FastAPI application
├── docs/              # Architecture and API documentation
└── vercel.json        # Vercel deployment configuration
```

## Prerequisites

- Node.js 20+
- Python 3.11+
- Clerk account (for authentication)
- Supabase account (for database)

## Environment Setup

### 1. Clone and Install

```bash
# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` in both frontend and backend directories and fill in your values.

#### Frontend (.env)
```
VITE_API_BASE_URL=http://localhost:8000
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

#### Backend (.env)
```
SUPABASE_DB_URL=postgresql://...
CLERK_JWKS_URL=https://your-clerk-instance.clerk.accounts.dev/.well-known/jwks.json
CLERK_ISSUER=https://your-clerk-instance.clerk.accounts.dev
CLERK_AUDIENCE=your-audience
ALLOWED_ORIGINS=http://localhost:5173
```

### 3. Database Setup

Run the SQL migrations in your Supabase SQL editor (see `docs/database-schema.md`).

## Development

### Run Backend
```bash
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

### Run Frontend
```bash
cd frontend
npm run dev
```

### Run Tests
```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm run test
```

## Deployment

The application is designed to be deployed on Vercel:

1. Connect your repository to Vercel
2. Set up two projects:
   - Frontend: Root directory = `frontend`
   - Backend: Root directory = `backend`
3. Configure environment variables in Vercel dashboard
4. Deploy!

## API Documentation

Once running, visit `http://localhost:8000/docs` for interactive API documentation.

## License

MIT

