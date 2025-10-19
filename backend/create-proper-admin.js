const pool = require("./config/database");
const bcrypt = require("bcryptjs");

async function createProperAdminUser() {
  try {
    console.log("👑 Creating proper admin user...");
    
    // Check if admin already exists
    const existingAdmin = await pool.query("SELECT id, email, national_id FROM users WHERE email = $1", ["admin@primerentals.co.ke"]);
    
    if (existingAdmin.rows.length > 0) {
      console.log("ℹ️ Admin user already exists, updating password and ensuring all fields are set...");
      const hashedPassword = await bcrypt.hash("admin123", 10);
      await pool.query(`
        UPDATE users SET 
          password_hash = $1,
          national_id = COALESCE(national_id, 'ADMIN001'),
          first_name = COALESCE(first_name, 'System'),
          last_name = COALESCE(last_name, 'Administrator'),
          phone_number = COALESCE(phone_number, '+254700000000'),
          is_active = true
        WHERE email = $2
      `, [hashedPassword, "admin@primerentals.co.ke"]);
      console.log("✅ Admin user updated with all required fields");
    } else {
      // Create new admin user with ALL required fields
      const hashedPassword = await bcrypt.hash("admin123", 10);
      const result = await pool.query(`
        INSERT INTO users (
          national_id, first_name, last_name, email, phone_number, 
          password_hash, role, is_active, created_at
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) 
        RETURNING id, email, role, national_id
      `, [
        "ADMIN001", 
        "System", 
        "Administrator", 
        "admin@primerentals.co.ke", 
        "+254700000000",
        hashedPassword, 
        "admin", 
        true
      ]);
      
      console.log("✅ Admin user created successfully with all required fields");
      console.log("   ID:", result.rows[0].id);
      console.log("   Email:", result.rows[0].email);
      console.log("   Role:", result.rows[0].role);
      console.log("   National ID:", result.rows[0].national_id);
    }
    
    console.log("   Default password: admin123");
    
    // Verify the user was created properly
    const verifyUser = await pool.query(`
      SELECT id, email, role, national_id, first_name, last_name, phone_number, is_active 
      FROM users WHERE email = $1
    `, ["admin@primerentals.co.ke"]);
    
    console.log("🔍 Verification:", verifyUser.rows[0]);
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to create admin user:", error);
    process.exit(1);
  }
}

createProperAdminUser();
