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
        
        print("Migrations complete.")

    await pool.close()

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(run_migrations())
