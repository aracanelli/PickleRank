-- Player photos and league logos, stored in Postgres (no external bucket).
-- Additive and idempotent. One row per player-in-league or league (upsert),
-- so storage cannot grow beyond one small re-encoded WebP per subject.
-- kind = 'player' -> ref_id = group_players.id
-- kind = 'group'  -> ref_id = groups.id
CREATE TABLE IF NOT EXISTS images (
    kind TEXT NOT NULL CHECK (kind IN ('player', 'group')),
    ref_id UUID NOT NULL,
    mime TEXT NOT NULL CHECK (mime IN ('image/webp', 'image/jpeg')),
    data BYTEA NOT NULL CHECK (octet_length(data) <= 1048576),
    width INT NOT NULL CHECK (width BETWEEN 1 AND 512),
    height INT NOT NULL CHECK (height BETWEEN 1 AND 512),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (kind, ref_id)
);

-- Only the API (table owner) reads or writes images; keep them away from the Supabase REST roles.
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
