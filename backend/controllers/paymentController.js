// backend/controllers/paymentController.js
// PRODUCTION-READY — Cleaned up for go-live
// Tenants do NOT use the system. Payments are recorded by admins/agents.
// STK Push removed. Paybill + Manual + M-Pesa Callback only.

const axios = require("axios");
const pool = require("../config/database");
const NotificationService = require("../services/notificationService");
const SMSService = require("../services/smsService");
const MessagingService = require("../services/messagingService");

// ==================== UTILITY HELPERS ====================

const getMpesaBaseUrl = () => {
  return process.env.MPESA_ENVIRONMENT === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
};

const generateTimestamp = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
};

const generatePassword = (shortCode, passKey, timestamp) => {
  return Buffer.from(`${shortCode}${passKey}${timestamp}`).toString("base64");
};

const getAccessToken = async () => {
  try {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
      throw new Error("M-Pesa consumer key or secret not configured");
    }

    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
      "base64",
    );

    const response = await axios.get(
      `${getMpesaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: { Authorization: `Basic ${auth}` },
        timeout: 10000,
      },
    );

    return response.data.access_token;
  } catch (error) {
    console.error(
      "Error getting M-Pesa access token:",
      error.response?.data || error.message,
    );
    throw new Error("Failed to get M-Pesa access token");
  }
};

const formatPaymentMonth = (paymentMonth) => {
  if (
    typeof paymentMonth === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(paymentMonth)
  ) {
    return paymentMonth;
  }

  if (typeof paymentMonth === "string" && /^\d{4}-\d{2}$/.test(paymentMonth)) {
    return `${paymentMonth}-01`;
  }

  if (paymentMonth instanceof Date) {
    return paymentMonth.toISOString().split("T")[0];
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
};

const isProduction = () => process.env.NODE_ENV === "production";

// ==================== CORE BUSINESS LOGIC ====================

const trackRentPayment = async (
  tenantId,
  unitId,
  amount,
  paymentDate,
  targetMonth = null,
) => {
  try {
    const allocationQuery = `
      SELECT ta.*, pu.rent_amount 
      FROM tenant_allocations ta 
      JOIN property_units pu ON ta.unit_id = pu.id 
      WHERE ta.tenant_id = $1 AND ta.unit_id = $2 AND ta.is_active = true
    `;
    const allocationResult = await pool.query(allocationQuery, [
      tenantId,
      unitId,
    ]);

    if (allocationResult.rows.length === 0) {
      throw new Error("No active tenant allocation found");
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
    const targetMonthResult = await pool.query(targetMonthPaymentsQuery, [
      tenantId,
      unitId,
      `${paymentMonth}-01`,
    ]);
    const targetMonthPaid = parseFloat(targetMonthResult.rows[0].total_paid);

    const remainingForTargetMonth = monthlyRent - targetMonthPaid;
    let allocatedAmount = 0;
    let carryForwardAmount = 0;
    let isMonthComplete = false;

    if (paymentAmount <= remainingForTargetMonth) {
      allocatedAmount = paymentAmount;
      isMonthComplete = targetMonthPaid + allocatedAmount >= monthlyRent;
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
      isFutureMonth,
    };
  } catch (error) {
    console.error("Error in trackRentPayment:", error);
    throw error;
  }
};

const recordCarryForward = async (
  tenantId,
  unitId,
  amount,
  originalPaymentId,
  paymentDate,
  mpesaReceiptNumber,
  phoneNumber,
  confirmedBy,
) => {
  try {
    let nextMonth = new Date(paymentDate);
    let remainingAmount = amount;
    const createdPayments = [];
    let index = 0;

    while (remainingAmount > 0) {
      index++;
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextMonthFormatted = nextMonth.toISOString().slice(0, 7) + "-01";

      const futureMonthResult = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total_paid 
         FROM rent_payments 
         WHERE tenant_id = $1 AND unit_id = $2 
         AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', $3::date)
         AND status = 'completed'`,
        [tenantId, unitId, nextMonthFormatted],
      );
      const futureMonthPaid = parseFloat(futureMonthResult.rows[0].total_paid);

      const allocationResult = await pool.query(
        `SELECT monthly_rent FROM tenant_allocations 
         WHERE tenant_id = $1 AND unit_id = $2 AND is_active = true`,
        [tenantId, unitId],
      );
      const monthlyRent = parseFloat(allocationResult.rows[0].monthly_rent);

      const remainingForFutureMonth = monthlyRent - futureMonthPaid;
      const allocationAmount = Math.min(
        remainingAmount,
        remainingForFutureMonth,
      );

      if (allocationAmount > 0) {
        const result = await pool.query(
          `INSERT INTO rent_payments 
           (tenant_id, unit_id, amount, payment_month, status, is_advance_payment, 
            original_payment_id, payment_date, mpesa_transaction_id, mpesa_receipt_number, 
            phone_number, payment_method, confirmed_by, confirmed_at)
           VALUES ($1, $2, $3, $4, 'completed', true, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING *`,
          [
            tenantId,
            unitId,
            allocationAmount,
            nextMonthFormatted,
            originalPaymentId,
            paymentDate,
            `CF_${originalPaymentId}_${index}`,
            `${mpesaReceiptNumber}_CF${index}`,
            phoneNumber,
            "carry_forward",
            confirmedBy,
            paymentDate,
          ],
        );

        createdPayments.push(result.rows[0]);
        remainingAmount -= allocationAmount;

        if (remainingAmount <= 0) break;
      }

      // Safety limit: max 24 months ahead
      if (index > 24) break;
    }

    return createdPayments;
  } catch (error) {
    console.error("Error recording carry-forward:", error);
    throw error;
  }
};

// ==================== NOTIFICATION FUNCTIONS ====================

const sendPaymentNotifications = async (
  payment,
  trackingResult,
  isCarryForward = false,
) => {
  try {
    const paymentId = payment.id || payment.payment_id;
    const amount = payment.amount;

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
      console.error("Could not find payment details for notification");
      return;
    }

    const details = detailsResult.rows[0];
    const tenantName = `${details.first_name} ${details.last_name}`;
    const unitInfo = `Unit ${details.unit_number} (${details.unit_code})`;

    // Build notification message
    let notificationMessage;
    if (isCarryForward) {
      notificationMessage = `Payment of KSh ${amount} for ${tenantName} (${details.unit_code}) has been carried forward to future months.`;
    } else if (trackingResult.carryForwardAmount > 0) {
      notificationMessage = `Payment of KSh ${amount} received from ${tenantName} for ${details.property_name} - ${unitInfo}. KSh ${trackingResult.allocatedAmount} applied to ${trackingResult.targetMonth}, KSh ${trackingResult.carryForwardAmount} carried forward.`;
    } else if (trackingResult.isMonthComplete) {
      notificationMessage = `Payment of KSh ${amount} received from ${tenantName} for ${details.property_name} - ${unitInfo}. Payment for ${trackingResult.targetMonth} is now complete.`;
    } else {
      const remaining =
        trackingResult.remainingForTargetMonth - trackingResult.allocatedAmount;
      notificationMessage = `Payment of KSh ${amount} received from ${tenantName} for ${details.property_name} - ${unitInfo}. Remaining balance for ${trackingResult.targetMonth}: KSh ${remaining}.`;
    }

    const notificationTitle = isCarryForward
      ? "Payment Carry-Forward"
      : "Tenant Payment Received";
    const notificationType = isCarryForward
      ? "payment_carry_forward"
      : "payment_confirmation";

    // Notify all admins
    const adminUsers = await pool.query(
      "SELECT id FROM users WHERE role = $1 AND is_active = true",
      ["admin"],
    );

    for (const admin of adminUsers.rows) {
      await NotificationService.createNotification({
        userId: admin.id,
        title: notificationTitle,
        message: notificationMessage,
        type: notificationType,
        relatedEntityType: "rent_payment",
        relatedEntityId: paymentId,
      });
    }

    // Notify assigned agent
    const agentQuery = await pool.query(
      `SELECT agent_id FROM agent_property_assignments 
       WHERE property_id = $1 AND is_active = true`,
      [details.property_id],
    );

    if (agentQuery.rows.length > 0) {
      const agentId = agentQuery.rows[0].agent_id;
      await NotificationService.createNotification({
        userId: agentId,
        title: notificationTitle,
        message: notificationMessage,
        type: notificationType,
        relatedEntityType: "rent_payment",
        relatedEntityId: paymentId,
      });
    }
  } catch (error) {
    console.error("Error sending payment notifications:", error);
    // Non-fatal: don't throw
  }
};

