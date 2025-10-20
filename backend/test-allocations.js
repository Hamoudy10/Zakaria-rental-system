// backend/test-allocations.js
const pool = require('./config/database');

async function testAllocations() {
  try {
    console.log('🧪 Testing allocations database connection...');
    
    // Test if tenant_allocations table exists
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'tenant_allocations'
      );
    `);
    
    console.log('📊 Tenant allocations table exists:', result.rows[0].exists);
    
    if (result.rows[0].exists) {
      // Check current allocations
      const allocations = await pool.query('SELECT COUNT(*) FROM tenant_allocations');
      console.log(`📈 Current allocations in database: ${allocations.rows[0].count}`);
      
      // Check table structure
      const structure = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'tenant_allocations'
        ORDER BY ordinal_position;
      `);
      
      console.log('🏗️  Table structure:');
      structure.rows.forEach(col => {
        console.log(`   ${col.column_name} (${col.data_type}) - nullable: ${col.is_nullable}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Allocation test failed:', error);
  } finally {
    pool.end();
  }
}

testAllocations();