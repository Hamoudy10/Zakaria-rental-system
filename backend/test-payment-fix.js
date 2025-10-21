const pool = require('./config/database');

async function testPaymentFlow() {
  try {
    console.log('🧪 Testing payment flow...');
    
    // Test database connection
    const dbTest = await pool.query('SELECT NOW()');
    console.log('✅ Database connection:', dbTest.rows[0]);
    
    // Test rent_payments table
    const payments = await pool.query('SELECT * FROM rent_payments LIMIT 1');
    console.log('✅ rent_payments table accessible');
    
    // Test tenant_allocations table
    const allocations = await pool.query('SELECT * FROM tenant_allocations LIMIT 1');
    console.log('✅ tenant_allocations table accessible');
    
    console.log('🎉 All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testPaymentFlow();