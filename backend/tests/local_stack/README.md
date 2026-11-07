# Local test stack

Runs the real FastAPI backend against a throwaway Postgres 16 container and a local
JWKS server that stands in for Clerk. It never touches production. `start.ps1` prints
the effective DB host and aborts if the host contains `supabase` or `pooler` or is not
`localhost`/`127.0.0.1`. It also refuses to start if `backend/.env` exists.

| Piece    | Where                                  |
|----------|----------------------------------------|
| Postgres | `localhost:54329`, container `picklerank-testdb`, user `postgres`, password `picklerank-local-only` |
| JWKS     | `http://localhost:8765/jwks.json` (key in `.keys/`, gitignored) |
| API      | `http://localhost:8000/api` (Swagger at `/docs`) |
| Logs     | `.run/uvicorn.out.log`, `.run/uvicorn.err.log` |

The backend gets these settings as process environment variables: `SUPABASE_DB_URL`,
`CLERK_JWKS_URL`, `CLERK_ISSUER=http://localhost:8765`, `CLERK_AUDIENCE=picklerank-local`,
`ALLOWED_ORIGINS=http://localhost:5199,http://localhost:5173`.

## Usage (from `backend/`)

```powershell
powershell -ExecutionPolicy Bypass -File tests\local_stack\start.ps1
cd tests\local_stack
..\..\.venv\Scripts\python seed.py      # prints group + group player ids as JSON
..\..\.venv\Scripts\python smoke.py     # PASS/FAIL per check, exit 1 on failure
..\..\.venv\Scripts\python mint_token.py user_org   # Bearer token, valid for 12h
cd ..\..
powershell -ExecutionPolicy Bypass -File tests\local_stack\stop.ps1   # also deletes the DB container
```

Users: `user_org` owns "Tuesday Ladder". `user_mem` is linked to player #2 (Daniel Reyes)
as a plain member. Any other `sub` works too, because the backend creates the user row on
the first authenticated request.

For the frontend, point the API base URL at `http://localhost:8000` and send
`Authorization: Bearer <mint_token.py output>` instead of a Clerk session token.

`schema.sql` is rebuilt from the backend SQL. `docs/database-schema.md` is out of date.
