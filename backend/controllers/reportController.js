const pool = require('../config/database');

const getReports = async (req, res) => {
  try {
    const query = 'SELECT * FROM reports ORDER BY created_at DESC';
    const { rows } = await pool.query(query);
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching reports'
    });
  }
};

const generateReport = async (req, res) => {
  try {
    const { type, start_date, end_date } = req.body;
    
    // Simple report generation - you can expand this
    let reportData = {};
    
    if (type === 'financial') {
      const query = `
        SELECT 
          COUNT(*) as total_payments,
          SUM(amount) as total_revenue,
          AVG(amount) as average_payment
        FROM payments 
        WHERE payment_date BETWEEN $1 AND $2
      `;
      const { rows } = await pool.query(query, [start_date, end_date]);
      reportData = rows[0];
    }
    
    // Save report to database
    const insertQuery = `
      INSERT INTO reports (type, generated_by, start_date, end_date, data) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *
    `;
    const { rows } = await pool.query(insertQuery, [
      type, 
      req.user.userId, 
      start_date, 
      end_date, 
      JSON.stringify(reportData)
    ]);
    
    res.status(201).json({
      success: true,
      message: 'Report generated successfully',
      data: rows[0]
    });
  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error generating report'
    });
  }
};

module.exports = {
  getReports,
  generateReport
};