// backend/routes/expenses.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ==================== GET EXPENSE CATEGORIES ====================
router.get('/categories', protect, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM expense_categories 
      WHERE is_active = true 
      ORDER BY display_order ASC
    `);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching expense categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching expense categories',
      error: error.message
    });
  }
});

// ==================== GET ALL EXPENSES (Admin sees all, Agent sees own) ====================
router.get('/', protect, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      startDate, 
      endDate, 
      category, 
      propertyId, 
      status,
      recordedBy
    } = req.query;
    
    const offset = (page - 1) * limit;
    const params = [];
    let paramCount = 1;
    
    let whereClause = 'WHERE 1=1';
    
    // Agent can only see their own expenses
    if (req.user.role === 'agent') {
      whereClause += ` AND e.recorded_by = $${paramCount}`;
      params.push(req.user.id);
      paramCount++;
    } else if (recordedBy) {
      // Admin can filter by specific agent
      whereClause += ` AND e.recorded_by = $${paramCount}`;
      params.push(recordedBy);
      paramCount++;
    }
    
    // Date range filter
    if (startDate) {
      whereClause += ` AND e.expense_date >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }
    
    if (endDate) {
      whereClause += ` AND e.expense_date <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }
    
    // Category filter
    if (category) {
      whereClause += ` AND e.category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }
    
    // Property filter
    if (propertyId) {
      whereClause += ` AND e.property_id = $${paramCount}`;
      params.push(propertyId);
      paramCount++;
    }
    
    // Status filter
    if (status) {
      whereClause += ` AND e.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM expenses e 
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);
    
    // Get expenses with pagination
    const query = `
      SELECT 
        e.*,
        p.name as property_name,
        p.property_code,
        pu.unit_code,
        u.first_name || ' ' || u.last_name as recorded_by_name,
        u.email as recorded_by_email,
        approver.first_name || ' ' || approver.last_name as approved_by_name
      FROM expenses e
      LEFT JOIN properties p ON e.property_id = p.id
      LEFT JOIN property_units pu ON e.unit_id = pu.id
      LEFT JOIN users u ON e.recorded_by = u.id
      LEFT JOIN users approver ON e.approved_by = approver.id
      ${whereClause}
      ORDER BY e.expense_date DESC, e.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    
    params.push(parseInt(limit), offset);
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching expenses',
      error: error.message
    });
  }
});

