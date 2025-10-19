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

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    next();
  };
};

console.log('Reports routes loaded');

// GET ALL REPORTS (with filtering)
router.get('/', protect, authorize('admin', 'agent'), async (req, res) => {
  try {
    console.log('Fetching all reports...');
    
    const { 
      report_type, 
      start_date, 
      end_date, 
      tenant_id,
      page = 1, 
      limit = 20 
    } = req.query;
    
    let query = `
      SELECT 
        pr.*,
        u.first_name as tenant_first_name,
        u.last_name as tenant_last_name,
        u.phone_number as tenant_phone
      FROM payment_reports pr
      LEFT JOIN users u ON pr.tenant_id = u.id
      WHERE 1=1
    `;
    const queryParams = [];
    let paramCount = 0;

    // Add filters based on query parameters
    if (report_type) {
      paramCount++;
      query += ` AND pr.report_type = $${paramCount}`;
      queryParams.push(report_type);
    }

    if (start_date) {
      paramCount++;
      query += ` AND pr.start_date >= $${paramCount}`;
      queryParams.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND pr.end_date <= $${paramCount}`;
      queryParams.push(end_date);
    }

    if (tenant_id) {
      paramCount++;
      query += ` AND pr.tenant_id = $${paramCount}`;
      queryParams.push(tenant_id);
    }

    // Add ordering and pagination
    query += ` ORDER BY pr.generated_at DESC`;
    
    const offset = (page - 1) * limit;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    queryParams.push(limit);
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    queryParams.push(offset);

    const result = await pool.query(query, queryParams);
    
    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) FROM payment_reports pr WHERE 1=1`;
    const countParams = [];
    let countParamCount = 0;

    if (report_type) {
      countParamCount++;
      countQuery += ` AND pr.report_type = $${countParamCount}`;
      countParams.push(report_type);
    }

    if (start_date) {
      countParamCount++;
      countQuery += ` AND pr.start_date >= $${countParamCount}`;
      countParams.push(start_date);
    }

    if (end_date) {
      countParamCount++;
      countQuery += ` AND pr.end_date <= $${countParamCount}`;
      countParams.push(end_date);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);
    
    console.log(`Found ${result.rows.length} reports`);
    
    res.json({
      success: true,
      count: result.rows.length,
      total: totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limit),
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reports',
      error: error.message
    });
  }
});