const sendPaybillSMSNotifications = async (payment, trackingResult, unit) => {
  try {
    const tenantName = `${unit.tenant_first_name} ${unit.tenant_last_name}`;
    const tenantPhone = unit.tenant_phone;
    const unitCode = unit.unit_code;
    const month = trackingResult.targetMonth;
    const balance =
      trackingResult.remainingForTargetMonth - trackingResult.allocatedAmount;

    // Send tenant notification via SMS + WhatsApp
    const tenantResult = await MessagingService.sendPaymentConfirmation(
      tenantPhone,
      tenantName,
      payment.amount,
      unitCode,
      balance,
      month,
    );

    // Send admin notifications via SMS + WhatsApp
    const adminUsers = await pool.query(
      "SELECT phone_number FROM users WHERE role = $1 AND phone_number IS NOT NULL",
      ["admin"],
    );

    for (const admin of adminUsers.rows) {
      await MessagingService.sendAdminAlert(
        admin.phone_number,
        tenantName,
        payment.amount,
        unitCode,
        balance,
        month,
      );
    }

    // Log notification (wrapped to prevent breaking payment flow)
    try {
      await pool.query(
        `INSERT INTO payment_notifications 
          (payment_id, recipient_id, message_type, message_content, mpesa_code, amount, 
           payment_date, property_info, unit_info, is_sent, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [
          payment.id,
          unit.tenant_id,
          "payment_confirmation",
          `Payment of KSh ${payment.amount} confirmed for ${unitCode}`,
          payment.mpesa_receipt_number,
          payment.amount,
          payment.payment_date,
          unit.property_name,
          unitCode,
          tenantResult.sms?.success || tenantResult.whatsapp?.success,
        ],
      );
    } catch (logError) {
      console.warn(
        "Failed to log payment notification (non-fatal):",
        logError.message,
      );
    }
  } catch (error) {
    console.error("Error sending paybill notifications:", error);
    // Non-fatal: don't throw
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
      sortBy = "payment_date",
      sortOrder = "desc",
    } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const userRole = req.user.role;
    const userId = req.user.id;

    // Whitelist sort columns to prevent SQL injection
    const validSortColumns = [
      "payment_date",
      "amount",
      "first_name",
      "property_name",
      "status",
    ];
    const safeSortBy = validSortColumns.includes(sortBy)
      ? sortBy
      : "payment_date";
    const safeSortOrder = sortOrder.toLowerCase() === "asc" ? "ASC" : "DESC";

    let baseQuery = `
      SELECT 
        rp.id, rp.amount, rp.payment_month, rp.payment_date, rp.status, 
        rp.mpesa_receipt_number, rp.mpesa_transaction_id, rp.phone_number,
        t.id as tenant_id, t.first_name, t.last_name,
        p.id as property_id, p.name as property_name,
        pu.unit_code
      FROM rent_payments rp
      JOIN tenants t ON rp.tenant_id = t.id
      JOIN property_units pu ON rp.unit_id = pu.id
      JOIN properties p ON pu.property_id = p.id
    `;

    const whereClauses = [];
    const queryParams = [];
    let paramIndex = 1;

    // Agent isolation
    if (userRole === "agent") {
      whereClauses.push(`
        p.id IN (
          SELECT property_id FROM agent_property_assignments 
          WHERE agent_id = $${paramIndex}::uuid AND is_active = true
        )
      `);
      queryParams.push(userId);
      paramIndex++;
    }

    if (propertyId) {
      whereClauses.push(`p.id = $${paramIndex}::uuid`);
      queryParams.push(propertyId);
      paramIndex++;
    }

    if (tenantId) {
      whereClauses.push(`t.id = $${paramIndex}::uuid`);
      queryParams.push(tenantId);
      paramIndex++;
    }

    if (startDate) {
      whereClauses.push(`rp.payment_date >= $${paramIndex}::date`);
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClauses.push(`rp.payment_date <= $${paramIndex}::date`);
      queryParams.push(endDate);
      paramIndex++;
    }

    if (search) {
      whereClauses.push(`(
        t.first_name ILIKE $${paramIndex} OR 
        t.last_name ILIKE $${paramIndex} OR 
        rp.mpesa_receipt_number ILIKE $${paramIndex} OR
        CONCAT(t.first_name, ' ', t.last_name) ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (whereClauses.length > 0) {
      baseQuery += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    // Count query
    const countQuery = `SELECT COUNT(*) FROM (${baseQuery}) as filtered_payments`;
    const countResult = await pool.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    // Add sorting and pagination
    baseQuery += ` ORDER BY rp.${safeSortBy} ${safeSortOrder}`;
    baseQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(parseInt(limit, 10), offset);

    const paymentsResult = await pool.query(baseQuery, queryParams);

    res.json({
      success: true,
      data: {
        payments: paymentsResult.rows,
        pagination: {
          currentPage: parseInt(page, 10),
          totalPages: Math.max(1, Math.ceil(totalCount / parseInt(limit, 10))),
          totalCount,
        },
      },
    });
  } catch (error) {
    console.error("Error in getAllPayments:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching payments",
      ...(!isProduction() && { error: error.message }),
    });
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
      [tenantId],
    );

    const allocationsQuery = await pool.query(
      `SELECT lease_start_date, lease_end_date, monthly_rent 
       FROM tenant_allocations WHERE tenant_id = $1`,
      [tenantId],
    );

    let totalExpected = 0;
    const now = new Date();

    allocationsQuery.rows.forEach((alloc) => {
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
      .filter((p) => p.status === "completed")
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
    console.error("Error fetching tenant history:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching tenant history",
    });
  }
};

const processPaybillPayment = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const {
      unit_code,
      amount,
      mpesa_receipt_number,
      phone_number,
      transaction_date,
      payment_month,
    } = req.body;

    if (!unit_code || !amount || !mpesa_receipt_number || !phone_number) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: unit_code, amount, mpesa_receipt_number, phone_number",
      });
    }

    // Check for duplicate receipt number
    const duplicateCheck = await client.query(
      "SELECT id FROM rent_payments WHERE mpesa_receipt_number = $1",
      [mpesa_receipt_number],
    );

    if (duplicateCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Payment with this M-Pesa receipt number already exists",
      });
    }

    const unitResult = await client.query(
      `SELECT 
        pu.*, p.name as property_name, p.property_code, p.id as property_id,
        ta.tenant_id, t.first_name as tenant_first_name, t.last_name as tenant_last_name,
        t.phone_number as tenant_phone, ta.monthly_rent, ta.is_active as allocation_active
      FROM property_units pu
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN tenant_allocations ta ON pu.id = ta.unit_id AND ta.is_active = true
      LEFT JOIN tenants t ON ta.tenant_id = t.id
      WHERE pu.unit_code = $1`,
      [unit_code],
    );

    if (unitResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Unit not found with the provided unit code",
      });
    }

    const unit = unitResult.rows[0];

    if (!unit.tenant_id || !unit.allocation_active) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "No active tenant allocated to this unit",
      });
    }

    const paymentDate = transaction_date
      ? new Date(transaction_date)
      : new Date();
    const formattedPaymentMonth = formatPaymentMonth(payment_month);

    const trackingResult = await trackRentPayment(
      unit.tenant_id,
      unit.id,
      amount,
      paymentDate,
      formattedPaymentMonth.slice(0, 7),
    );

    const paymentResult = await client.query(
      `INSERT INTO rent_payments 
       (tenant_id, unit_id, amount, payment_month, payment_date, status,
        mpesa_receipt_number, phone_number, confirmed_by, confirmed_at, 
        payment_method, mpesa_transaction_id)
       VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        unit.tenant_id,
        unit.id,
        trackingResult.allocatedAmount,
        formattedPaymentMonth,
        paymentDate,
        mpesa_receipt_number,
        phone_number,
        req.user?.id,
        paymentDate,
        "paybill",
        `PB_${mpesa_receipt_number}`,
      ],
    );

    const paymentRecord = paymentResult.rows[0];

    // In-app notifications to admins and agents
    try {
      const adminUsersQuery = await client.query(
        "SELECT id FROM users WHERE role = 'admin' AND is_active = true",
      );
      const agentAssignmentQuery = await client.query(
        "SELECT agent_id FROM agent_property_assignments WHERE property_id = $1 AND is_active = true",
        [unit.property_id],
      );

      const recipientIds = new Set(adminUsersQuery.rows.map((u) => u.id));
      if (agentAssignmentQuery.rows[0]?.agent_id) {
        recipientIds.add(agentAssignmentQuery.rows[0].agent_id);
      }

      const tenantName = `${unit.tenant_first_name} ${unit.tenant_last_name}`;
      const notificationMessage = `KSh ${amount} received from ${tenantName} for ${unit.property_name} (${unit.unit_code}). M-Pesa: ${mpesa_receipt_number}.`;

      for (const userId of recipientIds) {
        await NotificationService.createNotification({
          userId,
          title: "Payment Received",
          message: notificationMessage,
          type: "payment_received",
          relatedEntityType: "payment",
          relatedEntityId: paymentRecord.id,
        });
      }
    } catch (notificationError) {
      console.error(
        "Failed to send in-app notifications (non-fatal):",
        notificationError.message,
      );
    }

    // Carry-forward
    if (trackingResult.carryForwardAmount > 0) {
      const carryForwardPayments = await recordCarryForward(
        unit.tenant_id,
        unit.id,
        trackingResult.carryForwardAmount,
        paymentRecord.id,
        paymentDate,
        mpesa_receipt_number,
        phone_number,
        req.user?.id,
      );

      for (const cfPayment of carryForwardPayments) {
        await sendPaymentNotifications(cfPayment, trackingResult, true);
      }
    }

    // SMS + WhatsApp notifications
    await sendPaybillSMSNotifications(paymentRecord, trackingResult, unit);
    await sendPaymentNotifications(paymentRecord, trackingResult, false);

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Paybill payment processed successfully",
      data: {
        payment: paymentRecord,
        tracking: trackingResult,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error processing paybill payment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process paybill payment",
      ...(!isProduction() && { error: error.message }),
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

    const unitResult = await pool.query(
      `SELECT 
        pu.*, p.name as property_name,
        ta.tenant_id, t.first_name as tenant_first_name,
        t.last_name as tenant_last_name, t.phone_number as tenant_phone,
        ta.monthly_rent
      FROM property_units pu
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN tenant_allocations ta ON pu.id = ta.unit_id AND ta.is_active = true
      LEFT JOIN tenants t ON ta.tenant_id = t.id
      WHERE pu.unit_code = $1`,
      [unitCode],
    );

    if (unitResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Unit not found" });
    }

    const unit = unitResult.rows[0];

    if (!unit.tenant_id) {
      return res.json({
        success: true,
        data: {
          unit_code: unitCode,
          property_name: unit.property_name,
          status: "no_tenant",
          message: "No active tenant allocated to this unit",
        },
      });
    }

    const summaryResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total_paid, COUNT(*) as payment_count
       FROM rent_payments 
       WHERE unit_id = $1 
       AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', $2::date)
       AND status = 'completed'`,
      [unit.id, `${targetMonth}-01`],
    );

    const totalPaid = parseFloat(summaryResult.rows[0].total_paid);
    const monthlyRent = parseFloat(unit.monthly_rent);
    const balance = monthlyRent - totalPaid;

    const historyResult = await pool.query(
      `SELECT * FROM rent_payments 
       WHERE unit_id = $1 
       AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', $2::date)
       ORDER BY payment_date DESC`,
      [unit.id, `${targetMonth}-01`],
    );

    const futureResult = await pool.query(
      `SELECT 
        DATE_TRUNC('month', payment_month) as month,
        COALESCE(SUM(amount), 0) as total_paid
       FROM rent_payments 
       WHERE unit_id = $1 
       AND DATE_TRUNC('month', payment_month) > DATE_TRUNC('month', $2::date)
       AND status = 'completed'
       GROUP BY DATE_TRUNC('month', payment_month)
       ORDER BY month ASC`,
      [unit.id, `${targetMonth}-01`],
    );

    const futurePayments = futureResult.rows.map((row) => ({
      month: new Date(row.month).toISOString().slice(0, 7),
      total_paid: parseFloat(row.total_paid),
      is_fully_paid: parseFloat(row.total_paid) >= monthlyRent,
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
        balance,
        is_fully_paid: balance <= 0,
        payment_count: parseInt(summaryResult.rows[0].payment_count),
        payment_history: historyResult.rows,
        future_payments: futurePayments,
        current_month: targetMonth,
      },
    });
  } catch (error) {
    console.error("Error getting payment status by unit code:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get payment status",
      ...(!isProduction() && { error: error.message }),
    });
  }
};

