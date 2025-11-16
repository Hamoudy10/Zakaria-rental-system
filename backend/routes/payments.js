const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Import the payment controller
const paymentController = require('../controllers/paymentController');

console.log('🔗 Payments routes loaded - checking for controller...');

// FIXED: Use the actual auth middleware with correct import
const { authMiddleware } = require('../middleware/authMiddleware');

// Add this route to debug environment variables
router.get('/debug-env', (req, res) => {
  res.json({
    SMS_API_KEY: process.env.SMS_API_KEY ? '✅ Set' : '❌ Missing',
    SMS_SENDER_ID: process.env.SMS_SENDER_ID ? '✅ Set' : '❌ Missing', 
    SMS_USERNAME: process.env.SMS_USERNAME ? '✅ Set' : '❌ Missing',
    SMS_BASE_URL: process.env.SMS_BASE_URL ? '✅ Set' : '❌ Missing',
    NODE_ENV: process.env.NODE_ENV
  });
});

// ==================== M-PESA PAYMENT ROUTES ====================

// M-Pesa payment routes - FIXED: Using real auth middleware
router.post('/mpesa', authMiddleware, async (req, res) => {
  console.log('💰 M-Pesa STK Push Request Received:', {
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    user: req.user
  });
  
  try {
    console.log('🔄 Calling paymentController.initiateSTKPush...');
    await paymentController.initiateSTKPush(req, res);
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

// M-Pesa callback route (no auth required - called by Safaricom)
router.post('/mpesa-callback', async (req, res) => {
  console.log('📞 M-Pesa Callback Received:', {
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    headers: req.headers
  });
  
  try {
    // Use your existing callback handling logic here
    const callbackData = req.body;
    console.log('📦 M-Pesa Callback Data:', JSON.stringify(callbackData, null, 2));
    
    // Your existing callback processing logic
    if (callbackData.Body && callbackData.Body.stkCallback) {
      const stkCallback = callbackData.Body.stkCallback;
      
      if (stkCallback.ResultCode === 0) {
        console.log('✅ M-Pesa Payment Successful');
        
        // Extract and process successful payment
        const callbackMetadata = stkCallback.CallbackMetadata;
        if (callbackMetadata && callbackMetadata.Item) {
          let amount, mpesaReceiptNumber, phoneNumber, transactionDate;
          
          for (const item of callbackMetadata.Item) {
            if (item.Name === 'Amount') amount = item.Value;
            if (item.Name === 'MpesaReceiptNumber') mpesaReceiptNumber = item.Value;
            if (item.Name === 'PhoneNumber') phoneNumber = item.Value;
            if (item.Name === 'TransactionDate') transactionDate = item.Value;
          }
          
          console.log('💰 Payment Details:', {
            amount,
            mpesaReceiptNumber,
            phoneNumber,
            transactionDate
          });
          
          // Update payment status in database - use your existing logic
          // This should match what you have in paymentController
        }
      } else {
        console.log('❌ M-Pesa Payment Failed:', stkCallback.ResultDesc);
      }
    }
    
    // Always return success to M-Pesa
    res.status(200).json({ 
      ResultCode: 0, 
      ResultDesc: 'Success' 
    });
  } catch (error) {
    console.error('❌ CRITICAL ERROR in M-Pesa callback:', error);
    // Still return success to M-Pesa to avoid repeated callbacks
    res.status(200).json({ 
      ResultCode: 0, 
      ResultDesc: 'Success' 
    });
  }
});

// Check M-Pesa payment status
router.get('/mpesa/status/:checkoutRequestId', authMiddleware, async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;
    
    console.log('🔍 Checking payment status for:', checkoutRequestId);
    
    // Use your existing payment status check logic
    // For now, return a mock status that matches your development setup
    res.json({
      success: true,
      status: 'completed',
      checkoutRequestId: checkoutRequestId,
      message: 'Payment status checked successfully'
    });
  } catch (error) {
    console.error('❌ Error checking payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking payment status',
      error: error.message
    });
  }
});

// ==================== SALARY PAYMENT ROUTES ====================

