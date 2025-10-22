const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Import the payment controller
const paymentController = require('../controllers/paymentController');

console.log('🔗 Payments routes loaded - checking for controller...');

// FIXED: Use the actual auth middleware instead of mock
const { protect } = require('../middleware/authMiddleware');

// M-Pesa payment routes - FIXED: Using real auth middleware
router.post('/mpesa', protect, async (req, res) => {
  console.log('💰 M-Pesa STK Push Request Received:', {
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    user: req.user
  });
  
  try {
    console.log('🔄 Calling paymentController.initiateSTKPush...');
    await paymentController.initiateSTKPush(req, res);
    console.log('✅ M-Pesa STK Push completed successfully');
  } catch (error) {
    console.error('❌ CRITICAL ERROR in M-Pesa route:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    res.status(500).json({
      success: false,
      message: 'Internal server error in M-Pesa route',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ADDED: M-Pesa configuration test route
router.get('/mpesa/test-config', protect, async (req, res) => {
  console.log('🔧 M-Pesa Configuration Test Request:', {
    method: req.method,
    url: req.originalUrl,
    user: req.user
  });
  
  try {
    console.log('🔄 Calling paymentController.testMpesaConfig...');
    await paymentController.testMpesaConfig(req, res);
    console.log('✅ M-Pesa configuration test completed successfully');
  } catch (error) {
    console.error('❌ CRITICAL ERROR in M-Pesa config test:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error in M-Pesa configuration test',
      error: error.message
    });
  }
});

router.post('/mpesa-callback', async (req, res) => {
  console.log('📞 M-Pesa Callback Received:', {
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    headers: req.headers
  });
  
  try {
    console.log('🔄 Calling paymentController.handleMpesaCallback...');
    await paymentController.handleMpesaCallback(req, res);
    console.log('✅ M-Pesa callback handled successfully');
  } catch (error) {
    console.error('❌ CRITICAL ERROR in M-Pesa callback:', error);
    // Still return success to M-Pesa to avoid repeated callbacks
    res.status(200).json({ 
      ResultCode: 0, 
      ResultDesc: 'Success' 
    });
  }
});

router.get('/mpesa/status/:checkoutRequestId', protect, async (req, res) => {
  console.log('📊 M-Pesa Status Check Request:', {
    method: req.method,
    url: req.originalUrl,
    params: req.params,
    user: req.user
  });
  
  try {
    console.log('🔄 Calling paymentController.checkPaymentStatus...');
    await paymentController.checkPaymentStatus(req, res);
    console.log('✅ M-Pesa status check completed successfully');
  } catch (error) {
    console.error('❌ CRITICAL ERROR in M-Pesa status check:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error in M-Pesa status check',
      error: error.message
    });
  }
});

// GET ALL PAYMENTS
router.get('/', protect, async (req, res) => {
  console.log('📋 GET All Payments Request:', {
    method: req.method,
    url: req.originalUrl,
    user: req.user,
    query: req.query
  });
  
  try {
    console.log('🔄 Executing SQL query for all payments...');
    
    const result = await pool.query(`
      SELECT 
        rp.*,
        u.first_name as tenant_first_name,
        u.last_name as tenant_last_name,
        u.phone_number as tenant_phone,
        p.name as property_name,
        pu.unit_number,
        pu.unit_code,
        CONCAT(agent.first_name, ' ', agent.last_name) as confirmed_by_name
      FROM rent_payments rp
      LEFT JOIN users u ON rp.tenant_id = u.id
      LEFT JOIN property_units pu ON rp.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN users agent ON rp.confirmed_by = agent.id
      ORDER BY rp.payment_date DESC
    `);
    
    console.log(`✅ Found ${result.rows.length} payments`);
    console.log('📊 Sample payment data:', result.rows.length > 0 ? result.rows[0] : 'No payments found');
    
    res.json({
      success: true,
      count: result.rows.length,
      payments: result.rows
    });
  } catch (error) {
    console.error('❌ ERROR fetching payments:', error);
    console.error('🔍 Error details:', {
      message: error.message,
      code: error.code,
      constraint: error.constraint,
      table: error.table
    });
    res.status(500).json({
      success: false,
      message: 'Error fetching payments',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// GET PAYMENT BY ID
router.get('/:id', protect, async (req, res) => {
  console.log('🔍 GET Payment by ID Request:', {
    method: req.method,
    url: req.originalUrl,
    params: req.params,
    user: req.user
  });
  
  try {
    const { id } = req.params;
    console.log(`🔄 Fetching payment with ID: ${id}`);
    
    const result = await pool.query(`
      SELECT 
        rp.*,
        u.first_name as tenant_first_name,
        u.last_name as tenant_last_name,
        u.phone_number as tenant_phone,
        u.email as tenant_email,
        p.name as property_name,
        p.property_code,
        pu.unit_number,
        pu.unit_code,
        pu.rent_amount,
        CONCAT(agent.first_name, ' ', agent.last_name) as confirmed_by_name
      FROM rent_payments rp
      LEFT JOIN users u ON rp.tenant_id = u.id
      LEFT JOIN property_units pu ON rp.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN users agent ON rp.confirmed_by = agent.id
      WHERE rp.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      console.log(`❌ Payment not found with ID: ${id}`);
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    console.log(`✅ Found payment:`, result.rows[0]);
    
    res.json({
      success: true,
      payment: result.rows[0]
    });
  } catch (error) {
    console.error('❌ ERROR fetching payment by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// CREATE NEW PAYMENT (POST)
router.post('/', protect, async (req, res) => {
  console.log('💰 CREATE Payment Request:', {
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    user: req.user
  });
  
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting database transaction...');
    await client.query('BEGIN');
    
    const {
      tenant_id,
      unit_id,
      mpesa_transaction_id,
      mpesa_receipt_number,
      phone_number,
      amount,
      payment_month,
      status = 'completed',
      late_fee = 0,
      is_late_payment = false
    } = req.body;
    
    console.log('📦 Payment data received:', {
      tenant_id,
      unit_id,
      mpesa_transaction_id,
      mpesa_receipt_number,
      phone_number,
      amount,
      payment_month,
      status,
      late_fee,
      is_late_payment
    });
    
    // Validate required fields
    if (!tenant_id || !unit_id || !phone_number || !amount || !payment_month) {
      console.log('❌ Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: tenant_id, unit_id, phone_number, amount, payment_month'
      });
    }
    
    console.log('🔍 Checking if tenant exists...');
    // Check if tenant exists
    const tenantCheck = await client.query(
      'SELECT id, first_name, last_name FROM users WHERE id = $1 AND role = $2',
      [tenant_id, 'tenant']
    );
    
    if (tenantCheck.rows.length === 0) {
      console.log(`❌ Tenant not found with ID: ${tenant_id}`);
      return res.status(400).json({
        success: false,
        message: 'Tenant not found or invalid tenant ID'
      });
    }
    console.log(`✅ Tenant found: ${tenantCheck.rows[0].first_name} ${tenantCheck.rows[0].last_name}`);
    
    console.log('🔍 Checking if unit exists...');
    // Check if unit exists
    const unitCheck = await client.query(`
      SELECT pu.*, p.name as property_name 
      FROM property_units pu
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE pu.id = $1
    `, [unit_id]);
    
    if (unitCheck.rows.length === 0) {
      console.log(`❌ Property unit not found with ID: ${unit_id}`);
      return res.status(400).json({
        success: false,
        message: 'Property unit not found'
      });
    }
    console.log(`✅ Unit found: ${unitCheck.rows[0].property_name} - Unit ${unitCheck.rows[0].unit_number}`);
    
    console.log('🔍 Checking for duplicate payment...');
    // Check for duplicate payment (same tenant, unit, and payment month)
    const existingPayment = await client.query(
      `SELECT id FROM rent_payments 
       WHERE tenant_id = $1 AND unit_id = $2 AND payment_month = $3`,
      [tenant_id, unit_id, payment_month]
    );
    
    if (existingPayment.rows.length > 0) {
      console.log(`❌ Duplicate payment found for tenant ${tenant_id}, unit ${unit_id}, month ${payment_month}`);
      return res.status(400).json({
        success: false,
        message: 'Payment for this month already exists for this tenant and unit'
      });
    }
    console.log('✅ No duplicate payments found');
    
    console.log('🔄 Creating payment record...');
    // Create the payment
    const paymentResult = await client.query(
      `INSERT INTO rent_payments (
        tenant_id, unit_id, mpesa_transaction_id, mpesa_receipt_number,
        phone_number, amount, payment_month, status, confirmed_by,
        late_fee, is_late_payment, payment_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        tenant_id,
        unit_id,
        mpesa_transaction_id,
        mpesa_receipt_number,
        phone_number,
        amount,
        payment_month,
        status,
        req.user.id,
        late_fee,
        is_late_payment,
        status === 'completed' ? new Date() : null
      ]
    );
    
    console.log(`✅ Payment created with ID: ${paymentResult.rows[0].id}`);
    
    // Create payment notification only for completed payments
    if (status === 'completed') {
      console.log('🔄 Creating payment notification...');
      await client.query(
        `INSERT INTO payment_notifications (
          payment_id, recipient_id, message_type, message_content,
          mpesa_code, amount, payment_date, property_info, unit_info, is_sent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          paymentResult.rows[0].id,
          tenant_id,
          'payment_confirmation',
          `Your rent payment of KSh ${amount} for ${payment_month} has been confirmed. Thank you!`,
          mpesa_receipt_number,
          amount,
          new Date(),
          unitCheck.rows[0].property_name,
          `Unit ${unitCheck.rows[0].unit_number}`,
          true
        ]
      );
      console.log('✅ Payment notification created');
    }
    
    // Record in MPESA transactions if not exists and payment is completed
    if (status === 'completed' && mpesa_receipt_number) {
      console.log('🔍 Checking for existing M-Pesa transaction...');
      const mpesaCheck = await client.query(
        'SELECT id FROM mpesa_transactions WHERE mpesa_code = $1',
        [mpesa_receipt_number]
      );
      
      if (mpesaCheck.rows.length === 0) {
        console.log('🔄 Creating M-Pesa transaction record...');
        await client.query(
          `INSERT INTO mpesa_transactions (
            transaction_type, mpesa_code, phone_number, amount,
            transaction_date, is_confirmed, confirmed_at, payment_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            'rent_payment',
            mpesa_receipt_number,
            phone_number,
            amount,
            new Date(),
            true,
            new Date(),
            paymentResult.rows[0].id
          ]
        );
        console.log('✅ M-Pesa transaction record created');
      } else {
        console.log('ℹ️  M-Pesa transaction already exists, skipping creation');
      }
    }
    
    console.log('🔄 Committing transaction...');
    await client.query('COMMIT');
    
    console.log('✅ Payment creation completed successfully');
    
    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      payment: paymentResult.rows[0]
    });
  } catch (error) {
    console.error('❌ ERROR creating payment:', error);
    console.error('🔍 Error details:', {
      message: error.message,
      code: error.code,
      constraint: error.constraint,
      table: error.table,
      stack: error.stack
    });
    
    console.log('🔄 Rolling back transaction...');
    await client.query('ROLLBACK');
    
    // Handle duplicate MPESA transaction
    if (error.code === '23505' && error.constraint && error.constraint.includes('mpesa_transaction_id')) {
      console.log('❌ Duplicate M-Pesa transaction ID');
      return res.status(400).json({
        success: false,
        message: 'MPESA transaction ID already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating payment',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    console.log('🔄 Releasing database client...');
    client.release();
  }
});

// GET PAYMENTS BY TENANT
router.get('/tenant/:tenantId', protect, async (req, res) => {
  console.log('👤 GET Payments by Tenant Request:', {
    method: req.method,
    url: req.originalUrl,
    params: req.params,
    user: req.user
  });
  
  try {
    const { tenantId } = req.params;
    console.log(`🔄 Fetching payments for tenant ID: ${tenantId}`);
    
    const result = await pool.query(`
      SELECT 
        rp.*,
        p.name as property_name,
        pu.unit_number,
        pu.unit_code
      FROM rent_payments rp
      LEFT JOIN property_units pu ON rp.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE rp.tenant_id = $1
      ORDER BY rp.payment_month DESC
    `, [tenantId]);
    
    console.log(`✅ Found ${result.rows.length} payments for tenant ${tenantId}`);
    console.log('📊 Sample payment data:', result.rows.length > 0 ? result.rows[0] : 'No payments found');
    
    res.json({
      success: true,
      count: result.rows.length,
      payments: result.rows
    });
  } catch (error) {
    console.error('❌ ERROR fetching tenant payments:', error);
    console.error('🔍 Error details:', {
      message: error.message,
      code: error.code,
      constraint: error.constraint,
      table: error.table
    });
    res.status(500).json({
      success: false,
      message: 'Error fetching tenant payments',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// GET PAYMENTS BY UNIT
router.get('/unit/:unitId', protect, async (req, res) => {
  console.log('🏠 GET Payments by Unit Request:', {
    method: req.method,
    url: req.originalUrl,
    params: req.params,
    user: req.user
  });
  
  try {
    const { unitId } = req.params;
    console.log(`🔄 Fetching payments for unit ID: ${unitId}`);
    
    const result = await pool.query(`
      SELECT 
        rp.*,
        u.first_name as tenant_first_name,
        u.last_name as tenant_last_name
      FROM rent_payments rp
      LEFT JOIN users u ON rp.tenant_id = u.id
      WHERE rp.unit_id = $1
      ORDER BY rp.payment_month DESC
    `, [unitId]);
    
    console.log(`✅ Found ${result.rows.length} payments for unit ${unitId}`);
    
    res.json({
      success: true,
      count: result.rows.length,
      payments: result.rows
    });
  } catch (error) {
    console.error('❌ ERROR fetching unit payments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching unit payments',
      error: error.message
    });
  }
});

// GET PAYMENT STATISTICS
router.get('/stats/overview', protect, async (req, res) => {
  console.log('📊 GET Payment Statistics Request:', {
    method: req.method,
    url: req.originalUrl,
    user: req.user
  });
  
  try {
    console.log('🔄 Fetching payment statistics...');
    
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_payments,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_payments,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_payments,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
        COUNT(CASE WHEN is_late_payment = true THEN 1 END) as late_payments,
        SUM(late_fee) as total_late_fees
      FROM rent_payments
    `);
    
    const monthlyResult = await pool.query(`
      SELECT 
        DATE_TRUNC('month', payment_date) as month,
        COUNT(*) as payment_count,
        SUM(amount) as monthly_total
      FROM rent_payments 
      WHERE payment_date >= CURRENT_DATE - INTERVAL '12 months'
      AND status = 'completed'
      GROUP BY DATE_TRUNC('month', payment_date)
      ORDER BY month DESC
    `);
    
    // Get recent payments for dashboard
    const recentPayments = await pool.query(`
      SELECT 
        rp.*,
        u.first_name as tenant_first_name,
        u.last_name as tenant_last_name,
        p.name as property_name,
        pu.unit_number
      FROM rent_payments rp
      LEFT JOIN users u ON rp.tenant_id = u.id
      LEFT JOIN property_units pu ON rp.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      ORDER BY rp.created_at DESC
      LIMIT 10
    `);
    
    console.log('✅ Payment statistics fetched successfully');
    
    res.json({
      success: true,
      data: {
        overview: statsResult.rows[0],
        monthly_breakdown: monthlyResult.rows,
        recent_payments: recentPayments.rows
      }
    });
  } catch (error) {
    console.error('❌ ERROR fetching payment statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment statistics',
      error: error.message
    });
  }
});

// ADDED: Get pending payments
router.get('/status/pending', protect, async (req, res) => {
  console.log('⏳ GET Pending Payments Request:', {
    method: req.method,
    url: req.originalUrl,
    user: req.user
  });
  
  try {
    console.log('🔄 Fetching pending payments...');
    
    const result = await pool.query(`
      SELECT 
        rp.*,
        u.first_name as tenant_first_name,
        u.last_name as tenant_last_name,
        p.name as property_name,
        pu.unit_number
      FROM rent_payments rp
      LEFT JOIN users u ON rp.tenant_id = u.id
      LEFT JOIN property_units pu ON rp.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE rp.status = 'pending'
      ORDER BY rp.payment_month DESC
    `);
    
    console.log(`✅ Found ${result.rows.length} pending payments`);
    
    res.json({
      success: true,
      count: result.rows.length,
      payments: result.rows
    });
  } catch (error) {
    console.error('❌ ERROR fetching pending payments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending payments',
      error: error.message
    });
  }
});

// ADDED: Get overdue payments
router.get('/status/overdue', protect, async (req, res) => {
  console.log('⚠️  GET Overdue Payments Request:', {
    method: req.method,
    url: req.originalUrl,
    params: req.params,
    user: req.user
  });
  
  try {
    console.log('🔄 Fetching overdue payments...');
    
    const result = await pool.query(`
      SELECT 
        rp.*,
        u.first_name as tenant_first_name,
        u.last_name as tenant_last_name,
        p.name as property_name,
        pu.unit_number
      FROM rent_payments rp
      LEFT JOIN users u ON rp.tenant_id = u.id
      LEFT JOIN property_units pu ON rp.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE rp.is_late_payment = true OR rp.late_fee > 0
      ORDER BY rp.payment_month DESC
    `);
    
    console.log(`✅ Found ${result.rows.length} overdue payments`);
    
    res.json({
      success: true,
      count: result.rows.length,
      payments: result.rows
    });
  } catch (error) {
    console.error('❌ ERROR fetching overdue payments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching overdue payments',
      error: error.message
    });
  }
});

// UPDATE PAYMENT (PUT) - Keeping the original but with enhanced logging
router.put('/:id', protect, async (req, res) => {
  console.log('✏️  UPDATE Payment Request:', {
    method: req.method,
    url: req.originalUrl,
    params: req.params,
    body: req.body,
    user: req.user
  });
  
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting database transaction for update...');
    await client.query('BEGIN');
    
    const { id } = req.params;
    const {
      mpesa_receipt_number,
      amount,
      status,
      late_fee,
      is_late_payment
    } = req.body;
    
    console.log(`🔄 Updating payment ID: ${id}`, { mpesa_receipt_number, amount, status, late_fee, is_late_payment });
    
    // Check if payment exists
    const paymentCheck = await client.query(
      'SELECT id, tenant_id, amount, status as old_status FROM rent_payments WHERE id = $1',
      [id]
    );
    
    if (paymentCheck.rows.length === 0) {
      console.log(`❌ Payment not found with ID: ${id}`);
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    console.log(`✅ Payment found, old status: ${paymentCheck.rows[0].old_status}`);
    
    const result = await client.query(
      `UPDATE rent_payments 
       SET mpesa_receipt_number = COALESCE($1, mpesa_receipt_number),
           amount = COALESCE($2, amount),
           status = COALESCE($3, status),
           late_fee = COALESCE($4, late_fee),
           is_late_payment = COALESCE($5, is_late_payment),
           confirmed_by = $6,
           payment_date = CASE 
             WHEN $3 = 'completed' AND payment_date IS NULL THEN NOW()
             ELSE payment_date 
           END,
           confirmed_at = CASE 
             WHEN $3 = 'completed' AND confirmed_at IS NULL THEN NOW()
             ELSE confirmed_at 
           END
       WHERE id = $7
       RETURNING *`,
      [
        mpesa_receipt_number,
        amount,
        status,
        late_fee,
        is_late_payment,
        req.user.id,
        id
      ]
    );
    
    console.log(`✅ Payment updated successfully, new status: ${result.rows[0].status}`);
    
    // Create payment notification if status changed to completed
    if (status === 'completed' && paymentCheck.rows[0].old_status !== 'completed') {
      console.log('🔄 Creating payment notification for status change to completed...');
      // Get payment details for notification
      const paymentDetails = await client.query(`
        SELECT rp.*, u.first_name, u.last_name, p.name as property_name, pu.unit_number
        FROM rent_payments rp
        LEFT JOIN users u ON rp.tenant_id = u.id
        LEFT JOIN property_units pu ON rp.unit_id = pu.id
        LEFT JOIN properties p ON pu.property_id = p.id
        WHERE rp.id = $1
      `, [id]);
      
      if (paymentDetails.rows.length > 0) {
        const payment = paymentDetails.rows[0];
        
        await client.query(
          `INSERT INTO payment_notifications (
            payment_id, recipient_id, message_type, message_content,
            mpesa_code, amount, payment_date, property_info, unit_info, is_sent
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            id,
            payment.tenant_id,
            'payment_confirmation',
            `Your rent payment of KSh ${payment.amount} has been confirmed. Thank you!`,
            payment.mpesa_receipt_number,
            payment.amount,
            new Date(),
            payment.property_name,
            `Unit ${payment.unit_number}`,
            true
          ]
        );
        console.log('✅ Payment notification created');
      }
    }
    
    console.log('🔄 Committing update transaction...');
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Payment updated successfully',
      payment: result.rows[0]
    });
  } catch (error) {
    console.error('❌ ERROR updating payment:', error);
    console.error('🔍 Error details:', {
      message: error.message,
      code: error.code,
      constraint: error.constraint
    });
    
    console.log('🔄 Rolling back update transaction...');
    await client.query('ROLLBACK');
    
    res.status(500).json({
      success: false,
      message: 'Error updating payment',
      error: error.message
    });
  } finally {
    console.log('🔄 Releasing database client...');
    client.release();
  }
});

// DELETE PAYMENT (DELETE) - Keeping the original but with enhanced logging
router.delete('/:id', protect, async (req, res) => {
  console.log('🗑️  DELETE Payment Request:', {
    method: req.method,
    url: req.originalUrl,
    params: req.params,
    user: req.user
  });
  
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting database transaction for deletion...');
    await client.query('BEGIN');
    
    const { id } = req.params;
    console.log(`🔄 Deleting payment with ID: ${id}`);
    
    // Check if payment exists
    const paymentCheck = await client.query(
      'SELECT id, mpesa_receipt_number, amount FROM rent_payments WHERE id = $1',
      [id]
    );
    
    if (paymentCheck.rows.length === 0) {
      console.log(`❌ Payment not found with ID: ${id}`);
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    console.log(`✅ Payment found: ${paymentCheck.rows[0].mpesa_receipt_number} for KSh ${paymentCheck.rows[0].amount}`);
    
    // Delete related payment notifications
    console.log('🔄 Deleting related payment notifications...');
    await client.query(
      'DELETE FROM payment_notifications WHERE payment_id = $1',
      [id]
    );
    
    // Delete related MPESA transactions
    console.log('🔄 Deleting related M-Pesa transactions...');
    await client.query(
      'DELETE FROM mpesa_transactions WHERE payment_id = $1',
      [id]
    );
    
    // Delete the payment
    console.log('🔄 Deleting payment record...');
    await client.query('DELETE FROM rent_payments WHERE id = $1', [id]);
    
    console.log('🔄 Committing deletion transaction...');
    await client.query('COMMIT');
    
    console.log('✅ Payment deleted successfully');
    
    res.json({
      success: true,
      message: `Payment ${paymentCheck.rows[0].mpesa_receipt_number} for KSh ${paymentCheck.rows[0].amount} deleted successfully`
    });
  } catch (error) {
    console.error('❌ ERROR deleting payment:', error);
    console.error('🔍 Error details:', {
      message: error.message,
      code: error.code,
      constraint: error.constraint
    });
    
    console.log('🔄 Rolling back deletion transaction...');
    await client.query('ROLLBACK');
    
    res.status(500).json({
      success: false,
      message: 'Error deleting payment',
      error: error.message
    });
  } finally {
    console.log('🔄 Releasing database client...');
    client.release();
  }
});

console.log('✅ All payment routes configured successfully');

module.exports = router;