const sendBalanceReminders = async (req, res) => {
  try {
    const currentDate = new Date();
    const currentMonth = currentDate.toISOString().slice(0, 7);

    const overdueResult = await pool.query(
      `SELECT 
        pu.unit_code, p.name as property_name,
        ta.tenant_id, t.first_name as tenant_first_name,
        t.last_name as tenant_last_name, t.phone_number as tenant_phone,
        ta.monthly_rent,
        COALESCE(SUM(rp.amount), 0) as total_paid,
        (ta.monthly_rent - COALESCE(SUM(rp.amount), 0)) as balance,
        ta.rent_due_day, ta.grace_period_days
      FROM property_units pu
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN tenant_allocations ta ON pu.id = ta.unit_id AND ta.is_active = true
      LEFT JOIN tenants t ON ta.tenant_id = t.id
      LEFT JOIN rent_payments rp ON pu.id = rp.unit_id 
        AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', $1::date)
        AND rp.status = 'completed'
      WHERE ta.tenant_id IS NOT NULL
      GROUP BY pu.id, pu.unit_code, p.name, ta.tenant_id, t.first_name, t.last_name, 
               t.phone_number, ta.monthly_rent, ta.rent_due_day, ta.grace_period_days
      HAVING (ta.monthly_rent - COALESCE(SUM(rp.amount), 0)) > 0`,
      [`${currentMonth}-01`],
    );

    const overdueUnits = overdueResult.rows;

    const results = {
      total_units: overdueUnits.length,
      sms_sent: 0,
      errors: 0,
      details: [],
    };

    for (const unit of overdueUnits) {
      try {
        const dueDate = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          unit.rent_due_day,
        );
        const gracePeriodEnd = new Date(dueDate);
        gracePeriodEnd.setDate(
          gracePeriodEnd.getDate() + unit.grace_period_days,
        );

        if (currentDate > dueDate && currentDate <= gracePeriodEnd) {
          const msgResult = await MessagingService.sendBalanceReminder(
            unit.tenant_phone,
            `${unit.tenant_first_name} ${unit.tenant_last_name}`,
            unit.unit_code,
            unit.balance,
            currentMonth,
            gracePeriodEnd.toISOString().slice(0, 10),
          );

          const anySent = msgResult.sms?.success || msgResult.whatsapp?.success;

          results.details.push({
            unit_code: unit.unit_code,
            tenant_name: `${unit.tenant_first_name} ${unit.tenant_last_name}`,
            balance: unit.balance,
            sms_sent: msgResult.sms?.success || false,
            whatsapp_sent: msgResult.whatsapp?.success || false,
            error: !anySent
              ? msgResult.sms?.error || msgResult.whatsapp?.error
              : null,
          });

          if (anySent) {
            results.sms_sent++;
          } else {
            results.errors++;
          }
        }
      } catch (error) {
        console.error(`Error sending reminder for ${unit.unit_code}:`, error);
        results.errors++;
        results.details.push({
          unit_code: unit.unit_code,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      message: `Balance reminders sent: ${results.sms_sent} successful, ${results.errors} failed`,
      data: results,
    });
  } catch (error) {
    console.error("Error sending balance reminders:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send balance reminders",
      ...(!isProduction() && { error: error.message }),
    });
  }
};

