const pool = require("./config/database");

async function checkDatabaseState() {
  try {
    console.log("🔍 Checking database state...");
    
    // Check users
    const users = await pool.query("SELECT COUNT(*) as count FROM users");
    console.log("👥 Total users in database:", users.rows[0].count);
    
    const userDetails = await pool.query("SELECT id, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 5");
    console.log("Recent users:");
    userDetails.rows.forEach(user => {
      console.log(`  - ${user.email} (${user.role}) - ${user.created_at}`);
    });
    
    // Check properties
    const properties = await pool.query("SELECT COUNT(*) as count FROM properties");
    console.log("🏠 Total properties in database:", properties.rows[0].count);
    
    const propertyDetails = await pool.query("SELECT id, name, property_code, created_at FROM properties ORDER BY created_at DESC LIMIT 5");
    console.log("Recent properties:");
    propertyDetails.rows.forEach(property => {
      console.log(`  - ${property.name} (${property.property_code}) - ${property.created_at}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error checking database:", error);
    process.exit(1);
  }
}

checkDatabaseState();
