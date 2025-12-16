import asyncio
import asyncpg
from pathlib import Path

def get_db_url():
    env_path = Path('.env')
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line.startswith('SUPABASE_DB_URL='):
                value = line.split('=', 1)[1]
                return value.strip().strip("'").strip('"')
    return None

async def test():
    db_url = get_db_url()
    print(f"Connecting to database...")
    conn = await asyncpg.connect(db_url)
    
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
    
    await conn.close()
    print("Done!")

if __name__ == "__main__":
    asyncio.run(test())
