// backend/controllers/paymentController.js
const axios = require('axios');
const moment = require('moment');
const pool = require('../config/database');
const NotificationService = require('../services/notificationService');
const SMSService = require('../services/smsService');

// ==================== UTILITY HELPERS ====================

const checkDatabase = async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
};

const getMpesaBaseUrl = () => {
  return process.env.MPESA_ENVIRONMENT === 'production' 
    ? 'https://api.safaricom.co.ke' 
    : 'https://sandbox.safaricom.co.ke';
};

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

const generatePassword = (shortCode, passKey, timestamp) => {
  const passwordString = `${shortCode}${passKey}${timestamp}`;
  return Buffer.from(passwordString).toString('base64');
};

const getAccessToken = async () => {
  try {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    
    if (!consumerKey || !consumerSecret) {
      throw new Error('M-Pesa consumer key or secret not configured');
    }
    
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    
    // ✅ FIXED: Use environment-aware base URL
    const baseUrl = process.env.MPESA_ENVIRONMENT === 'production' 
      ? 'https://api.safaricom.co.ke' 
      : 'https://sandbox.safaricom.co.ke';
    
    const response = await axios.get(
      `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: { 'Authorization': `Basic ${auth}` },
        timeout: 10000,
      }
    );
    
    return response.data.access_token;
  } catch (error) {
    console.error('❌ Error getting access token:', error.response?.data || error.message);
    throw new Error(`Failed to get access token: ${error.message}`);
  }
};


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

// ==================== CORE BUSINESS LOGIC ====================

const trackRentPayment = async (tenantId, unitId, amount, paymentDate, targetMonth = null) => {
  try {
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
    
    let paymentMonth = targetMonth;
    if (!paymentMonth) {
      paymentMonth = new Date(paymentDate).toISOString().slice(0, 7);
    }
    
    const currentMonth = new Date().toISOString().slice(0, 7);
    const isFutureMonth = paymentMonth > currentMonth;

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
      allocatedAmount = paymentAmount;
      isMonthComplete = (targetMonthPaid + allocatedAmount) >= monthlyRent;
    } else {
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

const recordCarryForward = async (tenantId, unitId, amount, originalPaymentId, paymentDate, mpesa_receipt_number, phone_number, confirmedBy) => {
  try {
    let nextMonth = new Date(paymentDate);
    let remainingAmount = amount;
    const createdPayments = [];
    let index = 0;
    
    while (remainingAmount > 0) {
      index++;
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextMonthFormatted = nextMonth.toISOString().slice(0, 7) + '-01';
      
      const futureMonthQuery = `
        SELECT COALESCE(SUM(amount), 0) as total_paid 
        FROM rent_payments 
        WHERE tenant_id = $1 AND unit_id = $2 
        AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', $3::date)
        AND status = 'completed'
      `;
      const futureMonthResult = await pool.query(futureMonthQuery, [tenantId, unitId, nextMonthFormatted]);
      const futureMonthPaid = parseFloat(futureMonthResult.rows[0].total_paid);
      
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
          allocationAmount,
          nextMonthFormatted, 
          originalPaymentId,
          paymentDate,
          `CF_${originalPaymentId}_${index}`,
          `${mpesa_receipt_number}_CF${index}`,
          phone_number,
          'carry_forward',
          confirmedBy,
          paymentDate
        ]);
        
        createdPayments.push(result.rows[0]);
        remainingAmount -= allocationAmount;
        
        console.log(`✅ Carry-forward payment recorded: KSh ${allocationAmount} for ${nextMonthFormatted}`);
        
        if (remainingAmount <= 0) break;
      }
      
      if (index > 24) break; // Safety limit: 2 years ahead
    }
    
    return createdPayments;
  } catch (error) {
    console.error('Error recording carry-forward:', error);
    throw error;
  }
};

// ==================== NOTIFICATION FUNCTIONS ====================

const sendPaymentNotifications = async (payment, trackingResult, isCarryForward = false) => {
  try {
    const paymentId = payment.id || payment.payment_id;
    const tenantId = payment.tenant_id;
    const amount = payment.amount;
    
    // Get payment details
    const detailsQuery = `
      SELECT 
        t.first_name, t.last_name, t.phone_number,
        p.name as property_name, pu.unit_number, pu.unit_code,
        pu.property_id
      FROM rent_payments rp
      LEFT JOIN tenants t ON rp.tenant_id = t.id
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
    
    // ✅ FIXED: Only create notifications for USERS (admins/agents), not tenants
    // Tenants receive SMS instead (handled separately)
    
    if (isCarryForward) {
      // For carry-forward, notify admins only
      const adminUsers = await pool.query('SELECT id FROM users WHERE role = $1 AND is_active = true', ['admin']);
      
      for (const admin of adminUsers.rows) {
        await NotificationService.createNotification({
          userId: admin.id,  // ✅ This is a valid users.id
          title: 'Payment Carry-Forward',
          message: `Payment of KSh ${amount} for ${tenantName} (${details.unit_code}) has been carried forward to future months.`,
          type: 'payment_carry_forward',
          relatedEntityType: 'rent_payment',
          relatedEntityId: paymentId
        });
      }
      
      // Also notify assigned agent if any
      const agentQuery = await pool.query(
        `SELECT agent_id FROM agent_property_assignments 
         WHERE property_id = $1 AND is_active = true`,
        [details.property_id]
      );
      
      if (agentQuery.rows.length > 0) {
        const agentId = agentQuery.rows[0].agent_id;
        await NotificationService.createNotification({
          userId: agentId,  // ✅ This is a valid users.id
          title: 'Payment Carry-Forward',
          message: `Payment of KSh ${amount} for ${tenantName} (${details.unit_code}) has been carried forward.`,
          type: 'payment_carry_forward',
          relatedEntityType: 'rent_payment',
          relatedEntityId: paymentId
        });
      }
      
    } else {
      // Regular payment notification
      
      // Build message based on payment status
      let notificationMessage = `Payment of KSh ${amount} received from ${tenantName} for ${propertyInfo} - ${unitInfo}. `;
      
      if (trackingResult.carryForwardAmount > 0) {
        notificationMessage += `KSh ${trackingResult.allocatedAmount} applied to ${trackingResult.targetMonth}, KSh ${trackingResult.carryForwardAmount} carried forward.`;
      } else if (trackingResult.isMonthComplete) {
        notificationMessage += `Payment for ${trackingResult.targetMonth} is now complete.`;
      } else {
        const remaining = trackingResult.remainingForTargetMonth - trackingResult.allocatedAmount;
        notificationMessage += `Remaining balance for ${trackingResult.targetMonth}: KSh ${remaining}.`;
      }
      
      // ✅ Notify all admins
      const adminUsers = await pool.query('SELECT id FROM users WHERE role = $1 AND is_active = true', ['admin']);
      
      for (const admin of adminUsers.rows) {
        await NotificationService.createNotification({
          userId: admin.id,  // ✅ Valid users.id
          title: 'Tenant Payment Received',
          message: notificationMessage,
          type: 'payment_confirmation',
          relatedEntityType: 'rent_payment',
          relatedEntityId: paymentId
        });
      }
      
      // ✅ Notify assigned agent
      const agentQuery = await pool.query(
        `SELECT agent_id FROM agent_property_assignments 
         WHERE property_id = $1 AND is_active = true`,
        [details.property_id]
      );
      
      if (agentQuery.rows.length > 0) {
        const agentId = agentQuery.rows[0].agent_id;
        await NotificationService.createNotification({
          userId: agentId,  // ✅ Valid users.id
          title: 'Tenant Payment Received',
          message: notificationMessage,
          type: 'payment_confirmation',
          relatedEntityType: 'rent_payment',
          relatedEntityId: paymentId
        });
      }
      
      console.log('✅ Payment notifications sent to admins and agents');
    }
    
    // ✅ NOTE: Tenant receives SMS notification (handled in sendPaybillSMSNotifications 
    // or in the callback handler), not in-app notifications since they don't have user accounts
    
  } catch (error) {
    console.error('❌ Error sending payment notifications:', error);
    // Don't throw - notification failure shouldn't break payment flow
  }
};

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

    const wbRes = await pool.query(
      `SELECT amount FROM water_bills WHERE tenant_id = $1 AND bill_month = $2 LIMIT 1`,
      [unit.tenant_id, `${month}-01`]
    );
    const waterAmount = wbRes.rows[0] ? parseFloat(wbRes.rows[0].amount) : 0;

    const tenantSMSResult = await SMSService.sendPaymentConfirmation(
      tenantPhone,
      tenantName,
      payment.amount,
      unitCode,
      balance,
      month,
      waterAmount
    );

    console.log('✅ Tenant SMS result:', tenantSMSResult);

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

// ==================== CONTROLLER HANDLERS ====================

const getAllPayments = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 15, 
      propertyId, 
      tenantId, 
      startDate, 
      endDate, 
      search,
      sortBy = 'payment_date', 
      sortOrder = 'desc' 
    } = req.query;
    
    const offset = (page - 1) * limit;

    const validSortColumns = ['payment_date', 'amount', 'first_name', 'property_name', 'status'];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'payment_date';
    const safeSortOrder = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    let baseQuery = `
      SELECT 
        rp.id, rp.amount, rp.payment_month, rp.payment_date, rp.status, 
        rp.mpesa_receipt_number, rp.mpesa_transaction_id, rp.phone_number,
        t.id as tenant_id, t.first_name, t.last_name,
        p.name as property_name,
        pu.unit_code
      FROM rent_payments rp
      JOIN tenants t ON rp.tenant_id = t.id
      JOIN property_units pu ON rp.unit_id = pu.id
      JOIN properties p ON pu.property_id = p.id
    `;
    
    const whereClauses = [];
    const queryParams = [];
    let paramIndex = 1;
    
    if (propertyId) {
      whereClauses.push(`p.id = $${paramIndex++}`);
      queryParams.push(propertyId);
    }
    if (tenantId) {
      whereClauses.push(`t.id = $${paramIndex++}`);
      queryParams.push(tenantId);
    }
    if (startDate) {
      whereClauses.push(`rp.payment_date >= $${paramIndex++}`);
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClauses.push(`rp.payment_date <= $${paramIndex++}`);
      queryParams.push(endDate);
    }
    if (search) {
      whereClauses.push(`(t.first_name ILIKE $${paramIndex} OR t.last_name ILIKE $${paramIndex} OR rp.mpesa_receipt_number ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (whereClauses.length > 0) {
      baseQuery += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const countQuery = `SELECT COUNT(*) FROM (${baseQuery}) as filtered_payments`;
    const countResult = await pool.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count, 10);
    
    baseQuery += ` ORDER BY ${safeSortBy} ${safeSortOrder} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    queryParams.push(limit, offset);

    const paymentsResult = await pool.query(baseQuery, queryParams);

    res.json({
      success: true,
      data: {
        payments: paymentsResult.rows,
        pagination: {
          currentPage: parseInt(page, 10),
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
        },
      },
    });

  } catch (error) {
    console.error('Error fetching all payments:', error);
    res.status(500).json({ success: false, message: 'Server error fetching payments' });
  }
};

