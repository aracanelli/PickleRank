import asyncio
import asyncpg
import os
from dotenv import load_dotenv

def get_db_url():
    try:
        load_dotenv()
        return os.getenv("SUPABASE_DB_URL")
    except (FileNotFoundError, IOError):
        return None

async def test():
    db_url = get_db_url()
    if not db_url:
        raise ValueError("SUPABASE_DB_URL is not set in .env file. Please configure the database URL.")
    print(f"Connecting to database...")
    conn = await asyncpg.connect(db_url)
    try:
        # Test the modified query
        print("Testing list_by_group query...")
        rows = await conn.fetch('''
            SELECT gp.id, gp.group_id, gp.player_id, gp.membership_type, gp.skill_level, gp.role, gp.rating,
                   gp.games_played, gp.wins, gp.losses, gp.ties,
                   p.display_name, u.clerk_user_id as user_id
            FROM group_players gp
            JOIN players p ON p.id = gp.player_id
            LEFT JOIN users u ON u.id = p.user_id
            LIMIT 5
        ''')
        print(f'Query executed successfully, got {len(rows)} rows')
        for row in rows:
            print(f'  Player: {row["display_name"]}, user_id: {row["user_id"]}')
    finally:
        await conn.close()
    print("Done!")

if __name__ == "__main__":
    asyncio.run(test())
