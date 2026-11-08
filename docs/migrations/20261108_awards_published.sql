-- Awards publish step: stat awards and results stay organizer-only until published.
-- NULL = unpublished. Additive and idempotent.
ALTER TABLE award_editions ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL;