const getTenantPaymentHistory = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const paymentsQuery = await pool.query(
      `SELECT rp.*, p.name as property_name, pu.unit_code 
       FROM rent_payments rp
       JOIN property_units pu ON rp.unit_id = pu.id
       JOIN properties p ON pu.property_id = p.id
       WHERE rp.tenant_id = $1 
       ORDER BY rp.payment_date DESC`,
      [tenantId]
    );

    const allocationsQuery = await pool.query(
      `SELECT lease_start_date, lease_end_date, monthly_rent 
       FROM tenant_allocations 
       WHERE tenant_id = $1`,
      [tenantId]
    );
    
    let totalExpected = 0;
    const now = new Date();
    
    allocationsQuery.rows.forEach(alloc => {
      const start = new Date(alloc.lease_start_date);
      const end = alloc.lease_end_date ? new Date(alloc.lease_end_date) : now;
      if (end < start) return;
      
      let months = (end.getFullYear() - start.getFullYear()) * 12;
      months -= start.getMonth();
      months += end.getMonth();
      const monthCount = months < 0 ? 0 : months + 1;
      
      totalExpected += monthCount * parseFloat(alloc.monthly_rent);
    });

    const totalPaid = paymentsQuery.rows
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);
    
    const balance = totalExpected - totalPaid;

    res.json({
      success: true,
      data: {
        payments: paymentsQuery.rows,
        summary: {
          totalExpected,
          totalPaid,
          balance,
          arrears: balance > 0 ? balance : 0,
        },
      },
    });

  } catch (error) {
    console.error('Error fetching tenant history:', error);
    res.status(500).json({ success: false, message: 'Server error fetching tenant history' });
  }
};

