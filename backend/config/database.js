// config/database.js
const { Pool } = require('pg');
require('dotenv').config();

// Create a new pool using Supabase credentials
const pool = new Pool({
  user: process.env.DB_USER,                  // e.g., postgres
  host: process.env.DB_HOST,                  // e.g., db.dltbxfftevyxvadqrshl.supabase.co
  database: process.env.DB_NAME,              // your database name in Supabase
  password: process.env.DB_PASSWORD,          // your Supabase password
  port: process.env.DB_PORT || 5432,
  ssl: process.env.NODE_ENV === 'production'  // enforce SSL in production
    ? { rejectUnauthorized: false }
    : false
});

// Optional: set up UUID parsing
pool.on('connect', (client) => {
  client.query('SET TIME ZONE UTC;'); // ensure all timestamps are UTC
});

// Simple connection test at startup
(async () => {
  try {
    await pool.query('SELECT 1'); // just test connection
    console.log('✅ Database connection OK');
  } catch (err) {
    console.error('❌ Database connection FAILED:', err);
  }
})();

module.exports = pool;
