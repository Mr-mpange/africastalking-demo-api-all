const { Pool } = require('pg');
const logger = require('../utils/logger');

// Log connection configuration
// Cloud SQL on Cloud Run uses Unix socket via CLOUD_SQL_CONNECTION_NAME
const isCloudSQL = !!process.env.CLOUD_SQL_CONNECTION_NAME;

const dbConfig = {
  database: process.env.DB_NAME || 'research_system',
  user: process.env.DB_USER || 'postgres',
  password: String(process.env.DB_PASSWORD),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ...(isCloudSQL
    ? { host: `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}` }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        ssl: false,
      }),
};

logger.info('Database connection config:', {
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user,
  passwordSet: !!dbConfig.password
});

// PostgreSQL connection pool
const pool = new Pool(dbConfig);

// Test PostgreSQL connection
pool.on('connect', () => {
  logger.info('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  logger.error('PostgreSQL connection error:', err);
});

// Query helper with error handling
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug(`PostgreSQL query executed in ${duration}ms: ${text}`);
    return res;
  } catch (error) {
    logger.error('PostgreSQL query error:', error);
    // Return empty result if database is not available
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      logger.warn('Database not available, returning empty result');
      return { rows: [], rowCount: 0 };
    }
    throw error;
  }
};

// Transaction helper
const transaction = async (callback) => {
  const client = await pool.connect();
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
};

module.exports = {
  query,
  transaction,
  pool,
  end: () => pool.end()
};