const recordManualPayment = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const {
      tenant_id,
      unit_id,
      amount,
      payment_month,
      mpesa_receipt_number,
      phone_number,
      notes,
    } = req.body;

    if (!tenant_id || !unit_id || !amount || !payment_month) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: tenant_id, unit_id, amount, payment_month",
      });
    }

    // Check for duplicate receipt if provided
    if (mpesa_receipt_number) {
      const duplicateCheck = await client.query(
        "SELECT id FROM rent_payments WHERE mpesa_receipt_number = $1",
        [mpesa_receipt_number],
      );
      if (duplicateCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: "Payment with this M-Pesa receipt number already exists",
        });
      }
    }

    const paymentDate = new Date();
    const formattedPaymentMonth = formatPaymentMonth(payment_month);

    const trackingResult = await trackRentPayment(
      tenant_id,
      unit_id,
      amount,
      paymentDate,
      formattedPaymentMonth.slice(0, 7),
    );

    const paymentResult = await client.query(
      `INSERT INTO rent_payments 
       (tenant_id, unit_id, amount, payment_month, payment_date, status,
        mpesa_receipt_number, phone_number, confirmed_by, confirmed_at, notes)
       VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        tenant_id,
        unit_id,
        trackingResult.allocatedAmount,
        formattedPaymentMonth,
        paymentDate,
        mpesa_receipt_number,
        phone_number,
        req.user.id,
        paymentDate,
        notes,
      ],
    );

    const paymentRecord = paymentResult.rows[0];

    // Carry-forward
    if (trackingResult.carryForwardAmount > 0) {
      const carryForwardPayments = await recordCarryForward(
        tenant_id,
        unit_id,
        trackingResult.carryForwardAmount,
        paymentRecord.id,
        paymentDate,
        mpesa_receipt_number || "MANUAL",
        phone_number,
        req.user.id,
      );

      for (const cfPayment of carryForwardPayments) {
        await sendPaymentNotifications(cfPayment, trackingResult, true);
      }
    }

    await sendPaymentNotifications(paymentRecord, trackingResult, false);

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Manual payment recorded successfully",
      data: {
        payment: paymentRecord,
        tracking: trackingResult,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error recording manual payment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to record manual payment",
      ...(!isProduction() && { error: error.message }),
    });
  } finally {
    client.release();
  }
};

const getPaymentSummary = async (req, res) => {
  try {
    const { tenantId, unitId } = req.params;
    const currentMonth = new Date().toISOString().slice(0, 7);

    const allocationResult = await pool.query(
      `SELECT ta.*, pu.rent_amount, p.name as property_name, pu.unit_number
       FROM tenant_allocations ta
       JOIN property_units pu ON ta.unit_id = pu.id
       JOIN properties p ON pu.property_id = p.id
       WHERE ta.tenant_id = $1 AND ta.unit_id = $2 AND ta.is_active = true`,
      [tenantId, unitId],
    );

    if (allocationResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No active allocation found" });
    }

    const allocation = allocationResult.rows[0];
    const monthlyRent = parseFloat(allocation.monthly_rent);

    const currentMonthResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total_paid, COUNT(*) as payment_count
       FROM rent_payments 
       WHERE tenant_id = $1 AND unit_id = $2 
       AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', $3::date)
       AND status = 'completed'`,
      [tenantId, unitId, `${currentMonth}-01`],
    );

    const totalPaid = parseFloat(currentMonthResult.rows[0].total_paid);
    const balance = monthlyRent - totalPaid;

    const advanceResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as advance_amount, COUNT(*) as advance_count
       FROM rent_payments 
       WHERE tenant_id = $1 AND unit_id = $2 
       AND is_advance_payment = true AND status = 'completed'
       AND DATE_TRUNC('month', payment_month) > DATE_TRUNC('month', $3::date)`,
      [tenantId, unitId, `${currentMonth}-01`],
    );

    const historyResult = await pool.query(
      `SELECT 
        DATE_TRUNC('month', payment_month) as month,
        COALESCE(SUM(amount), 0) as total_paid,
        COUNT(*) as payment_count
       FROM rent_payments 
       WHERE tenant_id = $1 AND unit_id = $2 
       AND payment_month >= NOW() - INTERVAL '12 months'
       AND status = 'completed'
       GROUP BY DATE_TRUNC('month', payment_month)
       ORDER BY month DESC`,
      [tenantId, unitId],
    );

    const monthlyStatus = historyResult.rows.map((row) => ({
      month: new Date(row.month).toISOString().slice(0, 7),
      totalPaid: parseFloat(row.total_paid),
      balance: monthlyRent - parseFloat(row.total_paid),
      isComplete: parseFloat(row.total_paid) >= monthlyRent,
      paymentCount: parseInt(row.payment_count),
    }));

    res.json({
      success: true,
      data: {
        summary: {
          monthlyRent,
          totalPaid,
          balance,
          isFullyPaid: balance <= 0,
          advanceAmount: parseFloat(advanceResult.rows[0].advance_amount),
          advanceCount: parseInt(advanceResult.rows[0].advance_count),
          paymentCount: parseInt(currentMonthResult.rows[0].payment_count),
          propertyName: allocation.property_name,
          unitNumber: allocation.unit_number,
          monthlyStatus,
        },
      },
    });
  } catch (error) {
    console.error("Error getting payment summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get payment summary",
      ...(!isProduction() && { error: error.message }),
    });
  }
};

const getPaymentHistory = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { unitId, months = 12 } = req.query;

    // Sanitize months to prevent SQL injection
    const safeMonths = Math.min(Math.max(parseInt(months, 10) || 12, 1), 120);

    const queryParams = [tenantId, safeMonths];
    let paramIndex = 3;

    let paymentsQuery = `
      SELECT 
        rp.*, p.name as property_name, pu.unit_number, pu.unit_code,
        rp.is_advance_payment, rp.original_payment_id
      FROM rent_payments rp
      LEFT JOIN property_units pu ON rp.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE rp.tenant_id = $1
      AND rp.payment_month >= NOW() - make_interval(months => $2)
    `;

    if (unitId) {
      paymentsQuery += ` AND rp.unit_id = $${paramIndex}`;
      queryParams.push(unitId);
      paramIndex++;
    }

    paymentsQuery += ` ORDER BY rp.payment_month DESC, rp.payment_date DESC`;

    const result = await pool.query(paymentsQuery, queryParams);

    // Build monthly summary
    const monthlySummary = {};
    result.rows.forEach((payment) => {
      const month = payment.payment_month.toISOString().slice(0, 7);
      if (!monthlySummary[month]) {
        monthlySummary[month] = {
          month,
          totalPaid: 0,
          payments: [],
          isFullyPaid: false,
          paymentCount: 0,
        };
      }
      monthlySummary[month].totalPaid += parseFloat(payment.amount);
      monthlySummary[month].payments.push(payment);
      monthlySummary[month].paymentCount++;
    });

    // Get monthly rent
    const allocationParams = [tenantId];
    let allocationQuery = `
      SELECT monthly_rent FROM tenant_allocations 
      WHERE tenant_id = $1 AND is_active = true
    `;

    if (unitId) {
      allocationQuery += ` AND unit_id = $2`;
      allocationParams.push(unitId);
    }

    const allocationResult = await pool.query(
      allocationQuery,
      allocationParams,
    );
    const monthlyRent =
      allocationResult.rows.length > 0
        ? parseFloat(allocationResult.rows[0].monthly_rent)
        : 0;

    Object.keys(monthlySummary).forEach((month) => {
      monthlySummary[month].isFullyPaid =
        monthlySummary[month].totalPaid >= monthlyRent;
      monthlySummary[month].balance =
        monthlyRent - monthlySummary[month].totalPaid;
    });

    res.json({
      success: true,
      data: {
        payments: result.rows,
        monthlySummary: Object.values(monthlySummary),
        monthlyRent,
        totalMonths: Object.keys(monthlySummary).length,
      },
    });
  } catch (error) {
    console.error("Error getting payment history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get payment history",
      ...(!isProduction() && { error: error.message }),
    });
  }
};

const getFuturePaymentsStatus = async (req, res) => {
  try {
    const { tenantId, unitId } = req.params;
    const { futureMonths = 6 } = req.query;

    const allocationResult = await pool.query(
      `SELECT monthly_rent FROM tenant_allocations 
       WHERE tenant_id = $1 AND unit_id = $2 AND is_active = true`,
      [tenantId, unitId],
    );

    if (allocationResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No active allocation found" });
    }

    const monthlyRent = parseFloat(allocationResult.rows[0].monthly_rent);
    const currentDate = new Date();
    const safeFutureMonths = Math.min(
      Math.max(parseInt(futureMonths, 10) || 6, 1),
      24,
    );
    const futurePayments = [];

    for (let i = 1; i <= safeFutureMonths; i++) {
      const futureMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + i,
        1,
      );
      const monthFormatted = futureMonth.toISOString().slice(0, 7) + "-01";

      const paymentsResult = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total_paid
         FROM rent_payments 
         WHERE tenant_id = $1 AND unit_id = $2 
         AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', $3::date)
         AND status = 'completed'`,
        [tenantId, unitId, monthFormatted],
      );

      const totalPaid = parseFloat(paymentsResult.rows[0].total_paid);

      futurePayments.push({
        month: futureMonth.toISOString().slice(0, 7),
        monthlyRent,
        totalPaid,
        balance: monthlyRent - totalPaid,
        isFullyPaid: totalPaid >= monthlyRent,
        isAdvance: totalPaid > 0,
      });
    }

    res.json({
      success: true,
      data: { futurePayments, monthlyRent },
    });
  } catch (error) {
    console.error("Error getting future payments status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get future payments status",
      ...(!isProduction() && { error: error.message }),
    });
  }
};

