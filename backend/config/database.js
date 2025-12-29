// config/database.js - Add support for UUID parsing
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'rental_system',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false },
});

// Parse UUIDs properly
pool.on('connect', (client) => {
  client.query('SET TIME ZONE UTC;');
});

module.exports = pool;