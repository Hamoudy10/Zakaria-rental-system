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
    
    if (!consumerKey || !consumerSecret) {
      throw new Error('M-Pesa consumer key or secret not configured');
    }
    
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    
    const response = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${auth}`,
        },
        timeout: 10000,
      }
    );
    
    return response.data.access_token;
  } catch (error) {
    console.error('❌ Error getting access token:', error.response?.data || error.message);
    throw new Error(`Failed to get access token: ${error.message}`);
  }
};

// Format payment month to proper date format
const formatPaymentMonth = (paymentMonth) => {
  console.log('📅 Formatting payment month:', paymentMonth);
  
  if (typeof paymentMonth === 'string' && paymentMonth.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return paymentMonth;
  }
  
  if (typeof paymentMonth === 'string' && paymentMonth.match(/^\d{4}-\d{2}$/)) {
    return `${paymentMonth}-01`;
  }
  
  if (paymentMonth instanceof Date) {
    return paymentMonth.toISOString().split('T')[0];
  }
  
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
};

// NEW: Track rent payment with carry-forward logic
const trackRentPayment = async (tenantId, unitId, amount, paymentDate) => {
  try {
    // Get tenant allocation and current month's rent status
    const allocationQuery = `
      SELECT ta.*, pu.rent_amount 
      FROM tenant_allocations ta 
      JOIN property_units pu ON ta.unit_id = pu.id 
      WHERE ta.tenant_id = $1 AND ta.unit_id = $2 AND ta.is_active = true
    `;
    const allocationResult = await pool.query(allocationQuery, [tenantId, unitId]);
    
    if (allocationResult.rows.length === 0) {
      throw new Error('No active tenant allocation found');
    }

    const allocation = allocationResult.rows[0];
    const monthlyRent = parseFloat(allocation.monthly_rent);
    const paymentAmount = parseFloat(amount);
    const currentMonth = new Date(paymentDate).toISOString().slice(0, 7); // YYYY-MM
    
    // Check current month's paid amount
    const currentMonthPaymentsQuery = `
      SELECT COALESCE(SUM(amount), 0) as total_paid 
      FROM rent_payments 
      WHERE tenant_id = $1 AND unit_id = $2 
      AND DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', $3::timestamp)
      AND status = 'completed'
    `;
    const currentMonthResult = await pool.query(currentMonthPaymentsQuery, [tenantId, unitId, paymentDate]);
    const currentMonthPaid = parseFloat(currentMonthResult.rows[0].total_paid);
    
    const remainingForCurrentMonth = monthlyRent - currentMonthPaid;
    let currentMonthPayment = 0;
    let carryForwardAmount = 0;
    let isMonthComplete = false;
    
    if (paymentAmount <= remainingForCurrentMonth) {
      // Full amount applies to current month
      currentMonthPayment = paymentAmount;
      isMonthComplete = (currentMonthPaid + currentMonthPayment) >= monthlyRent;
    } else {
      // Part applies to current month, rest carries forward
      currentMonthPayment = remainingForCurrentMonth;
      carryForwardAmount = paymentAmount - remainingForCurrentMonth;
      isMonthComplete = true;
    }
    
    return {
      currentMonthPayment,
      carryForwardAmount,
      monthlyRent,
      currentMonthPaid,
      isMonthComplete,
      remainingForCurrentMonth
    };
  } catch (error) {
    console.error('Error in trackRentPayment:', error);
    throw error;
  }
};

// NEW: Record carry-forward payment
const recordCarryForward = async (tenantId, unitId, amount, originalPaymentId, paymentDate) => {
  try {
    const nextMonth = new Date(paymentDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthFormatted = nextMonth.toISOString().slice(0, 7) + '-01';
    
    const carryForwardQuery = `
      INSERT INTO rent_payments 
      (tenant_id, unit_id, amount, payment_month, status, is_advance_payment, original_payment_id, payment_date)
      VALUES ($1, $2, $3, $4, 'completed', true, $5, $6)
      RETURNING *
    `;
    
    const result = await pool.query(carryForwardQuery, [
      tenantId, 
      unitId, 
      amount, 
      nextMonthFormatted, 
      originalPaymentId,
      paymentDate
    ]);
    
    console.log(`✅ Carry-forward payment recorded: KSh ${amount} for ${nextMonthFormatted}`);
    return result.rows[0];
  } catch (error) {
    console.error('Error recording carry-forward:', error);
    throw error;
  }
};

// NEW: Enhanced payment notification system
const sendPaymentNotifications = async (payment, trackingResult, isCarryForward = false) => {
  try {
    const paymentId = payment.id || payment.payment_id;
    const tenantId = payment.tenant_id;
    const amount = payment.amount;
    
    // Get tenant and property details for notifications
    const detailsQuery = `
      SELECT 
        u.first_name, u.last_name, u.phone_number,
        p.name as property_name, pu.unit_number, pu.unit_code
      FROM rent_payments rp
      LEFT JOIN users u ON rp.tenant_id = u.id
      LEFT JOIN property_units pu ON rp.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE rp.id = $1
    `;
    const detailsResult = await pool.query(detailsQuery, [paymentId]);
    
    if (detailsResult.rows.length === 0) {
      console.error('❌ Could not find payment details for notification');
      return;
    }
    
    const details = detailsResult.rows[0];
    const tenantName = `${details.first_name} ${details.last_name}`;
    const propertyInfo = details.property_name;
    const unitInfo = `Unit ${details.unit_number} (${details.unit_code})`;
    
    if (isCarryForward) {
      // Notification for carry-forward payment
      const carryForwardNotification = {
        userId: tenantId,
        title: 'Payment Carry-Forward',
        message: `Your payment of KSh ${amount} has been carried forward to next month as advance payment.`,
        type: 'payment_carry_forward',
        relatedEntityType: 'rent_payment',
        relatedEntityId: paymentId
      };
      
      await NotificationService.createNotification(carryForwardNotification);
    } else {
      // Success notification to tenant
      let tenantMessage = `Your rent payment of KSh ${amount} has been processed successfully. `;
      
      if (trackingResult.carryForwardAmount > 0) {
        tenantMessage += `KSh ${trackingResult.currentMonthPayment} applied to current month, KSh ${trackingResult.carryForwardAmount} carried forward to next month.`;
      } else if (trackingResult.isMonthComplete) {
        tenantMessage += `Your rent for this month is now fully paid.`;
      } else {
        tenantMessage += `Your rent for this month is partially paid. Remaining balance: KSh ${trackingResult.remainingForCurrentMonth - trackingResult.currentMonthPayment}.`;
      }
      
      const tenantNotification = {
        userId: tenantId,
        title: 'Payment Successful',
        message: tenantMessage,
        type: 'payment_success',
        relatedEntityType: 'rent_payment',
        relatedEntityId: paymentId
      };
      
      await NotificationService.createNotification(tenantNotification);
      
      // Notification to all admins
      const adminUsers = await pool.query('SELECT id FROM users WHERE role = $1', ['admin']);
      
      for (const admin of adminUsers.rows) {
        const adminMessage = `Tenant ${tenantName} has successfully paid KSh ${amount} for ${propertyInfo} - ${unitInfo}. `;
        
        if (trackingResult.carryForwardAmount > 0) {
          adminMessage += `KSh ${trackingResult.carryForwardAmount} carried forward to next month.`;
        }
        
        const adminNotification = {
          userId: admin.id,
          title: 'Tenant Payment Received',
          message: adminMessage,
          type: 'payment_confirmation',
          relatedEntityType: 'rent_payment',
          relatedEntityId: paymentId
        };
        
        await NotificationService.createNotification(adminNotification);
      }
      
      console.log('✅ Payment notifications sent successfully');
    }
    
  } catch (error) {
    console.error('❌ Error sending payment notifications:', error);
  }
};

// NEW: Enhanced M-Pesa callback with payment tracking
const handleMpesaCallback = async (req, res) => {
  console.log('📞 M-Pesa callback received:', JSON.stringify(req.body, null, 2));

  try {
    const callbackData = req.body;
    
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
        pu.unit_number,
        pu.unit_code
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

      // Extract payment details from callback metadata
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

      // NEW: Track payment and handle carry-forward
      const paymentDate = new Date();
      const trackingResult = await trackRentPayment(
        payment.tenant_id, 
        payment.unit_id, 
        amount || payment.amount, 
        paymentDate
      );

      // Update payment status to completed
      await pool.query(
        `UPDATE rent_payments 
         SET status = 'completed', 
             mpesa_receipt_number = $1,
             payment_date = $2,
             confirmed_at = $2,
             confirmed_by = $3,
             amount = $4
         WHERE id = $5`,
        [
          mpesaReceiptNumber,
          paymentDate,
          payment.tenant_id, // Using tenant_id as confirmed_by for auto-confirmation
          trackingResult.currentMonthPayment, // Use the allocated amount for current month
          payment.id
        ]
      );

      console.log('✅ Payment completed in database');

      // NEW: Handle carry-forward if applicable
      if (trackingResult.carryForwardAmount > 0) {
        console.log(`🔄 Processing carry-forward: KSh ${trackingResult.carryForwardAmount}`);
        const carryForwardPayment = await recordCarryForward(
          payment.tenant_id,
          payment.unit_id,
          trackingResult.carryForwardAmount,
          payment.id,
          paymentDate
        );
        
        // Send carry-forward notification
        await sendPaymentNotifications(carryForwardPayment, trackingResult, true);
      }

      // NEW: Send enhanced payment notifications
      await sendPaymentNotifications(payment, trackingResult, false);

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

// NEW: Manual payment recording with tracking
const recordManualPayment = async (req, res) => {
  try {
    const { 
      tenant_id, 
      unit_id, 
      amount, 
      payment_month, 
      mpesa_receipt_number, 
      phone_number,
      notes 
    } = req.body;

    console.log('📝 Recording manual payment:', { tenant_id, unit_id, amount, payment_month });

    // Validate required fields
    if (!tenant_id || !unit_id || !amount || !payment_month) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: tenant_id, unit_id, amount, payment_month'
      });
    }

    const paymentDate = new Date();
    const formattedPaymentMonth = formatPaymentMonth(payment_month);

    // Track payment
    const trackingResult = await trackRentPayment(tenant_id, unit_id, amount, paymentDate);

    // Record the main payment
    const paymentQuery = `
      INSERT INTO rent_payments 
      (tenant_id, unit_id, amount, payment_month, payment_date, status,
       mpesa_receipt_number, phone_number, confirmed_by, confirmed_at, notes)
      VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const paymentResult = await pool.query(paymentQuery, [
      tenant_id,
      unit_id,
      trackingResult.currentMonthPayment,
      formattedPaymentMonth,
      paymentDate,
      mpesa_receipt_number,
      phone_number,
      req.user.id, // Admin user recording the payment
      paymentDate,
      notes
    ]);

    const paymentRecord = paymentResult.rows[0];

    // Handle carry forward if applicable
    if (trackingResult.carryForwardAmount > 0) {
      console.log(`🔄 Processing carry-forward for manual payment: KSh ${trackingResult.carryForwardAmount}`);
      await recordCarryForward(
        tenant_id,
        unit_id,
        trackingResult.carryForwardAmount,
        paymentRecord.id,
        paymentDate
      );
    }

    // Send notifications
    await sendPaymentNotifications(paymentRecord, trackingResult, false);

    res.status(201).json({
      success: true,
      message: 'Manual payment recorded successfully',
      payment: paymentRecord,
      tracking: trackingResult
    });

  } catch (error) {
    console.error('❌ ERROR recording manual payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record manual payment',
      error: error.message
    });
  }
};