// GET REPORT BY ID
router.get('/:id', protect, authorize('admin', 'agent'), async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`Fetching report with ID: ${id}`);
    
    const result = await pool.query(`
      SELECT 
        pr.*,
        u.first_name as tenant_first_name,
        u.last_name as tenant_last_name,
        u.email as tenant_email,
        u.phone_number as tenant_phone
      FROM payment_reports pr
      LEFT JOIN users u ON pr.tenant_id = u.id
      WHERE pr.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching report',
      error: error.message
    });
  }
});

// GENERATE AND CREATE NEW REPORT (POST)
router.post('/', protect, authorize('admin', 'agent'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      tenant_id,
      report_type,
      start_date,
      end_date
    } = req.body;
    
    console.log('📊 Generating new report with data:', req.body);
    
    // Validate required fields
    if (!report_type || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: report_type, start_date, end_date'
      });
    }
    
    // Validate report types
    const validReportTypes = ['rent_payments', 'expenses', 'maintenance', 'financial_summary', 'tenant_statement'];
    if (!validReportTypes.includes(report_type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid report type. Must be one of: ${validReportTypes.join(', ')}`
      });
    }
    
    let reportData = {};
    let totalPayments = 0;
    
    // Generate report data based on report type
    switch (report_type) {
      case 'rent_payments':
        if (tenant_id) {
          // Tenant-specific rent payments report
          const paymentsResult = await client.query(`
            SELECT 
              rp.*,
              p.name as property_name,
              pu.unit_number,
              pu.unit_code
            FROM rent_payments rp
            LEFT JOIN property_units pu ON rp.unit_id = pu.id
            LEFT JOIN properties p ON pu.property_id = p.id
            WHERE rp.tenant_id = $1 
              AND rp.payment_date BETWEEN $2 AND $3
            ORDER BY rp.payment_date DESC
          `, [tenant_id, start_date, end_date]);
          
          totalPayments = paymentsResult.rows.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
          
          reportData = {
            payments: paymentsResult.rows,
            summary: {
              total_payments: paymentsResult.rows.length,
              total_amount: totalPayments,
              average_payment: paymentsResult.rows.length > 0 ? totalPayments / paymentsResult.rows.length : 0,
              late_payments: paymentsResult.rows.filter(p => p.is_late_payment).length,
              total_late_fees: paymentsResult.rows.reduce((sum, payment) => sum + parseFloat(payment.late_fee || 0), 0)
            }
          };
        } else {
          // All rent payments report
          const paymentsResult = await client.query(`
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
            WHERE rp.payment_date BETWEEN $1 AND $2
            ORDER BY rp.payment_date DESC
          `, [start_date, end_date]);
          
          totalPayments = paymentsResult.rows.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
          
          reportData = {
            payments: paymentsResult.rows,
            summary: {
              total_payments: paymentsResult.rows.length,
              total_amount: totalPayments,
              average_payment: paymentsResult.rows.length > 0 ? totalPayments / paymentsResult.rows.length : 0,
              unique_tenants: [...new Set(paymentsResult.rows.map(p => p.tenant_id))].length,
              late_payments: paymentsResult.rows.filter(p => p.is_late_payment).length,
              total_late_fees: paymentsResult.rows.reduce((sum, payment) => sum + parseFloat(payment.late_fee || 0), 0)
            }
          };
        }
        break;
        
      case 'expenses':
        const expensesResult = await client.query(`
          SELECT 
            e.*,
            p.name as property_name,
            pu.unit_number,
            u.first_name as recorded_by_name
          FROM expenses e
          LEFT JOIN properties p ON e.property_id = p.id
          LEFT JOIN property_units pu ON e.unit_id = pu.id
          LEFT JOIN users u ON e.recorded_by = u.id
          WHERE e.expense_date BETWEEN $1 AND $2
          ORDER BY e.expense_date DESC
        `, [start_date, end_date]);
        
        const totalExpenses = expensesResult.rows.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
        
        reportData = {
          expenses: expensesResult.rows,
          summary: {
            total_expenses: expensesResult.rows.length,
            total_amount: totalExpenses,
            average_expense: expensesResult.rows.length > 0 ? totalExpenses / expensesResult.rows.length : 0,
            expenses_by_type: expensesResult.rows.reduce((acc, expense) => {
              acc[expense.expense_type] = (acc[expense.expense_type] || 0) + parseFloat(expense.amount);
              return acc;
            }, {})
          }
        };
        break;
        
      case 'financial_summary':
        // Rent payments summary
        const rentSummary = await client.query(`
          SELECT 
            COUNT(*) as total_payments,
            SUM(amount) as total_rent_collected,
            AVG(amount) as average_rent,
            COUNT(CASE WHEN is_late_payment = true THEN 1 END) as late_payments,
            SUM(late_fee) as total_late_fees
          FROM rent_payments 
          WHERE payment_date BETWEEN $1 AND $2
        `, [start_date, end_date]);
        
        // Expenses summary
        const expenseSummary = await client.query(`
          SELECT 
            COUNT(*) as total_expenses,
            SUM(amount) as total_expenses_amount,
            AVG(amount) as average_expense
          FROM expenses 
          WHERE expense_date BETWEEN $1 AND $2
        `, [start_date, end_date]);
        
        // Property occupancy summary
        const occupancySummary = await client.query(`
          SELECT 
            COUNT(*) as total_units,
            COUNT(CASE WHEN is_occupied = true THEN 1 END) as occupied_units,
            COUNT(CASE WHEN is_occupied = false THEN 1 END) as vacant_units
          FROM property_units 
          WHERE is_active = true
        `);
        
        reportData = {
          rent_summary: rentSummary.rows[0],
          expense_summary: expenseSummary.rows[0],
          occupancy_summary: occupancySummary.rows[0],
          net_income: (parseFloat(rentSummary.rows[0].total_rent_collected || 0) - parseFloat(expenseSummary.rows[0].total_expenses_amount || 0))
        };
        break;
        
      case 'tenant_statement':
        if (!tenant_id) {
          return res.status(400).json({
            success: false,
            message: 'Tenant ID is required for tenant statement reports'
          });
        }
        
        // Get tenant details
        const tenantResult = await client.query(`
          SELECT * FROM users WHERE id = $1
        `, [tenant_id]);
        
        if (tenantResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Tenant not found'
          });
        }
        
        // Get tenant payments
        const tenantPayments = await client.query(`
          SELECT 
            rp.*,
            p.name as property_name,
            pu.unit_number
          FROM rent_payments rp
          LEFT JOIN property_units pu ON rp.unit_id = pu.id
          LEFT JOIN properties p ON pu.property_id = p.id
          WHERE rp.tenant_id = $1 
            AND rp.payment_date BETWEEN $2 AND $3
          ORDER BY rp.payment_date DESC
        `, [tenant_id, start_date, end_date]);
        
        // Get tenant allocation info
        const allocationResult = await client.query(`
          SELECT 
            ta.*,
            p.name as property_name,
            pu.unit_number,
            pu.rent_amount
          FROM tenant_allocations ta
          LEFT JOIN property_units pu ON ta.unit_id = pu.id
          LEFT JOIN properties p ON pu.property_id = p.id
          WHERE ta.tenant_id = $1 AND ta.is_active = true
        `, [tenant_id]);
        
        totalPayments = tenantPayments.rows.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
        
        reportData = {
          tenant: tenantResult.rows[0],
          allocation: allocationResult.rows[0],
          payments: tenantPayments.rows,
          summary: {
            total_payments: tenantPayments.rows.length,
            total_amount: totalPayments,
            outstanding_balance: allocationResult.rows.length > 0 ? 
              (parseFloat(allocationResult.rows[0].monthly_rent) * 12 - totalPayments) : 0
          }
        };
        break;
    }
    
    // Store the report in payment_reports table
    const reportResult = await client.query(
      `INSERT INTO payment_reports (
        tenant_id, report_type, start_date, end_date, 
        total_payments, report_data, generated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *`,
      [
        tenant_id || null,
        report_type,
        start_date,
        end_date,
        totalPayments,
        JSON.stringify(reportData)
      ]
    );
    
    await client.query('COMMIT');
    
    console.log('✅ Report generated successfully');
    
    res.status(201).json({
      success: true,
      message: 'Report generated successfully',
      data: {
        ...reportResult.rows[0],
        report_data: reportData // Include the generated data in response
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error generating report:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error generating report',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// UPDATE REPORT (PUT) - mainly for metadata updates
router.put('/:id', protect, authorize('admin', 'agent'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      report_type,
      start_date,
      end_date
    } = req.body;
    
    // Check if report exists
    const reportCheck = await pool.query(
      'SELECT id, report_type FROM payment_reports WHERE id = $1',
      [id]
    );
    
    if (reportCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    const result = await pool.query(
      `UPDATE payment_reports 
       SET report_type = COALESCE($1, report_type),
           start_date = COALESCE($2, start_date),
           end_date = COALESCE($3, end_date)
       WHERE id = $4
       RETURNING *`,
      [
        report_type,
        start_date,
        end_date,
        id
      ]
    );
    
    res.json({
      success: true,
      message: 'Report updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating report',
      error: error.message
    });
  }
});

// DELETE REPORT (DELETE)
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if report exists
    const reportCheck = await pool.query(
      'SELECT id, report_type FROM payment_reports WHERE id = $1',
      [id]
    );
    
    if (reportCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    await pool.query('DELETE FROM payment_reports WHERE id = $1', [id]);
    
    res.json({
      success: true,
      message: `Report (${reportCheck.rows[0].report_type}) deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting report',
      error: error.message
    });
  }
});

// GENERATE QUICK REPORT (without storing)
router.post('/quick', protect, authorize('admin', 'agent'), async (req, res) => {
  try {
    const {
      report_type,
      start_date,
      end_date,
      tenant_id
    } = req.body;
    
    console.log('📈 Generating quick report:', { report_type, start_date, end_date });
    
    // Validate required fields
    if (!report_type || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: report_type, start_date, end_date'
      });
    }
    
    let reportData = {};
    
    // Generate quick report without storing
    switch (report_type) {
      case 'rent_payments_summary':
        const summaryResult = await pool.query(`
          SELECT 
            COUNT(*) as total_payments,
            SUM(amount) as total_amount,
            AVG(amount) as average_amount,
            COUNT(CASE WHEN is_late_payment = true THEN 1 END) as late_payments,
            SUM(late_fee) as total_late_fees,
            COUNT(DISTINCT tenant_id) as unique_tenants
          FROM rent_payments 
          WHERE payment_date BETWEEN $1 AND $2
        `, [start_date, end_date]);
        
        reportData = summaryResult.rows[0];
        break;
        
      case 'occupancy_rate':
        const occupancyResult = await pool.query(`
          SELECT 
            COUNT(*) as total_units,
            COUNT(CASE WHEN is_occupied = true THEN 1 END) as occupied_units,
            ROUND(COUNT(CASE WHEN is_occupied = true THEN 1 END) * 100.0 / COUNT(*), 2) as occupancy_rate
          FROM property_units 
          WHERE is_active = true
        `);
        
        reportData = occupancyResult.rows[0];
        break;
        
      case 'revenue_vs_expenses':
        const revenueResult = await pool.query(`
          SELECT SUM(amount) as total_revenue 
          FROM rent_payments 
          WHERE payment_date BETWEEN $1 AND $2
        `, [start_date, end_date]);
        
        const expensesResult = await pool.query(`
          SELECT SUM(amount) as total_expenses 
          FROM expenses 
          WHERE expense_date BETWEEN $1 AND $2
        `, [start_date, end_date]);
        
        reportData = {
          total_revenue: parseFloat(revenueResult.rows[0].total_revenue || 0),
          total_expenses: parseFloat(expensesResult.rows[0].total_expenses || 0),
          net_income: parseFloat(revenueResult.rows[0].total_revenue || 0) - parseFloat(expensesResult.rows[0].total_expenses || 0)
        };
        break;
        
      default:
        return res.status(400).json({
          success: false,
          message: 'Unsupported quick report type'
        });
    }
    
    res.json({
      success: true,
      message: 'Quick report generated successfully',
      data: reportData
    });
  } catch (error) {
    console.error('Error generating quick report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating quick report',
      error: error.message
    });
  }
});

// GET REPORT STATISTICS
router.get('/stats/overview', protect, authorize('admin', 'agent'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    let dateFilter = '';
    const queryParams = [];
    
    if (start_date && end_date) {
      dateFilter = 'WHERE generated_at BETWEEN $1 AND $2';
      queryParams.push(start_date, end_date);
    }
    
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_reports,
        COUNT(DISTINCT report_type) as unique_report_types,
        COUNT(DISTINCT tenant_id) as tenants_with_reports,
        COUNT(CASE WHEN report_type = 'rent_payments' THEN 1 END) as rent_payment_reports,
        COUNT(CASE WHEN report_type = 'financial_summary' THEN 1 END) as financial_reports,
        COUNT(CASE WHEN report_type = 'tenant_statement' THEN 1 END) as tenant_statements,
        SUM(total_payments) as total_reported_payments
      FROM payment_reports
      ${dateFilter}
    `, queryParams);
    
    const monthlyResult = await pool.query(`
      SELECT 
        DATE(generated_at) as report_date,
        report_type,
        COUNT(*) as report_count
      FROM payment_reports
      WHERE generated_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(generated_at), report_type
      ORDER BY report_date DESC, report_type
    `);
    
    res.json({
      success: true,
      data: {
        overview: statsResult.rows[0],
        monthly_trends: monthlyResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching report statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching report statistics',
      error: error.message
    });
  }
});

// EXPORT REPORT AS CSV/PDF (placeholder endpoint)
router.get('/:id/export', protect, authorize('admin', 'agent'), async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'csv' } = req.query;
    
    // Get the report
    const reportResult = await pool.query(`
      SELECT * FROM payment_reports WHERE id = $1
    `, [id]);
    
    if (reportResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    const report = reportResult.rows[0];
    
    // In a real implementation, you would generate actual CSV/PDF files
    // For now, return the report data with export metadata
    
    res.json({
      success: true,
      message: `Report exported as ${format.toUpperCase()}`,
      data: {
        report_id: report.id,
        report_type: report.report_type,
        format: format,
        download_url: `/api/reports/${id}/download/${format}`, // Placeholder
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error exporting report:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting report',
      error: error.message
    });
  }
});

module.exports = router;