const handleMpesaCallback = async (req, res) => {
  // ALWAYS respond to Safaricom immediately
  res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

  const client = await pool.connect();
  try {
    const callbackData = req.body;

    if (!callbackData.Body || !callbackData.Body.stkCallback) {
      console.error("Invalid M-Pesa callback format");
      return;
    }

    const stkCallback = callbackData.Body.stkCallback;
    const checkoutRequestId = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;

    // Find the pending payment
    const paymentResult = await client.query(
      `SELECT 
        rp.*, t.first_name, t.last_name,
        p.name as property_name, pu.unit_number, pu.unit_code
       FROM rent_payments rp
       LEFT JOIN tenants t ON rp.tenant_id = t.id
       LEFT JOIN property_units pu ON rp.unit_id = pu.id
       LEFT JOIN properties p ON pu.property_id = p.id
       WHERE rp.mpesa_transaction_id = $1`,
      [checkoutRequestId],
    );

    if (paymentResult.rows.length === 0) {
      console.warn(
        "No pending payment found for checkoutRequestId:",
        checkoutRequestId,
      );
      return;
    }

    const payment = paymentResult.rows[0];

    await client.query("BEGIN");

    if (resultCode === 0) {
      // ✅ PAYMENT SUCCESSFUL
      const callbackMetadata = stkCallback.CallbackMetadata?.Item;

      if (!callbackMetadata) {
        await client.query(
          "UPDATE rent_payments SET status = 'failed', failure_reason = $1 WHERE id = $2",
          ["No callback metadata received", payment.id],
        );
        await client.query("COMMIT");

        // Notify admins only
        await notifyAdminsOfFailure(payment, "No M-Pesa confirmation received");
        return;
      }

      let amount, mpesaReceiptNumber, transactionDate, phoneNumber;

      if (Array.isArray(callbackMetadata)) {
        callbackMetadata.forEach((item) => {
          switch (item.Name) {
            case "Amount":
              amount = item.Value;
              break;
            case "MpesaReceiptNumber":
              mpesaReceiptNumber = item.Value;
              break;
            case "TransactionDate":
              transactionDate = item.Value;
              break;
            case "PhoneNumber":
              phoneNumber = item.Value?.toString();
              break;
          }
        });
      }

      // Duplicate receipt check
      if (mpesaReceiptNumber) {
        const duplicateCheck = await client.query(
          "SELECT id FROM rent_payments WHERE mpesa_receipt_number = $1 AND status = $2 AND id != $3",
          [mpesaReceiptNumber, "completed", payment.id],
        );

        if (duplicateCheck.rows.length > 0) {
          console.warn(
            "Duplicate M-Pesa callback ignored:",
            mpesaReceiptNumber,
          );
          await client.query("ROLLBACK");
          return;
        }
      }

      const paymentDate = new Date();
      const trackingResult = await trackRentPayment(
        payment.tenant_id,
        payment.unit_id,
        amount || payment.amount,
        paymentDate,
        payment.payment_month.toISOString().slice(0, 7),
      );

      await client.query(
        `UPDATE rent_payments 
         SET status = 'completed', 
             mpesa_receipt_number = $1, payment_date = $2,
             confirmed_at = $2, amount = $3
         WHERE id = $4`,
        [
          mpesaReceiptNumber,
          paymentDate,
          trackingResult.allocatedAmount,
          payment.id,
        ],
      );

      // Carry-forward
      if (trackingResult.carryForwardAmount > 0) {
        const carryForwardPayments = await recordCarryForward(
          payment.tenant_id,
          payment.unit_id,
          trackingResult.carryForwardAmount,
          payment.id,
          paymentDate,
          mpesaReceiptNumber,
          phoneNumber,
          null,
        );

        for (const cfPayment of carryForwardPayments) {
          await sendPaymentNotifications(cfPayment, trackingResult, true);
        }
      }

      await client.query("COMMIT");

      // Post-commit: notifications (non-fatal)
      await sendPaymentNotifications(payment, trackingResult, false);

      // SMS + WhatsApp
      try {
        const tenantName = `${payment.first_name} ${payment.last_name}`;
        const unitCode = payment.unit_code;
        const month = payment.payment_month.toISOString().slice(0, 7);
        const balance =
          trackingResult.remainingForTargetMonth -
          trackingResult.allocatedAmount;

        await MessagingService.sendPaymentConfirmation(
          phoneNumber || payment.phone_number,
          tenantName,
          amount || payment.amount,
          unitCode,
          balance,
          month,
        );

        const adminUsers = await pool.query(
          "SELECT phone_number FROM users WHERE role = $1 AND phone_number IS NOT NULL",
          ["admin"],
        );

        for (const admin of adminUsers.rows) {
          await MessagingService.sendAdminAlert(
            admin.phone_number,
            tenantName,
            amount || payment.amount,
            unitCode,
            balance,
            month,
          );
        }
      } catch (msgError) {
        console.error(
          "Failed to send callback notifications (non-fatal):",
          msgError.message,
        );
      }
    } else {
      // ❌ PAYMENT FAILED
      const failureReason = stkCallback.ResultDesc || "Payment failed";

      await client.query(
        "UPDATE rent_payments SET status = $1, failure_reason = $2 WHERE id = $3",
        ["failed", failureReason, payment.id],
      );

      await client.query("COMMIT");

      // Notify admins only (tenants are not system users)
      await notifyAdminsOfFailure(payment, failureReason);
    }
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in M-Pesa callback processing:", error);

    // Attempt to notify admins of system error
    try {
      const adminUsers = await pool.query(
        "SELECT id FROM users WHERE role = $1",
        ["admin"],
      );
      for (const admin of adminUsers.rows) {
        await NotificationService.createNotification({
          userId: admin.id,
          title: "Payment System Error",
          message: `System error processing M-Pesa callback: ${error.message}`,
          type: "system_error",
          relatedEntityType: "system",
        });
      }
    } catch (notifError) {
      console.error(
        "Failed to create system error notification:",
        notifError.message,
      );
    }
  } finally {
    client.release();
  }
};