// NEW: Get payment tracking summary for tenant
const getPaymentSummary = async (req, res) => {
  try {
    const { tenantId, unitId } = req.params;

    const currentDate = new Date();
    const currentMonth = currentDate.toISOString().slice(0, 7); // YYYY-MM

    // Get allocation details
    const allocationQuery = `
      SELECT ta.*, pu.rent_amount, p.name as property_name, pu.unit_number
      FROM tenant_allocations ta
      JOIN property_units pu ON ta.unit_id = pu.id
      JOIN properties p ON pu.property_id = p.id
      WHERE ta.tenant_id = $1 AND ta.unit_id = $2 AND ta.is_active = true
    `;
    const allocationResult = await pool.query(allocationQuery, [tenantId, unitId]);

    if (allocationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active allocation found'
      });
    }

    const allocation = allocationResult.rows[0];

    // Get current month payments
    const currentMonthPaymentsQuery = `
      SELECT COALESCE(SUM(amount), 0) as total_paid, 
             COUNT(*) as payment_count
      FROM rent_payments 
      WHERE tenant_id = $1 AND unit_id = $2 
      AND DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', $3::timestamp)
      AND status = 'completed'
    `;
    const currentMonthResult = await pool.query(currentMonthPaymentsQuery, [tenantId, unitId, currentDate]);

    const totalPaid = parseFloat(currentMonthResult.rows[0].total_paid);
    const monthlyRent = parseFloat(allocation.monthly_rent);
    const balance = monthlyRent - totalPaid;
    const isFullyPaid = balance <= 0;

    // Get advance payments (carry-forward)
    const advancePaymentsQuery = `
      SELECT COALESCE(SUM(amount), 0) as advance_amount
      FROM rent_payments 
      WHERE tenant_id = $1 AND unit_id = $2 
      AND is_advance_payment = true
      AND status = 'completed'
    `;
    const advanceResult = await pool.query(advancePaymentsQuery, [tenantId, unitId]);
    const advanceAmount = parseFloat(advanceResult.rows[0].advance_amount);

    res.json({
      success: true,
      summary: {
        monthlyRent,
        totalPaid,
        balance,
        isFullyPaid,
        advanceAmount,
        paymentCount: currentMonthResult.rows[0].payment_count,
        propertyName: allocation.property_name,
        unitNumber: allocation.unit_number
      }
    });

  } catch (error) {
    console.error('❌ ERROR getting payment summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment summary',
      error: error.message
    });
  }
};

