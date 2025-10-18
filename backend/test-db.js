const pool = require('./config/database');

async function testDB() {
    try {
        console.log('Testing database connection...');
        const result = await pool.query('SELECT NOW()');
        console.log('✅ Database connection successful:', result.rows[0]);
        
        // Check if users table exists
        const usersTable = await pool.query(\
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'users'
            );
        \);
        console.log('✅ Users table exists:', usersTable.rows[0].exists);
        
        // Check if admin user exists
        const adminUser = await pool.query(\
            SELECT id, email, role FROM users WHERE email = 'admin@rental.com'
        \);
        console.log('Admin user count:', adminUser.rows.length);
        if (adminUser.rows.length > 0) {
            console.log('✅ Admin user exists:', adminUser.rows[0]);
        } else {
            console.log('❌ Admin user does not exist');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Database test failed:', error);
        process.exit(1);
    }
}

testDB();
