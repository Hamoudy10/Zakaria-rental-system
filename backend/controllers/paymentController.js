const axios = require('axios');
const moment = require('moment');
const pool = require('../config/database');
const NotificationService = require('../services/notificationService');

// Check database connection
const checkDatabase = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
};

// Generate timestamp for M-Pesa (YYYYMMDDHHmmss format)
const generateTimestamp = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
};

// Generate M-Pesa password
const generatePassword = (shortCode, passKey, timestamp) => {
  const passwordString = `${shortCode}${passKey}${timestamp}`;
  return Buffer.from(passwordString).toString('base64');
};

// Get M-Pesa access token
const getAccessToken = async () => {
  try {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    
    const response = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${auth}`,
        },
      }
    );
    
    return response.data.access_token;
  } catch (error) {
    console.error('❌ Error getting access token:', error.response?.data || error.message);
    throw new Error(`Failed to get access token: ${error.message}`);
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
      account_reference = 'RENTAL_PAYMENT',
      transaction_desc = 'Monthly Rent Payment'
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

    // Check tenant allocation
    console.log('🔍 Checking tenant allocation for user:', req.user.id, 'unit:', unitId);
    const allocationCheck = await pool.query(
      `SELECT 
        ta.id, 
        ta.tenant_id, 
        ta.unit_id,
        ta.monthly_rent,
        p.name as property_name,
        pu.unit_number,
        u.first_name,
        u.last_name
       FROM tenant_allocations ta
       LEFT JOIN property_units pu ON ta.unit_id = pu.id
       LEFT JOIN properties p ON pu.property_id = p.id
       LEFT JOIN users u ON ta.tenant_id = u.id
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
    const unitMonthlyRent = parseFloat(allocation.monthly_rent);
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

    // REAL M-Pesa Integration
    console.log('🔧 Initiating real M-Pesa STK Push...');

    // Get M-Pesa credentials from environment
    const shortCode = process.env.MPESA_SHORT_CODE;
    const passKey = process.env.MPESA_PASSKEY;
    const callbackUrl = `${process.env.BACKEND_URL}/api/payments/mpesa-callback`;

    if (!shortCode || !passKey) {
      throw new Error('M-Pesa configuration missing: MPESA_SHORT_CODE or MPESA_PASSKEY not set');
    }

    // Get access token
    const access_token = await getAccessToken();
    console.log('✅ M-Pesa access token obtained');

    // Generate timestamp and password
    const timestamp = generateTimestamp();
    const password = generatePassword(shortCode, passKey, timestamp);

    // Prepare STK Push request payload :cite[1]:cite[2]
    const stkPushPayload = {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(paymentAmount), // M-Pesa requires whole numbers
      PartyA: formattedPhone,
      PartyB: shortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: account_reference,
      TransactionDesc: transaction_desc,
    };

    console.log('📤 Initiating STK Push:', { 
      phone: formattedPhone, 
      amount: paymentAmount, 
      shortcode: shortCode,
      callback_url: callbackUrl
    });

    // Initiate STK Push :cite[1]:cite[10]
    const stkResponse = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      stkPushPayload,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    console.log('✅ STK Push initiated:', stkResponse.data);

    if (stkResponse.data.ResponseCode !== '0') {
      throw new Error(`M-Pesa API error: ${stkResponse.data.ResponseDescription}`);
    }

    // Create pending payment record
    const paymentResult = await pool.query(
      `INSERT INTO rent_payments (
        tenant_id, unit_id, phone_number, amount, 
        payment_month, status, mpesa_transaction_id,
        merchant_request_id, payment_method, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *`,
      [
        req.user.id,
        unitId,
        formattedPhone,
        paymentAmount,
        paymentMonth,
        'pending',
        stkResponse.data.CheckoutRequestID,
        stkResponse.data.MerchantRequestID,
        'mpesa'
      ]
    );

    const paymentRecord = paymentResult.rows[0];
    console.log('✅ Pending payment record created:', paymentRecord.id);

    // Create pending payment notification for tenant
    try {
      await NotificationService.createNotification({
        userId: req.user.id,
        title: 'Payment Initiated',
        message: `Your rent payment of KSh ${paymentAmount} for ${paymentMonth} has been initiated. Please check your phone to enter your M-Pesa PIN.`,
        type: 'payment_pending',
        relatedEntityType: 'rent_payment',
        relatedEntityId: paymentRecord.id
      });
      console.log('✅ Pending payment notification created');
    } catch (notificationError) {
      console.error('❌ Failed to create pending payment notification:', notificationError);
    }

    res.json({
      success: true,
      message: 'M-Pesa payment initiated successfully. Please check your phone to enter your M-Pesa PIN.',
      checkoutRequestID: stkResponse.data.CheckoutRequestID,
      merchantRequestID: stkResponse.data.MerchantRequestID,
      responseCode: stkResponse.data.ResponseCode,
      responseDescription: stkResponse.data.ResponseDescription,
      customerMessage: stkResponse.data.CustomerMessage,
      payment: paymentRecord
    });

  } catch (error) {
    console.error('❌ ERROR in initiateSTKPush:', error);
    
    // Create error notification for tenant
    try {
      await NotificationService.createNotification({
        userId: req.user.id,
        title: 'Payment Failed',
        message: `Failed to initiate rent payment: ${error.message}`,
        type: 'payment_failed'
      });
    } catch (notificationError) {
      console.error('Failed to create error notification:', notificationError);
    }
    
    res.status(500).json({
      success: false,
      message: 'Error initiating M-Pesa payment',
      error: error.message,
      details: error.response?.data || error.message,
    });
  }
};