// ==================== GET EXPENSE STATISTICS ====================
router.get('/stats', protect, async (req, res) => {
  try {
    const { startDate, endDate, propertyId } = req.query;
    
    let dateFilter = '';
    let propertyFilter = '';
    let agentFilter = '';
    const params = [];
    let paramCount = 1;
    
    if (startDate && endDate) {
      dateFilter = `AND expense_date BETWEEN $${paramCount} AND $${paramCount + 1}`;
      params.push(startDate, endDate);
      paramCount += 2;
    } else {
      // Default to current month
      dateFilter = `AND DATE_TRUNC('month', expense_date) = DATE_TRUNC('month', CURRENT_DATE)`;
    }
    
    if (propertyId) {
      propertyFilter = `AND property_id = $${paramCount}`;
      params.push(propertyId);
      paramCount++;
    }
    
    // Agent can only see their own stats
    if (req.user.role === 'agent') {
      agentFilter = `AND recorded_by = $${paramCount}`;
      params.push(req.user.id);
      paramCount++;
    }
    
    // Total expenses by status
    const statusQuery = `
      SELECT 
        status,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM expenses
      WHERE 1=1 ${dateFilter} ${propertyFilter} ${agentFilter}
      GROUP BY status
    `;
    
    // Expenses by category
    const categoryQuery = `
      SELECT 
        category,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM expenses
      WHERE status = 'approved' ${dateFilter} ${propertyFilter} ${agentFilter}
      GROUP BY category
      ORDER BY total_amount DESC
    `;
    
    // Monthly trend (last 6 months)
    const trendQuery = `
      SELECT 
        TO_CHAR(DATE_TRUNC('month', expense_date), 'YYYY-MM') as month,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM expenses
      WHERE status = 'approved' 
        AND expense_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 months')
        ${propertyFilter} ${agentFilter}
      GROUP BY DATE_TRUNC('month', expense_date)
      ORDER BY month ASC
    `;
    
    // Top properties by expense
    const propertyQuery = `
      SELECT 
        p.id,
        p.name,
        p.property_code,
        COUNT(e.id) as expense_count,
        COALESCE(SUM(e.amount), 0) as total_amount
      FROM expenses e
      JOIN properties p ON e.property_id = p.id
      WHERE e.status = 'approved' ${dateFilter} ${agentFilter}
      GROUP BY p.id, p.name, p.property_code
      ORDER BY total_amount DESC
      LIMIT 5
    `;
    
    const [statusResult, categoryResult, trendResult, propertyResult] = await Promise.all([
      pool.query(statusQuery, params.slice(0, dateFilter ? 2 : 0).concat(propertyId ? [propertyId] : []).concat(req.user.role === 'agent' ? [req.user.id] : [])),
      pool.query(categoryQuery, params.slice(0, dateFilter ? 2 : 0).concat(propertyId ? [propertyId] : []).concat(req.user.role === 'agent' ? [req.user.id] : [])),
      pool.query(trendQuery, (propertyId ? [propertyId] : []).concat(req.user.role === 'agent' ? [req.user.id] : [])),
      pool.query(propertyQuery, params.slice(0, dateFilter ? 2 : 0).concat(req.user.role === 'agent' ? [req.user.id] : []))
    ]);
    
    // Calculate totals
    const totals = statusResult.rows.reduce((acc, row) => {
      acc[row.status] = {
        count: parseInt(row.count),
        amount: parseFloat(row.total_amount)
      };
      acc.total += parseFloat(row.total_amount);
      acc.totalCount += parseInt(row.count);
      return acc;
    }, { total: 0, totalCount: 0 });
    
    res.json({
      success: true,
      data: {
        totals,
        byStatus: statusResult.rows,
        byCategory: categoryResult.rows,
        monthlyTrend: trendResult.rows,
        topProperties: propertyResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching expense stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching expense statistics',
      error: error.message
    });
  }
});

// ==================== GET SINGLE EXPENSE ====================
router.get('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    
    let query = `
      SELECT 
        e.*,
        p.name as property_name,
        p.property_code,
        pu.unit_code,
        u.first_name || ' ' || u.last_name as recorded_by_name,
        u.email as recorded_by_email,
        approver.first_name || ' ' || approver.last_name as approved_by_name,
        c.title as complaint_title
      FROM expenses e
      LEFT JOIN properties p ON e.property_id = p.id
      LEFT JOIN property_units pu ON e.unit_id = pu.id
      LEFT JOIN users u ON e.recorded_by = u.id
      LEFT JOIN users approver ON e.approved_by = approver.id
      LEFT JOIN complaints c ON e.complaint_id = c.id
      WHERE e.id = $1
    `;
    
    const params = [id];
    
    // Agent can only view their own expenses
    if (req.user.role === 'agent') {
      query += ` AND e.recorded_by = $2`;
      params.push(req.user.id);
    }
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found or access denied'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching expense:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching expense',
      error: error.message
    });
  }
});

// ==================== CREATE EXPENSE ====================
router.post('/', protect, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      expense_date,
      amount,
      description,
      category,
      subcategory,
      property_id,
      unit_id,
      complaint_id,
      payment_method,
      receipt_number,
      receipt_image_url,
      vendor_name,
      vendor_phone,
      notes,
      is_recurring,
      recurring_frequency
    } = req.body;
    
    console.log('📝 Creating expense:', { amount, category, description });
    
    // Validate required fields
    if (!amount || !description || !category) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: amount, description, category'
      });
    }
    
    if (parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }
    
    // If agent, verify they're assigned to the property
    if (req.user.role === 'agent' && property_id) {
      const assignmentCheck = await client.query(
        `SELECT 1 FROM agent_property_assignments 
         WHERE agent_id = $1 AND property_id = $2 AND is_active = true`,
        [req.user.id, property_id]
      );
      
      if (assignmentCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'You are not assigned to this property'
        });
      }
    }
    
    // Verify unit belongs to property if both provided
    if (unit_id && property_id) {
      const unitCheck = await client.query(
        'SELECT 1 FROM property_units WHERE id = $1 AND property_id = $2',
        [unit_id, property_id]
      );
      
      if (unitCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Unit does not belong to the specified property'
        });
      }
    }
    