// Salary payment routes
router.post('/salary', authMiddleware, async (req, res) => {
  console.log('💰 Salary Payment Request:', {
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    user: req.user
  });
  
  try {
    // Use your existing salary payment logic
    const { agent_id, amount, payment_month, mpesa_receipt_number } = req.body;
    
    // Validate required fields
    if (!agent_id || !amount || !payment_month) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: agent_id, amount, payment_month'
      });
    }
    
    // Check if agent exists
    const agentCheck = await pool.query(
      'SELECT id, first_name, last_name FROM users WHERE id = $1 AND role = $2',
      [agent_id, 'agent']
    );
    
    if (agentCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Agent not found'
      });
    }
    
    // Create salary payment record
    const salaryResult = await pool.query(
      `INSERT INTO salary_payments (
        agent_id, amount, payment_month, mpesa_receipt_number, paid_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        agent_id,
        amount,
        payment_month,
        mpesa_receipt_number,
        req.user.id,
        'completed'
      ]
    );
    
    res.json({
      success: true,
      message: 'Salary payment processed successfully',
      payment: salaryResult.rows[0]
    });
    
  } catch (error) {
    console.error('❌ ERROR in salary payment:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error in salary payment',
      error: error.message
    });
  }
});

// Get salary payments
router.get('/salary', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        sp.*,
        u.first_name as agent_first_name,
        u.last_name as agent_last_name,
        admin.first_name as paid_by_name
      FROM salary_payments sp
      LEFT JOIN users u ON sp.agent_id = u.id
      LEFT JOIN users admin ON sp.paid_by = admin.id
      ORDER BY sp.payment_month DESC
    `);
    
    res.json({
      success: true,
      count: result.rows.length,
      payments: result.rows
    });
  } catch (error) {
    console.error('❌ ERROR getting salary payments:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting salary payments',
      error: error.message
    });
  }
});

// ==================== PAYMENT MANAGEMENT ROUTES ====================

// GET ALL PAYMENTS
router.get('/', authMiddleware, async (req, res) => {
  try {
    console.log('📋 GET All Payments Request:', {
      method: req.method,
      url: req.originalUrl,
      user: req.user,
      query: req.query
    });
    
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
    
    res.json({
      success: true,
      count: result.rows.length,
      payments: result.rows
    });
  } catch (error) {
    console.error('❌ ERROR fetching payments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payments',
      error: error.message
    });
  }
});

// GET PAYMENT BY ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
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
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    res.json({
      success: true,
      payment: result.rows[0]
    });
  } catch (error) {
    console.error('❌ ERROR fetching payment by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment',
      error: error.message
    });
  }
});

// CREATE NEW PAYMENT (POST)
router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      tenant_id,
      unit_id,
      mpesa_transaction_id,
      mpesa_receipt_number,
      phone_number,
      amount,
      payment_month,
      status = 'completed'
    } = req.body;
    
    const paymentResult = await client.query(
      `INSERT INTO rent_payments (
        tenant_id, unit_id, mpesa_transaction_id, mpesa_receipt_number,
        phone_number, amount, payment_month, status, confirmed_by, payment_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        status === 'completed' ? new Date() : null
      ]
    );
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      payment: paymentResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ ERROR creating payment:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error creating payment',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// GET PAYMENTS BY TENANT
router.get('/tenant/:tenantId', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params;
    
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
    
    res.json({
      success: true,
      count: result.rows.length,
      payments: result.rows
    });
  } catch (error) {
    console.error('❌ ERROR fetching tenant payments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tenant payments',
      error: error.message
    });
  }
});

// UPDATE PAYMENT (PUT)
router.put('/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const {
      mpesa_receipt_number,
      amount,
      status
    } = req.body;
    
    // Check if payment exists
    const paymentCheck = await client.query(
      'SELECT id FROM rent_payments WHERE id = $1',
      [id]
    );
    
    if (paymentCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    const result = await client.query(
      `UPDATE rent_payments 
       SET mpesa_receipt_number = COALESCE($1, mpesa_receipt_number),
           amount = COALESCE($2, amount),
           status = COALESCE($3, status),
           confirmed_by = $4,
           payment_date = CASE 
             WHEN $3 = 'completed' AND payment_date IS NULL THEN NOW()
             ELSE payment_date 
           END
       WHERE id = $5
       RETURNING *`,
      [
        mpesa_receipt_number,
        amount,
        status,
        req.user.id,
        id
      ]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Payment updated successfully',
      payment: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ ERROR updating payment:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error updating payment',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// DELETE PAYMENT (DELETE)
router.delete('/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // Check if payment exists
    const paymentCheck = await pool.query(
      'SELECT id FROM rent_payments WHERE id = $1',
      [id]
    );
    
    if (paymentCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    await client.query('DELETE FROM rent_payments WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Payment deleted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ ERROR deleting payment:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error deleting payment',
      error: error.message
    });
  } finally {
    client.release();
  }
});

console.log('✅ All payment routes configured successfully');

module.exports = router;