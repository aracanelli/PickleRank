-- Player stats look up games by any of the four player slots (OR query): one index per slot
-- lets Postgres BitmapOr them instead of scanning every game.
CREATE INDEX IF NOT EXISTS idx_games_team1_p1 ON games(team1_p1);
CREATE INDEX IF NOT EXISTS idx_games_team1_p2 ON games(team1_p2);
CREATE INDEX IF NOT EXISTS idx_games_team2_p1 ON games(team2_p1);
CREATE INDEX IF NOT EXISTS idx_games_team2_p2 ON games(team2_p2);

-- Event lists: WHERE group_id = $1 ORDER BY starts_at DESC NULLS LAST, created_at DESC.
CREATE INDEX IF NOT EXISTS idx_events_group_starts_created
    ON events(group_id, starts_at DESC NULLS LAST, created_at DESC);