// NEW: Get payment history with tracking info
const getPaymentHistory = async (req, res) => {
  try {
    const { tenantId, unitId } = req.params;
    const { months = 6 } = req.query;

    const paymentsQuery = `
      SELECT 
        rp.*,
        p.name as property_name,
        pu.unit_number,
        pu.unit_code,
        rp.is_advance_payment,
        rp.original_payment_id
      FROM rent_payments rp
      LEFT JOIN property_units pu ON rp.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE rp.tenant_id = $1 AND rp.unit_id = $2
      AND rp.payment_date >= NOW() - INTERVAL '${months} months'
      ORDER BY rp.payment_date DESC
    `;

    const result = await pool.query(paymentsQuery, [tenantId, unitId]);

    // Group payments by month and calculate totals
    const monthlySummary = {};
    result.rows.forEach(payment => {
      const month = payment.payment_month.toISOString().slice(0, 7); // YYYY-MM
      if (!monthlySummary[month]) {
        monthlySummary[month] = {
          month: month,
          totalPaid: 0,
          payments: [],
          isFullyPaid: false
        };
      }
      monthlySummary[month].totalPaid += parseFloat(payment.amount);
      monthlySummary[month].payments.push(payment);
    });

    // Get monthly rent for comparison
    const allocationQuery = `
      SELECT monthly_rent FROM tenant_allocations 
      WHERE tenant_id = $1 AND unit_id = $2 AND is_active = true
    `;
    const allocationResult = await pool.query(allocationQuery, [tenantId, unitId]);
    
    const monthlyRent = allocationResult.rows.length > 0 ? parseFloat(allocationResult.rows[0].monthly_rent) : 0;

    // Mark months as fully paid
    Object.keys(monthlySummary).forEach(month => {
      monthlySummary[month].isFullyPaid = monthlySummary[month].totalPaid >= monthlyRent;
    });

    res.json({
      success: true,
      payments: result.rows,
      monthlySummary: Object.values(monthlySummary),
      monthlyRent
    });

  } catch (error) {
    console.error('❌ ERROR getting payment history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment history',
      error: error.message
    });
  }
};

