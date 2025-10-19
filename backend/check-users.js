const pool = require("./config/database");

async function checkAllUsers() {
  try {
    console.log("👥 Checking all users in database...");
    
    const users = await pool.query(`
      SELECT 
        id, email, role, national_id, 
        first_name, last_name, phone_number,
        is_active, created_at
      FROM users 
      ORDER BY created_at DESC
    `);
    
    console.log(`📊 Found ${users.rows.length} users:`);
    console.log("=".repeat(80));
    
    users.rows.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email} (${user.role})`);
      console.log(`   Name: ${user.first_name} ${user.last_name}`);
      console.log(`   National ID: ${user.national_id}`);
      console.log(`   Phone: ${user.phone_number}`);
      console.log(`   Active: ${user.is_active}`);
      console.log(`   Created: ${user.created_at}`);
      console.log("");
    });
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to check users:", error);
    process.exit(1);
  }
}

checkAllUsers();
