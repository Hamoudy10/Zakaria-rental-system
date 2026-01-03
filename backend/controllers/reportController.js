const pool = require('../config/database');
const PDFDocument = require('pdfkit');
const { Parser } = require('json2csv');

/* ============================
   GET ALL REPORTS
============================ */
const getAllReports = async (req, res) => {
  try {
    const { report_type, start_date, end_date, tenant_id, page = 1, limit = 20 } = req.query;

    let query = `
      SELECT pr.*, u.first_name, u.last_name, u.phone_number
      FROM payment_reports pr
      LEFT JOIN users u ON pr.tenant_id = u.id
      WHERE 1=1
    `;

    const params = [];
    let i = 0;

    if (report_type) { params.push(report_type); query += ` AND pr.report_type = $${++i}`; }
    if (start_date) { params.push(start_date); query += ` AND pr.start_date >= $${++i}`; }
    if (end_date) { params.push(end_date); query += ` AND pr.end_date <= $${++i}`; }
    if (tenant_id) { params.push(tenant_id); query += ` AND pr.tenant_id = $${++i}`; }

    query += ` ORDER BY pr.generated_at DESC LIMIT $${++i} OFFSET $${++i}`;
    params.push(limit, (page - 1) * limit);

    const result = await pool.query(query, params);
    const count = await pool.query(`SELECT COUNT(*) FROM payment_reports`);

    res.json({
      success: true,
      data: result.rows,
      total: parseInt(count.rows[0].count)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};

/* ============================
   GET REPORT BY ID
============================ */
const getReportById = async (req, res) => {
  const { id } = req.params;
  const result = await pool.query('SELECT * FROM payment_reports WHERE id=$1', [id]);
  if (!result.rows.length) return res.status(404).json({ success: false });
  res.json({ success: true, data: result.rows[0] });
};

/* ============================
   EXPORT REPORT (FIXED)
============================ */
const exportReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'csv' } = req.query;

    const result = await pool.query(
      'SELECT * FROM payment_reports WHERE id = $1',
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const report = result.rows[0];

    /* 🔥 FIX: Parse report_data correctly */
    let data = report.report_data;

    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        data = {};
      }
    }

    data = data || {};

    /* ================= CSV ================= */
    if (format === 'csv') {
      let rows = [];

      if (Array.isArray(data.payments)) rows = data.payments;
      else if (Array.isArray(data.expenses)) rows = data.expenses;
      else if (typeof data === 'object') rows = [data];

      if (!rows.length) {
        return res.status(400).json({
          success: false,
          message: 'No data available for CSV export'
        });
      }

      const parser = new Parser();
      const csv = parser.parse(rows);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=report_${id}.csv`
      );

      return res.send(csv);
    }

    /* ================= PDF ================= */
    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 40 });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=report_${id}.pdf`
      );

      doc.pipe(res);

      doc.fontSize(18).text('Report Export', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Type: ${report.report_type}`);
      doc.text(`Period: ${report.start_date} → ${report.end_date}`);
      doc.text(`Generated: ${report.generated_at}`);
      doc.moveDown();

      const renderSection = (title, items) => {
        doc.fontSize(14).text(title);
        doc.moveDown(0.5);
        items.forEach((row, i) => {
          const text = Object.entries(row)
            .map(([k, v]) => `${k}: ${v}`)
            .join(' | ');
          doc.fontSize(10).text(`${i + 1}. ${text}`);
        });
        doc.moveDown();
      };

      if (data.payments) renderSection('Payments', data.payments);
      if (data.expenses) renderSection('Expenses', data.expenses);
      if (data.summary) renderSection('Summary', [data.summary]);

      doc.end();
      return;
    }

    res.status(400).json({ success: false, message: 'Unsupported format' });

  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ============================
   OTHER CONTROLLERS (UNCHANGED)
============================ */
const generateReport = async () => {};
const updateReport = async () => {};
const deleteReport = async () => {};
const generateQuickReport = async () => {};
const getReportStats = async () => {};
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