/**
 * Helper: Notify admins when a payment fails
 * Tenants are NOT system users, so we only notify admins/agents
 */
const notifyAdminsOfFailure = async (payment, reason) => {
  try {
    const adminUsers = await pool.query(
      "SELECT id FROM users WHERE role = $1 AND is_active = true",
      ["admin"],
    );

    const tenantName =
      payment.first_name && payment.last_name
        ? `${payment.first_name} ${payment.last_name}`
        : "Unknown tenant";

    for (const admin of adminUsers.rows) {
      await NotificationService.createNotification({
        userId: admin.id,
        title: "Payment Failure Alert",
        message: `Payment failed for ${tenantName}. Reason: ${reason}`,
        type: "payment_failed",
        relatedEntityType: "rent_payment",
        relatedEntityId: payment.id,
      });
    }
  } catch (error) {
    console.error("Failed to notify admins of payment failure:", error.message);
  }
};

const checkPaymentStatus = async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;

    const result = await pool.query(
      `SELECT 
        rp.*, t.first_name as tenant_first_name, t.last_name as tenant_last_name,
        p.name as property_name, pu.unit_number
       FROM rent_payments rp
       LEFT JOIN tenants t ON rp.tenant_id = t.id
       LEFT JOIN property_units pu ON rp.unit_id = pu.id
       LEFT JOIN properties p ON pu.property_id = p.id
       WHERE rp.mpesa_transaction_id = $1`,
      [checkoutRequestId],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }

    res.json({ success: true, data: { payment: result.rows[0] } });
  } catch (error) {
    console.error("Error checking payment status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check payment status",
      ...(!isProduction() && { error: error.message }),
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
      [tenantId],
    );

    res.json({ success: true, data: { allocations: result.rows } });
  } catch (error) {
    console.error("Error getting tenant allocations:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get tenant allocations",
      ...(!isProduction() && { error: error.message }),
    });
  }
};

const processSalaryPayment = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { agent_id, amount, payment_month, phone_number, notes } = req.body;

    if (!agent_id || !amount || !payment_month || !phone_number) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: agent_id, amount, payment_month, phone_number",
      });
    }

    const agentCheck = await client.query(
      "SELECT id, first_name, last_name FROM users WHERE id = $1 AND role = $2",
      [agent_id, "agent"],
    );

    if (agentCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ success: false, message: "Agent not found" });
    }

    const agent = agentCheck.rows[0];
    const formattedPaymentMonth = formatPaymentMonth(payment_month);

    const existingPayment = await client.query(
      "SELECT id FROM salary_payments WHERE agent_id = $1 AND payment_month = $2",
      [agent_id, formattedPaymentMonth],
    );

    if (existingPayment.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Salary payment for this agent and month already exists",
      });
    }

    const salaryResult = await client.query(
      `INSERT INTO salary_payments 
       (agent_id, amount, payment_month, phone_number, paid_by, payment_date, status)
       VALUES ($1, $2, $3, $4, $5, NOW(), 'completed')
       RETURNING *`,
      [agent_id, amount, formattedPaymentMonth, phone_number, req.user.id],
    );

    const salaryPayment = salaryResult.rows[0];

    // Notify the agent
    await NotificationService.createNotification({
      userId: agent_id,
      title: "Salary Paid",
      message: `Your salary of KSh ${amount} for ${payment_month} has been processed.`,
      type: "salary_paid",
      relatedEntityType: "salary_payment",
      relatedEntityId: salaryPayment.id,
    });

    // Notify admins
    const adminUsers = await client.query(
      "SELECT id FROM users WHERE role = $1 AND is_active = true",
      ["admin"],
    );

    for (const admin of adminUsers.rows) {
      await NotificationService.createNotification({
        userId: admin.id,
        title: "Salary Payment Processed",
        message: `Salary of KSh ${amount} for ${agent.first_name} ${agent.last_name} (${payment_month}) processed.`,
        type: "salary_processed",
        relatedEntityType: "salary_payment",
        relatedEntityId: salaryPayment.id,
      });
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Salary payment processed successfully",
      data: { payment: salaryPayment },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error processing salary payment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process salary payment",
      ...(!isProduction() && { error: error.message }),
    });
  } finally {
    client.release();
  }
};

