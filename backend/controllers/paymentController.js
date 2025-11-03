const axios = require('axios');
const moment = require('moment');
const pool = require('../config/database');
const NotificationService = require('../services/notificationService');
const SMSService = require('../services/smsService');

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

// ENHANCED: Track rent payment with partial payments and carry-forward logic
const trackRentPayment = async (tenantId, unitId, amount, paymentDate, targetMonth = null) => {
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
    
    // Determine the target month for payment allocation
    let paymentMonth = targetMonth;
    if (!paymentMonth) {
      paymentMonth = new Date(paymentDate).toISOString().slice(0, 7); // YYYY-MM
    }
    
    // Check if target month is in the future
    const currentMonth = new Date().toISOString().slice(0, 7);
    const isFutureMonth = paymentMonth > currentMonth;

    // Check target month's paid amount
    const targetMonthPaymentsQuery = `
      SELECT COALESCE(SUM(amount), 0) as total_paid 
      FROM rent_payments 
      WHERE tenant_id = $1 AND unit_id = $2 
      AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', $3::date)
      AND status = 'completed'
    `;
    const targetMonthResult = await pool.query(targetMonthPaymentsQuery, [tenantId, unitId, `${paymentMonth}-01`]);
    const targetMonthPaid = parseFloat(targetMonthResult.rows[0].total_paid);
    
    const remainingForTargetMonth = monthlyRent - targetMonthPaid;
    let allocatedAmount = 0;
    let carryForwardAmount = 0;
    let isMonthComplete = false;
    
    if (paymentAmount <= remainingForTargetMonth) {
      // Full amount applies to target month
      allocatedAmount = paymentAmount;
      isMonthComplete = (targetMonthPaid + allocatedAmount) >= monthlyRent;
    } else {
      // Part applies to target month, rest carries forward
      allocatedAmount = remainingForTargetMonth;
      carryForwardAmount = paymentAmount - remainingForTargetMonth;
      isMonthComplete = true;
    }
    
    return {
      allocatedAmount,
      carryForwardAmount,
      monthlyRent,
      targetMonthPaid,
      isMonthComplete,
      remainingForTargetMonth,
      targetMonth: paymentMonth,
      isFutureMonth
    };
  } catch (error) {
    console.error('Error in trackRentPayment:', error);
    throw error;
  }
};

// ENHANCED: Record carry-forward payment with future month support
const recordCarryForward = async (tenantId, unitId, amount, originalPaymentId, paymentDate, mpesa_receipt_number,phone_number, confirmedBy) => {
  try {
    let nextMonth = new Date(paymentDate);
    let remainingAmount = amount;
    const createdPayments = [];
    let index = 0; 
    while (remainingAmount > 0) {
      index++;
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextMonthFormatted = nextMonth.toISOString().slice(0, 7) + '-01';
      
      // Check if future month already has payments
      const futureMonthQuery = `
        SELECT COALESCE(SUM(amount), 0) as total_paid 
        FROM rent_payments 
        WHERE tenant_id = $1 AND unit_id = $2 
        AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', $3::date)
        AND status = 'completed'
      `;
      const futureMonthResult = await pool.query(futureMonthQuery, [tenantId, unitId, nextMonthFormatted]);
      const futureMonthPaid = parseFloat(futureMonthResult.rows[0].total_paid);
      
      // Get monthly rent for calculation
      const allocationQuery = `
        SELECT monthly_rent FROM tenant_allocations 
        WHERE tenant_id = $1 AND unit_id = $2 AND is_active = true
      `;
      const allocationResult = await pool.query(allocationQuery, [tenantId, unitId]);
      const monthlyRent = parseFloat(allocationResult.rows[0].monthly_rent);
      
      const remainingForFutureMonth = monthlyRent - futureMonthPaid;
      const allocationAmount = Math.min(remainingAmount, remainingForFutureMonth);
      
      if (allocationAmount > 0) {
         const carryForwardQuery = `
          INSERT INTO rent_payments 
          (tenant_id, unit_id, amount, payment_month, status, is_advance_payment, 
           original_payment_id, payment_date, mpesa_transaction_id, mpesa_receipt_number, 
           phone_number, payment_method, confirmed_by, confirmed_at)
          VALUES ($1, $2, $3, $4, 'completed', true, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *
        `;
        
        const result = await pool.query(carryForwardQuery, [
          tenantId, 
          unitId, 
          amount,
          nextMonthFormatted, 
          originalPaymentId,
          paymentDate,
          `CF_${originalPaymentId}_${index}`, // Generate carry-forward transaction ID
          `${mpesa_receipt_number}_CF${index}`, // Carry-forward receipt number
          phone_number, // Use original phone number
          'paybill', // Payment method
          confirmedBy,
          paymentDate
        ]);
        
        createdPayments.push(result.rows[0]);
        remainingAmount -= allocationAmount;
        
        console.log(`✅ Carry-forward payment recorded: KSh ${allocationAmount} for ${nextMonthFormatted}`);
        
        // If we've allocated all remaining amount, break the loop
        if (remainingAmount <= 0) break;

         return [result.rows[0]]; 
      } else {
        // If this month is already fully paid, move to next month
        continue;
      }
    }
    
    return createdPayments;
  } catch (error) {
    console.error('Error recording carry-forward:', error);
    throw error;
  }
};

