const pool = require('../config/database');
const PDFDocument = require('pdfkit');
const { Parser } = require('json2csv');

// GET ALL REPORTS WITH FILTERS AND PAGINATION
const getAllReports = async (req, res) => {
  try {
    const { report_type, start_date, end_date, tenant_id, page = 1, limit = 20 } = req.query;

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

    if (report_type) { paramCount++; query += ` AND pr.report_type = $${paramCount}`; queryParams.push(report_type); }
    if (start_date) { paramCount++; query += ` AND pr.start_date >= $${paramCount}`; queryParams.push(start_date); }
    if (end_date) { paramCount++; query += ` AND pr.end_date <= $${paramCount}`; queryParams.push(end_date); }
    if (tenant_id) { paramCount++; query += ` AND pr.tenant_id = $${paramCount}`; queryParams.push(tenant_id); }

    query += ` ORDER BY pr.generated_at DESC`;
    const offset = (page - 1) * limit;
    paramCount++; query += ` LIMIT $${paramCount}`; queryParams.push(limit);
    paramCount++; query += ` OFFSET $${paramCount}`; queryParams.push(offset);

    const result = await pool.query(query, queryParams);

    // total count for pagination
    let countQuery = `SELECT COUNT(*) FROM payment_reports pr WHERE 1=1`;
    const countParams = [];
    let countParamCount = 0;

    if (report_type) { countParamCount++; countQuery += ` AND pr.report_type = $${countParamCount}`; countParams.push(report_type); }
    if (start_date) { countParamCount++; countQuery += ` AND pr.start_date >= $${countParamCount}`; countParams.push(start_date); }
    if (end_date) { countParamCount++; countQuery += ` AND pr.end_date <= $${countParamCount}`; countParams.push(end_date); }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

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
    res.status(500).json({ success: false, message: 'Error fetching reports', error: error.message });
  }
};

// GET REPORT BY ID
const getReportById = async (req, res) => {
  try {
    const { id } = req.params;
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

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Report not found' });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ success: false, message: 'Error fetching report', error: error.message });
  }
};

