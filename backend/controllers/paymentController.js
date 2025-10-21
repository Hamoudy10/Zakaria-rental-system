const axios = require('axios');
const moment = require('moment');
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

// Add this function to check database connection
const checkDatabase = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful:', result.rows[0]);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
};

// Real M-Pesa STK Push function
const initiateSTKPush = async (req, res) => {
  console.log('🚀 initiateSTKPush called with:', {
    body: req.body,
    user: req.user
  });

  try {
    // Check database connection first
    const dbConnected = await checkDatabase();
    if (!dbConnected) {
      return res.status(500).json({
        success: false,
        message: 'Database connection failed'
      });
    }

    const { 
      phone, 
      amount, 
      unitId,
      paymentMonth,
      account_reference = 'RENTAL',
      transaction_desc = 'Rent Payment'
    } = req.body;

    console.log('📦 Payment data:', { phone, amount, unitId, paymentMonth });

    // Validate required fields
    if (!phone || !amount || !unitId || !paymentMonth) {
      console.log('❌ Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: phone, amount, unitId, paymentMonth'
      });
    }

    // Validate phone number format (Kenyan format)
    const cleanedPhone = phone.replace(/\s+/g, '');
    const phoneRegex = /^(?:254|\+254|0)?(7[0-9]{8})$/;
    const match = cleanedPhone.match(phoneRegex);
    
    if (!match) {
      console.log('❌ Invalid phone number format:', cleanedPhone);
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Use Kenyan format: 07... or 254...'
      });
    }

    const formattedPhone = `254${match[1]}`;
    console.log('📞 Formatted phone:', formattedPhone);

    // FIXED: Use monthly_rent column instead of rent_amount
    console.log('🔍 Checking tenant allocation for user:', req.user.id, 'unit:', unitId);
    const allocationCheck = await pool.query(
      `SELECT 
        ta.id, 
        ta.tenant_id, 
        ta.unit_id,
        ta.monthly_rent,  -- CHANGED: Using monthly_rent from tenant_allocations
        p.name as property_name,
        pu.unit_number
       FROM tenant_allocations ta
       LEFT JOIN property_units pu ON ta.unit_id = pu.id
       LEFT JOIN properties p ON pu.property_id = p.id
       WHERE ta.unit_id = $1 AND ta.tenant_id = $2 AND ta.is_active = true`,
      [unitId, req.user.id]
    );

    if (allocationCheck.rows.length === 0) {
      console.log('❌ No active allocation found for this unit and tenant');
      return res.status(400).json({
        success: false,
        message: 'You are not allocated to this unit or allocation is not active'
      });
    }

    const allocation = allocationCheck.rows[0];
    console.log('✅ Allocation found:', allocation);

    // Validate amount matches the unit's monthly rent
    const unitMonthlyRent = parseFloat(allocation.monthly_rent); // CHANGED: monthly_rent
    const paymentAmount = parseFloat(amount);
    
    if (paymentAmount !== unitMonthlyRent) {
      console.log(`❌ Payment amount (${paymentAmount}) doesn't match unit monthly rent (${unitMonthlyRent})`);
      return res.status(400).json({
        success: false,
        message: `Payment amount must be exactly KSh ${unitMonthlyRent} (the monthly rent for this unit)`
      });
    }

    // Check for existing payment for this month
    console.log('🔍 Checking for existing payment...');
    const existingPayment = await pool.query(
      `SELECT id, status FROM rent_payments 
       WHERE tenant_id = $1 AND unit_id = $2 AND payment_month = $3`,
      [req.user.id, unitId, paymentMonth]
    );

    if (existingPayment.rows.length > 0) {
      const payment = existingPayment.rows[0];
      console.log('⚠️ Existing payment found:', payment);
      
      if (payment.status === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Payment for this month already completed'
        });
      } else if (payment.status === 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Payment for this month is already pending'
        });
      }
    }

    // Check if using real M-Pesa
    const useRealMpesa = process.env.VITE_USE_REAL_MPESA === 'true' || process.env.USE_REAL_MPESA === 'true';
    console.log('💰 M-Pesa Mode:', useRealMpesa ? 'REAL' : 'MOCK');

    if (!useRealMpesa) {
      console.log('🔧 Using mock M-Pesa payment...');
      
      // Create a mock payment record
      const mockPaymentResult = await pool.query(
        `INSERT INTO rent_payments (
          tenant_id, unit_id, phone_number, amount, 
          payment_month, status, mpesa_receipt_number,
          mpesa_transaction_id, payment_date, confirmed_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          req.user.id,
          unitId,
          formattedPhone,
          amount,
          paymentMonth,
          'completed',
          `MPESA${Date.now()}`,
          `TEST${Date.now()}`,
          new Date(),
          req.user.id
        ]
      );

      console.log('✅ Mock payment created:', mockPaymentResult.rows[0].id);

      // Create payment notification
      await pool.query(
        `INSERT INTO payment_notifications (
          payment_id, recipient_id, message_type, message_content,
          mpesa_code, amount, payment_date, property_info, unit_info, is_sent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          mockPaymentResult.rows[0].id,
          req.user.id,
          'payment_confirmation',
          `Your rent payment of KSh ${amount} for ${paymentMonth} has been confirmed. Thank you!`,
          `MPESA${Date.now()}`,
          amount,
          new Date(),
          allocation.property_name,
          `Unit ${allocation.unit_number}`,
          true
        ]
      );

      return res.json({
        success: true,
        message: 'Mock payment processed successfully',
        payment: mockPaymentResult.rows[0],
        checkoutRequestId: `MOCK${Date.now()}`
      });
    }

    // REAL M-Pesa Integration
    console.log('🔧 Initiating real M-Pesa STK Push...');

    // Get access token from Daraja API
    const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
    
    const tokenResponse = await axios.get(
      `${process.env.MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );

    const access_token = tokenResponse.data.access_token;
    console.log('✅ M-Pesa access token obtained');

    // Prepare STK Push request
    const timestamp = moment().format('YYYYMMDDHHmmss');
    const password = Buffer.from(
      `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString('base64');

    const stkPushPayload = {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount), // M-Pesa requires whole numbers
      PartyA: formattedPhone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: formattedPhone,
      CallBackURL: `${process.env.BACKEND_URL}/api/payments/mpesa-callback`,
      AccountReference: account_reference,
      TransactionDesc: transaction_desc,
    };

    console.log('📤 Initiating STK Push:', { 
      phone: formattedPhone, 
      amount, 
      shortcode: process.env.MPESA_SHORTCODE,
      callback_url: `${process.env.BACKEND_URL}/api/payments/mpesa-callback`
    });

    // Initiate STK Push
    const stkResponse = await axios.post(
      `${process.env.MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
      stkPushPayload,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ STK Push initiated:', stkResponse.data);

    // Create pending payment record
    const paymentResult = await pool.query(
      `INSERT INTO rent_payments (
        tenant_id, unit_id, phone_number, amount, 
        payment_month, status, mpesa_transaction_id,
        merchant_request_id, payment_method
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        req.user.id,
        unitId,
        formattedPhone,
        amount,
        paymentMonth,
        'pending',
        stkResponse.data.CheckoutRequestID,
        stkResponse.data.MerchantRequestID,
        'mpesa'
      ]
    );

    const paymentRecord = paymentResult.rows[0];
    console.log('✅ Pending payment record created:', paymentRecord.id);

    res.json({
      success: true,
      message: 'M-Pesa payment initiated successfully',
      checkoutRequestID: stkResponse.data.CheckoutRequestID,
      merchantRequestID: stkResponse.data.MerchantRequestID,
      responseCode: stkResponse.data.ResponseCode,
      responseDescription: stkResponse.data.ResponseDescription,
      payment: paymentRecord
    });

  } catch (error) {
    console.error('❌ ERROR in initiateSTKPush:', error);
    console.error('🔍 Error details:', {
      message: error.message,
      response: error.response?.data,
      code: error.code,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Error initiating M-Pesa payment',
      error: error.message,
      details: error.response?.data || error.message,
    });
  }
};

