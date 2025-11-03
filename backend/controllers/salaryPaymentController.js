const db = require('../config/database');

const salaryPaymentController = {
  getSalaryPayments: async (req, res) => {
    try {
      const userRole = req.user.role;
      const userId = req.user.id;

      let query = `
        SELECT 
          sp.*, 
          u.first_name, u.last_name,
          payer.first_name as payer_first_name, payer.last_name as payer_last_name
        FROM salary_payments sp
        LEFT JOIN users u ON sp.agent_id = u.id
        LEFT JOIN users payer ON sp.paid_by = payer.id
        WHERE 1=1
      `;

      const params = [];

      // Agents can only see their own payments
      if (userRole === 'agent') {
        query += ` AND sp.agent_id = $1`;
        params.push(userId);
      }

      query += ` ORDER BY sp.payment_date DESC`;

      const result = await db.query(query, params);
      res.json({ data: result.rows });
    } catch (error) {
      console.error('Error fetching salary payments:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  createSalaryPayment: async (req, res) => {
    try {
      // Only admin can create salary payments
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { agent_id, amount, payment_month, mpesa_transaction_id, phone_number } = req.body;

      const query = `
        INSERT INTO salary_payments 
        (agent_id, amount, payment_month, mpesa_transaction_id, phone_number, paid_by, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'completed')
        RETURNING *
      `;

      const result = await db.query(query, [
        agent_id, amount, payment_month, mpesa_transaction_id, phone_number, req.user.id
      ]);

      res.status(201).json({ 
        message: 'Salary payment created successfully',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error creating salary payment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getSalaryPaymentById: async (req, res) => {
    try {
      const { id } = req.params;
      const userRole = req.user.role;
      const userId = req.user.id;

      let query = `
        SELECT 
          sp.*, 
          u.first_name, u.last_name,
          payer.first_name as payer_first_name, payer.last_name as payer_last_name
        FROM salary_payments sp
        LEFT JOIN users u ON sp.agent_id = u.id
        LEFT JOIN users payer ON sp.paid_by = payer.id
        WHERE sp.id = $1
      `;

      const params = [id];

      // Agents can only see their own payments
      if (userRole === 'agent') {
        query += ` AND sp.agent_id = $2`;
        params.push(userId);
      }

      const result = await db.query(query, params);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Salary payment not found' });
      }

      res.json({ data: result.rows[0] });
    } catch (error) {
      console.error('Error fetching salary payment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  updateSalaryPaymentStatus: async (req, res) => {
    try {
      // Only admin can update salary payment status
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { id } = req.params;
      const { status } = req.body;

      const query = `
        UPDATE salary_payments 
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;

      const result = await db.query(query, [status, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Salary payment not found' });
      }

      res.json({ 
        message: 'Salary payment status updated successfully',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error updating salary payment status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = salaryPaymentController;