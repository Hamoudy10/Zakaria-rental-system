// config/database.js - Add support for UUID parsing
const { Pool } = require('pg');
require('dotenv').config();



const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'rental_system',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432,
  ssl: process.env.NODE_ENV === 'production'
  ? { rejectUnauthorized: false }
  : false,
  options: '-c role=backend_service'
});

// Parse UUIDs properly
pool.on('connect', (client) => {
  client.query('SET TIME ZONE UTC;');
});

(async () => {
  try {
    const res = await pool.query('select now()');
    console.log('✅ Database test OK:', res.rows[0]);
    const res2 = await pool.query('SELECT current_role');
    console.log('DB ROLE:', res.rows[0].current_role);

  } catch (err) {
    console.error('❌ Database test FAILED:', err.message);
  }
})();

module.exports = pool;