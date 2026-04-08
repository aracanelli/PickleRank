-- Migration: Flexible Court Matchmaking
-- Allows 2v1 and 1v1 games when player count doesn't perfectly fill all courts
--
-- Run this against your Supabase PostgreSQL database before deploying the new code.
-- This migration is backwards-compatible: existing 2v2 games are unaffected.

-- 1. Make team1_p2 and team2_p2 nullable to support 1v1 and 2v1 games
--    - 2v2: all four player columns populated (unchanged)
--    - 2v1: team2_p2 is NULL (solo player on team2)
--    - 1v1: team1_p2 AND team2_p2 are NULL
ALTER TABLE games ALTER COLUMN team1_p2 DROP NOT NULL;
ALTER TABLE games ALTER COLUMN team2_p2 DROP NOT NULL;

-- 2. Add game_type column to distinguish match formats
--    Defaults to '2v2' so all existing games are correctly tagged
ALTER TABLE games ADD COLUMN IF NOT EXISTS game_type VARCHAR(3) NOT NULL DEFAULT '2v2';

-- 3. Add CHECK constraint for valid game types
ALTER TABLE games ADD CONSTRAINT games_game_type_check
    CHECK (game_type IN ('2v2', '2v1', '1v1'));
