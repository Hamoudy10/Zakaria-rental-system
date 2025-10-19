const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Simple inline middleware for testing
const protect = (req, res, next) => {
  req.user = { 
    id: 'test-user-id', 
    userId: 'test', 
    role: 'admin',
    first_name: 'Test',
    last_name: 'User'
  };
  next();
};

console.log('Payments routes loaded');

// GET ALL PAYMENTS
router.get('/', protect, async (req, res) => {
  try {
    console.log('Fetching all payments...');
    
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
    
    console.log(`Found ${result.rows.length} payments`);
    
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payments',
      error: error.message
    });
  }
});

// GET PAYMENT BY ID
router.get('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`Fetching payment with ID: ${id}`);
    
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
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment',
      error: error.message
    });
  }
});

// CREATE NEW PAYMENT (POST)
router.post('/', protect, async (req, res) => {
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
      status = 'completed',
      late_fee = 0,
      is_late_payment = false
    } = req.body;
    
    console.log('💰 Creating new payment with data:', req.body);
    console.log('👤 Created by user ID:', req.user.id);
    
    // Validate required fields
    if (!tenant_id || !unit_id || !mpesa_transaction_id || !phone_number || !amount || !payment_month) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: tenant_id, unit_id, mpesa_transaction_id, phone_number, amount, payment_month'
      });
    }
    
    // Check if tenant exists
    const tenantCheck = await client.query(
      'SELECT id, first_name, last_name FROM users WHERE id = $1 AND role = $2',
      [tenant_id, 'tenant']
    );
    
    if (tenantCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tenant not found or invalid tenant ID'
      });
    }
    
    // Check if unit exists
    const unitCheck = await client.query(`
      SELECT pu.*, p.name as property_name 
      FROM property_units pu
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE pu.id = $1
    `, [unit_id]);
    
    if (unitCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Property unit not found'
      });
    }
    
    // Check for duplicate payment (same tenant, unit, and payment month)
    const existingPayment = await client.query(
      `SELECT id FROM rent_payments 
       WHERE tenant_id = $1 AND unit_id = $2 AND payment_month = $3`,
      [tenant_id, unit_id, payment_month]
    );
    
    if (existingPayment.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Payment for this month already exists for this tenant and unit'
      });
    }
    
    // Create the payment
    const paymentResult = await client.query(
      `INSERT INTO rent_payments (
        tenant_id, unit_id, mpesa_transaction_id, mpesa_receipt_number,
        phone_number, amount, payment_month, status, confirmed_by,
        late_fee, is_late_payment
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        req.user.id, // confirmed_by
        late_fee,
        is_late_payment
      ]
    );
    
    // Create payment notification
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
    
    // Record in MPESA transactions if not exists
    const mpesaCheck = await client.query(
      'SELECT id FROM mpesa_transactions WHERE mpesa_code = $1',
      [mpesa_receipt_number]
    );
    
    if (mpesaCheck.rows.length === 0) {
      await client.query(
        `INSERT INTO mpesa_transactions (
          transaction_type, mpesa_code, phone_number, amount,
          transaction_date, is_confirmed, confirmed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          'rent_payment',
          mpesa_receipt_number,
          phone_number,
          amount,
          new Date(),
          true,
          new Date()
        ]
      );
    }
    
    await client.query('COMMIT');
    
    console.log('✅ Payment created successfully:', paymentResult.rows[0]);
    
    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: paymentResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating payment:', error);
    
    // Handle duplicate MPESA transaction
    if (error.code === '23505' && error.constraint.includes('mpesa_transaction_id')) {
      return res.status(400).json({
        success: false,
        message: 'MPESA transaction ID already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating payment',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// UPDATE PAYMENT (PUT)
router.put('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      mpesa_receipt_number,
      amount,
      status,
      late_fee,
      is_late_payment
    } = req.body;
    
    // Check if payment exists
    const paymentCheck = await pool.query(
      'SELECT id, tenant_id, amount FROM rent_payments WHERE id = $1',
      [id]
    );
    
    if (paymentCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    const result = await pool.query(
      `UPDATE rent_payments 
       SET mpesa_receipt_number = COALESCE($1, mpesa_receipt_number),
           amount = COALESCE($2, amount),
           status = COALESCE($3, status),
           late_fee = COALESCE($4, late_fee),
           is_late_payment = COALESCE($5, is_late_payment),
           confirmed_by = $6,
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
    
    // Update payment notification if status changed to completed
    if (status === 'completed') {
      await pool.query(
        `UPDATE payment_notifications 
         SET is_sent = true, sent_at = NOW()
         WHERE payment_id = $1 AND message_type = 'payment_confirmation'`,
        [id]
      );
    }
    
    res.json({
      success: true,
      message: 'Payment updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating payment',
      error: error.message
    });
  }
});

// DELETE PAYMENT (DELETE)
router.delete('/:id', protect, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // Check if payment exists
    const paymentCheck = await client.query(
      'SELECT id, mpesa_receipt_number, amount FROM rent_payments WHERE id = $1',
      [id]
    );
    
    if (paymentCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    // Delete related payment notifications
    await client.query(
      'DELETE FROM payment_notifications WHERE payment_id = $1',
      [id]
    );
    
    // Delete the payment
    await client.query('DELETE FROM rent_payments WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: `Payment ${paymentCheck.rows[0].mpesa_receipt_number} for KSh ${paymentCheck.rows[0].amount} deleted successfully`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting payment:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error deleting payment',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// GET PAYMENTS BY TENANT
router.get('/tenant/:tenantId', protect, async (req, res) => {
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
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching tenant payments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tenant payments',
      error: error.message
    });
  }
});

// GET PAYMENTS BY UNIT
router.get('/unit/:unitId', protect, async (req, res) => {
  try {
    const { unitId } = req.params;
    
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
    
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching unit payments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching unit payments',
      error: error.message
    });
  }
});

// GET PAYMENT STATISTICS
router.get('/stats/overview', protect, async (req, res) => {
  try {
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_payments,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_payments,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_payments,
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
      GROUP BY DATE_TRUNC('month', payment_date)
      ORDER BY month DESC
    `);
    
    res.json({
      success: true,
      data: {
        overview: statsResult.rows[0],
        monthly_breakdown: monthlyResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching payment statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment statistics',
      error: error.message
    });
  }
});

module.exports = router;