# Database Schema

Run these migrations in your Supabase SQL editor.

## Tables

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (synced from Clerk)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_user_id TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_clerk_id ON users(clerk_user_id);

-- Groups table
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sport TEXT DEFAULT 'pickleball',
    settings_json JSONB NOT NULL DEFAULT '{
        "ratingSystem": "SERIOUS_ELO",
        "initialRating": 1000,
        "kFactor": 32,
        "eloDiff": 0.05,
        "noRepeatTeammateInEvent": true,
        "noRepeatTeammateFromPreviousEvent": true,
        "noRepeatOpponentInEvent": true,
        "autoRelaxEloDiff": true,
        "autoRelaxStep": 0.01,
        "autoRelaxMaxEloDiff": 0.25
    }'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_groups_owner ON groups(owner_user_id);

-- Players table (global)
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_players_owner ON players(owner_user_id);
CREATE INDEX idx_players_name ON players(display_name);

-- Membership type enum for group players
CREATE TYPE membership_type AS ENUM ('PERMANENT', 'SUB');

-- Group Players table (player membership in group with ratings)
CREATE TABLE group_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    membership_type membership_type NOT NULL DEFAULT 'PERMANENT',
    skill_level TEXT DEFAULT NULL, -- 'ADVANCED', 'INTERMEDIATE', 'BEGINNER' for subs
    rating NUMERIC(10, 2) NOT NULL DEFAULT 1000,
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    ties INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, player_id)
);

CREATE INDEX idx_group_players_group ON group_players(group_id);
CREATE INDEX idx_group_players_player ON group_players(player_id);
CREATE INDEX idx_group_players_rating ON group_players(group_id, rating DESC);

-- Events table
CREATE TYPE event_status AS ENUM ('DRAFT', 'GENERATED', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Event Participants table
CREATE TABLE event_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    group_player_id UUID NOT NULL REFERENCES group_players(id) ON DELETE CASCADE,
    UNIQUE(event_id, group_player_id)
);

CREATE INDEX idx_event_participants_event ON event_participants(event_id);

-- Games table
CREATE TYPE game_result AS ENUM ('TEAM1_WIN', 'TEAM2_WIN', 'TIE', 'UNSET');

CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Rating Updates table (audit trail)
CREATE TABLE rating_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Audit Logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_groups_updated_at
    BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_players_updated_at
    BEFORE UPDATE ON players
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_group_players_updated_at
    BEFORE UPDATE ON group_players
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_games_updated_at
    BEFORE UPDATE ON games
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## Views (Optional Helpers)

```sql
-- Rankings view with win rate calculation
CREATE OR REPLACE VIEW v_rankings AS
SELECT 
    gp.id,
    gp.group_id,
    gp.player_id,
    p.display_name,
    gp.membership_type,
    gp.rating,
    gp.games_played,
    gp.wins,
    gp.losses,
    gp.ties,
    CASE 
        WHEN gp.games_played > 0 
        THEN ROUND((gp.wins + 0.5 * gp.ties)::NUMERIC / gp.games_played, 3)
        ELSE 0 
    END AS win_rate,
    RANK() OVER (PARTITION BY gp.group_id ORDER BY gp.rating DESC) as rank
FROM group_players gp
JOIN players p ON p.id = gp.player_id;

-- Match history view
CREATE OR REPLACE VIEW v_match_history AS
SELECT 
    g.id as game_id,
    g.event_id,
    e.name as event_name,
    e.starts_at as event_date,
    e.group_id,
    g.round_index,
    g.court_index,
    g.team1_p1,
    g.team1_p2,
    g.team2_p1,
    g.team2_p2,
    g.score_team1,
    g.score_team2,
    g.result,
    p1.display_name as team1_p1_name,
    p2.display_name as team1_p2_name,
    p3.display_name as team2_p1_name,
    p4.display_name as team2_p2_name
FROM games g
JOIN events e ON e.id = g.event_id
JOIN group_players gp1 ON gp1.id = g.team1_p1
JOIN group_players gp2 ON gp2.id = g.team1_p2
JOIN group_players gp3 ON gp3.id = g.team2_p1
JOIN group_players gp4 ON gp4.id = g.team2_p2
JOIN players p1 ON p1.id = gp1.player_id
JOIN players p2 ON p2.id = gp2.player_id
JOIN players p3 ON p3.id = gp3.player_id
JOIN players p4 ON p4.id = gp4.player_id
WHERE e.status = 'COMPLETED';
```