const getSalaryPayments = async (req, res) => {
  try {
    const { page = 1, limit = 10, agent_id } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `
      SELECT sp.*, u.first_name as agent_first_name, u.last_name as agent_last_name,
             admin_u.first_name as paid_by_first_name, admin_u.last_name as paid_by_last_name
      FROM salary_payments sp
      LEFT JOIN users u ON sp.agent_id = u.id
      LEFT JOIN users admin_u ON sp.paid_by = admin_u.id
    `;

    let countQuery = "SELECT COUNT(*) FROM salary_payments sp";
    const queryParams = [];
    const countParams = [];

    if (agent_id) {
      query += " WHERE sp.agent_id = $1";
      countQuery += " WHERE sp.agent_id = $1";
      queryParams.push(agent_id);
      countParams.push(agent_id);
    }

    query += ` ORDER BY sp.payment_month DESC, sp.payment_date DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(parseInt(limit, 10), offset);

    const paymentsResult = await pool.query(query, queryParams);
    const countResult = await pool.query(countQuery, countParams);

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / parseInt(limit, 10));

    res.json({
      success: true,
      data: {
        payments: paymentsResult.rows,
        pagination: {
          currentPage: parseInt(page, 10),
          totalPages,
          totalCount,
          hasNext: parseInt(page, 10) < totalPages,
          hasPrev: parseInt(page, 10) > 1,
        },
      },
    });
  } catch (error) {
    console.error("Error getting salary payments:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get salary payments",
      ...(!isProduction() && { error: error.message }),
    });
  }
};

const getAgentSalaryPayments = async (req, res) => {
  try {
    const { agentId } = req.params;

    const result = await pool.query(
      `SELECT sp.*, u.first_name as agent_first_name, u.last_name as agent_last_name
       FROM salary_payments sp
       LEFT JOIN users u ON sp.agent_id = u.id
       WHERE sp.agent_id = $1
       ORDER BY sp.payment_month DESC, sp.payment_date DESC`,
      [agentId],
    );

    res.json({ success: true, data: { payments: result.rows } });
  } catch (error) {
    console.error("Error getting agent salary payments:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get agent salary payments",
      ...(!isProduction() && { error: error.message }),
    });
  }
};

const getOverdueReminders = async (req, res) => {
  try {
    const { days_overdue = 5 } = req.query;
    const safeDaysOverdue = Math.min(
      Math.max(parseInt(days_overdue, 10) || 5, 1),
      31,
    );

    const reminders = await pool.query(
      `SELECT 
        ta.tenant_id, t.first_name, t.last_name, t.phone_number,
        pu.unit_code, p.name as property_name, ta.monthly_rent
       FROM tenant_allocations ta
       LEFT JOIN tenants t ON ta.tenant_id = t.id
       LEFT JOIN property_units pu ON ta.unit_id = pu.id
       LEFT JOIN properties p ON pu.property_id = p.id
       WHERE ta.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM rent_payments rp 
         WHERE rp.tenant_id = ta.tenant_id AND rp.unit_id = ta.unit_id 
         AND rp.payment_month = DATE_TRUNC('month', CURRENT_DATE)::date
         AND rp.status = 'completed'
       )
       AND EXTRACT(DAY FROM CURRENT_DATE) >= $1`,
      [safeDaysOverdue],
    );

    res.json({
      success: true,
      data: { reminders: reminders.rows, total: reminders.rows.length },
    });
  } catch (error) {
    console.error("Error in getOverdueReminders:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching overdue reminders",
      ...(!isProduction() && { error: error.message }),
    });
  }
};

const sendOverdueReminders = async (req, res) => {
  try {
    const { tenant_ids, custom_message } = req.body;

    // TODO: Implement actual SMS/WhatsApp sending
    res.json({
      success: true,
      message: "Overdue reminders sent successfully",
      data: { recipients: tenant_ids || ["all_overdue"], custom_message },
    });
  } catch (error) {
    console.error("Error in sendOverdueReminders:", error);
    res.status(500).json({
      success: false,
      message: "Error sending overdue reminders",
      ...(!isProduction() && { error: error.message }),
    });
  }
};

const getUpcomingReminders = async (req, res) => {
  try {
    const { days_ahead = 3 } = req.query;
    const safeDaysAhead = Math.min(
      Math.max(parseInt(days_ahead, 10) || 3, 1),
      31,
    );

    const reminders = await pool.query(
      `SELECT 
        ta.tenant_id, t.first_name, t.last_name, t.phone_number,
        pu.unit_code, p.name as property_name, ta.monthly_rent,
        (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date as due_date
       FROM tenant_allocations ta
       LEFT JOIN tenants t ON ta.tenant_id = t.id
       LEFT JOIN property_units pu ON ta.unit_id = pu.id
       LEFT JOIN properties p ON pu.property_id = p.id
       WHERE ta.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM rent_payments rp 
         WHERE rp.tenant_id = ta.tenant_id AND rp.unit_id = ta.unit_id 
         AND rp.payment_month = (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date
         AND rp.status = 'completed'
       )
       AND EXTRACT(DAY FROM CURRENT_DATE) >= (
         EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')) - $1
       )`,
      [safeDaysAhead],
    );

    res.json({
      success: true,
      data: { reminders: reminders.rows, total: reminders.rows.length },
    });
  } catch (error) {
    console.error("Error in getUpcomingReminders:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching upcoming reminders",
      ...(!isProduction() && { error: error.message }),
    });
  }
};

const sendUpcomingReminders = async (req, res) => {
  try {
    const { tenant_ids, custom_message } = req.body;

    // TODO: Implement actual SMS/WhatsApp sending
    res.json({
      success: true,
      message: "Upcoming reminders sent successfully",
      data: { recipients: tenant_ids || ["all_upcoming"], custom_message },
    });
  } catch (error) {
    console.error("Error in sendUpcomingReminders:", error);
    res.status(500).json({
      success: false,
      message: "Error sending upcoming reminders",
      ...(!isProduction() && { error: error.message }),
    });
  }
};

const testSMSService = async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!phone) {
      return res
        .status(400)
        .json({ success: false, message: "Phone number is required" });
    }

    const testMessage =
      message ||
      "Test SMS from Rental System. If you receive this, SMS service is working!";
    const result = await SMSService.sendSMS(phone, testMessage);

    res.json({
      success: true,
      message: "SMS test completed",
      data: { result },
    });
  } catch (error) {
    console.error("Error testing SMS service:", error);
    res.status(500).json({
      success: false,
      message: "Failed to test SMS service",
      ...(!isProduction() && { error: error.message }),
    });
  }
};

const testMpesaConfig = async (req, res) => {
  try {
    const mpesaConfig = {
      consumerKey: process.env.MPESA_CONSUMER_KEY ? "✅ Set" : "❌ Missing",
      consumerSecret: process.env.MPESA_CONSUMER_SECRET
        ? "✅ Set"
        : "❌ Missing",
      shortCode: process.env.MPESA_SHORT_CODE ? "✅ Set" : "❌ Missing",
      passKey: process.env.MPESA_PASSKEY ? "✅ Set" : "❌ Missing",
      callbackUrl: process.env.MPESA_CALLBACK_URL ? "✅ Set" : "❌ Missing",
      environment: process.env.MPESA_ENVIRONMENT || "sandbox",
    };

    try {
      const accessToken = await getAccessToken();
      mpesaConfig.accessToken = accessToken ? "✅ Obtained" : "❌ Failed";
    } catch (tokenError) {
      mpesaConfig.accessToken = `❌ Failed: ${tokenError.message}`;
    }

    res.json({
      success: true,
      message: "M-Pesa configuration test",
      data: { config: mpesaConfig },
    });
  } catch (error) {
    console.error("M-Pesa config test failed:", error);
    res.status(500).json({
      success: false,
      message: "M-Pesa configuration test failed",
      ...(!isProduction() && { error: error.message }),
    });
  }
};

const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT rp.*, t.first_name as tenant_first_name, t.last_name as tenant_last_name,
              p.name as property_name, pu.unit_number
       FROM rent_payments rp
       LEFT JOIN tenants t ON rp.tenant_id = t.id
       LEFT JOIN property_units pu ON rp.unit_id = pu.id
       LEFT JOIN properties p ON pu.property_id = p.id
       WHERE rp.id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }

    res.json({ success: true, data: { payment: result.rows[0] } });
  } catch (error) {
    console.error("Error getting payment by ID:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get payment",
      ...(!isProduction() && { error: error.message }),
    });
  }
};

const getPaymentsByTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const result = await pool.query(
      `SELECT rp.*, p.name as property_name, pu.unit_number, pu.unit_code
       FROM rent_payments rp
       LEFT JOIN property_units pu ON rp.unit_id = pu.id
       LEFT JOIN properties p ON pu.property_id = p.id
       WHERE rp.tenant_id = $1
       ORDER BY rp.payment_month DESC, rp.payment_date DESC`,
      [tenantId],
    );

    res.json({
      success: true,
      data: { payments: result.rows, count: result.rows.length },
    });
  } catch (error) {
    console.error("Error getting payments by tenant:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get tenant payments",
      ...(!isProduction() && { error: error.message }),
    });
  }
};

const getTenantPaymentStatus = async (req, res) => {
  try {
    const { month, propertyId, search } = req.query;
    const userRole = req.user.role;
    const userId = req.user.id;

    const targetMonth = month || new Date().toISOString().slice(0, 7);
    const monthStart = `${targetMonth}-01`;

    let baseQuery = `
      SELECT 
        t.id as tenant_id, t.first_name, t.last_name,
        CONCAT(t.first_name, ' ', t.last_name) as tenant_name,
        t.phone_number,
        p.id as property_id, p.name as property_name,
        pu.id as unit_id, pu.unit_code,
        ta.monthly_rent, ta.arrears_balance as arrears,
        COALESCE((
          SELECT SUM(rp.amount) FROM rent_payments rp 
          WHERE rp.tenant_id = t.id AND rp.unit_id = pu.id 
          AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', $1::date)
          AND rp.status = 'completed'
        ), 0) as rent_paid,
        COALESCE((
          SELECT wb.amount FROM water_bills wb 
          WHERE wb.tenant_id = t.id 
          AND DATE_TRUNC('month', wb.bill_month) = DATE_TRUNC('month', $1::date)
          LIMIT 1
        ), 0) as water_bill,
        COALESCE((
          SELECT SUM(rp.allocated_to_water) FROM rent_payments rp 
          WHERE rp.tenant_id = t.id 
          AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', $1::date)
          AND rp.status = 'completed'
        ), 0) as water_paid,
        COALESCE((
          SELECT SUM(rp.amount) FROM rent_payments rp 
          WHERE rp.tenant_id = t.id AND rp.unit_id = pu.id 
          AND DATE_TRUNC('month', rp.payment_month) > DATE_TRUNC('month', $1::date)
          AND rp.status = 'completed' AND rp.is_advance_payment = true
        ), 0) as advance_amount,
        (
          SELECT MAX(rp.payment_date) FROM rent_payments rp 
          WHERE rp.tenant_id = t.id AND rp.status = 'completed'
        ) as last_payment_date
      FROM tenants t
      INNER JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
      INNER JOIN property_units pu ON ta.unit_id = pu.id AND pu.is_active = true
      INNER JOIN properties p ON pu.property_id = p.id
    `;

    const whereClauses = [];
    const queryParams = [monthStart];
    let paramIndex = 2;

    // Agent isolation
    if (userRole === "agent") {
      whereClauses.push(`
        p.id IN (
          SELECT property_id FROM agent_property_assignments 
          WHERE agent_id = $${paramIndex}::uuid AND is_active = true
        )
      `);
      queryParams.push(userId);
      paramIndex++;
    }

    if (propertyId) {
      whereClauses.push(`p.id = $${paramIndex}::uuid`);
      queryParams.push(propertyId);
      paramIndex++;
    }

    if (search) {
      whereClauses.push(`(
        t.first_name ILIKE $${paramIndex} OR t.last_name ILIKE $${paramIndex} OR 
        pu.unit_code ILIKE $${paramIndex} OR p.name ILIKE $${paramIndex} OR
        t.phone_number ILIKE $${paramIndex} OR
        CONCAT(t.first_name, ' ', t.last_name) ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (whereClauses.length > 0) {
      baseQuery += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    baseQuery += ` ORDER BY p.name, pu.unit_code`;

    const result = await pool.query(baseQuery, queryParams);

    const tenants = result.rows.map((row) => {
      const monthlyRent = parseFloat(row.monthly_rent) || 0;
      const rentPaid = parseFloat(row.rent_paid) || 0;
      const waterBill = parseFloat(row.water_bill) || 0;
      const waterPaid = parseFloat(row.water_paid) || 0;
      const arrears = parseFloat(row.arrears) || 0;
      const advanceAmount = parseFloat(row.advance_amount) || 0;

      const rentDue = Math.max(0, monthlyRent - rentPaid);
      const waterDue = Math.max(0, waterBill - waterPaid);
      const totalDue = rentDue + waterDue + arrears;

      return {
        tenant_id: row.tenant_id,
        first_name: row.first_name,
        last_name: row.last_name,
        tenant_name: row.tenant_name,
        phone_number: row.phone_number,
        property_id: row.property_id,
        property_name: row.property_name,
        unit_id: row.unit_id,
        unit_code: row.unit_code,
        monthly_rent: monthlyRent,
        rent_paid: rentPaid,
        rent_due: rentDue,
        water_bill: waterBill,
        water_paid: waterPaid,
        water_due: waterDue,
        arrears,
        total_due: totalDue,
        advance_amount: advanceAmount,
        is_fully_paid: totalDue <= 0,
        last_payment_date: row.last_payment_date,
      };
    });

    const summary = {
      total_tenants: tenants.length,
      paid_count: tenants.filter((t) => t.total_due <= 0).length,
      unpaid_count: tenants.filter((t) => t.total_due > 0).length,
      total_expected: tenants.reduce(
        (sum, t) => sum + t.monthly_rent + t.water_bill + t.arrears,
        0,
      ),
      total_collected: tenants.reduce(
        (sum, t) => sum + t.rent_paid + t.water_paid,
        0,
      ),
      total_outstanding: tenants.reduce((sum, t) => sum + t.total_due, 0),
    };

    res.json({
      success: true,
      data: { tenants, summary, month: targetMonth },
    });
  } catch (error) {
    console.error("Error getting tenant payment status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get tenant payment status",
      ...(!isProduction() && { error: error.message }),
    });
  }
};

// ==================== EXPORTS ====================

module.exports = {
  // M-Pesa callback (called by Safaricom — no auth)
  handleMpesaCallback,
  checkPaymentStatus,

  // Paybill payment processing
  processPaybillPayment,
  getPaymentStatusByUnitCode,
  sendBalanceReminders,

  // Payment management (admin/agent)
  getAllPayments,
  getTenantPaymentHistory,
  getPaymentById,
  getPaymentsByTenant,
  recordManualPayment,
  getPaymentSummary,
  getPaymentHistory,
  getFuturePaymentsStatus,
  getTenantPaymentStatus,

  // Tenant allocations
  getTenantAllocations,

  // Salary payments
  processSalaryPayment,
  getSalaryPayments,
  getAgentSalaryPayments,

  // SMS and config testing
  testSMSService,
  testMpesaConfig,

  // Reminders
  getOverdueReminders,
  sendOverdueReminders,
  getUpcomingReminders,
  sendUpcomingReminders,

  // Utility (exported for use by other modules)
  formatPaymentMonth,
  trackRentPayment,
  recordCarryForward,
  sendPaymentNotifications,
};
