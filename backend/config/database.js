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
    const roleRes = await pool.query('SELECT current_role');
    console.log('🔎 CURRENT DB ROLE:', roleRes.rows[0].current_role);

    const timeRes = await pool.query('SELECT now()');
    console.log('✅ Database connected at:', timeRes.rows[0].now);

  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
  }
})();


module.exports = pool;