// ENHANCED: Payment notification system with partial payment support
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
        message: `Your payment of KSh ${amount} has been carried forward to future months as advance payment.`,
        type: 'payment_carry_forward',
        relatedEntityType: 'rent_payment',
        relatedEntityId: paymentId
      };
      
      await NotificationService.createNotification(carryForwardNotification);
    } else {
      // Success notification to tenant
      let tenantMessage = `Your rent payment of KSh ${amount} has been processed successfully. `;
      
      if (trackingResult.carryForwardAmount > 0) {
        tenantMessage += `KSh ${trackingResult.allocatedAmount} applied to ${trackingResult.targetMonth}, KSh ${trackingResult.carryForwardAmount} carried forward to future months.`;
      } else if (trackingResult.isMonthComplete) {
        tenantMessage += `Your rent for ${trackingResult.targetMonth} is now fully paid.`;
      } else {
        tenantMessage += `Your rent for ${trackingResult.targetMonth} is partially paid. Remaining balance: KSh ${trackingResult.remainingForTargetMonth - trackingResult.allocatedAmount}.`;
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
        let adminMessage = `Tenant ${tenantName} has successfully paid KSh ${amount} for ${propertyInfo} - ${unitInfo} (${trackingResult.targetMonth}). `;
        
        if (trackingResult.carryForwardAmount > 0) {
          adminMessage += `KSh ${trackingResult.carryForwardAmount} carried forward to future months.`;
        } else if (!trackingResult.isMonthComplete) {
          adminMessage += `Remaining balance for ${trackingResult.targetMonth}: KSh ${trackingResult.remainingForTargetMonth - trackingResult.allocatedAmount}.`;
        } else {
          adminMessage += `Payment for ${trackingResult.targetMonth} is now complete.`;
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

// NEW: Send SMS notifications for paybill payments
const sendPaybillSMSNotifications = async (payment, trackingResult, unit) => {
  try {
    const tenantName = `${unit.tenant_first_name} ${unit.tenant_last_name}`;
    const tenantPhone = unit.tenant_phone;
    const unitCode = unit.unit_code;
    const month = trackingResult.targetMonth;
    const balance = trackingResult.remainingForTargetMonth - trackingResult.allocatedAmount;

    console.log('📱 Preparing SMS notifications:', {
      tenantName,
      tenantPhone,
      unitCode,
      amount: payment.amount,
      balance,
      month
    });

    // Send confirmation to tenant
    const tenantSMSResult = await SMSService.sendPaymentConfirmation(
      tenantPhone,
      tenantName,
      payment.amount,
      unitCode,
      balance,
      month
    );

    console.log('✅ Tenant SMS result:', tenantSMSResult);

    // Get admin phone numbers and send alerts
    const adminUsers = await pool.query(
      'SELECT phone_number FROM users WHERE role = $1 AND phone_number IS NOT NULL',
      ['admin']
    );

    console.log(`👨‍💼 Found ${adminUsers.rows.length} admins to notify`);

    const adminSMSResults = [];
    for (const admin of adminUsers.rows) {
      const adminResult = await SMSService.sendAdminAlert(
        admin.phone_number,
        tenantName,
        payment.amount,
        unitCode,
        balance,
        month
      );
      adminSMSResults.push(adminResult);
    }

    // Record SMS notifications in database
    await pool.query(
      `INSERT INTO payment_notifications 
        (payment_id, recipient_id, message_type, message_content, mpesa_code, amount, 
         payment_date, property_info, unit_info, is_sent, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [
        payment.id,
        unit.tenant_id,
        'payment_confirmation',
        `Payment of KSh ${payment.amount} confirmed for ${unitCode}`,
        payment.mpesa_receipt_number,
        payment.amount,
        payment.payment_date,
        unit.property_name,
        unitCode,
        tenantSMSResult.success
      ]
    );

    console.log('✅ Paybill SMS notifications processed', {
      tenantSMS: tenantSMSResult.success,
      adminSMS: adminSMSResults.filter(r => r.success).length
    });

  } catch (error) {
    console.error('❌ Error sending paybill SMS notifications:', error);
  }
};

// NEW: Process M-Pesa paybill payment using unit code
const processPaybillPayment = async (req, res) => {
  try {
    const { 
      unit_code, 
      amount, 
      mpesa_receipt_number, 
      phone_number, 
      transaction_date,
      payment_month 
    } = req.body;

    console.log('💰 Processing paybill payment:', { 
      unit_code, 
      amount, 
      mpesa_receipt_number, 
      phone_number 
    });

    // Validate required fields
    if (!unit_code || !amount || !mpesa_receipt_number || !phone_number) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: unit_code, amount, mpesa_receipt_number, phone_number'
      });
    }

    // Find unit by unit code
    const unitResult = await pool.query(
      `SELECT 
        pu.*,
        p.name as property_name,
        p.property_code,
        ta.tenant_id,
        t.first_name as tenant_first_name,
        t.last_name as tenant_last_name,
        t.phone_number as tenant_phone,
        ta.monthly_rent,
        ta.is_active as allocation_active
      FROM property_units pu
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN tenant_allocations ta ON pu.id = ta.unit_id AND ta.is_active = true
      LEFT JOIN tenants t ON ta.tenant_id = t.id
      WHERE pu.unit_code = $1`,
      [unit_code]
    );

    if (unitResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found with the provided unit code'
      });
    }

    const unit = unitResult.rows[0];

    if (!unit.tenant_id || !unit.allocation_active) {
      return res.status(400).json({
        success: false,
        message: 'No active tenant allocated to this unit'
      });
    }

    console.log('✅ Unit and tenant found:', {
      unit: unit.unit_code,
      tenant: `${unit.tenant_first_name} ${unit.tenant_last_name}`,
      monthly_rent: unit.monthly_rent
    });

    const paymentDate = transaction_date ? new Date(transaction_date) : new Date();
    const formattedPaymentMonth = formatPaymentMonth(payment_month);

    // Track payment
    const trackingResult = await trackRentPayment(
      unit.tenant_id, 
      unit.id, 
      amount, 
      paymentDate,
      formattedPaymentMonth.slice(0, 7)
    );

    // Record the payment
   const paymentQuery = `
    INSERT INTO rent_payments 
    (tenant_id, unit_id, amount, payment_month, payment_date, status,
    mpesa_receipt_number, phone_number, confirmed_by, confirmed_at, 
    payment_method, mpesa_transaction_id)
    VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;

   const paymentResult = await pool.query(paymentQuery, [
    unit.tenant_id,
    unit.id,
    trackingResult.allocatedAmount,
    formattedPaymentMonth,
    paymentDate,
    mpesa_receipt_number,
    phone_number,
    req.user?.id || unit.tenant_id,
    paymentDate,
    'paybill',
    `PB_${mpesa_receipt_number}` // Generate paybill transaction ID
  ]);
  
    const paymentRecord = paymentResult.rows[0];

    // Handle carry forward if applicable
    if (trackingResult.carryForwardAmount > 0) {
      console.log(`🔄 Processing carry-forward: KSh ${trackingResult.carryForwardAmount}`);
      const carryForwardPayments = await recordCarryForward(
        unit.tenant_id,
        unit.id,
        trackingResult.carryForwardAmount,
        paymentRecord.id,
        paymentDate,
        mpesa_receipt_number, // Pass receipt number
        phone_number,
        req.user?.id || unit.tenant_id
      );

      // Send notifications for carry-forward payments
      for (const carryForwardPayment of carryForwardPayments) {
        await sendPaymentNotifications(carryForwardPayment, trackingResult, true);
      }
    }

    // Send SMS notifications
    await sendPaybillSMSNotifications(paymentRecord, trackingResult, unit);

    // Also send in-app notifications
    await sendPaymentNotifications(paymentRecord, trackingResult, false);

    res.status(201).json({
      success: true,
      message: 'Paybill payment processed successfully',
      payment: paymentRecord,
      tracking: trackingResult
    });

  } catch (error) {
    console.error('❌ ERROR processing paybill payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process paybill payment',
      error: error.message
    });
  }
};

// NEW: Get payment status by unit code
const getPaymentStatusByUnitCode = async (req, res) => {
  try {
    const { unitCode } = req.params;
    const { month } = req.query;

    const currentDate = new Date();
    const targetMonth = month || currentDate.toISOString().slice(0, 7); // YYYY-MM

    console.log('🔍 Checking payment status for unit:', unitCode, 'month:', targetMonth);

    // Find unit and tenant
    const unitResult = await pool.query(
      `SELECT 
        pu.*,
        p.name as property_name,
        ta.tenant_id,
        t.first_name as tenant_first_name,
        t.last_name as tenant_last_name,
        t.phone_number as tenant_phone,
        ta.monthly_rent
      FROM property_units pu
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN tenant_allocations ta ON pu.id = ta.unit_id AND ta.is_active = true
      LEFT JOIN tenants t ON ta.tenant_id = t.id
      WHERE pu.unit_code = $1`,
      [unitCode]
    );

    if (unitResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found'
      });
    }

    const unit = unitResult.rows[0];

    if (!unit.tenant_id) {
      return res.json({
        success: true,
        data: {
          unit_code: unitCode,
          property_name: unit.property_name,
          status: 'no_tenant',
          message: 'No active tenant allocated to this unit'
        }
      });
    }

    // Get payment summary for the month
    const paymentSummaryQuery = `
      SELECT 
        COALESCE(SUM(amount), 0) as total_paid,
        COUNT(*) as payment_count
      FROM rent_payments 
      WHERE unit_id = $1 
      AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', $2::date)
      AND status = 'completed'
    `;

    const summaryResult = await pool.query(paymentSummaryQuery, [
      unit.id,
      `${targetMonth}-01`
    ]);

    const totalPaid = parseFloat(summaryResult.rows[0].total_paid);
    const monthlyRent = parseFloat(unit.monthly_rent);
    const balance = monthlyRent - totalPaid;
    const isFullyPaid = balance <= 0;
    const paymentCount = parseInt(summaryResult.rows[0].payment_count);

    // Get payment history for the month
    const paymentHistoryQuery = `
      SELECT * FROM rent_payments 
      WHERE unit_id = $1 
      AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', $2::date)
      ORDER BY payment_date DESC
    `;

    const historyResult = await pool.query(paymentHistoryQuery, [
      unit.id,
      `${targetMonth}-01`
    ]);

    // Get future payment status (advance payments)
    const futurePaymentsQuery = `
      SELECT 
        DATE_TRUNC('month', payment_month) as month,
        COALESCE(SUM(amount), 0) as total_paid
      FROM rent_payments 
      WHERE unit_id = $1 
      AND DATE_TRUNC('month', payment_month) > DATE_TRUNC('month', $2::date)
      AND status = 'completed'
      GROUP BY DATE_TRUNC('month', payment_month)
      ORDER BY month ASC
    `;

    const futureResult = await pool.query(futurePaymentsQuery, [
      unit.id,
      `${targetMonth}-01`
    ]);

    const futurePayments = futureResult.rows.map(row => ({
      month: new Date(row.month).toISOString().slice(0, 7),
      total_paid: parseFloat(row.total_paid),
      is_fully_paid: parseFloat(row.total_paid) >= monthlyRent
    }));

    res.json({
      success: true,
      data: {
        unit_code: unitCode,
        property_name: unit.property_name,
        tenant_name: `${unit.tenant_first_name} ${unit.tenant_last_name}`,
        tenant_phone: unit.tenant_phone,
        monthly_rent: monthlyRent,
        total_paid: totalPaid,
        balance: balance,
        is_fully_paid: isFullyPaid,
        payment_count: paymentCount,
        payment_history: historyResult.rows,
        future_payments: futurePayments,
        current_month: targetMonth
      }
    });

  } catch (error) {
    console.error('❌ ERROR getting payment status by unit code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment status',
      error: error.message
    });
  }
};

