// test-db-complete.js
const pool = require('./config/database');

async function testDB() {
    try {
        console.log('🔍 Comprehensive Database Check...');
        
        // Test basic connection
        const result = await pool.query('SELECT NOW()');
        console.log('✅ Database connection successful');
        
        // Check if users table exists
        const usersTable = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'users'
            );
        `);
        console.log('Users table exists:', usersTable.rows[0].exists);
        
        if (usersTable.rows[0].exists) {
            // Check if admin user exists
            const adminUser = await pool.query(`
                SELECT id, email, role FROM users WHERE email = 'admin@rental.com'
            `);
            console.log('Admin user count:', adminUser.rows.length);
            
            if (adminUser.rows.length > 0) {
                console.log('✅ Admin user exists:', adminUser.rows[0].email);
            } else {
                console.log('❌ Admin user does not exist');
                
                // List all users in the database
                const allUsers = await pool.query('SELECT id, email, role FROM users LIMIT 10');
                console.log('All users in database:', allUsers.rows);
            }
        } else {
            console.log('❌ Users table does not exist');
        }
        
        // Check other important tables
        const tables = ['properties', 'payments', 'complaints', 'reports'];
        for (const table of tables) {
            const tableExists = await pool.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                );
            `, [table]);
            console.log(`${table} table exists:`, tableExists.rows[0].exists);
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Database test failed:', error.message);
        process.exit(1);
    }
}

testDB();