// M-Pesa callback handler
const handleMpesaCallback = async (req, res) => {
  console.log('📞 M-Pesa callback received:', JSON.stringify(req.body, null, 2));

  try {
    const callbackData = req.body;
    
    // Check if this is a valid STK callback
    if (!callbackData.Body || !callbackData.Body.stkCallback) {
      console.log('❌ Invalid callback format');
      return res.status(200).json({ 
        ResultCode: 0, 
        ResultDesc: 'Success' 
      });
    }

    const stkCallback = callbackData.Body.stkCallback;
    const checkoutRequestId = stkCallback.CheckoutRequestID;

    console.log('🔍 Processing callback for:', checkoutRequestId);

    // Find the payment record
    const paymentResult = await pool.query(
      'SELECT * FROM rent_payments WHERE mpesa_transaction_id = $1',
      [checkoutRequestId]
    );

    if (paymentResult.rows.length === 0) {
      console.log('❌ Payment not found for checkoutRequestId:', checkoutRequestId);
      return res.status(200).json({ 
        ResultCode: 0, 
        ResultDesc: 'Success' 
      });
    }

    const payment = paymentResult.rows[0];

    // Check if transaction was successful
    if (stkCallback.ResultCode === 0) {
      const callbackMetadata = stkCallback.CallbackMetadata?.Item;
      
      if (!callbackMetadata) {
        console.log('❌ No callback metadata found');
        await pool.query(
          'UPDATE rent_payments SET status = $1, failure_reason = $2 WHERE id = $3',
          ['failed', 'No callback metadata received', payment.id]
        );
        return res.status(200).json({ 
          ResultCode: 0, 
          ResultDesc: 'Success' 
        });
      }

      // Extract payment details from callback
      const amount = callbackMetadata.find(item => item.Name === 'Amount')?.Value;
      const mpesaReceiptNumber = callbackMetadata.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
      const transactionDate = callbackMetadata.find(item => item.Name === 'TransactionDate')?.Value;
      const phoneNumber = callbackMetadata.find(item => item.Name === 'PhoneNumber')?.Value;

      console.log('✅ Payment successful:', {
        receipt: mpesaReceiptNumber,
        amount: amount,
        phone: phoneNumber,
        transactionDate: transactionDate
      });

      // Get allocation details for notification
      const allocationResult = await pool.query(
        `SELECT 
          p.name as property_name,
          pu.unit_number
         FROM tenant_allocations ta
         LEFT JOIN property_units pu ON ta.unit_id = pu.id
         LEFT JOIN properties p ON pu.property_id = p.id
         WHERE ta.unit_id = $1 AND ta.tenant_id = $2`,
        [payment.unit_id, payment.tenant_id]
      );

      const allocation = allocationResult.rows[0] || {};

      // Update payment status to completed
      await pool.query(
        `UPDATE rent_payments 
         SET status = 'completed', 
             mpesa_receipt_number = $1,
             payment_date = $2,
             confirmed_at = $2,
             confirmed_by = $3
         WHERE id = $4`,
        [
          mpesaReceiptNumber,
          new Date(),
          payment.tenant_id, // or system user
          payment.id
        ]
      );

      // Create payment notification
      await pool.query(
        `INSERT INTO payment_notifications (
          payment_id, recipient_id, message_type, message_content,
          mpesa_code, amount, payment_date, property_info, unit_info, is_sent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          payment.id,
          payment.tenant_id,
          'payment_confirmation',
          `Your rent payment of KSh ${amount} has been confirmed. M-Pesa receipt: ${mpesaReceiptNumber}`,
          mpesaReceiptNumber,
          amount,
          new Date(),
          allocation.property_name || 'Property',
          `Unit ${allocation.unit_number || 'N/A'}`,
          true
        ]
      );

      console.log('✅ Payment completed and notification sent');

    } else {
      // Transaction failed
      await pool.query(
        'UPDATE rent_payments SET status = $1, failure_reason = $2 WHERE id = $3',
        ['failed', stkCallback.ResultDesc || 'Payment cancelled by user', payment.id]
      );

      console.log('❌ Payment failed:', stkCallback.ResultDesc);
    }

    // Always return success to M-Pesa to avoid repeated callbacks
    res.status(200).json({ 
      ResultCode: 0, 
      ResultDesc: 'Success' 
    });

  } catch (error) {
    console.error('❌ ERROR in M-Pesa callback:', error);
    // Still return success to M-Pesa to avoid repeated callbacks
    res.status(200).json({ 
      ResultCode: 0, 
      ResultDesc: 'Success' 
    });
  }
};

// Check payment status
const checkPaymentStatus = async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;

    console.log('🔍 Checking payment status for:', checkoutRequestId);

    const result = await pool.query(
      'SELECT * FROM rent_payments WHERE mpesa_transaction_id = $1',
      [checkoutRequestId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    res.json({
      success: true,
      payment: result.rows[0]
    });

  } catch (error) {
    console.error('❌ ERROR checking payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check payment status',
      error: error.message
    });
  }
};

// Get payment by ID
const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        rp.*,
        u.first_name as tenant_first_name,
        u.last_name as tenant_last_name,
        p.name as property_name,
        pu.unit_number
       FROM rent_payments rp
       LEFT JOIN users u ON rp.tenant_id = u.id
       LEFT JOIN property_units pu ON rp.unit_id = pu.id
       LEFT JOIN properties p ON pu.property_id = p.id
       WHERE rp.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    res.json({
      success: true,
      payment: result.rows[0]
    });

  } catch (error) {
    console.error('❌ ERROR getting payment by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment',
      error: error.message
    });
  }
};

// Get payments by tenant
const getPaymentsByTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;

    console.log('🔍 Getting payments for tenant:', tenantId);

    const result = await pool.query(
      `SELECT 
        rp.*,
        p.name as property_name,
        pu.unit_number,
        pu.unit_code
       FROM rent_payments rp
       LEFT JOIN property_units pu ON rp.unit_id = pu.id
       LEFT JOIN properties p ON pu.property_id = p.id
       WHERE rp.tenant_id = $1
       ORDER BY rp.payment_month DESC`,
      [tenantId]
    );

    console.log(`✅ Found ${result.rows.length} payments for tenant ${tenantId}`);

    res.json({
      success: true,
      count: result.rows.length,
      payments: result.rows
    });

  } catch (error) {
    console.error('❌ ERROR getting payments by tenant:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tenant payments',
      error: error.message
    });
  }
};

module.exports = {
  initiateSTKPush,
  handleMpesaCallback,
  checkPaymentStatus,
  getPaymentById,
  getPaymentsByTenant
};