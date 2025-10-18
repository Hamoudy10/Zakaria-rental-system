// simple-db-test.js
const pool = require('./config/database');

async function simpleTest() {
    try {
        console.log('Testing basic database connection...');
        const result = await pool.query('SELECT NOW() as current_time');
        console.log('✅ Database connected successfully!');
        console.log('Current time from database:', result.rows[0].current_time);
        process.exit(0);
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        process.exit(1);
    }
}

simpleTest();