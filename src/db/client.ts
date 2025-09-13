import { Pool, PoolClient } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    // Fail fast in production if DATABASE_URL is missing
    if (!process.env.DATABASE_URL) {
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ DATABASE_URL is required in production');
        process.exit(1);
      } else {
        console.warn('⚠️  DATABASE_URL not set - database operations will fail');
      }
    }
    
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      console.error('🔥 [DB] Unexpected database pool error:', err);
    });
  }
  return pool;
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}