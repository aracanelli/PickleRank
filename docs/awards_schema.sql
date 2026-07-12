-- Awards feature schema (run in the Supabase SQL editor).
-- Idempotent: safe to run multiple times.
-- Requires the uuid-ossp extension (uuid_generate_v4) and the shared
-- update_updated_at_column() trigger function, both already present in the
-- PickleRank schema.

-- Award editions: one snapshot per "awards run" for a group.
CREATE TABLE IF NOT EXISTS award_editions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'VOTING_OPEN', 'CLOSED')),
    stat_awards JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_award_editions_group ON award_editions(group_id);

-- Voting categories within an edition.
CREATE TABLE IF NOT EXISTS award_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    edition_id UUID NOT NULL REFERENCES award_editions(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_award_categories_edition ON award_categories(edition_id);

-- Votes: one row per voter per category (enforced by the UNIQUE constraint).
CREATE TABLE IF NOT EXISTS award_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL REFERENCES award_categories(id) ON DELETE CASCADE,
    voter_group_player_id UUID NOT NULL REFERENCES group_players(id) ON DELETE CASCADE,
    nominee_group_player_id UUID NOT NULL REFERENCES group_players(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (category_id, voter_group_player_id)
);

CREATE INDEX IF NOT EXISTS idx_award_votes_category ON award_votes(category_id);

-- updated_at triggers (drop-then-create for idempotency).
DROP TRIGGER IF EXISTS update_award_editions_updated_at ON award_editions;
CREATE TRIGGER update_award_editions_updated_at
    BEFORE UPDATE ON award_editions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_award_votes_updated_at ON award_votes;
CREATE TRIGGER update_award_votes_updated_at
    BEFORE UPDATE ON award_votes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