const processPaybillPayment = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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

    if (!unit_code || !amount || !mpesa_receipt_number || !phone_number) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: unit_code, amount, mpesa_receipt_number, phone_number'
      });
    }

    const unitResult = await client.query(
      `SELECT 
        pu.*,
        p.name as property_name,
        p.property_code,
        p.id as property_id,
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

    const trackingResult = await trackRentPayment(
      unit.tenant_id, 
      unit.id, 
      amount, 
      paymentDate,
      formattedPaymentMonth.slice(0, 7)
    );

    const paymentQuery = `
      INSERT INTO rent_payments 
      (tenant_id, unit_id, amount, payment_month, payment_date, status,
      mpesa_receipt_number, phone_number, confirmed_by, confirmed_at, 
      payment_method, mpesa_transaction_id)
      VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const paymentResult = await client.query(paymentQuery, [
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
      `PB_${mpesa_receipt_number}`
    ]);
    
    const paymentRecord = paymentResult.rows[0];

    try {
      const adminUsersQuery = await client.query("SELECT id FROM users WHERE role = 'admin' AND is_active = true");
      const agentAssignmentQuery = await client.query(
        "SELECT agent_id FROM agent_property_assignments WHERE property_id = $1 AND is_active = true",
        [unit.property_id]
      );

      const adminIds = adminUsersQuery.rows.map(u => u.id);
      const agentId = agentAssignmentQuery.rows[0]?.agent_id;

      const recipientIds = new Set(adminIds);
      if (agentId) {
        recipientIds.add(agentId);
      }

      const tenantName = `${unit.tenant_first_name} ${unit.tenant_last_name}`;
      const notificationTitle = 'Payment Received';
      const notificationMessage = `KSh ${amount} received from ${tenantName} for ${unit.property_name} (${unit.unit_code}). M-Pesa: ${mpesa_receipt_number}.`;

      for (const userId of recipientIds) {
        await NotificationService.createNotification({
          userId,
          title: notificationTitle,
          message: notificationMessage,
          type: 'payment_received',
          relatedEntityType: 'payment',
          relatedEntityId: paymentRecord.id
        });
      }
      console.log(`✅ Payment notifications sent to ${recipientIds.size} users.`);

    } catch (notificationError) {
      console.error("Failed to send payment notifications, but payment was processed:", notificationError);
    }

    if (trackingResult.carryForwardAmount > 0) {
      console.log(`🔄 Processing carry-forward: KSh ${trackingResult.carryForwardAmount}`);
      const carryForwardPayments = await recordCarryForward(
        unit.tenant_id,
        unit.id,
        trackingResult.carryForwardAmount,
        paymentRecord.id,
        paymentDate,
        mpesa_receipt_number,
        phone_number,
        req.user?.id || unit.tenant_id
      );

      for (const carryForwardPayment of carryForwardPayments) {
        await sendPaymentNotifications(carryForwardPayment, trackingResult, true);
      }
    }

    await sendPaybillSMSNotifications(paymentRecord, trackingResult, unit);
    await sendPaymentNotifications(paymentRecord, trackingResult, false);

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      message: 'Paybill payment processed successfully',
      data: {
        payment: paymentRecord,
        tracking: trackingResult
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ ERROR processing paybill payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process paybill payment',
      error: error.message
    });
  } finally {
    client.release();
  }
};