// GENERATE NEW REPORT
const generateReport = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { tenant_id, report_type, start_date, end_date } = req.body;

    if (!report_type || !start_date || !end_date) {
      return res.status(400).json({ success: false, message: 'Missing required fields: report_type, start_date, end_date' });
    }

    const validReportTypes = ['rent_payments', 'expenses', 'financial_summary', 'tenant_statement'];
    if (!validReportTypes.includes(report_type)) {
      return res.status(400).json({ success: false, message: `Invalid report type. Must be one of: ${validReportTypes.join(', ')}` });
    }

    let reportData = {};
    let totalPayments = 0;

    // Generate report data based on type
    switch (report_type) {
      case 'rent_payments':
        if (tenant_id) {
          const paymentsResult = await client.query(`
            SELECT rp.*, p.name as property_name, pu.unit_number, pu.unit_code
            FROM rent_payments rp
            LEFT JOIN property_units pu ON rp.unit_id = pu.id
            LEFT JOIN properties p ON pu.property_id = p.id
            WHERE rp.tenant_id = $1 AND rp.payment_date BETWEEN $2 AND $3
            ORDER BY rp.payment_date DESC
          `, [tenant_id, start_date, end_date]);

          totalPayments = paymentsResult.rows.reduce((sum, p) => sum + parseFloat(p.amount), 0);
          reportData = { payments: paymentsResult.rows, summary: { total_payments: paymentsResult.rows.length, total_amount: totalPayments } };
        } else {
          const paymentsResult = await client.query(`
            SELECT rp.*, u.first_name as tenant_first_name, u.last_name as tenant_last_name, p.name as property_name, pu.unit_number
            FROM rent_payments rp
            LEFT JOIN users u ON rp.tenant_id = u.id
            LEFT JOIN property_units pu ON rp.unit_id = pu.id
            LEFT JOIN properties p ON pu.property_id = p.id
            WHERE rp.payment_date BETWEEN $1 AND $2
            ORDER BY rp.payment_date DESC
          `, [start_date, end_date]);

          totalPayments = paymentsResult.rows.reduce((sum, p) => sum + parseFloat(p.amount), 0);
          reportData = { payments: paymentsResult.rows, summary: { total_payments: paymentsResult.rows.length, total_amount: totalPayments } };
        }
        break;

      case 'expenses':
        const expensesResult = await client.query(`
          SELECT e.*, p.name as property_name, pu.unit_number, u.first_name as recorded_by_name
          FROM expenses e
          LEFT JOIN properties p ON e.property_id = p.id
          LEFT JOIN property_units pu ON e.unit_id = pu.id
          LEFT JOIN users u ON e.recorded_by = u.id
          WHERE e.expense_date BETWEEN $1 AND $2
          ORDER BY e.expense_date DESC
        `, [start_date, end_date]);

        const totalExpenses = expensesResult.rows.reduce((sum, e) => sum + parseFloat(e.amount), 0);
        reportData = { expenses: expensesResult.rows, summary: { total_expenses: expensesResult.rows.length, total_amount: totalExpenses } };
        break;

      case 'financial_summary':
        const rentSummary = await client.query(`
          SELECT COUNT(*) as total_payments, SUM(amount) as total_rent_collected
          FROM rent_payments WHERE payment_date BETWEEN $1 AND $2
        `, [start_date, end_date]);

        const expenseSummary = await client.query(`
          SELECT COUNT(*) as total_expenses, SUM(amount) as total_expenses_amount
          FROM expenses WHERE expense_date BETWEEN $1 AND $2
        `, [start_date, end_date]);

        reportData = {
          rent_summary: rentSummary.rows[0],
          expense_summary: expenseSummary.rows[0],
          net_income: parseFloat(rentSummary.rows[0].total_rent_collected || 0) - parseFloat(expenseSummary.rows[0].total_expenses_amount || 0)
        };
        break;

      case 'tenant_statement':
        if (!tenant_id) return res.status(400).json({ success: false, message: 'Tenant ID is required for tenant statement' });

        const tenantResult = await client.query('SELECT * FROM users WHERE id = $1', [tenant_id]);
        if (tenantResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Tenant not found' });

        const tenantPayments = await client.query(`
          SELECT rp.*, p.name as property_name, pu.unit_number
          FROM rent_payments rp
          LEFT JOIN property_units pu ON rp.unit_id = pu.id
          LEFT JOIN properties p ON pu.property_id = p.id
          WHERE rp.tenant_id = $1 AND rp.payment_date BETWEEN $2 AND $3
        `, [tenant_id, start_date, end_date]);

        totalPayments = tenantPayments.rows.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        reportData = { tenant: tenantResult.rows[0], payments: tenantPayments.rows, summary: { total_payments: tenantPayments.rows.length, total_amount: totalPayments } };
        break;
    }

    const reportResult = await client.query(`
      INSERT INTO payment_reports (tenant_id, report_type, start_date, end_date, total_payments, report_data, generated_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING *
    `, [tenant_id || null, report_type, start_date, end_date, totalPayments, JSON.stringify(reportData)]);

    await client.query('COMMIT');

    res.status(201).json({ success: true, message: 'Report generated successfully', data: { ...reportResult.rows[0], report_data: reportData } });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error generating report:', error);
    res.status(500).json({ success: false, message: 'Error generating report', error: error.message });
  } finally {
    client.release();
  }
};

// UPDATE REPORT METADATA
const updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { report_type, start_date, end_date } = req.body;

    const reportCheck = await pool.query('SELECT id FROM payment_reports WHERE id=$1', [id]);
    if (reportCheck.rows.length === 0) return res.status(404).json({ success: false, message: 'Report not found' });

    const result = await pool.query(`
      UPDATE payment_reports
      SET report_type=COALESCE($1,report_type),
          start_date=COALESCE($2,start_date),
          end_date=COALESCE($3,end_date)
      WHERE id=$4 RETURNING *
    `, [report_type, start_date, end_date, id]);

    res.json({ success: true, message: 'Report updated successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({ success: false, message: 'Error updating report', error: error.message });
  }
};

// DELETE REPORT
const deleteReport = async (req, res) => {
  try {
    const { id } = req.params;
    const reportCheck = await pool.query('SELECT id, report_type FROM payment_reports WHERE id=$1', [id]);
    if (reportCheck.rows.length === 0) return res.status(404).json({ success: false, message: 'Report not found' });

    await pool.query('DELETE FROM payment_reports WHERE id=$1', [id]);
    res.json({ success: true, message: `Report (${reportCheck.rows[0].report_type}) deleted successfully` });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ success: false, message: 'Error deleting report', error: error.message });
  }
};

