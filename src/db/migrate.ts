import { getPool } from './client.js';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const migrateFilename = fileURLToPath(import.meta.url);
const migrateDirname = dirname(migrateFilename);

export async function runMigrations(logger?: { info: (msg: string, data?: any) => void; error: (msg: string, data?: any) => void }): Promise<void> {
  const pool = getPool();
  
  logger?.info('🔧 [DB Migration] Starting database migrations...');
  
  try {
    // Create migrations table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    logger?.info('📝 [DB Migration] Migrations table ready');
    
    // Get applied migrations
    const appliedResult = await pool.query('SELECT filename FROM migrations ORDER BY filename');
    const appliedMigrations = new Set(appliedResult.rows.map(row => row.filename));
    
    logger?.info('📝 [DB Migration] Found applied migrations:', { count: appliedMigrations.size });
    
    // Find migrations directory - try multiple candidate paths
    // We need to go up from the .mastra/output directory to the project root
    const projectRoot = process.cwd().replace('/.mastra/output', '');
    const candidates = [
      process.env.MIGRATIONS_DIR,
      join(projectRoot, 'src', 'db', 'migrations'),
      join(projectRoot, 'db', 'migrations'),
      join(process.cwd(), 'src', 'db', 'migrations'),
      join(process.cwd(), 'db', 'migrations'),
      join(migrateDirname, 'migrations'),
    ].filter(Boolean) as string[];
    
    const migrationsDir = candidates.find((p) => existsSync(p));
    if (!migrationsDir) {
      logger?.error('📝 [DB Migration] No migrations directory found', { candidates });
      throw new Error('Migrations directory not found');
    }
    
    logger?.info('📝 [DB Migration] Using migrations directory', { migrationsDir });

    // Read migration files
    const migrationFiles = readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    if (migrationFiles.length === 0) {
      logger?.error('📝 [DB Migration] No migration files found in directory', { migrationsDir });
      throw new Error('No migration files found');
    }
    
    logger?.info('📝 [DB Migration] Found migration files:', { files: migrationFiles });
    
    // Apply new migrations
    for (const filename of migrationFiles) {
      if (appliedMigrations.has(filename)) {
        logger?.info(`⏭️ [DB Migration] Skipping already applied migration: ${filename}`);
        continue;
      }
      
      logger?.info(`🔄 [DB Migration] Applying migration: ${filename}`);
      
      const migrationPath = join(migrationsDir, filename);
      const migrationSql = readFileSync(migrationPath, 'utf8');
      
      try {
        await pool.query('BEGIN');
        await pool.query(migrationSql);
        await pool.query('INSERT INTO migrations (filename) VALUES ($1)', [filename]);
        await pool.query('COMMIT');
        
        logger?.info(`✅ [DB Migration] Successfully applied: ${filename}`);
      } catch (error) {
        await pool.query('ROLLBACK');
        logger?.error(`❌ [DB Migration] Failed to apply migration ${filename}:`, { error });
        throw error;
      }
    }
    
    logger?.info('🎉 [DB Migration] All migrations completed successfully');
  } catch (error) {
    logger?.error('🔥 [DB Migration] Migration process failed:', { error });
    throw error;
  }
}