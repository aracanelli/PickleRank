-- PickleRank schema reconstructed from backend code (LOCAL TEST STACK ONLY).
-- Sources: app/infrastructure/repositories/*.py, app/application/services/*.py,
-- app/api/deps/auth.py, run_migration.py, fix_created_by.py,
-- docs/database-schema.md, docs/add_performance_indexes.sql.
-- docs/database-schema.md is stale; this file is the union of it plus later migrations.
-- Requires PostgreSQL 13+ (gen_random_uuid() is builtin).

-- users: one row per Clerk subject, upserted by app/api/deps/auth.py on every request.
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sport TEXT DEFAULT 'pickleball',
    settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,  -- run_migration.py (nullable there; code compares = FALSE)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_groups_owner ON groups(owner_user_id);

CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    notes TEXT,
    -- run_migration.py adds user_id without an FK; code joins users u ON u.id = p.user_id.
    user_id UUID DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
    invite_token VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_players_owner ON players(owner_user_id);
CREATE INDEX idx_players_name ON players(display_name);
CREATE INDEX idx_players_user_id ON players(user_id);
CREATE INDEX idx_players_invite_token ON players(invite_token);

CREATE TYPE membership_type AS ENUM ('PERMANENT', 'SUB');

CREATE TABLE group_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    membership_type membership_type NOT NULL DEFAULT 'PERMANENT',
    skill_level TEXT DEFAULT NULL CHECK (skill_level IN ('ADVANCED', 'INTERMEDIATE', 'BEGINNER')),
    role VARCHAR(50) NOT NULL DEFAULT 'PLAYER' CHECK (role IN ('PLAYER', 'ORGANIZER')),
    rating NUMERIC(10, 2) NOT NULL DEFAULT 1000,
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    ties INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (group_id, player_id)
);
CREATE INDEX idx_group_players_group ON group_players(group_id);
CREATE INDEX idx_group_players_player ON group_players(player_id);
CREATE INDEX idx_group_players_rating ON group_players(group_id, rating DESC);

CREATE TYPE event_status AS ENUM ('DRAFT', 'GENERATED', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name TEXT,
    starts_at TIMESTAMPTZ,
    courts INTEGER NOT NULL CHECK (courts >= 1),
    rounds INTEGER NOT NULL CHECK (rounds >= 1),
    status event_status DEFAULT 'DRAFT',
    generation_meta JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_events_group ON events(group_id);
CREATE INDEX idx_events_status ON events(group_id, status);
CREATE INDEX idx_events_date ON events(group_id, starts_at DESC);
CREATE INDEX idx_events_created_at ON events(created_at DESC);
CREATE INDEX idx_events_group_status_date ON events(group_id, status, starts_at DESC, created_at DESC);

CREATE TABLE event_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    group_player_id UUID NOT NULL REFERENCES group_players(id) ON DELETE CASCADE,
    UNIQUE (event_id, group_player_id)
);
CREATE INDEX idx_event_participants_event ON event_participants(event_id);

CREATE TYPE game_result AS ENUM ('TEAM1_WIN', 'TEAM2_WIN', 'TIE', 'UNSET');

CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    round_index INTEGER NOT NULL CHECK (round_index >= 0),
    court_index INTEGER NOT NULL CHECK (court_index >= 0),
    team1_p1 UUID NOT NULL REFERENCES group_players(id),
    team1_p2 UUID NOT NULL REFERENCES group_players(id),
    team2_p1 UUID NOT NULL REFERENCES group_players(id),
    team2_p2 UUID NOT NULL REFERENCES group_players(id),
    score_team1 NUMERIC(5, 1),
    score_team2 NUMERIC(5, 1),
    team1_elo NUMERIC(10, 2),
    team2_elo NUMERIC(10, 2),
    result game_result DEFAULT 'UNSET',
    swapped BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_games_event ON games(event_id);
CREATE INDEX idx_games_round ON games(event_id, round_index);
CREATE INDEX idx_games_created_at ON games(created_at DESC);
CREATE INDEX idx_games_group_created ON games(event_id, created_at DESC);

CREATE TABLE rating_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    group_player_id UUID NOT NULL REFERENCES group_players(id) ON DELETE CASCADE,
    rating_before NUMERIC(10, 2) NOT NULL,
    rating_after NUMERIC(10, 2) NOT NULL,
    delta NUMERIC(10, 2) NOT NULL,
    system TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_rating_updates_event ON rating_updates(event_id);
CREATE INDEX idx_rating_updates_player ON rating_updates(group_player_id);
CREATE INDEX idx_rating_updates_event_player ON rating_updates(event_id, group_player_id, rating_before);

-- run_migration.py + fix_created_by.py (created_by nullable)
CREATE TABLE sub_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    group_player_id UUID NOT NULL REFERENCES group_players(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('ATTENDANCE', 'PAYMENT', 'ADJUSTMENT')),
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sub_payments_group ON sub_payments(group_id);
CREATE INDEX idx_sub_payments_player ON sub_payments(group_player_id);
CREATE INDEX idx_sub_payments_event ON sub_payments(event_id);

-- audit_logs: in docs + AuditRepository, currently not called by any service.
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    payload JSONB,
    actor_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_group ON audit_logs(group_id);
CREATE INDEX idx_audit_logs_event ON audit_logs(event_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_players_updated_at BEFORE UPDATE ON players
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_group_players_updated_at BEFORE UPDATE ON group_players
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Added on main after 0e17ac8 (backend/run_migration.py sections 7-8 and
-- docs/migrations/20261023_event_completion_idempotency.sql)
-- ---------------------------------------------------------------------------

CREATE TABLE award_editions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'VOTING_OPEN', 'CLOSED')),
    stat_awards JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_award_editions_group ON award_editions(group_id);

CREATE TABLE award_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    edition_id UUID NOT NULL REFERENCES award_editions(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_award_categories_edition ON award_categories(edition_id);

CREATE TABLE award_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES award_categories(id) ON DELETE CASCADE,
    voter_group_player_id UUID NOT NULL REFERENCES group_players(id) ON DELETE CASCADE,
    nominee_group_player_id UUID NOT NULL REFERENCES group_players(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (category_id, voter_group_player_id)
);
CREATE INDEX idx_award_votes_category ON award_votes(category_id);
CREATE TRIGGER update_award_editions_updated_at BEFORE UPDATE ON award_editions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_award_votes_updated_at BEFORE UPDATE ON award_votes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE spond_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    spond_email TEXT NOT NULL,
    encrypted_credentials TEXT NOT NULL,
    access_token TEXT,
    token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE spond_group_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL UNIQUE REFERENCES groups(id) ON DELETE CASCADE,
    spond_group_id TEXT NOT NULL,
    spond_group_name TEXT,
    linked_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE spond_member_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    spond_member_id TEXT NOT NULL,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (group_id, spond_member_id)
);
CREATE INDEX idx_spond_member_links_group ON spond_member_links(group_id);
CREATE TRIGGER update_spond_accounts_updated_at BEFORE UPDATE ON spond_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE UNIQUE INDEX uq_rating_updates_event_player ON rating_updates (event_id, group_player_id);
CREATE UNIQUE INDEX uq_sub_payments_attendance_event_player
    ON sub_payments (event_id, group_player_id, payment_type) WHERE payment_type = 'ATTENDANCE';
