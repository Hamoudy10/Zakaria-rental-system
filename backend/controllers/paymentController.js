const { query } = require('../config/database');

const getPayments = async (req, res) => {
  try {
    const paymentsResult = await query(`
      SELECT rp.*, 
             u.first_name, u.last_name,
             p.name as property_name,
             pu.unit_number
      FROM rent_payments rp
      LEFT JOIN users u ON rp.tenant_id = u.id
      LEFT JOIN property_units pu ON rp.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      ORDER BY rp.payment_date DESC
    `);

    res.json({
      success: true,
      payments: paymentsResult.rows
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payments'
    });
  }
};

const getPaymentsByTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const paymentsResult = await query(`
      SELECT rp.*, 
             p.name as property_name,
             pu.unit_number,
             pu.unit_code
      FROM rent_payments rp
      LEFT JOIN property_units pu ON rp.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE rp.tenant_id = $1
      ORDER BY rp.payment_date DESC
    `, [tenantId]);

    res.json({
      success: true,
      payments: paymentsResult.rows
    });
  } catch (error) {
    console.error('Get tenant payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payments'
    });
  }
};

const createPayment = async (req, res) => {
  try {
    const {
      tenant_id,
      unit_id,
      mpesa_transaction_id,
      mpesa_receipt_number,
      phone_number,
      amount,
      payment_month,
      status
    } = req.body;

    const newPayment = await query(
      `INSERT INTO rent_payments 
       (tenant_id, unit_id, mpesa_transaction_id, mpesa_receipt_number, phone_number, amount, payment_month, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [tenant_id, unit_id, mpesa_transaction_id, mpesa_receipt_number, phone_number, amount, payment_month, status || 'completed']
    );

    res.json({
      success: true,
      payment: newPayment.rows[0]
    });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment'
    });
  }
};

module.exports = {
  getPayments,
  getPaymentsByTenant,
  createPayment
};