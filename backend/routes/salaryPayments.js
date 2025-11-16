const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// FIXED: Import authMiddleware correctly
const { authMiddleware, requireAdmin, requireAgent } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Get salary payments
router.get('/', requireAgent, async (req, res) => {
  try {
    let query = `
      SELECT 
        sp.*,
        u.first_name as agent_first_name,
        u.last_name as agent_last_name,
        admin.first_name as paid_by_name
      FROM salary_payments sp
      LEFT JOIN users u ON sp.agent_id = u.id
      LEFT JOIN users admin ON sp.paid_by = admin.id
    `;
    
    // If user is agent, only show their payments
    if (req.user.role === 'agent') {
      query += ` WHERE sp.agent_id = $1`;
      const result = await pool.query(query + ' ORDER BY sp.payment_month DESC', [req.user.id]);
      
      return res.json({
        success: true,
        count: result.rows.length,
        payments: result.rows
      });
    }
    
    // Admin can see all payments
    const result = await pool.query(query + ' ORDER BY sp.payment_month DESC');
    
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

// Create salary payment
router.post('/', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      agent_id,
      amount,
      payment_month,
      mpesa_receipt_number
    } = req.body;
    
    // Validate required fields
    if (!agent_id || !amount || !payment_month) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: agent_id, amount, payment_month'
      });
    }
    
    // Check if agent exists
    const agentCheck = await client.query(
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
    const salaryResult = await client.query(
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
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: 'Salary payment processed successfully',
      payment: salaryResult.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ ERROR creating salary payment:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error in salary payment',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// Get salary payment by ID
router.get('/:id', requireAgent, async (req, res) => {
  try {
    const { id } = req.params;
    
    let query = `
      SELECT 
        sp.*,
        u.first_name as agent_first_name,
        u.last_name as agent_last_name,
        admin.first_name as paid_by_name
      FROM salary_payments sp
      LEFT JOIN users u ON sp.agent_id = u.id
      LEFT JOIN users admin ON sp.paid_by = admin.id
      WHERE sp.id = $1
    `;
    
    // If user is agent, ensure they can only see their own payments
    if (req.user.role === 'agent') {
      query += ` AND sp.agent_id = $2`;
      const result = await pool.query(query, [id, req.user.id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Salary payment not found or access denied'
        });
      }
      
      return res.json({
        success: true,
        payment: result.rows[0]
      });
    }
    
    // Admin can see any payment
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Salary payment not found'
      });
    }
    
    res.json({
      success: true,
      payment: result.rows[0]
    });
  } catch (error) {
    console.error('❌ ERROR getting salary payment by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting salary payment',
      error: error.message
    });
  }
});

// Update salary payment status
router.put('/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }
    
    const result = await pool.query(
      `UPDATE salary_payments 
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Salary payment not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Salary payment status updated successfully',
      payment: result.rows[0]
    });
  } catch (error) {
    console.error('❌ ERROR updating salary payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating salary payment status',
      error: error.message
    });
  }
});

module.exports = router;