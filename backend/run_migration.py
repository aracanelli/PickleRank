import asyncio
import os
import sys
import asyncpg
from pathlib import Path

def get_db_url():
    """Extract SUPABASE_DB_URL from .env file manually."""
    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        print("No .env file found at:", env_path)
        return None
    
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("SUPABASE_DB_URL="):
                # Handle quoted values if present
                value = line.split("=", 1)[1]
                return value.strip().strip("'").strip('"')
                
    # Fallback to os.environ
    return os.environ.get("SUPABASE_DB_URL")

async def run_migrations():
    print("Connecting to database...")
    db_url = get_db_url()
    if not db_url:
        print("Could not find SUPABASE_DB_URL in .env or environment")
        return

    try:
        pool = await asyncpg.create_pool(dsn=db_url)
    except Exception as e:
        print(f"Failed to connect: {e}")
        return

    async with pool.acquire() as conn:
        print("Running migrations...")
        
        # 1. Add user_id to players
        print("Adding user_id to players...")
        await conn.execute("""
            ALTER TABLE players 
            ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT NULL
        """)
        
        # Index on user_id for faster lookups
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_players_user_id ON players(user_id)
        """)

        # 2. Add invite_token to players
        print("Adding invite_token to players...")
        await conn.execute("""
            ALTER TABLE players 
            ADD COLUMN IF NOT EXISTS invite_token VARCHAR(255) DEFAULT NULL
        """)
        
        # Index on invite_token
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_players_invite_token ON players(invite_token)
        """)
        
        # 3. Add role to group_players
        print("Adding role to group_players...")
        await conn.execute("""
            ALTER TABLE group_players 
            ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'PLAYER'
        """)
        
        # 5. Add is_archived to groups
        print("Adding is_archived to groups...")
        await conn.execute("""
            ALTER TABLE groups 
            ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE
        """)
        
        # 6. Create sub_payments table for payment tracking
        print("Creating sub_payments table...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS sub_payments (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
                group_player_id UUID NOT NULL REFERENCES group_players(id) ON DELETE CASCADE,
                amount NUMERIC(10, 2) NOT NULL,
                event_id UUID REFERENCES events(id) ON DELETE SET NULL,
                payment_type TEXT NOT NULL CHECK (payment_type IN ('ATTENDANCE', 'PAYMENT', 'ADJUSTMENT')),
                notes TEXT,
                created_by UUID REFERENCES users(id),
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        
        # Indexes for sub_payments
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_sub_payments_group ON sub_payments(group_id)
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_sub_payments_player ON sub_payments(group_player_id)
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_sub_payments_event ON sub_payments(event_id)
        """)

        # 7. Create Awards feature tables (editions, categories, votes)
        print("Creating award_editions table...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS award_editions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'VOTING_OPEN', 'CLOSED')),
                stat_awards JSONB NOT NULL DEFAULT '[]'::jsonb,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_award_editions_group ON award_editions(group_id)
        """)

        print("Creating award_categories table...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS award_categories (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                edition_id UUID NOT NULL REFERENCES award_editions(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_award_categories_edition ON award_categories(edition_id)
        """)

        print("Creating award_votes table...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS award_votes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                category_id UUID NOT NULL REFERENCES award_categories(id) ON DELETE CASCADE,
                voter_group_player_id UUID NOT NULL REFERENCES group_players(id) ON DELETE CASCADE,
                nominee_group_player_id UUID NOT NULL REFERENCES group_players(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE (category_id, voter_group_player_id)
            )
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_award_votes_category ON award_votes(category_id)
        """)

        # updated_at triggers for awards tables (drop-then-create for idempotency)
        print("Creating awards updated_at triggers...")
        await conn.execute("""
            DROP TRIGGER IF EXISTS update_award_editions_updated_at ON award_editions
        """)
        await conn.execute("""
            CREATE TRIGGER update_award_editions_updated_at
                BEFORE UPDATE ON award_editions
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
        """)
        await conn.execute("""
            DROP TRIGGER IF EXISTS update_award_votes_updated_at ON award_votes
        """)
        await conn.execute("""
            CREATE TRIGGER update_award_votes_updated_at
                BEFORE UPDATE ON award_votes
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
        """)

        print("Migrations complete.")

    await pool.close()

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(run_migrations())
