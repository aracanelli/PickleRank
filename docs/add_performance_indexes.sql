-- =====================================================
-- Performance Indexes for PickleRank Database
-- Run this in your Supabase SQL Editor
-- =====================================================

-- Games table indexes
-- Speeds up: fetching games by event, history queries, sorting by date
CREATE INDEX IF NOT EXISTS idx_games_event_id ON games(event_id);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at DESC);

-- Group players table indexes  
-- Speeds up: player list queries, rankings ordering by rating
CREATE INDEX IF NOT EXISTS idx_group_players_group_id ON group_players(group_id);
CREATE INDEX IF NOT EXISTS idx_group_players_rating ON group_players(group_id, rating DESC);

-- Events table indexes
-- Speeds up: listing events by group/status, sorting by date
CREATE INDEX IF NOT EXISTS idx_events_group_id_status ON events(group_id, status);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);

-- Rating updates table indexes
-- Speeds up: event rating history queries, player rating history
CREATE INDEX IF NOT EXISTS idx_rating_updates_event_id ON rating_updates(event_id);
CREATE INDEX IF NOT EXISTS idx_rating_updates_player_id ON rating_updates(group_player_id);

-- Composite index for common history query pattern
CREATE INDEX IF NOT EXISTS idx_games_group_created ON games(event_id, created_at DESC);

-- =====================================================
-- NEW: Indexes for get_last_event_deltas optimization
-- These speed up the rating delta calculation query
-- =====================================================

-- Composite index for faster event lookup by group, status, and date
CREATE INDEX IF NOT EXISTS idx_events_group_status_date 
ON events(group_id, status, starts_at DESC, created_at DESC);

-- Composite index for rating_updates with event and player lookup
CREATE INDEX IF NOT EXISTS idx_rating_updates_event_player 
ON rating_updates(event_id, group_player_id, rating_before);

-- =====================================================
-- To verify indexes were created, run:
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public';
-- =====================================================