// QUICK REPORT (WITHOUT STORING)
const generateQuickReport = async (req, res) => {
  try {
    const { report_type, start_date, end_date, tenant_id } = req.body;
    if (!report_type || !start_date || !end_date) return res.status(400).json({ success: false, message: 'Missing required fields' });

    let reportData = {};

    switch (report_type) {
      case 'rent_payments_summary':
        const summaryResult = await pool.query(`
          SELECT COUNT(*) as total_payments, SUM(amount) as total_amount FROM rent_payments
          WHERE payment_date BETWEEN $1 AND $2
        `, [start_date, end_date]);
        reportData = summaryResult.rows[0];
        break;

      case 'occupancy_rate':
        const occupancyResult = await pool.query(`
          SELECT COUNT(*) as total_units, COUNT(CASE WHEN is_occupied THEN 1 END) as occupied_units FROM property_units
        `);
        reportData = occupancyResult.rows[0];
        break;

      case 'revenue_vs_expenses':
        const revenueResult = await pool.query(`SELECT SUM(amount) as total_revenue FROM rent_payments WHERE payment_date BETWEEN $1 AND $2`, [start_date, end_date]);
        const expensesResult = await pool.query(`SELECT SUM(amount) as total_expenses FROM expenses WHERE expense_date BETWEEN $1 AND $2`, [start_date, end_date]);
        reportData = { total_revenue: parseFloat(revenueResult.rows[0].total_revenue || 0), total_expenses: parseFloat(expensesResult.rows[0].total_expenses || 0) };
        break;

      default:
        return res.status(400).json({ success: false, message: 'Unsupported quick report type' });
    }

    res.json({ success: true, message: 'Quick report generated successfully', data: reportData });
  } catch (error) {
    console.error('Error generating quick report:', error);
    res.status(500).json({ success: false, message: 'Error generating quick report', error: error.message });
  }
};

// REPORT STATISTICS / OVERVIEW
const getReportStats = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let dateFilter = '';
    const queryParams = [];
    if (start_date && end_date) { dateFilter = 'WHERE generated_at BETWEEN $1 AND $2'; queryParams.push(start_date, end_date); }

    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_reports,
        COUNT(DISTINCT report_type) as unique_report_types,
        COUNT(DISTINCT tenant_id) as tenants_with_reports,
        COUNT(CASE WHEN report_type='rent_payments' THEN 1 END) as rent_payment_reports
      FROM payment_reports ${dateFilter}
    `, queryParams);

    res.json({ success: true, data: statsResult.rows[0] });
  } catch (error) {
    console.error('Error fetching report stats:', error);
    res.status(500).json({ success: false, message: 'Error fetching report stats', error: error.message });
  }
};

// GET /api/reports/types
// GET /api/reports/types
// GET /api/reports/types
const getReportTypes = (req, res) => {
  res.json({
    success: true,
    data: [
      { label: 'Rent Payments', value: 'rent_payments' },
      { label: 'Expenses', value: 'expenses' },
      { label: 'Financial Summary', value: 'financial_summary' },
      { label: 'Tenant Statement', value: 'tenant_statement' }
    ]
  });
};



// EXPORT REPORT (CSV/PDF placeholder)

// EXPORT REPORT (CSV / PDF)
// EXPORT REPORT (CSV/PDF)
const exportReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'csv' } = req.query;

    const result = await pool.query(
      'SELECT * FROM payment_reports WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const report = result.rows[0];
    const data = report.report_data || {};

    /* ================= CSV ================= */
    if (format === 'csv') {
      let rows = [];

      if (data.payments) rows = data.payments;
      else if (data.expenses) rows = data.expenses;
      else rows = [data];

      const parser = new Parser();
      const csv = parser.parse(rows);

      // Send CSV as raw content
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=report_${id}.csv`);
      return res.send(csv);
    }

    /* ================= PDF ================= */
    if (format === 'pdf') {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 40 });

      // Set response headers first
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=report_${id}.pdf`);

      // Pipe PDF directly to response
      doc.pipe(res);

      // PDF content
      doc.fontSize(18).text('Report Export', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Report Type: ${report.report_type}`);
      doc.text(`Period: ${report.start_date} → ${report.end_date}`);
      doc.text(`Generated At: ${report.generated_at}`);
      doc.moveDown();

      const writeSection = (title, items) => {
        doc.fontSize(14).text(title);
        doc.moveDown(0.5);

        items.forEach((row, index) => {
          // Format row nicely instead of raw JSON
          const rowText = Object.entries(row)
            .map(([key, val]) => `${key}: ${val}`)
            .join(' | ');
          doc.fontSize(10).text(`${index + 1}. ${rowText}`);
        });

        doc.moveDown();
      };

      if (data.payments) writeSection('Payments', data.payments);
      if (data.expenses) writeSection('Expenses', data.expenses);
      if (data.summary) writeSection('Summary', [data.summary]);

      // End the PDF stream
      doc.end();
      return; // Do not send JSON after this
    }

    return res.status(400).json({ success: false, message: 'Unsupported format' });
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting report',
      error: error.message
    });
  }
};



module.exports = {
  getAllReports,
  getReportById,
  generateReport,
  updateReport,
  deleteReport,
  generateQuickReport,
  getReportStats,
  exportReport,
  getReportTypes
};
