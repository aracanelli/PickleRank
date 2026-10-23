# CI baselines

`npm run check` is the single aggregate project check. It runs backend lint,
format, mypy, and pytest, followed by the frontend lint, TypeScript check,
tests, and production build.

The backend Ruff and mypy checks currently report pre-existing findings. The
aggregate command and the standalone backend lint job run them and label
failures as baseline warnings so the test suite and frontend checks remain
blocking. The warnings are intentionally visible in local output and CI logs;
they must be removed as the backend is cleaned up. New backend test failures
and all frontend failures remain blocking.
