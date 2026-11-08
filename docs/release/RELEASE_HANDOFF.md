# PickleRank "Court Card" redesign: release handoff (rebuilt on current main)

Branch `claude/court-card-v2`, built on `origin/main` `7f17c5c`. The earlier `claude/mobile-rc` was built on an outdated main and is superseded by this branch.

## What this branch does
- **Replaces main's Courtside presentation layer with Court Card.**
  - Every matchup is a court seen from above.
  - Atkinson Hyperlegible Next for text, Barlow Condensed for numbers.
  - Contrast-tested light and dark tokens, with Light, Dark or Match phone kept from main's theme store.
  - Tailwind, the old component kit and confetti are removed.
- **Keeps all of main's newer features**, rebuilt in Court Card:
  - **Awards:** stat awards, categories, voting, results.
  - **Spond:** connect, link a group, and import attendees on a new event, capped at courts×4.
  - **Live tools:** sync with other organizers every 8 seconds, screen wake lock, swap two players, change a court's players, delete a game, and rating changes shown after completion.
  - **Analysis:** head-to-head, form guide, hot and cold streaks, history date filters, and player rename and notes.
  - **Platform:** the PWA and the help screen.
- **Scoring safety from the original redesign:**
  - Score saves queue per game and survive a reload.
  - A failed save shows "Retry court N" in the thumb zone.
  - Complete is only offered once every game is saved.
  - Changing a court's players blocks anyone already on another court that round. Main's sheet didn't check this.
- **Backend fixes**, each with a test:
  - **Payments null crash:** with main's transactional completion, a league whose `paymentSettings` is null failed **every** event completion. Sub charging crashed and rolled the whole completion back.
  - **Stale rankings:** the rankings cache is cleared after commit, and responses are `private, no-cache`.
  - **History:** scores of 0 are kept.
  - **Rating history:** members no longer get a 500.
- Supabase is unchanged: database config, `db.py` and `vercel.json` are identical to main.

## Verification (2026-11-07, on the final commit)
| Gate | Command (from `frontend/` unless noted) | Result |
|---|---|---|
| Type check | `npm run type-check` | pass |
| Unit tests | `npm test -- --run` | 21 files, 210 tests pass |
| Lint (non-mutating) | `npm run lint` | 0 errors, 19 warnings (`no-explicit-any`) |
| Build | `npm run build` | pass (PWA generated); no fixture code in `dist` |
| E2E, fixtures | `npx playwright test` | 354 passed, 3 skipped (keyboard-only on WebKit by design), 0 failed |
| E2E, real backend | `npx playwright test -c playwright.real.config.ts` (tokens from `backend/tests/local_stack`) | 2 passed, Chromium 375 and WebKit 390; 0 HTTP 500s |
| Backend tests | `backend/.venv/Scripts/python -m pytest -q` | 115 passed |
| Backend API smoke | `backend/tests/local_stack/smoke.py` | 36/36 pass |
| Backend lint | `ruff check` | changed files add no findings over main (main's ruff baseline is documented in `docs/CI-BASELINES.md`) |

The fixture matrix runs Chromium and WebKit at 320, 375 and 390 wide, light and dark, plus desktop. It covers:
- **Flows:** league-night slice, scoring resilience, live tools, Awards, Spond import, and member denial.
- **On every route:** axe WCAG 2.2 AA, at least 44px targets, no overflow, one h1, and refresh.
- **Accessibility settings:** keyboard scoring, 200% text, reduced motion.

The real-backend run uses the real FastAPI code against a local Docker Postgres. Clerk is replaced by locally minted tokens. The start script refuses any Supabase host.

Screenshots (fixture data) are in `docs/release/screenshots/`: 23 states in each of `light/` and `dark/` at 375 wide, plus 6 in `light-320/`.

## Not verified
- **Physical iPhone Safari and Android Chrome**, including the on-screen numeric keyboard.
- **Real Clerk sign-in widget** (mocked in every run).
- **Real Spond servers.** Only the fake Spond API was exercised.
- **Vercel preview.** Nothing has been deployed.

## Dropped from main's Courtside, as decoration
Confetti and the "event complete" flash, the podium, trading-card headers, count-up numbers, stat-tile grids, avatars and pull-to-refresh. Refresh buttons replace pull-to-refresh.

## Known issues not fixed
- Invite tokens aren't cleared after linking (`player_service.py`).
- Score saves are last-write-wins. Live sync narrows the window but doesn't remove it.
- Regenerating a schedule deletes its scores. The UI confirms first and states the count.
