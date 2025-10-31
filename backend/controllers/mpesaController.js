const axios = require('axios');
const pool = require('../config/database');
const paymentController = require('./paymentController');

class MpesaController {
  // Handle paybill payment confirmation from M-Pesa
  async handlePaybillPayment(req, res) {
    try {
      console.log('📞 M-Pesa Paybill Payment Received:', JSON.stringify(req.body, null, 2));

      const callbackData = req.body;

      // M-Pesa paybill callback structure
      if (callbackData.TransType === 'Pay Bill' && callbackData.ResultCode === 0) {
        const {
          BillRefNumber: unit_code,
          TransAmount: amount,
          TransID: mpesa_receipt_number,
          MSISDN: phone_number,
          TransTime: transaction_date
        } = callbackData;

        console.log('💰 Processing paybill payment:', {
          unit_code,
          amount,
          mpesa_receipt_number,
          phone_number,
          transaction_date
        });

        // Format transaction date from M-Pesa format (YYYYMMDDHHmmss) to ISO
        const formattedDate = this.formatMpesaDate(transaction_date);

        // Process the payment using existing payment controller
        const paymentResult = await paymentController.processPaybillPayment({
          body: {
            unit_code,
            amount: parseFloat(amount),
            mpesa_receipt_number,
            phone_number: this.formatMpesaPhone(phone_number),
            transaction_date: formattedDate,
            payment_month: new Date().toISOString().slice(0, 7) // Current month
          },
          user: { id: null } // No user context for automated payments
        }, res);

        console.log('✅ Paybill payment processed successfully');

      } else {
        console.log('❌ Invalid or failed paybill transaction:', callbackData.ResultDesc);
      }

      // Always acknowledge receipt to M-Pesa
      res.status(200).json({
        ResultCode: 0,
        ResultDesc: 'Success'
      });

    } catch (error) {
      console.error('❌ ERROR processing paybill payment:', error);
      // Still acknowledge to avoid repeated callbacks
      res.status(200).json({
        ResultCode: 0,
        ResultDesc: 'Success'
      });
    }
  }

  // Format M-Pesa date (YYYYMMDDHHmmss) to ISO string
  formatMpesaDate(mpesaDate) {
    const year = mpesaDate.substring(0, 4);
    const month = mpesaDate.substring(4, 6);
    const day = mpesaDate.substring(6, 8);
    const hours = mpesaDate.substring(8, 10);
    const minutes = mpesaDate.substring(10, 12);
    const seconds = mpesaDate.substring(12, 14);
    
    return new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}`);
  }

  // Format M-Pesa phone number (254XXXXXXXXX) to standard format
  formatMpesaPhone(phone) {
    // Remove any non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Ensure it starts with 254
    if (cleaned.startsWith('0') && cleaned.length === 10) {
      return '254' + cleaned.substring(1);
    } else if (cleaned.startsWith('254') && cleaned.length === 12) {
      return cleaned;
    } else if (cleaned.startsWith('7') && cleaned.length === 9) {
      return '254' + cleaned;
    }
    
    return cleaned;
  }

  // Validate paybill transaction before processing
  async validatePaybillTransaction(transactionData) {
    try {
      const { unit_code, mpesa_receipt_number } = transactionData;

      // Check for duplicate transaction
      const duplicateCheck = await pool.query(
        'SELECT id FROM rent_payments WHERE mpesa_receipt_number = $1',
        [mpesa_receipt_number]
      );

      if (duplicateCheck.rows.length > 0) {
        throw new Error(`Duplicate M-Pesa transaction: ${mpesa_receipt_number}`);
      }

      // Validate unit exists and has active tenant
      const unitCheck = await pool.query(
        `SELECT pu.id, ta.tenant_id, ta.is_active
         FROM property_units pu
         LEFT JOIN tenant_allocations ta ON pu.id = ta.unit_id AND ta.is_active = true
         WHERE pu.unit_code = $1`,
        [unit_code]
      );

      if (unitCheck.rows.length === 0) {
        throw new Error(`Unit not found: ${unit_code}`);
      }

      if (!unitCheck.rows[0].tenant_id) {
        throw new Error(`No active tenant for unit: ${unit_code}`);
      }

      return true;

    } catch (error) {
      console.error('❌ Paybill validation failed:', error);
      throw error;
    }
  }

  // Get paybill payment statistics
  async getPaybillStats(req, res) {
    try {
      const { period = '30days' } = req.query;

      const statsQuery = `
        SELECT 
          COUNT(*) as total_payments,
          SUM(amount) as total_amount,
          COUNT(DISTINCT unit_id) as unique_units,
          AVG(amount) as average_payment
        FROM rent_payments 
        WHERE payment_method = 'paybill'
        AND payment_date >= NOW() - INTERVAL '${period}'
        AND status = 'completed'
      `;

      const result = await pool.query(statsQuery);
      
      res.json({
        success: true,
        data: result.rows[0],
        period
      });

    } catch (error) {
      console.error('❌ Error getting paybill stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get paybill statistics',
        error: error.message
      });
    }
  }
}

module.exports = new MpesaController();