const getPaymentStatusByUnitCode = async (req, res) => {
  try {
    const { unitCode } = req.params;
    const { month } = req.query;

    const currentDate = new Date();
    const targetMonth = month || currentDate.toISOString().slice(0, 7);

    console.log('🔍 Checking payment status for unit:', unitCode, 'month:', targetMonth);

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

const sendBalanceReminders = async (req, res) => {
  try {
    console.log('🔔 Sending balance reminders...');

    const currentDate = new Date();
    const currentMonth = currentDate.toISOString().slice(0, 7);

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

    for (const unit of overdueUnits) {
      try {
        const dueDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), unit.rent_due_day);
        const gracePeriodEnd = new Date(dueDate);
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + unit.grace_period_days);

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

    if (!tenant_id || !unit_id || !amount || !payment_month) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: tenant_id, unit_id, amount, payment_month'
      });
    }

    const paymentDate = new Date();
    const formattedPaymentMonth = formatPaymentMonth(payment_month);

    const trackingResult = await trackRentPayment(
      tenant_id, 
      unit_id, 
      amount, 
      paymentDate,
      formattedPaymentMonth.slice(0, 7)
    );

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
      req.user.id,
      paymentDate,
      notes
    ]);

    const paymentRecord = paymentResult.rows[0];

    if (trackingResult.carryForwardAmount > 0) {
      console.log(`🔄 Processing carry-forward for manual payment: KSh ${trackingResult.carryForwardAmount}`);
      const carryForwardPayments = await recordCarryForward(
        tenant_id,
        unit_id,
        trackingResult.carryForwardAmount,
        paymentRecord.id,
        paymentDate,
        mpesa_receipt_number || 'MANUAL',
        phone_number,
        req.user.id
      );

      for (const carryForwardPayment of carryForwardPayments) {
        await sendPaymentNotifications(carryForwardPayment, trackingResult, true);
      }
    }

    await sendPaymentNotifications(paymentRecord, trackingResult, false);

    res.status(201).json({
      success: true,
      message: 'Manual payment recorded successfully',
      data: {
        payment: paymentRecord,
        tracking: trackingResult
      }
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

const getPaymentSummary = async (req, res) => {
  try {
    const { tenantId, unitId } = req.params;

    const currentDate = new Date();
    const currentMonth = currentDate.toISOString().slice(0, 7);

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
      data: {
        summary: {
          monthlyRent,
          totalPaid,
          balance,
          isFullyPaid,
          advanceAmount,
          advanceCount,
          paymentCount: parseInt(currentMonthResult.rows[0].payment_count),
          propertyName: allocation.property_name,
          unitNumber: allocation.unit_number,
          monthlyStatus
        }
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

const getPaymentHistory = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { unitId, months = 12 } = req.query;

    let paymentsQuery = `
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
      WHERE rp.tenant_id = $1
      AND rp.payment_month >= NOW() - INTERVAL '${months} months'
    `;

    const queryParams = [tenantId];
    
    if (unitId) {
      paymentsQuery += ` AND rp.unit_id = $2`;
      queryParams.push(unitId);
    }

    paymentsQuery += ` ORDER BY rp.payment_month DESC, rp.payment_date DESC`;

    const result = await pool.query(paymentsQuery, queryParams);

    const monthlySummary = {};
    result.rows.forEach(payment => {
      const month = payment.payment_month.toISOString().slice(0, 7);
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

    let allocationQuery = `
      SELECT monthly_rent FROM tenant_allocations 
      WHERE tenant_id = $1 AND is_active = true
    `;
    const allocationParams = [tenantId];
    
    if (unitId) {
      allocationQuery += ` AND unit_id = $2`;
      allocationParams.push(unitId);
    }

    const allocationResult = await pool.query(allocationQuery, allocationParams);
    
    const monthlyRent = allocationResult.rows.length > 0 ? parseFloat(allocationResult.rows[0].monthly_rent) : 0;

    Object.keys(monthlySummary).forEach(month => {
      monthlySummary[month].isFullyPaid = monthlySummary[month].totalPaid >= monthlyRent;
      monthlySummary[month].balance = monthlyRent - monthlySummary[month].totalPaid;
    });

    res.json({
      success: true,
      data: {
        payments: result.rows,
        monthlySummary: Object.values(monthlySummary),
        monthlyRent,
        totalMonths: Object.keys(monthlySummary).length
      }
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

const getFuturePaymentsStatus = async (req, res) => {
  try {
    const { tenantId, unitId } = req.params;
    const { futureMonths = 6 } = req.query;

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

    for (let i = 1; i <= parseInt(futureMonths); i++) {
      const futureMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
      const monthFormatted = futureMonth.toISOString().slice(0, 7) + '-01';

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
      data: {
        futurePayments,
        monthlyRent
      }
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

    const paymentResult = await pool.query(
      `SELECT 
        rp.*,
        t.first_name,
        t.last_name,
        p.name as property_name,
        pu.unit_number,
        pu.unit_code
       FROM rent_payments rp
       LEFT JOIN tenants t ON rp.tenant_id = t.id
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

    if (resultCode === 0) {
      const callbackMetadata = stkCallback.CallbackMetadata?.Item;
      
      if (!callbackMetadata) {
        console.log('❌ No callback metadata found');
        await pool.query(
          'UPDATE rent_payments SET status = $1, failure_reason = $2 WHERE id = $3',
          ['failed', 'No callback metadata received', payment.id]
        );

        try {
          await NotificationService.createNotification({
            userId: payment.tenant_id,
            title: 'Payment Failed',
            message: 'Payment failed: No confirmation received from M-Pesa',
            type: 'payment_failed',
            relatedEntityType: 'rent_payment',
            relatedEntityId: payment.id
          });

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

      const paymentDate = new Date();
      const trackingResult = await trackRentPayment(
        payment.tenant_id, 
        payment.unit_id, 
        amount || payment.amount, 
        paymentDate,
        payment.payment_month.toISOString().slice(0, 7)
      );

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
          payment.tenant_id,
          trackingResult.allocatedAmount,
          payment.id
        ]
      );

      console.log('✅ Payment completed in database');

      if (trackingResult.carryForwardAmount > 0) {
        console.log(`🔄 Processing carry-forward: KSh ${trackingResult.carryForwardAmount}`);
        const carryForwardPayments = await recordCarryForward(
          payment.tenant_id,
          payment.unit_id,
          trackingResult.carryForwardAmount,
          payment.id,
          paymentDate,
          mpesaReceiptNumber,
          phoneNumber,
          payment.tenant_id
        );
        
        for (const carryForwardPayment of carryForwardPayments) {
          await sendPaymentNotifications(carryForwardPayment, trackingResult, true);
        }
      }

      await sendPaymentNotifications(payment, trackingResult, false);

       // ✅ ADD THIS: Send SMS confirmation to tenant
      try {
        const tenantName = `${payment.first_name} ${payment.last_name}`;
        const unitCode = payment.unit_code;
        const month = payment.payment_month.toISOString().slice(0, 7);
        const balance = trackingResult.remainingForTargetMonth - trackingResult.allocatedAmount;
        
        // Get water bill amount for this month
        const wbRes = await pool.query(
          `SELECT amount FROM water_bills WHERE tenant_id = $1 AND bill_month = $2 LIMIT 1`,
          [payment.tenant_id, `${month}-01`]
        );
        const waterAmount = wbRes.rows[0] ? parseFloat(wbRes.rows[0].amount) : 0;

        // Send SMS to tenant
        await SMSService.sendPaymentConfirmation(
          phoneNumber || payment.phone_number,
          tenantName,
          amount || payment.amount,
          unitCode,
          balance,
          month,
          waterAmount
        );

        // Send SMS to admins
        const adminUsers = await pool.query(
          'SELECT phone_number FROM users WHERE role = $1 AND phone_number IS NOT NULL',
          ['admin']
        );

        for (const admin of adminUsers.rows) {
          await SMSService.sendAdminAlert(
            admin.phone_number,
            tenantName,
            amount || payment.amount,
            unitCode,
            balance,
            month
          );
        }

        console.log('✅ SMS notifications sent for M-Pesa callback payment');
      } catch (smsError) {
        console.error('❌ Failed to send SMS notifications:', smsError);
        // Don't throw - payment was successful, SMS failure shouldn't break the flow
      }

    } else {
      const failureReason = stkCallback.ResultDesc || 'Payment failed';
      await pool.query(
        'UPDATE rent_payments SET status = $1, failure_reason = $2 WHERE id = $3',
        ['failed', failureReason, payment.id]
      );

      try {
        await NotificationService.createNotification({
          userId: payment.tenant_id,
          title: 'Payment Failed',
          message: `Payment failed: ${failureReason}`,
          type: 'payment_failed',
          relatedEntityType: 'rent_payment',
          relatedEntityId: payment.id
        });

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

    res.status(200).json({ 
      ResultCode: 0, 
      ResultDesc: 'Success' 
    });

  } catch (error) {
    console.error('❌ ERROR in M-Pesa callback:', error);
    
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
    
    res.status(200).json({ 
      ResultCode: 0, 
      ResultDesc: 'Success' 
    });
  }
};

const initiateSTKPush = async (req, res) => {
  console.log('🚀 initiateSTKPush called with:', {
    body: req.body,
    user: req.user
  });

  try {
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

    if (!phone || !amount || !unitId || !paymentMonth) {
      console.log('❌ Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: phone, amount, unitId, paymentMonth'
      });
    }

    const formattedPaymentMonth = formatPaymentMonth(paymentMonth);
    console.log('📅 Formatted payment month:', formattedPaymentMonth);

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

    console.log('🔍 Checking tenant allocation for user:', req.user.id, 'unit:', unitId);
    const allocationCheck = await pool.query(
      `SELECT 
        ta.id, 
        ta.tenant_id, 
        ta.unit_id,
        ta.monthly_rent,
        p.name as property_name,
        pu.unit_number,
        t.first_name,
        t.last_name
       FROM tenant_allocations ta
       LEFT JOIN property_units pu ON ta.unit_id = pu.id
       LEFT JOIN properties p ON pu.property_id = p.id
       LEFT JOIN tenants t ON ta.tenant_id = t.id
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

    const paymentAmount = parseFloat(amount);
    
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

    console.log('🔧 Initiating real M-Pesa STK Push...');

    const shortCode = process.env.MPESA_SHORT_CODE;
    const passKey = process.env.MPESA_PASSKEY;
    const callbackUrl = process.env.MPESA_CALLBACK_URL || `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/payments/mpesa-callback`;

    console.log('🔗 Callback URL:', callbackUrl);

    if (!shortCode || !passKey) {
      throw new Error('M-Pesa configuration missing: MPESA_SHORT_CODE or MPESA_PASSKEY not set');
    }

    if (!callbackUrl || callbackUrl.includes('undefined')) {
      throw new Error('M-Pesa callback URL is not properly configured. Check BACKEND_URL environment variable.');
    }

    const access_token = await getAccessToken();
    console.log('✅ M-Pesa access token obtained');

    const timestamp = generateTimestamp();
    const password = generatePassword(shortCode, passKey, timestamp);

    const stkPushPayload = {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(paymentAmount),
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
    
   // ✅ FIXED: Use environment-aware base URL
    const mpesaBaseUrl = process.env.MPESA_ENVIRONMENT === 'production' 
      ? 'https://api.safaricom.co.ke' 
      : 'https://sandbox.safaricom.co.ke';

    console.log('📤 Initiating STK Push to M-Pesa...');
    
    const stkResponse = await axios.post(
      `${mpesaBaseUrl}/mpesa/stkpush/v1/processrequest`,
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
        formattedPaymentMonth,
        'pending',
        stkResponse.data.CheckoutRequestID,
        stkResponse.data.MerchantRequestID,
        'mpesa'
      ]
    );

    const paymentRecord = paymentResult.rows[0];
    console.log('✅ Pending payment record created:', paymentRecord.id);

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
    
    try {
      await NotificationService.createNotification({
        userId: req.user.id,
        title: 'Payment Failed',
        message: `Failed to initiate rent payment: ${error.message}`,
        type: 'payment_failed'
      });

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

const checkPaymentStatus = async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;

    console.log('🔍 Checking payment status for:', checkoutRequestId);

    const result = await pool.query(
      `SELECT 
        rp.*,
        t.first_name as tenant_first_name,
        t.last_name as tenant_last_name,
        p.name as property_name,
        pu.unit_number
       FROM rent_payments rp
       LEFT JOIN tenants t ON rp.tenant_id = t.id
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
      data: {
        payment: result.rows[0]
      }
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

const getTenantAllocations = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const result = await pool.query(
      `SELECT ta.*, pu.unit_code, p.name as property_name 
       FROM tenant_allocations ta
       JOIN property_units pu ON ta.unit_id = pu.id
       JOIN properties p ON pu.property_id = p.id
       WHERE ta.tenant_id = $1`,
      [tenantId]
    );

    res.json({
      success: true,
      data: {
        allocations: result.rows
      }
    });

  } catch (error) {
    console.error('❌ ERROR getting tenant allocations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tenant allocations',
      error: error.message
    });
  }
};

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

    if (!agent_id || !amount || !payment_month || !phone_number) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: agent_id, amount, payment_month, phone_number'
      });
    }

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
      req.user.id,
      paymentDate
    ]);

    const salaryPayment = salaryResult.rows[0];

    await NotificationService.createNotification({
      userId: agent_id,
      title: 'Salary Paid',
      message: `Your salary of KSh ${amount} for ${payment_month} has been processed successfully.`,
      type: 'salary_paid',
      relatedEntityType: 'salary_payment',
      relatedEntityId: salaryPayment.id
    });

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
      data: {
        payment: salaryPayment
      }
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
      data: {
        payments: result.rows
      }
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

const getOverdueReminders = async (req, res) => {
  try {
    const { days_overdue = 5 } = req.query;

    const reminders = await pool.query(
      `SELECT 
        ta.tenant_id,
        t.first_name,
        t.last_name,
        t.phone_number,
        pu.unit_code,
        p.name as property_name,
        ta.monthly_rent,
        EXTRACT(DAY FROM (CURRENT_DATE - (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day'))) as days_overdue
       FROM tenant_allocations ta
       LEFT JOIN tenants t ON ta.tenant_id = t.id
       LEFT JOIN property_units pu ON ta.unit_id = pu.id
       LEFT JOIN properties p ON pu.property_id = p.id
       WHERE ta.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM rent_payments rp 
         WHERE rp.tenant_id = ta.tenant_id 
         AND rp.unit_id = ta.unit_id 
         AND rp.payment_month = DATE_TRUNC('month', CURRENT_DATE)::date
         AND rp.status = 'completed'
       )
       AND EXTRACT(DAY FROM CURRENT_DATE) >= $1`,
      [days_overdue]
    );

    res.json({
      success: true,
      data: {
        reminders: reminders.rows,
        total: reminders.rows.length
      }
    });

  } catch (error) {
    console.error('❌ ERROR in getOverdueReminders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching overdue reminders',
      error: error.message
    });
  }
};

const sendOverdueReminders = async (req, res) => {
  try {
    const { tenant_ids, custom_message } = req.body;

    console.log('📤 Sending overdue reminders to:', tenant_ids);

    res.json({
      success: true,
      message: 'Overdue reminders sent successfully',
      data: {
        recipients: tenant_ids || ['all_overdue'],
        custom_message: custom_message
      }
    });

  } catch (error) {
    console.error('❌ ERROR in sendOverdueReminders:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending overdue reminders',
      error: error.message
    });
  }
};

const getUpcomingReminders = async (req, res) => {
  try {
    const { days_ahead = 3 } = req.query;

    const reminders = await pool.query(
      `SELECT 
        ta.tenant_id,
        t.first_name,
        t.last_name,
        t.phone_number,
        pu.unit_code,
        p.name as property_name,
        ta.monthly_rent,
        (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date as due_date
       FROM tenant_allocations ta
       LEFT JOIN tenants t ON ta.tenant_id = t.id
       LEFT JOIN property_units pu ON ta.unit_id = pu.id
       LEFT JOIN properties p ON pu.property_id = p.id
       WHERE ta.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM rent_payments rp 
         WHERE rp.tenant_id = ta.tenant_id 
         AND rp.unit_id = ta.unit_id 
         AND rp.payment_month = (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date
         AND rp.status = 'completed'
       )
       AND EXTRACT(DAY FROM CURRENT_DATE) >= (EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')) - $1)`,
      [days_ahead]
    );

    res.json({
      success: true,
      data: {
        reminders: reminders.rows,
        total: reminders.rows.length
      }
    });

  } catch (error) {
    console.error('❌ ERROR in getUpcomingReminders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching upcoming reminders',
      error: error.message
    });
  }
};

const sendUpcomingReminders = async (req, res) => {
  try {
    const { tenant_ids, custom_message } = req.body;

    console.log('📤 Sending upcoming reminders to:', tenant_ids);

    res.json({
      success: true,
      message: 'Upcoming reminders sent successfully',
      data: {
        recipients: tenant_ids || ['all_upcoming'],
        custom_message: custom_message
      }
    });

  } catch (error) {
    console.error('❌ ERROR in sendUpcomingReminders:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending upcoming reminders',
      error: error.message
    });
  }
};

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
      data: {
        result
      }
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

const testMpesaConfig = async (req, res) => {
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
      data: {
        config: mpesaConfig,
        instructions: 'If any items show as ❌ Missing, check your .env file'
      }
    });

  } catch (error) {
    console.error('❌ M-Pesa config test failed:', error);
    res.status(500).json({
      success: false,
      message: 'M-Pesa configuration test failed',
      error: error.message
    });
  }
};

const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        rp.*,
        t.first_name as tenant_first_name,
        t.last_name as tenant_last_name,
        p.name as property_name,
        pu.unit_number
       FROM rent_payments rp
       LEFT JOIN tenants t ON rp.tenant_id = t.id
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
      data: {
        payment: result.rows[0]
      }
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
       ORDER BY rp.payment_month DESC, rp.payment_date DESC`,
      [tenantId]
    );

    console.log(`✅ Found ${result.rows.length} payments for tenant ${tenantId}`);

    res.json({
      success: true,
      data: {
        payments: result.rows,
        count: result.rows.length
      }
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

// ==================== EXPORT ALL FUNCTIONS ====================

module.exports = {
  // Core M-Pesa functions
  initiateSTKPush,
  handleMpesaCallback,
  checkPaymentStatus,
  
  // Paybill payment functions
  processPaybillPayment,
  getPaymentStatusByUnitCode,
  sendBalanceReminders,
  
  // Payment management functions
  getAllPayments,
  getTenantPaymentHistory,
  getPaymentById,
  getPaymentsByTenant,
  recordManualPayment,
  getPaymentSummary,
  getPaymentHistory,
  getFuturePaymentsStatus,
  
  // Tenant allocations
  getTenantAllocations,
  
  // Salary payment functions
  processSalaryPayment,
  getSalaryPayments,
  getAgentSalaryPayments,
  
  // SMS and notification functions
  testSMSService,
  testMpesaConfig,
  
  // Reminder functions
  getOverdueReminders,
  sendOverdueReminders,
  getUpcomingReminders,
  sendUpcomingReminders,
  
  // Utility functions (exported for use by other modules)
  formatPaymentMonth,
  trackRentPayment,
  recordCarryForward,
  sendPaymentNotifications
};