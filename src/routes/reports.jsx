const express = require('express');
const router = express.Router();
const db = require('../config/database');
const auth = require('../middleware/auth');

// Financial Report
router.post('/financial', auth, async (req, res) => {
  try {
    const { startDate, endDate, propertyId } = req.body;

    let whereClause = `WHERE rp.payment_date BETWEEN $1 AND $2`;
    let params = [startDate, endDate];
    let paramCount = 2;

    if (propertyId) {
      paramCount++;
      whereClause += ` AND pu.property_id = $${paramCount}`;
      params.push(propertyId);
    }

    // Get total revenue
    const revenueResult = await db.query(
      `SELECT COALESCE(SUM(rp.amount), 0) as total_revenue
       FROM rent_payments rp
       JOIN property_units pu ON rp.unit_id = pu.id
       ${whereClause} AND rp.status = 'completed'`,
      params
    );

    // Get total expenses
    const expenseResult = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as total_expenses
       FROM expenses 
       WHERE expense_date BETWEEN $1 AND $2 ${propertyId ? 'AND property_id = $3' : ''}`,
      propertyId ? [startDate, endDate, propertyId] : [startDate, endDate]
    );

    // Get recent transactions
    const transactionsResult = await db.query(
      `SELECT rp.*, u.first_name, u.last_name, p.name as property_name,
              CONCAT(u.first_name, ' ', u.last_name) as tenant_name
       FROM rent_payments rp
       JOIN users u ON rp.tenant_id = u.id
       JOIN property_units pu ON rp.unit_id = pu.id
       JOIN properties p ON pu.property_id = p.id
       ${whereClause}
       ORDER BY rp.payment_date DESC
       LIMIT 50`,
      params
    );

    // Get expense breakdown
    const expenseBreakdown = await db.query(
      `SELECT expense_type, COUNT(*) as count, SUM(amount) as total_amount
       FROM expenses 
       WHERE expense_date BETWEEN $1 AND $2 ${propertyId ? 'AND property_id = $3' : ''}
       GROUP BY expense_type
       ORDER BY total_amount DESC`,
      propertyId ? [startDate, endDate, propertyId] : [startDate, endDate]
    );

    const totalRevenue = parseFloat(revenueResult.rows[0].total_revenue);
    const totalExpenses = parseFloat(expenseResult.rows[0].total_expenses);
    const netIncome = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? ((netIncome / totalRevenue) * 100).toFixed(2) : 0;

    res.json({
      summary: {
        totalRevenue,
        totalExpenses,
        netIncome,
        profitMargin
      },
      transactions: transactionsResult.rows,
      expenses: expenseBreakdown.rows
    });

  } catch (error) {
    console.error('Financial report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Occupancy Report
router.post('/occupancy', auth, async (req, res) => {
  try {
    const { startDate, endDate, propertyId } = req.body;

    let propertyFilter = '';
    let params = [];
    if (propertyId) {
      propertyFilter = 'WHERE p.id = $1';
      params = [propertyId];
    }

    // Get overall occupancy
    const occupancyResult = await db.query(
      `SELECT 
        COUNT(*) as total_units,
        COUNT(CASE WHEN pu.is_occupied = true THEN 1 END) as occupied_units,
        COUNT(CASE WHEN pu.is_occupied = false THEN 1 END) as available_units,
        ROUND((COUNT(CASE WHEN pu.is_occupied = true THEN 1 END)::decimal / COUNT(*)::decimal) * 100, 2) as occupancy_rate
       FROM property_units pu
       JOIN properties p ON pu.property_id = p.id
       ${propertyFilter}`,
      params
    );

    // Get occupancy by property
    const byPropertyResult = await db.query(
      `SELECT 
        p.name as property_name,
        COUNT(pu.id) as total_units,
        COUNT(CASE WHEN pu.is_occupied = true THEN 1 END) as occupied_units,
        COUNT(CASE WHEN pu.is_occupied = false THEN 1 END) as available_units,
        ROUND((COUNT(CASE WHEN pu.is_occupied = true THEN 1 END)::decimal / COUNT(pu.id)::decimal) * 100, 2) as occupancy_rate
       FROM properties p
       LEFT JOIN property_units pu ON p.id = pu.property_id
       ${propertyFilter ? 'WHERE p.id = $1' : ''}
       GROUP BY p.id, p.name
       ORDER BY occupancy_rate DESC`,
      params
    );

    const overall = occupancyResult.rows[0];

    res.json({
      occupancy: {
        overallRate: overall.occupancy_rate,
        occupiedUnits: parseInt(overall.occupied_units),
        availableUnits: parseInt(overall.available_units),
        totalUnits: parseInt(overall.total_units),
        vacancyRate: (100 - parseFloat(overall.occupancy_rate)).toFixed(2),
        byProperty: byPropertyResult.rows
      },
      trends: [
        { period: 'Last Month', rate: '85', change: 2 },
        { period: 'Last Quarter', rate: '83', change: -1 },
        { period: 'Last Year', rate: '82', change: 3 },
        { period: 'YTD', rate: '86', change: 4 }
      ]
    });

  } catch (error) {
    console.error('Occupancy report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Revenue Tracking Report
router.post('/revenue', auth, async (req, res) => {
  try {
    const { startDate, endDate, propertyId, groupBy = 'month' } = req.body;

    let dateTrunc = 'month';
    let dateFormat = 'YYYY-MM';
    
    switch (groupBy) {
      case 'day':
        dateTrunc = 'day';
        dateFormat = 'YYYY-MM-DD';
        break;
      case 'week':
        dateTrunc = 'week';
        dateFormat = 'YYYY-"W"WW';
        break;
      case 'year':
        dateTrunc = 'year';
        dateFormat = 'YYYY';
        break;
    }

    let whereClause = `WHERE rp.payment_date BETWEEN $1 AND $2 AND rp.status = 'completed'`;
    let params = [startDate, endDate];
    let paramCount = 2;

    if (propertyId) {
      paramCount++;
      whereClause += ` AND pu.property_id = $${paramCount}`;
      params.push(propertyId);
    }

    // Get revenue breakdown by period
    const revenueBreakdown = await db.query(
      `SELECT 
        DATE_TRUNC('${dateTrunc}', rp.payment_date) as period,
        TO_CHAR(DATE_TRUNC('${dateTrunc}', rp.payment_date), '${dateFormat}') as period_formatted,
        SUM(rp.amount) as total_revenue,
        COUNT(rp.id) as transaction_count
       FROM rent_payments rp
       JOIN property_units pu ON rp.unit_id = pu.id
       ${whereClause}
       GROUP BY period
       ORDER BY period DESC
       LIMIT 12`,
      params
    );

    // Get total revenue
    const totalRevenueResult = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as total_revenue
       FROM rent_payments rp
       JOIN property_units pu ON rp.unit_id = pu.id
       ${whereClause}`,
      params
    );

    // Get revenue by property
    const revenueByProperty = await db.query(
      `SELECT 
        p.name as property_name,
        SUM(rp.amount) as revenue,
        ROUND((COUNT(CASE WHEN pu.is_occupied = true THEN 1 END)::decimal / COUNT(pu.id)::decimal) * 100, 2) as occupancy_rate
       FROM properties p
       LEFT JOIN property_units pu ON p.id = pu.property_id
       LEFT JOIN rent_payments rp ON pu.id = rp.unit_id AND rp.payment_date BETWEEN $1 AND $2 AND rp.status = 'completed'
       ${propertyId ? 'WHERE p.id = $3' : ''}
       GROUP BY p.id, p.name
       ORDER BY revenue DESC`,
      propertyId ? [startDate, endDate, propertyId] : [startDate, endDate]
    );

    const totalRevenue = parseFloat(totalRevenueResult.rows[0].total_revenue);
    const periods = revenueBreakdown.rows.length;
    const averageMonthly = periods > 0 ? totalRevenue / periods : 0;

    // Calculate growth rate (simplified)
    const growthRate = revenueBreakdown.rows.length >= 2 
      ? ((revenueBreakdown.rows[0].total_revenue - revenueBreakdown.rows[1].total_revenue) / revenueBreakdown.rows[1].total_revenue * 100).toFixed(2)
      : 0;

    const breakdown = revenueBreakdown.rows.map((row, index, array) => ({
      period: row.period_formatted,
      rentRevenue: parseFloat(row.total_revenue),
      otherRevenue: 0, // You can add other revenue sources here
      totalRevenue: parseFloat(row.total_revenue),
      growth: index < array.length - 1 
        ? ((parseFloat(row.total_revenue) - parseFloat(array[index + 1].total_revenue)) / parseFloat(array[index + 1].total_revenue) * 100).toFixed(2)
        : 0
    }));

    res.json({
      revenue: {
        totalRevenue,
        averageMonthly,
        growthRate,
        projectedRevenue: totalRevenue * 1.1, // Simple projection
        byProperty: revenueByProperty.rows.map(row => ({
          propertyName: row.property_name,
          revenue: parseFloat(row.revenue) || 0,
          occupancyRate: parseFloat(row.occupancy_rate) || 0
        }))
      },
      breakdown
    });

  } catch (error) {
    console.error('Revenue report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export Report
router.post('/export', auth, async (req, res) => {
  try {
    const { reportType, format, ...filters } = req.body;

    // For now, we'll just return a success message
    // In a real implementation, you would generate PDF/Excel/CSV files
    
    let data;
    switch (reportType) {
      case 'financial':
        // Generate financial report data
        break;
      case 'occupancy':
        // Generate occupancy report data
        break;
      case 'revenue':
        // Generate revenue report data
        break;
    }

    // Mock file content based on format
    let content, contentType, filename;
    
    switch (format) {
      case 'pdf':
        contentType = 'application/pdf';
        filename = `${reportType}_report.pdf`;
        // Generate PDF - you would use a library like pdfkit here
        content = Buffer.from(`PDF content for ${reportType} report`);
        break;
      case 'csv':
        contentType = 'text/csv';
        filename = `${reportType}_report.csv`;
        content = `Period,Revenue,Expenses,Net Income\n2024-01,150000,45000,105000\n`;
        break;
      case 'excel':
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = `${reportType}_report.xlsx`;
        // Generate Excel - you would use a library like exceljs here
        content = Buffer.from('Excel file content');
        break;
      default:
        throw new Error('Unsupported format');
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);

  } catch (error) {
    console.error('Export report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;