// ADDED: Process Salary Payment Function
const processSalaryPayment = async (req, res) => {
  try {
    const { agent_id, amount, payment_month, phone_number } = req.body;
    
    console.log('💰 Processing salary payment:', { 
      agent_id, amount, payment_month, phone_number 
    });

    // Validate required fields
    if (!agent_id || !amount || !payment_month || !phone_number) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: agent_id, amount, payment_month, phone_number'
      });
    }

    // Check if agent exists and is active
    const agentQuery = await pool.query(
      'SELECT id, first_name, last_name FROM users WHERE id = $1 AND role = $2 AND is_active = true',
      [agent_id, 'agent']
    );

    if (agentQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or inactive'
      });
    }

    const agent = agentQuery.rows[0];

    // Check if salary for this month already processed
    const existingPaymentQuery = await pool.query(
      'SELECT id FROM salary_payments WHERE agent_id = $1 AND payment_month = $2',
      [agent_id, payment_month]
    );

    if (existingPaymentQuery.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Salary for this month has already been processed'
      });
    }

    // Process M-Pesa payment (simulated for now)
    const mpesaTransactionId = `MPESA_${Date.now()}`;
    const mpesaReceiptNumber = `R${Date.now()}`;

    // Insert salary payment record
    const insertQuery = `
      INSERT INTO salary_payments (
        agent_id, amount, payment_month, phone_number,
        mpesa_transaction_id, mpesa_receipt_number,
        paid_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      agent_id,
      amount,
      payment_month,
      phone_number,
      mpesaTransactionId,
      mpesaReceiptNumber,
      req.user.id, // The admin processing the payment
      'completed'
    ]);

    const salaryPayment = result.rows[0];

    console.log('✅ Salary payment processed successfully:', salaryPayment.id);

    // Create notification for the agent
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        agent_id,
        'Salary Processed',
        `Your salary of KSh ${amount} for ${new Date(payment_month).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })} has been processed.`,
        'salary_processed',
        'salary_payment',
        salaryPayment.id
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Salary payment processed successfully',
      data: salaryPayment
    });

  } catch (error) {
    console.error('❌ Process salary payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error processing salary payment',
      error: error.message
    });
  }
};

// Keep existing functions (initiateSTKPush, checkPaymentStatus, etc.) but they now use the enhanced tracking
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

    // Format payment month to proper date format
    const formattedPaymentMonth = formatPaymentMonth(paymentMonth);
    console.log('📅 Formatted payment month:', formattedPaymentMonth);

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

    // NEW: Allow any amount (removed strict amount validation)
    const unitMonthlyRent = parseFloat(allocation.monthly_rent);
    const paymentAmount = parseFloat(amount);
    
    // Check for existing payment for this month
    console.log('🔍 Checking for existing payment...');
    const existingPayment = await pool.query(
      `SELECT id, status FROM rent_payments 
       WHERE tenant_id = $1 AND unit_id = $2 AND payment_month = $3`,
      [req.user.id, unitId, formattedPaymentMonth]
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
    
    // Use environment variable for callback URL with fallback
    const callbackUrl = process.env.MPESA_CALLBACK_URL || `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/payments/mpesa-callback`;

    console.log('🔗 Callback URL:', callbackUrl);

    if (!shortCode || !passKey) {
      throw new Error('M-Pesa configuration missing: MPESA_SHORT_CODE or MPESA_PASSKEY not set');
    }

    // Validate callback URL is set
    if (!callbackUrl || callbackUrl.includes('undefined')) {
      throw new Error('M-Pesa callback URL is not properly configured. Check BACKEND_URL environment variable.');
    }

    // Get access token
    const access_token = await getAccessToken();
    console.log('✅ M-Pesa access token obtained');

    // Generate timestamp and password
    const timestamp = generateTimestamp();
    const password = generatePassword(shortCode, passKey, timestamp);

    // Prepare STK Push request payload
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

    console.log('🎯 FINAL STK PUSH DETAILS:', {
      phone: formattedPhone,
      amount: paymentAmount,
      shortCode: shortCode,
      callbackUrl: callbackUrl,
      timestamp: timestamp,
      environment: process.env.MPESA_ENVIRONMENT
    });

    console.log('📤 Initiating STK Push to M-Pesa...');
    
    // Initiate STK Push
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
        formattedPaymentMonth, // Use formatted date
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

// Keep other existing functions (checkPaymentStatus, processSalaryPayment, etc.) as they are
// ... [rest of the existing functions remain the same]

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

// ... [other existing functions like processSalaryPayment, getPaymentById, etc.]

module.exports = {
  initiateSTKPush,
  handleMpesaCallback,
  checkPaymentStatus,
  getPaymentById: async (req, res) => {
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
  },
  getPaymentsByTenant: async (req, res) => {
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
  },
  getAllPayments: async (req, res) => {
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
  },
  processSalaryPayment,
  testMpesaConfig: async (req, res) => {
    try {
      console.log('🔧 Testing M-Pesa configuration...');
      
      const mpesaConfig = {
        consumerKey: process.env.MPESA_CONSUMER_KEY ? '✅ Set' : '❌ Missing',
        consumerSecret: process.env.MPESA_CONSUMER_SECRET ? '✅ Set' : '❌ Missing',
        shortCode: process.env.MPESA_SHORT_CODE ? '✅ Set' : '❌ Missing',
        passKey: process.env.MPESA_PASSKEY ? '✅ Set' : '❌ Missing',
        backendUrl: process.env.BACKEND_URL ? '✅ Set' : '❌ Missing',
        callbackUrl: process.env.MPESA_CALLBACK_URL ? '✅ Set' : '❌ Missing',
        environment: process.env.MPESA_ENVIRONMENT || 'sandbox'
      };

      console.log('📋 M-Pesa Configuration:', mpesaConfig);

      // Test access token generation
      try {
        const access_token = await getAccessToken();
        mpesaConfig.accessToken = access_token ? '✅ Obtained' : '❌ Failed';
        console.log('✅ Access token test passed');
      } catch (tokenError) {
        mpesaConfig.accessToken = `❌ Failed: ${tokenError.message}`;
        console.error('❌ Access token test failed:', tokenError.message);
      }

      res.json({
        success: true,
        message: 'M-Pesa configuration test',
        config: mpesaConfig,
        instructions: 'If any items show as ❌ Missing, check your .env file'
      });

    } catch (error) {
      console.error('❌ M-Pesa config test failed:', error);
      res.status(500).json({
        success: false,
        message: 'M-Pesa configuration test failed',
        error: error.message
      });
    }
  },
  formatPaymentMonth,
  
  // NEW: Export the new functions
  recordManualPayment,
  getPaymentSummary,
  getPaymentHistory,
  trackRentPayment
};