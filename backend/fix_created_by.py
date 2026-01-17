"""Quick migration to make created_by nullable."""
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

async def run():
    db_url = get_db_url()
    conn = await asyncpg.connect(db_url)
    try:
        await conn.execute("ALTER TABLE sub_payments ALTER COLUMN created_by DROP NOT NULL")
        print("Column created_by is now nullable")
    except Exception as e:
        print(f"Migration result: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(run())