// In the CREATE EXPENSE route, update the INSERT query:

const result = await client.query(
  `INSERT INTO expenses (
    expense_date, amount, description, category, subcategory,
    property_id, unit_id, complaint_id, recorded_by,
    payment_method, receipt_number, receipt_image_url,
    vendor_name, vendor_phone, notes, is_recurring, recurring_frequency,
    status, expense_type
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
  RETURNING *`,
  [
    expense_date || new Date(),
    parseFloat(amount),
    description.trim(),
    category,
    subcategory || null,
    property_id || null,
    unit_id || null,
    complaint_id || null,
    req.user.id,
    payment_method || 'cash',
    receipt_number || null,
    receipt_image_url || null,
    vendor_name || null,
    vendor_phone || null,
    notes || null,
    is_recurring || false,
    recurring_frequency || null,
    'pending',
    category // Use category as expense_type
  ]
);
    
    await client.query('COMMIT');
    
    console.log('✅ Expense created successfully:', result.rows[0].id);
    
    res.status(201).json({
      success: true,
      message: 'Expense recorded successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating expense:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating expense',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// ==================== UPDATE EXPENSE ====================
router.put('/:id', protect, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const updates = req.body;
    
    console.log(`🔄 Updating expense ${id}`);
    
    // Check if expense exists and user has permission
    let checkQuery = 'SELECT * FROM expenses WHERE id = $1';
    const checkParams = [id];
    
    if (req.user.role === 'agent') {
      checkQuery += ' AND recorded_by = $2';
      checkParams.push(req.user.id);
    }
    
    const expenseCheck = await client.query(checkQuery, checkParams);
    
    if (expenseCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found or access denied'
      });
    }
    
    const expense = expenseCheck.rows[0];
    
    // Agents cannot update approved/rejected expenses
    if (req.user.role === 'agent' && expense.status !== 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Cannot update expense that has been processed'
      });
    }
    
    // Build update query dynamically
    const allowedFields = [
      'expense_date', 'amount', 'description', 'category', 'subcategory',
      'property_id', 'unit_id', 'complaint_id', 'payment_method',
      'receipt_number', 'receipt_image_url', 'vendor_name', 'vendor_phone',
      'notes', 'is_recurring', 'recurring_frequency'
    ];
    
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;
    
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        updateFields.push(`${field} = $${paramCount}`);
        updateValues.push(updates[field]);
        paramCount++;
      }
    });
    
    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }
    
    updateFields.push('updated_at = NOW()');
    updateValues.push(id);
    
    const query = `
      UPDATE expenses 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await client.query(query, updateValues);
    
    await client.query('COMMIT');
    
    console.log('✅ Expense updated successfully');
    
    res.json({
      success: true,
      message: 'Expense updated successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error updating expense:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating expense',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// ==================== APPROVE/REJECT EXPENSE (Admin only) ====================
router.patch('/:id/status', protect, adminOnly, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { status, rejection_reason } = req.body;
    
    console.log(`🔄 Updating expense ${id} status to ${status}`);
    
    if (!['approved', 'rejected', 'reimbursed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be: approved, rejected, or reimbursed'
      });
    }
    
    if (status === 'rejected' && !rejection_reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required when rejecting an expense'
      });
    }
    
    const expenseCheck = await client.query(
      'SELECT * FROM expenses WHERE id = $1',
      [id]
    );
    
    if (expenseCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }
    
    const result = await client.query(
      `UPDATE expenses 
       SET status = $1, 
           approved_by = $2, 
           approved_at = NOW(),
           rejection_reason = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, req.user.id, rejection_reason || null, id]
    );
    
    await client.query('COMMIT');
    
    console.log(`✅ Expense ${id} ${status}`);
    
    res.json({
      success: true,
      message: `Expense ${status} successfully`,
      data: result.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error updating expense status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating expense status',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// ==================== BULK APPROVE EXPENSES (Admin only) ====================
router.post('/bulk-approve', protect, adminOnly, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { expenseIds, status } = req.body;
    
    if (!expenseIds || !Array.isArray(expenseIds) || expenseIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'expenseIds array is required'
      });
    }
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be approved or rejected'
      });
    }
    
    const result = await client.query(
      `UPDATE expenses 
       SET status = $1, 
           approved_by = $2, 
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = ANY($3) AND status = 'pending'
       RETURNING id`,
      [status, req.user.id, expenseIds]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: `${result.rows.length} expense(s) ${status}`,
      data: { updatedCount: result.rows.length }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error bulk updating expenses:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk updating expenses',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// ==================== DELETE EXPENSE ====================
router.delete('/:id', protect, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    console.log(`🗑️ Deleting expense ${id}`);
    
    // Check if expense exists and user has permission
    let checkQuery = 'SELECT * FROM expenses WHERE id = $1';
    const checkParams = [id];
    
    if (req.user.role === 'agent') {
      checkQuery += ' AND recorded_by = $2 AND status = $3';
      checkParams.push(req.user.id, 'pending');
    }
    
    const expenseCheck = await client.query(checkQuery, checkParams);
    
    if (expenseCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found or cannot be deleted'
      });
    }
    
    await client.query('DELETE FROM expenses WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    
    console.log('✅ Expense deleted successfully');
    
    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error deleting expense:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting expense',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// ==================== GET NET PROFIT CALCULATION (Admin only) ====================
router.get('/reports/net-profit', protect, adminOnly, async (req, res) => {
  try {
    const { startDate, endDate, propertyId } = req.query;
    
    let dateFilter = '';
    let propertyFilter = '';
    const params = [];
    let paramCount = 1;
    
    if (startDate && endDate) {
      params.push(startDate, endDate);
      paramCount = 3;
    }
    
    if (propertyId) {
      propertyFilter = propertyId;
    }
    
    // Get total revenue (completed payments)
    const revenueQuery = `
      SELECT 
        COALESCE(SUM(amount), 0) as total_revenue,
        COUNT(*) as payment_count
      FROM rent_payments
      WHERE status = 'completed'
      ${startDate && endDate ? `AND payment_date BETWEEN $1 AND $2` : `AND DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', CURRENT_DATE)`}
      ${propertyId ? `AND property_id = $${paramCount}` : ''}
    `;
    
    // Get total approved expenses
    const expenseQuery = `
      SELECT 
        COALESCE(SUM(amount), 0) as total_expenses,
        COUNT(*) as expense_count
      FROM expenses
      WHERE status = 'approved'
      ${startDate && endDate ? `AND expense_date BETWEEN $1 AND $2` : `AND DATE_TRUNC('month', expense_date) = DATE_TRUNC('month', CURRENT_DATE)`}
      ${propertyId ? `AND property_id = $${paramCount}` : ''}
    `;
    
    // Get breakdown by category
    const categoryBreakdownQuery = `
      SELECT 
        category,
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(*) as count
      FROM expenses
      WHERE status = 'approved'
      ${startDate && endDate ? `AND expense_date BETWEEN $1 AND $2` : `AND DATE_TRUNC('month', expense_date) = DATE_TRUNC('month', CURRENT_DATE)`}
      ${propertyId ? `AND property_id = $${paramCount}` : ''}
      GROUP BY category
      ORDER BY total_amount DESC
    `;
    
    const revenueParams = startDate && endDate 
      ? (propertyId ? [startDate, endDate, propertyId] : [startDate, endDate])
      : (propertyId ? [propertyId] : []);
    
    const [revenueResult, expenseResult, categoryResult] = await Promise.all([
      pool.query(revenueQuery, revenueParams),
      pool.query(expenseQuery, revenueParams),
      pool.query(categoryBreakdownQuery, revenueParams)
    ]);
    
    const totalRevenue = parseFloat(revenueResult.rows[0].total_revenue);
    const totalExpenses = parseFloat(expenseResult.rows[0].total_expenses);
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : 0;
    
    res.json({
      success: true,
      data: {
        period: {
          startDate: startDate || 'Current Month Start',
          endDate: endDate || 'Current Date'
        },
        revenue: {
          total: totalRevenue,
          paymentCount: parseInt(revenueResult.rows[0].payment_count)
        },
        expenses: {
          total: totalExpenses,
          expenseCount: parseInt(expenseResult.rows[0].expense_count),
          byCategory: categoryResult.rows
        },
        netProfit,
        profitMargin: parseFloat(profitMargin)
      }
    });
  } catch (error) {
    console.error('Error calculating net profit:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating net profit',
      error: error.message
    });
  }
});

module.exports = router;