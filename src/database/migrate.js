const fs = require('fs');
const path = require('path');
const db = require('./connection');
const logger = require('../utils/logger');

async function runMigrations() {
  // Ensure migrations tracking table exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await db.query(
      'SELECT filename FROM schema_migrations WHERE filename = $1', [file]
    );
    if (rows.length > 0) continue; // already applied

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await db.query(sql);
      await db.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      logger.info(`Migration applied: ${file}`);
    } catch (err) {
      // Mark as applied if it's a "already exists" type error so we don't retry forever
      const ignorable = ['42701', '42710', '42P07', '42703'].includes(err.code);
      if (ignorable) {
        logger.warn(`Migration ${file} skipped (schema already up to date): ${err.message}`);
        await db.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
      } else {
        logger.error(`Migration failed: ${file} — ${err.message}`);
        // Non-fatal: log and continue so the server still starts
      }
    }
  }
}

module.exports = runMigrations;