// M-Pesa callback handler :cite[1]:cite[4]
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
    const resultCode = stkCallback.ResultCode;

    console.log('🔍 Processing callback for:', checkoutRequestId, 'ResultCode:', resultCode);

    // Find the payment record with tenant and property details
    const paymentResult = await pool.query(
      `SELECT 
        rp.*,
        u.first_name,
        u.last_name,
        p.name as property_name,
        pu.unit_number
       FROM rent_payments rp
       LEFT JOIN users u ON rp.tenant_id = u.id
       LEFT JOIN property_units pu ON rp.unit_id = pu.id
       LEFT JOIN properties p ON pu.property_id = p.id
       WHERE rp.mpesa_transaction_id = $1`,
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
    if (resultCode === 0) {
      const callbackMetadata = stkCallback.CallbackMetadata?.Item;
      
      if (!callbackMetadata) {
        console.log('❌ No callback metadata found');
        await pool.query(
          'UPDATE rent_payments SET status = $1, failure_reason = $2 WHERE id = $3',
          ['failed', 'No callback metadata received', payment.id]
        );

        // Create failure notification
        try {
          await NotificationService.createNotification({
            userId: payment.tenant_id,
            title: 'Payment Failed',
            message: 'Payment failed: No confirmation received from M-Pesa',
            type: 'payment_failed',
            relatedEntityType: 'rent_payment',
            relatedEntityId: payment.id
          });
        } catch (notificationError) {
          console.error('Failed to create failure notification:', notificationError);
        }

        return res.status(200).json({ 
          ResultCode: 0, 
          ResultDesc: 'Success' 
        });
      }

      // Extract payment details from callback metadata :cite[4]
      let amount, mpesaReceiptNumber, transactionDate, phoneNumber;

      if (Array.isArray(callbackMetadata)) {
        callbackMetadata.forEach(item => {
          switch (item.Name) {
            case 'Amount':
              amount = item.Value;
              break;
            case 'MpesaReceiptNumber':
              mpesaReceiptNumber = item.Value;
              break;
            case 'TransactionDate':
              transactionDate = item.Value;
              break;
            case 'PhoneNumber':
              phoneNumber = item.Value;
              break;
          }
        });
      }

      console.log('✅ Payment successful:', {
        receipt: mpesaReceiptNumber,
        amount: amount,
        phone: phoneNumber,
        transactionDate: transactionDate
      });

      // Update payment status to completed
      await pool.query(
        `UPDATE rent_payments 
         SET status = 'completed', 
             mpesa_receipt_number = $1,
             payment_date = NOW(),
             confirmed_at = NOW(),
             confirmed_by = $2
         WHERE id = $3`,
        [
          mpesaReceiptNumber,
          payment.tenant_id,
          payment.id
        ]
      );

      console.log('✅ Payment completed in database');

      // Create payment notifications using NotificationService
      try {
        await NotificationService.createPaymentNotification({
          tenantId: payment.tenant_id,
          tenantName: `${payment.first_name} ${payment.last_name}`,
          unitInfo: `Unit ${payment.unit_number}`,
          propertyInfo: payment.property_name,
          amount: amount || payment.amount,
          paymentMonth: payment.payment_month,
          mpesaReceipt: mpesaReceiptNumber,
          paymentId: payment.id
        });
        console.log('✅ Payment notifications created successfully');
      } catch (notificationError) {
        console.error('❌ Failed to create payment notifications:', notificationError);
      }

    } else {
      // Transaction failed
      const failureReason = stkCallback.ResultDesc || 'Payment failed';
      await pool.query(
        'UPDATE rent_payments SET status = $1, failure_reason = $2 WHERE id = $3',
        ['failed', failureReason, payment.id]
      );

      // Create failure notification for tenant
      try {
        await NotificationService.createNotification({
          userId: payment.tenant_id,
          title: 'Payment Failed',
          message: `Payment failed: ${failureReason}`,
          type: 'payment_failed',
          relatedEntityType: 'rent_payment',
          relatedEntityId: payment.id
        });
      } catch (notificationError) {
        console.error('Failed to create failure notification:', notificationError);
      }

      console.log('❌ Payment failed:', failureReason);
    }

    // Always return success to M-Pesa to avoid repeated callbacks :cite[1]
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
       WHERE rp.mpesa_transaction_id = $1`,
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

// Process Salary Payment with M-Pesa
const processSalaryPayment = async (req, res) => {
  console.log('💰 processSalaryPayment called with:', {
    body: req.body,
    user: req.user
  });

  try {
    const {
      agentId,
      amount,
      paymentMonth,
      phone
    } = req.body;

    // Validate required fields
    if (!agentId || !amount || !paymentMonth || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: agentId, amount, paymentMonth, phone'
      });
    }

    // Validate phone number format
    const cleanedPhone = phone.replace(/\s+/g, '');
    const phoneRegex = /^(?:254|\+254|0)?(7[0-9]{8})$/;
    const match = cleanedPhone.match(phoneRegex);
    
    if (!match) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Use Kenyan format: 07... or 254...'
      });
    }

    const formattedPhone = `254${match[1]}`;

    // Get agent details
    const agentQuery = await pool.query(
      `SELECT id, first_name, last_name FROM users WHERE id = $1 AND role = 'agent'`,
      [agentId]
    );

    if (agentQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    const agent = agentQuery.rows[0];

    // Get admin details for notification
    const adminQuery = await pool.query(
      `SELECT first_name, last_name FROM users WHERE id = $1`,
      [req.user.id]
    );
    const admin = adminQuery.rows[0] || { first_name: 'Admin', last_name: 'User' };

    // REAL M-Pesa Integration for Salary Payments
    console.log('🔧 Initiating real M-Pesa salary payment...');

    const shortCode = process.env.MPESA_SHORT_CODE;
    const passKey = process.env.MPESA_PASSKEY;
    const callbackUrl = `${process.env.BACKEND_URL}/api/payments/salary-callback`;

    // Get access token
    const access_token = await getAccessToken();
    
    // Generate timestamp and password
    const timestamp = generateTimestamp();
    const password = generatePassword(shortCode, passKey, timestamp);

    // Prepare STK Push request for salary
    const stkPushPayload = {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: formattedPhone,
      PartyB: shortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: 'SALARY_PAYMENT',
      TransactionDesc: `Salary for ${paymentMonth}`,
    };

    // Initiate STK Push for salary
    const stkResponse = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      stkPushPayload,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (stkResponse.data.ResponseCode !== '0') {
      throw new Error(`M-Pesa API error: ${stkResponse.data.ResponseDescription}`);
    }

    // Create pending salary payment record
    const salaryPaymentResult = await pool.query(
      `INSERT INTO salary_payments (
        agent_id, amount, payment_month, phone_number,
        mpesa_transaction_id, merchant_request_id,
        paid_by, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *`,
      [
        agentId,
        amount,
        paymentMonth,
        formattedPhone,
        stkResponse.data.CheckoutRequestID,
        stkResponse.data.MerchantRequestID,
        req.user.id,
        'pending'
      ]
    );

    const salaryRecord = salaryPaymentResult.rows[0];

    // Create pending salary notifications
    try {
      await NotificationService.createNotification({
        userId: agentId,
        title: 'Salary Payment Initiated',
        message: `Your salary payment of KSh ${amount} for ${paymentMonth} has been initiated. Please check your phone.`,
        type: 'salary_pending',
        relatedEntityType: 'salary_payment',
        relatedEntityId: salaryRecord.id
      });

      await NotificationService.createNotification({
        userId: req.user.id,
        title: 'Salary Payment Initiated',
        message: `Salary payment of KSh ${amount} to ${agent.first_name} ${agent.last_name} has been initiated.`,
        type: 'salary_processed',
        relatedEntityType: 'salary_payment',
        relatedEntityId: salaryRecord.id
      });
    } catch (notificationError) {
      console.error('Failed to create salary notifications:', notificationError);
    }

    res.json({
      success: true,
      message: 'Salary payment initiated successfully. Agent will receive an M-Pesa prompt.',
      checkoutRequestID: stkResponse.data.CheckoutRequestID,
      payment: salaryRecord
    });

  } catch (error) {
    console.error('❌ ERROR in processSalaryPayment:', error);
    
    // Create error notification for admin
    try {
      await NotificationService.createNotification({
        userId: req.user.id,
        title: 'Salary Payment Failed',
        message: `Failed to process salary payment: ${error.message}`,
        type: 'payment_failed'
      });
    } catch (notificationError) {
      console.error('Failed to create error notification:', notificationError);
    }

    res.status(500).json({
      success: false,
      message: 'Error processing salary payment',
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

// Get all payments (for admin)
const getAllPayments = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let query = `
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
    `;

    let countQuery = `SELECT COUNT(*) FROM rent_payments rp`;
    const queryParams = [];
    const countParams = [];

    if (status) {
      query += ` WHERE rp.status = $1`;
      countQuery += ` WHERE rp.status = $1`;
      queryParams.push(status);
      countParams.push(status);
    }

    query += ` ORDER BY rp.created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);

    const paymentsResult = await pool.query(query, queryParams);
    const countResult = await pool.query(countQuery, countParams);

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: {
        payments: paymentsResult.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('❌ ERROR getting all payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payments',
      error: error.message
    });
  }
};

module.exports = {
  initiateSTKPush,
  handleMpesaCallback,
  checkPaymentStatus,
  getPaymentById,
  getPaymentsByTenant,
  getAllPayments,
  processSalaryPayment
};