// NEW: Send balance reminders for overdue payments
const sendBalanceReminders = async (req, res) => {
  try {
    console.log('🔔 Sending balance reminders...');

    // Find units with outstanding balances for current month
    const currentDate = new Date();
    const currentMonth = currentDate.toISOString().slice(0, 7); // YYYY-MM

    const overdueUnitsQuery = `
      SELECT 
        pu.unit_code,
        p.name as property_name,
        ta.tenant_id,
        t.first_name as tenant_first_name,
        t.last_name as tenant_last_name,
        t.phone_number as tenant_phone,
        ta.monthly_rent,
        COALESCE(SUM(rp.amount), 0) as total_paid,
        (ta.monthly_rent - COALESCE(SUM(rp.amount), 0)) as balance,
        ta.rent_due_day,
        ta.grace_period_days
      FROM property_units pu
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN tenant_allocations ta ON pu.id = ta.unit_id AND ta.is_active = true
      LEFT JOIN tenants t ON ta.tenant_id = t.id
      LEFT JOIN rent_payments rp ON pu.id = rp.unit_id 
        AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', $1::date)
        AND rp.status = 'completed'
      WHERE ta.tenant_id IS NOT NULL
      GROUP BY pu.id, p.name, ta.tenant_id, t.first_name, t.last_name, t.phone_number, 
               ta.monthly_rent, ta.rent_due_day, ta.grace_period_days
      HAVING (ta.monthly_rent - COALESCE(SUM(rp.amount), 0)) > 0
    `;

    const overdueResult = await pool.query(overdueUnitsQuery, [`${currentMonth}-01`]);
    const overdueUnits = overdueResult.rows;

    console.log(`📊 Found ${overdueUnits.length} units with outstanding balances`);

    const results = {
      total_units: overdueUnits.length,
      sms_sent: 0,
      errors: 0,
      details: []
    };

    // Send reminders for each overdue unit
    for (const unit of overdueUnits) {
      try {
        const dueDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), unit.rent_due_day);
        const gracePeriodEnd = new Date(dueDate);
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + unit.grace_period_days);

        // Only send reminder if we're past the due date but within grace period
        if (currentDate > dueDate && currentDate <= gracePeriodEnd) {
          const smsResult = await SMSService.sendBalanceReminder(
            unit.tenant_phone,
            `${unit.tenant_first_name} ${unit.tenant_last_name}`,
            unit.unit_code,
            unit.balance,
            currentMonth,
            gracePeriodEnd.toISOString().slice(0, 10)
          );

          results.details.push({
            unit_code: unit.unit_code,
            tenant_name: `${unit.tenant_first_name} ${unit.tenant_last_name}`,
            balance: unit.balance,
            sms_sent: smsResult.success,
            error: smsResult.error
          });

          if (smsResult.success) {
            results.sms_sent++;
          } else {
            results.errors++;
          }

          console.log(`✅ Balance reminder sent for ${unit.unit_code}: ${smsResult.success ? 'Success' : 'Failed'}`);
        }
      } catch (error) {
        console.error(`❌ Error sending reminder for ${unit.unit_code}:`, error);
        results.errors++;
        results.details.push({
          unit_code: unit.unit_code,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Balance reminders sent: ${results.sms_sent} successful, ${results.errors} failed`,
      data: results
    });

  } catch (error) {
    console.error('❌ ERROR sending balance reminders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send balance reminders',
      error: error.message
    });
  }
};

// ENHANCED: M-Pesa callback with partial payment tracking
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

          // Notify admins about failed transaction
          const adminUsers = await pool.query('SELECT id FROM users WHERE role = $1', ['admin']);
          for (const admin of adminUsers.rows) {
            await NotificationService.createNotification({
              userId: admin.id,
              title: 'Payment Failure Alert',
              message: `Payment failed for tenant ${payment.first_name} ${payment.last_name}. Reason: No M-Pesa confirmation received.`,
              type: 'payment_failed',
              relatedEntityType: 'rent_payment',
              relatedEntityId: payment.id
            });
          }
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

      // ENHANCED: Track payment and handle carry-forward
      const paymentDate = new Date();
      const trackingResult = await trackRentPayment(
        payment.tenant_id, 
        payment.unit_id, 
        amount || payment.amount, 
        paymentDate,
        payment.payment_month.toISOString().slice(0, 7) // Use the original payment month
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
          trackingResult.allocatedAmount, // Use the allocated amount for target month
          payment.id
        ]
      );

      console.log('✅ Payment completed in database');

      // ENHANCED: Handle carry-forward if applicable
      if (trackingResult.carryForwardAmount > 0) {
        console.log(`🔄 Processing carry-forward: KSh ${trackingResult.carryForwardAmount}`);
        const carryForwardPayments = await recordCarryForward(
          payment.tenant_id,
          payment.unit_id,
          trackingResult.carryForwardAmount,
          payment.id,
          paymentDate
        );
        
        // Send carry-forward notifications for each created payment
        for (const carryForwardPayment of carryForwardPayments) {
          await sendPaymentNotifications(carryForwardPayment, trackingResult, true);
        }
      }

      // ENHANCED: Send enhanced payment notifications
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

        // Notify admins about failed transaction
        const adminUsers = await pool.query('SELECT id FROM users WHERE role = $1', ['admin']);
        for (const admin of adminUsers.rows) {
          await NotificationService.createNotification({
            userId: admin.id,
            title: 'Payment Failure Alert',
            message: `Payment failed for tenant ${payment.first_name} ${payment.last_name}. Reason: ${failureReason}`,
            type: 'payment_failed',
            relatedEntityType: 'rent_payment',
            relatedEntityId: payment.id
          });
        }
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
    
    // Notify admins about system error
    try {
      const adminUsers = await pool.query('SELECT id FROM users WHERE role = $1', ['admin']);
      for (const admin of adminUsers.rows) {
        await NotificationService.createNotification({
          userId: admin.id,
          title: 'Payment System Error',
          message: `System error processing M-Pesa callback: ${error.message}`,
          type: 'system_error',
          relatedEntityType: 'system'
        });
      }
    } catch (notificationError) {
      console.error('Failed to create system error notification:', notificationError);
    }
    
    // Still return success to M-Pesa to avoid repeated callbacks
    res.status(200).json({ 
      ResultCode: 0, 
      ResultDesc: 'Success' 
    });
  }
};

// ENHANCED: Manual payment recording with tracking
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
    const trackingResult = await trackRentPayment(
      tenant_id, 
      unit_id, 
      amount, 
      paymentDate,
      formattedPaymentMonth.slice(0, 7) // Use the specified payment month
    );

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
      trackingResult.allocatedAmount,
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
      const carryForwardPayments = await recordCarryForward(
        tenant_id,
        unit_id,
        trackingResult.carryForwardAmount,
        paymentRecord.id,
        paymentDate
      );

      // Send notifications for carry-forward payments
      for (const carryForwardPayment of carryForwardPayments) {
        await sendPaymentNotifications(carryForwardPayment, trackingResult, true);
      }
    }

    // Send notifications for main payment
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

// ENHANCED: Get payment tracking summary for tenant
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
    const monthlyRent = parseFloat(allocation.monthly_rent);

    // Get current month payments
    const currentMonthPaymentsQuery = `
      SELECT COALESCE(SUM(amount), 0) as total_paid, 
             COUNT(*) as payment_count
      FROM rent_payments 
      WHERE tenant_id = $1 AND unit_id = $2 
      AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', $3::date)
      AND status = 'completed'
    `;
    const currentMonthResult = await pool.query(currentMonthPaymentsQuery, [tenantId, unitId, `${currentMonth}-01`]);

    const totalPaid = parseFloat(currentMonthResult.rows[0].total_paid);
    const balance = monthlyRent - totalPaid;
    const isFullyPaid = balance <= 0;

    // Get advance payments (carry-forward for future months)
    const advancePaymentsQuery = `
      SELECT COALESCE(SUM(amount), 0) as advance_amount,
             COUNT(*) as advance_count
      FROM rent_payments 
      WHERE tenant_id = $1 AND unit_id = $2 
      AND is_advance_payment = true
      AND status = 'completed'
      AND DATE_TRUNC('month', payment_month) > DATE_TRUNC('month', $3::date)
    `;
    const advanceResult = await pool.query(advancePaymentsQuery, [tenantId, unitId, `${currentMonth}-01`]);
    const advanceAmount = parseFloat(advanceResult.rows[0].advance_amount);
    const advanceCount = parseInt(advanceResult.rows[0].advance_count);

    // Get payment history for last 12 months
    const historyQuery = `
      SELECT 
        DATE_TRUNC('month', payment_month) as month,
        COALESCE(SUM(amount), 0) as total_paid,
        COUNT(*) as payment_count
      FROM rent_payments 
      WHERE tenant_id = $1 AND unit_id = $2 
      AND payment_month >= NOW() - INTERVAL '12 months'
      AND status = 'completed'
      GROUP BY DATE_TRUNC('month', payment_month)
      ORDER BY month DESC
    `;
    const historyResult = await pool.query(historyQuery, [tenantId, unitId]);

    // Calculate monthly status
    const monthlyStatus = historyResult.rows.map(row => {
      const month = new Date(row.month).toISOString().slice(0, 7);
      const totalPaid = parseFloat(row.total_paid);
      const isComplete = totalPaid >= monthlyRent;
      
      return {
        month,
        totalPaid,
        balance: monthlyRent - totalPaid,
        isComplete,
        paymentCount: parseInt(row.payment_count)
      };
    });

    res.json({
      success: true,
      summary: {
        monthlyRent,
        totalPaid,
        balance,
        isFullyPaid,
        advanceAmount,
        advanceCount,
        paymentCount: currentMonthResult.rows[0].payment_count,
        propertyName: allocation.property_name,
        unitNumber: allocation.unit_number,
        monthlyStatus
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

// ENHANCED: Get payment history with detailed tracking info
const getPaymentHistory = async (req, res) => {
  try {
    const { tenantId, unitId } = req.params;
    const { months = 12 } = req.query;

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
      AND rp.payment_month >= NOW() - INTERVAL '${months} months'
      ORDER BY rp.payment_month DESC, rp.payment_date DESC
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
          isFullyPaid: false,
          paymentCount: 0
        };
      }
      monthlySummary[month].totalPaid += parseFloat(payment.amount);
      monthlySummary[month].payments.push(payment);
      monthlySummary[month].paymentCount++;
    });

    // Get monthly rent for comparison
    const allocationQuery = `
      SELECT monthly_rent FROM tenant_allocations 
      WHERE tenant_id = $1 AND unit_id = $2 AND is_active = true
    `;
    const allocationResult = await pool.query(allocationQuery, [tenantId, unitId]);
    
    const monthlyRent = allocationResult.rows.length > 0 ? parseFloat(allocationResult.rows[0].monthly_rent) : 0;

    // Mark months as fully paid and calculate balances
    Object.keys(monthlySummary).forEach(month => {
      monthlySummary[month].isFullyPaid = monthlySummary[month].totalPaid >= monthlyRent;
      monthlySummary[month].balance = monthlyRent - monthlySummary[month].totalPaid;
    });

    res.json({
      success: true,
      payments: result.rows,
      monthlySummary: Object.values(monthlySummary),
      monthlyRent,
      totalMonths: Object.keys(monthlySummary).length
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

// NEW: Get future payment status
const getFuturePaymentsStatus = async (req, res) => {
  try {
    const { tenantId, unitId } = req.params;
    const { futureMonths = 6 } = req.query;

    // Get allocation details
    const allocationQuery = `
      SELECT monthly_rent FROM tenant_allocations 
      WHERE tenant_id = $1 AND unit_id = $2 AND is_active = true
    `;
    const allocationResult = await pool.query(allocationQuery, [tenantId, unitId]);
    
    if (allocationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active allocation found'
      });
    }

    const monthlyRent = parseFloat(allocationResult.rows[0].monthly_rent);
    const currentDate = new Date();
    const futurePayments = [];

    // Check status for future months
    for (let i = 1; i <= parseInt(futureMonths); i++) {
      const futureMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
      const monthFormatted = futureMonth.toISOString().slice(0, 7) + '-01';

      // Get payments for this future month
      const paymentsQuery = `
        SELECT COALESCE(SUM(amount), 0) as total_paid
        FROM rent_payments 
        WHERE tenant_id = $1 AND unit_id = $2 
        AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', $3::date)
        AND status = 'completed'
      `;
      const paymentsResult = await pool.query(paymentsQuery, [tenantId, unitId, monthFormatted]);
      const totalPaid = parseFloat(paymentsResult.rows[0].total_paid);

      futurePayments.push({
        month: futureMonth.toISOString().slice(0, 7),
        monthlyRent,
        totalPaid,
        balance: monthlyRent - totalPaid,
        isFullyPaid: totalPaid >= monthlyRent,
        isAdvance: totalPaid > 0
      });
    }

    res.json({
      success: true,
      futurePayments,
      monthlyRent
    });

  } catch (error) {
    console.error('❌ ERROR getting future payments status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get future payments status',
      error: error.message
    });
  }
};

// NEW: Process salary payment function
const processSalaryPayment = async (req, res) => {
  try {
    const { 
      agent_id, 
      amount, 
      payment_month, 
      phone_number,
      notes 
    } = req.body;

    console.log('💰 Processing salary payment:', { agent_id, amount, payment_month });

    // Validate required fields
    if (!agent_id || !amount || !payment_month || !phone_number) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: agent_id, amount, payment_month, phone_number'
      });
    }

    // Check if agent exists and is actually an agent
    const agentCheck = await pool.query(
      'SELECT id, first_name, last_name FROM users WHERE id = $1 AND role = $2',
      [agent_id, 'agent']
    );

    if (agentCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Agent not found or user is not an agent'
      });
    }

    const agent = agentCheck.rows[0];
    const paymentDate = new Date();
    const formattedPaymentMonth = formatPaymentMonth(payment_month);

    // Check for duplicate salary payment for the same month
    const existingPayment = await pool.query(
      `SELECT id FROM salary_payments 
       WHERE agent_id = $1 AND payment_month = $2`,
      [agent_id, formattedPaymentMonth]
    );

    if (existingPayment.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Salary payment for this agent and month already exists'
      });
    }

    // Create salary payment record
    const salaryPaymentQuery = `
      INSERT INTO salary_payments 
      (agent_id, amount, payment_month, phone_number, paid_by, payment_date, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'completed')
      RETURNING *
    `;

    const salaryResult = await pool.query(salaryPaymentQuery, [
      agent_id,
      amount,
      formattedPaymentMonth,
      phone_number,
      req.user.id, // Admin user processing the payment
      paymentDate
    ]);

    const salaryPayment = salaryResult.rows[0];

    // Create notification for the agent
    await NotificationService.createNotification({
      userId: agent_id,
      title: 'Salary Paid',
      message: `Your salary of KSh ${amount} for ${payment_month} has been processed successfully.`,
      type: 'salary_paid',
      relatedEntityType: 'salary_payment',
      relatedEntityId: salaryPayment.id
    });

    // Notify admins about the salary payment
    const adminUsers = await pool.query('SELECT id FROM users WHERE role = $1', ['admin']);
    for (const admin of adminUsers.rows) {
      await NotificationService.createNotification({
        userId: admin.id,
        title: 'Salary Payment Processed',
        message: `Salary payment of KSh ${amount} for ${agent.first_name} ${agent.last_name} (${payment_month}) has been processed.`,
        type: 'salary_processed',
        relatedEntityType: 'salary_payment',
        relatedEntityId: salaryPayment.id
      });
    }

    console.log(`✅ Salary payment processed for agent ${agent.first_name} ${agent.last_name}`);

    res.status(201).json({
      success: true,
      message: 'Salary payment processed successfully',
      payment: salaryPayment
    });

  } catch (error) {
    console.error('❌ ERROR processing salary payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process salary payment',
      error: error.message
    });
  }
};

// NEW: Get salary payments
const getSalaryPayments = async (req, res) => {
  try {
    const { page = 1, limit = 10, agent_id } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        sp.*,
        u.first_name as agent_first_name,
        u.last_name as agent_last_name,
        admin.first_name as paid_by_first_name,
        admin.last_name as paid_by_last_name
      FROM salary_payments sp
      LEFT JOIN users u ON sp.agent_id = u.id
      LEFT JOIN users admin ON sp.paid_by = admin.id
    `;

    let countQuery = `SELECT COUNT(*) FROM salary_payments sp`;
    const queryParams = [];
    const countParams = [];

    if (agent_id) {
      query += ` WHERE sp.agent_id = $1`;
      countQuery += ` WHERE sp.agent_id = $1`;
      queryParams.push(agent_id);
      countParams.push(agent_id);
    }

    query += ` ORDER BY sp.payment_month DESC, sp.payment_date DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
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
    console.error('❌ ERROR getting salary payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get salary payments',
      error: error.message
    });
  }
};

// NEW: Get agent salary payments
const getAgentSalaryPayments = async (req, res) => {
  try {
    const { agentId } = req.params;

    const result = await pool.query(
      `SELECT 
        sp.*,
        u.first_name as agent_first_name,
        u.last_name as agent_last_name
      FROM salary_payments sp
      LEFT JOIN users u ON sp.agent_id = u.id
      WHERE sp.agent_id = $1
      ORDER BY sp.payment_month DESC, sp.payment_date DESC`,
      [agentId]
    );

    res.json({
      success: true,
      payments: result.rows
    });

  } catch (error) {
    console.error('❌ ERROR getting agent salary payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get agent salary payments',
      error: error.message
    });
  }
};

// Keep existing functions (initiateSTKPush, checkPaymentStatus, etc.) with enhanced tracking
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

    // ENHANCED: Allow any amount with partial payment tracking
    const unitMonthlyRent = parseFloat(allocation.monthly_rent);
    const paymentAmount = parseFloat(amount);
    
    // Check for existing pending payment for this month
    console.log('🔍 Checking for existing payment...');
    const existingPayment = await pool.query(
      `SELECT id, status FROM rent_payments 
       WHERE tenant_id = $1 AND unit_id = $2 AND payment_month = $3 AND status = 'pending'`,
      [req.user.id, unitId, formattedPaymentMonth]
    );

    if (existingPayment.rows.length > 0) {
      const payment = existingPayment.rows[0];
      console.log('⚠️ Existing pending payment found:', payment);
      
      return res.status(400).json({
        success: false,
        message: 'A pending payment for this month already exists. Please wait for it to complete.'
      });
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
    
    // Create error notification for tenant and admin
    try {
      await NotificationService.createNotification({
        userId: req.user.id,
        title: 'Payment Failed',
        message: `Failed to initiate rent payment: ${error.message}`,
        type: 'payment_failed'
      });

      // Notify admins
      const adminUsers = await pool.query('SELECT id FROM users WHERE role = $1', ['admin']);
      for (const admin of adminUsers.rows) {
        await NotificationService.createNotification({
          userId: admin.id,
          title: 'Payment Initiation Failed',
          message: `Payment initiation failed for tenant. Error: ${error.message}`,
          type: 'payment_failed'
        });
      }
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

// Keep other existing functions
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

// NEW: Test SMS service
const testSMSService = async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    const testMessage = message || 'Test SMS from Rental System. If you receive this, SMS service is working!';
    const result = await SMSService.sendSMS(phone, testMessage);

    res.json({
      success: true,
      message: 'SMS test completed',
      result
    });

  } catch (error) {
    console.error('❌ ERROR testing SMS service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test SMS service',
      error: error.message
    });
  }
};

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
         ORDER BY rp.payment_month DESC, rp.payment_date DESC`,
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
  getSalaryPayments,
  getAgentSalaryPayments,
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
  
  // Export the enhanced functions
  recordManualPayment,
  getPaymentSummary,
  getPaymentHistory,
  getFuturePaymentsStatus,
  trackRentPayment,
  recordCarryForward,
  sendPaymentNotifications,

  // NEW: Export paybill payment functions
  processPaybillPayment,
  getPaymentStatusByUnitCode,
  sendBalanceReminders,
  testSMSService
};