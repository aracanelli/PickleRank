-- Last-write-wins for scores by edit time (offline-first clients replay queued edits later).
-- PATCH /api/games/{id}/score only overwrites when the stored edit is not newer.
-- NULL = never scored through the API since this migration (any edit wins).
-- Apply BEFORE deploying the backend that selects this column.
ALTER TABLE games ADD COLUMN IF NOT EXISTS score_edited_at TIMESTAMPTZ;
