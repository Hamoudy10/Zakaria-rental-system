// backend/seed.js
const pool = require('./config/database');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function seedDatabase() {
  try {
    console.log('🌱 Seeding database...');

    // Create admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    await pool.query(`
      INSERT INTO users (national_id, first_name, last_name, email, phone_number, password_hash, role) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (email) DO NOTHING
    `, [
      '12345678', 
      'System', 
      'Admin', 
      'admin@rental.com', 
      '254700000000', 
      hashedPassword, 
      'admin'
    ]);

    // Create sample property
    await pool.query(`
      INSERT INTO properties (property_code, name, address, county, town, total_units, available_units, created_by) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT id FROM users WHERE email = 'admin@rental.com'))
      ON CONFLICT (property_code) DO NOTHING
    `, [
      'PROP001',
      'Sunrise Apartments', 
      '123 Main Street, Nairobi', 
      'Nairobi', 
      'Nairobi CBD', 
      20, 
      20
    ]);

    console.log('✅ Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedDatabase();