const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false }
});

pool.on('connect', () => {
  console.log('🔗 PostgreSQL pool connected');
});

// SAFE startup check (NO role logic)
(async () => {
  try {
    const res = await pool.query('SELECT 1');
    console.log('✅ Database reachable');
  } catch (err) {
    console.error('❌ Database unreachable:', err);
  }
})();

module.exports = pool;
