# Performance and offline

How the app stays fast and keeps working on a bad gym connection, what was measured, and what
is still open.

## Before you deploy the backend

Run these in Supabase first, in this order:

1. `docs/migrations/20261113_score_edited_at.sql` (required: game queries read `score_edited_at`;
   without it event detail, scoring and completion fail)
2. `docs/migrations/20261113_perf_indexes.sql` (safe any time; on big tables consider
   `CREATE INDEX CONCURRENTLY` outside a transaction)

Deploy the backend before (or with) the frontend: the frontend sends `editedAt`, `id` on creates
and `force` on reshuffle, which the old backend ignores or rejects.

## How offline works

**Reads.** Every successful GET is kept in localStorage, per signed-in user
(`core/offline/persist.ts`, max 120 entries, oldest dropped first). Screens paint the kept copy
first and refresh in place (`api.get(url, { onCached })`). With no connection, `api.get` returns
the kept copy. Kept copies are wiped on sign-out and account switch. The service worker still
never caches API responses.

**Writes.** User changes go to the outbox (`core/offline/outbox.ts`), a FIFO queue in
localStorage, then to the server one at a time, in order:

| Server answer | Outbox does |
|---|---|
| no response (offline, dropped) | keeps it, retries with backoff forever; retries at once on reconnect or when the app returns to the foreground |
| 5xx, 408, 429 | retries with backoff, then parks it as failed after 5 tries |
| other 4xx | parks it as failed; the sync bar offers Retry / Discard |
| 404 on a DELETE | done (a replay of a delete that already landed) |

Ops with the same `key` coalesce (latest value wins), e.g. one court's score. Failed ops never
block the ops behind them. Unsent ops are stored per user and resume when that user signs in.

**Replays are safe on the server.**
- Creates (league, event, player, add-to-league) carry an id made on the phone; the server
  inserts once and returns the same row on a replay. Another owner's id gets 409.
- Score writes carry `editedAt` (when it was typed, epoch ms, clamped to server now). The server
  keeps the newest edit; an older replay gets 200 with the newer stored game, and the phone shows
  that. This is what stops a phone that was offline from overwriting a newer score from another
  organizer.
- Reshuffling an event that has scores needs `force: true` (the UI sends it after the organizer
  confirms).
- Completing an event twice is harmless.

**Auth offline.** With a session cached on the device the app opens at once without waiting for
Clerk (`provisional` in `stores/auth.ts`), also offline. Without a token it does not send
requests (they would 401 and sign the user out); they wait in the outbox. Clerk retries when the
connection returns. Navigation no longer asks Clerk for a token on every screen change.

**What works offline:** opening any screen visited before, scoring (queued, survives closing the
app), completing an event (queued behind its scores), creating a league, starting an event
(the schedule is made when the queue reaches the server, since matchmaking runs there),
renaming/deleting events and games, roster membership/skill/role/remove.

## Measured

| Change | Before | After | How |
|---|---|---|---|
| First paint, returning signed-in user, Slow 4G (150 ms RTT, 1.6 Mbps) | 5.84–6.24 s | 0.66–0.68 s | prod build + `vite preview`, Playwright, 3 runs each; "before" = boot that waits for Clerk (2.6 MB chunk, 896 KB gzip, plus handshake) |
| Score PATCH queries | ~7 | ~3 | code count |
| Score edit on a completed event (re-rates group) | 1 query per event + per game + per player, no transaction | batched, one transaction | code count; output verified identical by `tests/unit/test_recalculate_ratings.py` |

## Tests

- Unit: frontend `npx vitest run`, backend `pytest` (includes outbox, saver, recalculation parity).
- E2E (fake API): `e2e/offline.e2e.ts`, offline cases in `e2e/scoring-resilience.e2e.ts`.
- Real Postgres: `backend/tests/local_stack/smoke_offline.py` (idempotent creates, last-write-wins,
  regenerate guard, rankings access). Note `schema.sql` lacks the Nov 8 `images` tables; apply
  `docs/migrations/20261108_*.sql` after loading it.

## Not done yet

- Payments (record payment, adjustment, mark paid) and awards still wait for the server: their
  POSTs are not idempotent, so queuing them could double-charge on a replay. They need client ids
  on the server first.
- Bulk add players, new-player create, invites, Spond import, photos, settings save: still online only.
- Event schedules can't be made offline (matchmaking is server-side). Porting the generator to the
  client would allow a full offline night.
- `/groups/{id}/history` has no default limit; adding one needs the awards page to page through.
- The in-process auth user cache keeps a deleted user's id until the instance restarts (no app code
  deletes users today).
