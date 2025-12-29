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

    # Connection timeout in seconds - prevents indefinite hangs
    CONNECTION_TIMEOUT = 30
    
    pool = None
    try:
        pool = await asyncio.wait_for(
            asyncpg.create_pool(dsn=db_url),
            timeout=CONNECTION_TIMEOUT
        )
    except asyncio.TimeoutError:
        print(f"Connection timed out after {CONNECTION_TIMEOUT} seconds. "
              "Please check your network connection and database availability.")
        if pool is not None:
            await pool.close()
        return
    except Exception as e:
        print(f"Failed to connect: {e}")
        if pool is not None:
            await pool.close()
        return

    try:
        async with pool.acquire() as conn:
            print("Running migrations...")
            
            async with conn.transaction():
                # 1. Add user_id to players
                print("Adding user_id to players...")
                await conn.execute("""
                    ALTER TABLE players 
                    ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT NULL
                """)

                # 2. Add invite_token to players
                print("Adding invite_token to players...")
                await conn.execute("""
                    ALTER TABLE players 
                    ADD COLUMN IF NOT EXISTS invite_token VARCHAR(255) DEFAULT NULL
                """)
                
                # 3. Add role to group_players
                print("Adding role to group_players...")
                await conn.execute("""
                    ALTER TABLE group_players 
                    ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'PLAYER'
                """)
                
                # 4. Add is_archived to groups
                print("Adding is_archived to groups...")
                await conn.execute("""
                    ALTER TABLE groups 
                    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE
                """)
                
                print("DDL migrations complete.")
        
        # Create indexes CONCURRENTLY outside of transaction block
        # CONCURRENTLY allows non-blocking index creation in production
        # These must run outside any transaction context
        async with pool.acquire() as conn:
            print("Creating indexes concurrently (non-blocking)...")
            
            # Index on user_id for faster lookups
            try:
                print("  Creating idx_players_user_id...")
                exists_user_id = await conn.fetchval("SELECT 1 FROM pg_class WHERE relname = 'idx_players_user_id'")
                if not exists_user_id:
                    await conn.execute("""
                        CREATE INDEX CONCURRENTLY idx_players_user_id ON players(user_id)
                    """)
                    print("  idx_players_user_id created successfully.")
                else:
                    print("  idx_players_user_id already exists.")
            except Exception as e:
                print(f"  Warning: Failed to create idx_players_user_id: {e}")
                print("  You may need to create this index manually or retry.")
            
            # Index on invite_token
            try:
                print("  Creating idx_players_invite_token...")
                exists_invite_token = await conn.fetchval("SELECT 1 FROM pg_class WHERE relname = 'idx_players_invite_token'")
                if not exists_invite_token:
                    await conn.execute("""
                        CREATE INDEX CONCURRENTLY idx_players_invite_token ON players(invite_token)
                    """)
                    print("  idx_players_invite_token created successfully.")
                else:
                    print("  idx_players_invite_token already exists.")
            except Exception as e:
                print(f"  Warning: Failed to create idx_players_invite_token: {e}")
                print("  You may need to create this index manually or retry.")
            
            print("Index creation complete.")
    finally:
        await pool.close()

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(run_migrations())
