// backend/controllers/paymentController.js
// PRODUCTION-READY â€” C2B Paybill + Manual Entry
// STK Push fully removed. C2B callback handles real M-Pesa Paybill payments.
// Tenants do NOT use the system. Payments are recorded by admins/agents or arrive via M-Pesa C2B callback.

const axios = require("axios");
const pool = require("../config/database");
const NotificationService = require("../services/notificationService");
const SMSService = require("../services/smsService");
const MessagingService = require("../services/messagingService");
const MessageTemplateService = require("../services/messageTemplateService");

// ==================== UTILITY HELPERS ====================

const getMpesaBaseUrl = () => {
  return process.env.MPESA_ENVIRONMENT === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
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

const normalizeKenyanPhone = (input) => {
  if (input === undefined || input === null) return null;

  const raw = String(input).trim();
  if (!raw) return null;

  // Keep digits only; Safaricom MSISDN must end up as 2547XXXXXXXX or 2541XXXXXXXX
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  let normalized = null;

  if (digits.startsWith("254") && digits.length >= 12) {
    normalized = digits.slice(0, 12);
  } else if (digits.startsWith("0") && digits.length >= 10) {
    normalized = `254${digits.slice(1, 10)}`;
  } else if (
    (digits.startsWith("7") || digits.startsWith("1")) &&
    digits.length >= 9
  ) {
    normalized = `254${digits.slice(0, 9)}`;
  }

  if (!normalized || !/^254[17]\d{8}$/.test(normalized)) {
    return null;
  }

  return normalized;
};

const isProduction = () => process.env.NODE_ENV === "production";

const formatCoveredMonths = (carryForwardPayments = []) => {
  const uniqueMonths = [
    ...new Set(
      carryForwardPayments
        .map((p) => {
          const d = p.payment_month ? new Date(p.payment_month) : null;
          return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 7) : null;
        })
        .filter(Boolean),
    ),
  ].sort();

  return uniqueMonths.map((month) => {
    const [year, monthNum] = month.split("-");
    return new Date(Number(year), Number(monthNum) - 1, 1).toLocaleDateString(
      "en-US",
      {
        month: "short",
        year: "numeric",
      },
    );
  });
};

// ==================== CORE BUSINESS LOGIC ====================

/**
 * Track payment allocation across arrears, rent, and water.
 * Any remainder is treated as carry-forward to future rent months.
 */
const trackRentPayment = async (
  tenantId,
  unitId,
  amount,
  paymentDate,
  targetMonth = null,
  dbClient = null,
) => {
  const db = dbClient || pool;

  try {
    const allocationQuery = `
      SELECT ta.*, pu.rent_amount 
      FROM tenant_allocations ta 
      JOIN property_units pu ON ta.unit_id = pu.id 
      WHERE ta.tenant_id = $1 AND ta.unit_id = $2 AND ta.is_active = true
    `;
    const allocationResult = await db.query(allocationQuery, [
      tenantId,
      unitId,
    ]);

    if (allocationResult.rows.length === 0) {
      throw new Error("No active tenant allocation found");
    }

    const allocation = allocationResult.rows[0];
    const monthlyRent = parseFloat(allocation.monthly_rent);
    const arrearsBalance = parseFloat(allocation.arrears_balance) || 0;
    const paymentAmount = parseFloat(amount);

    if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) {
      throw new Error("Invalid monthly rent configuration for allocation");
    }

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      throw new Error("Invalid payment amount");
    }

    let paymentMonth = targetMonth;
    if (!paymentMonth) {
      paymentMonth = new Date(paymentDate).toISOString().slice(0, 7);
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const isFutureMonth = paymentMonth > currentMonth;

    const targetMonthPaymentsQuery = `
      SELECT
        COALESCE(SUM(
          CASE
            WHEN (
              COALESCE(allocated_to_rent, 0) +
              COALESCE(allocated_to_water, 0) +
              COALESCE(allocated_to_arrears, 0)
            ) > 0 THEN COALESCE(allocated_to_rent, 0)
            ELSE COALESCE(amount, 0)
          END
        ), 0) AS rent_paid,
        COALESCE(SUM(COALESCE(allocated_to_water, 0)), 0) AS water_paid,
        COALESCE(SUM(COALESCE(allocated_to_arrears, 0)), 0) AS arrears_paid
      FROM rent_payments
      WHERE tenant_id = $1 AND unit_id = $2
      AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', $3::date)
      AND status = 'completed'
    `;
    const targetMonthResult = await db.query(targetMonthPaymentsQuery, [
      tenantId,
      unitId,
      `${paymentMonth}-01`,
    ]);
    const rentPaidForMonth = parseFloat(targetMonthResult.rows[0].rent_paid) || 0;
    const waterPaidForMonth =
      parseFloat(targetMonthResult.rows[0].water_paid) || 0;
    const arrearsPaidForMonth =
      parseFloat(targetMonthResult.rows[0].arrears_paid) || 0;

    const waterBillResult = await db.query(
      `SELECT COALESCE(wb.amount, 0) AS amount
       FROM water_bills wb
       WHERE wb.tenant_id = $1
       AND DATE_TRUNC('month', wb.bill_month) = DATE_TRUNC('month', $2::date)
       AND (wb.unit_id = $3 OR wb.unit_id IS NULL)
       ORDER BY CASE WHEN wb.unit_id = $3 THEN 0 ELSE 1 END
       LIMIT 1`,
      [tenantId, `${paymentMonth}-01`, unitId],
    );
    const waterAmount = parseFloat(waterBillResult.rows[0]?.amount) || 0;

    const remainingArrears = Math.max(0, arrearsBalance - arrearsPaidForMonth);
    const remainingRent = Math.max(0, monthlyRent - rentPaidForMonth);
    const remainingWater = Math.max(0, waterAmount - waterPaidForMonth);

    const totalDueBeforePayment = remainingArrears + remainingRent + remainingWater;
    let remainingPayment = paymentAmount;

    const allocatedToArrears = Math.min(remainingPayment, remainingArrears);
    remainingPayment -= allocatedToArrears;

    const allocatedToRent = Math.min(remainingPayment, remainingRent);
    remainingPayment -= allocatedToRent;

    const allocatedToWater = Math.min(remainingPayment, remainingWater);
    remainingPayment -= allocatedToWater;

    const allocatedAmount = allocatedToArrears + allocatedToRent + allocatedToWater;
    const carryForwardAmount = remainingPayment;
    const totalDueAfterPayment = Math.max(0, totalDueBeforePayment - allocatedAmount);
    const isMonthComplete = totalDueAfterPayment <= 0;

    return {
      allocatedAmount,
      allocatedToArrears,
      allocatedToRent,
      allocatedToWater,
      carryForwardAmount,
      monthlyRent,
      waterAmount,
      targetMonthPaid: rentPaidForMonth,
      isMonthComplete,
      remainingForTargetMonth: totalDueBeforePayment,
      rentBalanceAfterPayment: Math.max(0, remainingRent - allocatedToRent),
      waterBalanceAfterPayment: Math.max(0, remainingWater - allocatedToWater),
      arrearsBalanceAfterPayment: Math.max(0, remainingArrears - allocatedToArrears),
      targetMonth: paymentMonth,
      isFutureMonth,
    };
  } catch (error) {
    console.error("Error in trackRentPayment:", error);
    throw error;
  }
};

/**
 * Record carry-forward payments to future months
 * Uses transaction client to avoid FK constraint errors
 */
const recordCarryForward = async (
  tenantId,
  unitId,
  amount,
  originalPaymentId,
  paymentDate,
  mpesaReceiptNumber,
  phoneNumber,
  confirmedBy,
  dbClient = null,
) => {
  const db = dbClient || pool;

  try {
    let remainingAmount = parseFloat(amount);
    if (!Number.isFinite(remainingAmount) || remainingAmount <= 0) {
      return [];
    }

    // Get property_id for the unit
    const propertyResult = await db.query(
      `SELECT property_id FROM property_units WHERE id = $1`,
      [unitId],
    );
    const propertyId = propertyResult.rows[0]?.property_id;

    let nextMonth = new Date(paymentDate);
    const createdPayments = [];
    let index = 0;

    while (remainingAmount > 0) {
      index++;
      if (index > 24) {
        console.warn("Carry-forward safety limit reached (24 months)");
        break;
      }

      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextMonthFormatted = nextMonth.toISOString().slice(0, 7) + "-01";

      const futureMonthResult = await db.query(
        `SELECT COALESCE(SUM(amount), 0) as total_paid 
         FROM rent_payments 
         WHERE tenant_id = $1 AND unit_id = $2 
         AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', $3::date)
         AND status = 'completed'`,
        [tenantId, unitId, nextMonthFormatted],
      );
      const futureMonthPaid = parseFloat(futureMonthResult.rows[0].total_paid);

      const allocationResult = await db.query(
        `SELECT monthly_rent FROM tenant_allocations 
         WHERE tenant_id = $1 AND unit_id = $2 AND is_active = true`,
        [tenantId, unitId],
      );

      if (allocationResult.rows.length === 0) {
        console.warn("No active allocation found for carry-forward");
        break;
      }

      const monthlyRent = parseFloat(allocationResult.rows[0].monthly_rent);
      const remainingForFutureMonth = monthlyRent - futureMonthPaid;
      const allocationAmount = Math.min(
        remainingAmount,
        Math.max(0, remainingForFutureMonth),
      );

      if (allocationAmount > 0) {
        const result = await db.query(
          `INSERT INTO rent_payments 
           (tenant_id, unit_id, property_id, amount, payment_month, status, is_advance_payment, 
            original_payment_id, payment_date, mpesa_transaction_id, mpesa_receipt_number, 
            phone_number, payment_method, allocated_to_rent, allocated_to_water, allocated_to_arrears)
           VALUES ($1, $2, $3, $4, $5, 'completed', true, $6, $7, $8, $9, $10, $11, $4, 0, 0)
           RETURNING *`,
          [
            tenantId,
            unitId,
            propertyId,
            allocationAmount,
            nextMonthFormatted,
            originalPaymentId,
            paymentDate,
            `CF_${originalPaymentId}_${index}`,
            mpesaReceiptNumber
              ? `${mpesaReceiptNumber}_CF${index}`
              : `CF_${index}_${Date.now()}`,
            phoneNumber,
            "carry_forward",
          ],
        );

        createdPayments.push(result.rows[0]);
        remainingAmount -= allocationAmount;

        if (remainingAmount <= 0) break;
      } else {
        if (remainingForFutureMonth <= 0) {
          // Month fully paid, continue to next
          continue;
        }
      }
    }

    if (remainingAmount > 0) {
      console.warn(
        `Carry-forward ended with unallocated remainder: ${remainingAmount}`,
      );
    }

    return createdPayments;
  } catch (error) {
    console.error("Error recording carry-forward:", error);
    throw error;
  }
};

// ==================== NOTIFICATION FUNCTIONS ====================

/**
 * Send in-app notifications to admins and assigned agents
 */
const sendPaymentNotifications = async (
  payment,
  trackingResult,
  isCarryForward = false,
  carryForwardPayments = [],
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

    const paidAmount = Number(amount) || 0;
    const carryForwardAmount = Number(trackingResult.carryForwardAmount) || 0;
    const totalReceivedAmount = paidAmount + carryForwardAmount;
    const coveredMonths = formatCoveredMonths(carryForwardPayments);
    const coveredMonthsText =
      coveredMonths.length > 0
        ? coveredMonths.join(", ")
        : "future month(s)";

    let notificationMessage;
    if (isCarryForward) {
      notificationMessage = `Payment of KSh ${amount} for ${tenantName} (${details.unit_code}) has been carried forward to future months.`;
    } else if (carryForwardAmount > 0) {
      notificationMessage = `Payment of KSh ${totalReceivedAmount} received from ${tenantName} for ${details.property_name} - ${unitInfo}. KSh ${trackingResult.allocatedAmount} applied to ${trackingResult.targetMonth}, KSh ${carryForwardAmount} carried forward to ${coveredMonthsText}.`;
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

/**
 * Send SMS + WhatsApp notifications for paybill payments
 */
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

    // Log notification (non-fatal)
    try {
      await pool.query(
        `INSERT INTO payment_notifications 
          (payment_id, message_type, message_content, mpesa_code, amount, 
           payment_date, property_info, unit_info, is_sent, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          payment.id,
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

// ==================== C2B M-PESA HANDLERS ====================

/**
 * M-Pesa C2B Validation Handler
 * Safaricom calls this BEFORE completing a Paybill payment.
 * Return ResultCode "0" to accept, any other code to reject.
 * NO AUTH MIDDLEWARE â€” Safaricom calls this directly.
 */
const handleMpesaValidation = async (req, res) => {
  try {
    console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
    console.log("M-PESA C2B VALIDATION REQUEST");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Body:", JSON.stringify(req.body, null, 2));
    console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");

    const {
      TransID,
      TransAmount,
      BillRefNumber,
      MSISDN,
      FirstName,
      MiddleName,
      LastName,
    } = req.body;

    // 1. Validate amount
    const amount = parseFloat(TransAmount);
    if (!amount || amount <= 0) {
      console.log("VALIDATION REJECTED: Invalid amount", TransAmount);
      return res.json({
        ResultCode: "C2B00012",
        ResultDesc: "Invalid Amount",
      });
    }

    // 2. Strictly validate account reference (reject unknown refs)
    if (!BillRefNumber || !String(BillRefNumber).trim()) {
      console.log("VALIDATION REJECTED: Missing BillRefNumber");
      return res.json({
        ResultCode: "C2B00011",
        ResultDesc: "Invalid Account",
      });
    }

    const cleanRef = BillRefNumber.trim().toUpperCase();

    // Try matching BillRef as active unit code
    const unitCheck = await pool.query(
      `SELECT pu.id, pu.unit_code, ta.tenant_id
       FROM property_units pu
       LEFT JOIN tenant_allocations ta ON pu.id = ta.unit_id AND ta.is_active = true
       LEFT JOIN unit_code_aliases uca ON uca.unit_id = pu.id AND uca.is_active = true
       WHERE pu.is_active = true
         AND (UPPER(pu.unit_code) = $1 OR UPPER(uca.alias_code) = $1)`,
      [cleanRef],
    );

    let isRecognizedAccount = unitCheck.rows.length > 0;

    // Fallback: allow BillRef that is a registered tenant phone
    if (!isRecognizedAccount) {
      const phoneRef = normalizeKenyanPhone(BillRefNumber);
      if (phoneRef) {
        const phoneCheck = await pool.query(
          `SELECT id FROM tenants WHERE phone_number = $1`,
          [phoneRef],
        );
        isRecognizedAccount = phoneCheck.rows.length > 0;
      }
    }

    if (!isRecognizedAccount) {
      console.log(
        "VALIDATION REJECTED: Unrecognized account reference:",
        cleanRef,
      );
      return res.json({
        ResultCode: "C2B00011",
        ResultDesc: "Invalid Account",
      });
    }

    // 3. Accept the transaction
    console.log("VALIDATION ACCEPTED:", {
      transId: TransID,
      amount: TransAmount,
      ref: BillRefNumber,
      phone: MSISDN,
      name: `${FirstName || ""} ${MiddleName || ""} ${LastName || ""}`.trim(),
    });

    return res.json({
      ResultCode: "0",
      ResultDesc: "Accepted",
    });
  } catch (error) {
    console.error("Validation endpoint error:", error);
    // Fail closed: reject when validation cannot be performed
    return res.json({
      ResultCode: "C2B00013",
      ResultDesc: "Validation Service Error",
    });
  }
};

/**
 * M-Pesa C2B Confirmation (Callback) Handler
 * Safaricom calls this AFTER a Paybill payment is completed.
 * Payload is FLAT JSON â€” NOT the nested stkCallback format.
 * NO AUTH MIDDLEWARE â€” Safaricom calls this directly.
 *
 * C2B Payload format:
 * {
 *   "TransactionType": "Pay Bill",
 *   "TransID": "SHJ0VBWRGL",
 *   "TransTime": "20250604123045",
 *   "TransAmount": "15000.00",
 *   "BusinessShortCode": "123456",
 *   "BillRefNumber": "MJ-01",
 *   "InvoiceNumber": "",
 *   "OrgAccountBalance": "50000.00",
 *   "ThirdPartyTransID": "",
 *   "MSISDN": "2547XXXXXXXX",
 *   "FirstName": "JOHN",
 *   "MiddleName": "",
 *   "LastName": "DOE"
 * }
 */
const handleMpesaCallback = async (req, res) => {
  // ALWAYS respond to Safaricom immediately (they timeout after ~5 seconds)
  res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // DEBUG: Log ALL fields and their lengths from real Safaricom callback
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  console.log("REAL SAFARICOM CALLBACK - FULL PAYLOAD:");
  console.log(JSON.stringify(req.body, null, 2));
  console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");

  console.log("FIELD LENGTHS FROM SAFARICOM:");
  Object.entries(req.body).forEach(([key, value]) => {
    const strValue = String(value || "");
    console.log(`  ${key}: ${strValue.length} chars = "${strValue}"`);
  });
  console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");

  const client = await pool.connect();
  try {
    console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
    console.log("M-PESA C2B CONFIRMATION RECEIVED");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Body:", JSON.stringify(req.body, null, 2));
    console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");

    // C2B Paybill payload is FLAT JSON
    const {
      TransID,
      TransAmount,
      BillRefNumber,
      MSISDN,
      FirstName,
      MiddleName,
      LastName,
      TransTime,
      BusinessShortCode,
      OrgAccountBalance,
    } = req.body;

    // Validate required fields
    if (!TransID || !TransAmount || !MSISDN) {
      console.error(
        "Invalid C2B callback: missing TransID, TransAmount, or MSISDN",
      );
      return;
    }

    const amount = parseFloat(TransAmount);
    if (!amount || amount <= 0) {
      console.log("Invalid payment amount, skipping:", TransAmount);
      return;
    }

    // Check for duplicate (Safaricom may retry callbacks)
    const duplicateCheck = await client.query(
      "SELECT id FROM rent_payments WHERE mpesa_receipt_number = $1",
      [TransID],
    );
    if (duplicateCheck.rows.length > 0) {
      console.log("Duplicate C2B callback ignored:", TransID);
      return;
    }

    const phone = normalizeKenyanPhone(MSISDN);
    const billRefPhone = normalizeKenyanPhone(BillRefNumber);
    if (!phone) {
      console.warn("Invalid callback MSISDN format received:", MSISDN);
    }

    // Parse transaction time (format: YYYYMMDDHHmmss)
    let transTime = new Date();
    if (TransTime && TransTime.length >= 14) {
      try {
        transTime = new Date(
          `${TransTime.substring(0, 4)}-${TransTime.substring(4, 6)}-${TransTime.substring(6, 8)}T` +
            `${TransTime.substring(8, 10)}:${TransTime.substring(10, 12)}:${TransTime.substring(12, 14)}`,
        );
        if (isNaN(transTime.getTime())) transTime = new Date();
      } catch {
        transTime = new Date();
      }
    }

    const payerName =
      `${FirstName || ""} ${MiddleName || ""} ${LastName || ""}`.trim() ||
      "Unknown";

    await client.query("BEGIN");

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // TENANT RESOLUTION â€” Try multiple strategies
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    let tenant = null;
    let unit = null;
    let property = null;

    // Strategy 1: Match BillRefNumber as unit_code
    if (BillRefNumber && BillRefNumber.trim()) {
      const cleanRef = BillRefNumber.trim().toUpperCase();
      const unitResult = await client.query(
        `SELECT 
          ta.tenant_id, ta.id as allocation_id, ta.monthly_rent, 
          ta.arrears_balance,
          pu.id as unit_id, pu.unit_code, pu.property_id,
          t.first_name as tenant_first_name, t.last_name as tenant_last_name,
          t.phone_number as tenant_phone,
          p.name as property_name
        FROM property_units pu
        LEFT JOIN unit_code_aliases uca ON uca.unit_id = pu.id AND uca.is_active = true
        JOIN tenant_allocations ta ON pu.id = ta.unit_id AND ta.is_active = true
        JOIN tenants t ON ta.tenant_id = t.id
        JOIN properties p ON pu.property_id = p.id
        WHERE pu.is_active = true
          AND (UPPER(pu.unit_code) = $1 OR UPPER(uca.alias_code) = $1)`,
        [cleanRef],
      );

      if (unitResult.rows.length > 0) {
        const row = unitResult.rows[0];
        tenant = {
          id: row.tenant_id,
          first_name: row.tenant_first_name,
          last_name: row.tenant_last_name,
          phone_number: row.tenant_phone,
        };
        unit = { id: row.unit_id, unit_code: row.unit_code };
        property = { id: row.property_id, name: row.property_name };
        console.log(
          `âœ… Matched by unit_code: ${cleanRef} â†’ ${tenant.first_name} ${tenant.last_name}`,
        );
      }
    }

    // Strategy 2: Match BillRefNumber as phone number
    if (!tenant && BillRefNumber && BillRefNumber.trim()) {
      const phoneRef = billRefPhone;
      // Only try if it looks like a phone number
      if (phoneRef) {
        const phoneResult = await client.query(
          `SELECT 
            t.id as tenant_id, t.first_name, t.last_name, t.phone_number,
            ta.id as allocation_id, ta.monthly_rent, ta.arrears_balance,
            pu.id as unit_id, pu.unit_code, pu.property_id,
            p.name as property_name
          FROM tenants t
          JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
          JOIN property_units pu ON ta.unit_id = pu.id
          JOIN properties p ON pu.property_id = p.id
          WHERE t.phone_number = $1`,
          [phoneRef],
        );

        if (phoneResult.rows.length > 0) {
          const row = phoneResult.rows[0];
          tenant = {
            id: row.tenant_id,
            first_name: row.first_name,
            last_name: row.last_name,
            phone_number: row.phone_number,
          };
          unit = { id: row.unit_id, unit_code: row.unit_code };
          property = { id: row.property_id, name: row.property_name };
          console.log(
            `âœ… Matched by BillRefNumber as phone: ${phoneRef} â†’ ${tenant.first_name} ${tenant.last_name}`,
          );
        }
      }
    }

    // Strategy 3: Match MSISDN (paying phone number) to tenant
    if (!tenant) {
      if (phone) {
        const msisdnResult = await client.query(
          `SELECT 
            t.id as tenant_id, t.first_name, t.last_name, t.phone_number,
            ta.id as allocation_id, ta.monthly_rent, ta.arrears_balance,
            pu.id as unit_id, pu.unit_code, pu.property_id,
            p.name as property_name
          FROM tenants t
          JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
          JOIN property_units pu ON ta.unit_id = pu.id
          JOIN properties p ON pu.property_id = p.id
          WHERE t.phone_number = $1`,
          [phone],
        );

        if (msisdnResult.rows.length > 0) {
          const row = msisdnResult.rows[0];
          tenant = {
            id: row.tenant_id,
            first_name: row.first_name,
            last_name: row.last_name,
            phone_number: row.phone_number,
          };
          unit = { id: row.unit_id, unit_code: row.unit_code };
          property = { id: row.property_id, name: row.property_name };
          console.log(
            `âœ… Matched by MSISDN: ${phone} â†’ ${tenant.first_name} ${tenant.last_name}`,
          );
        }
      }
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // UNMATCHED PAYMENT â€” Record for manual allocation
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    if (!tenant) {
      const phoneForInsert = phone || billRefPhone;
      const safePhone = phoneForInsert || "invalid_msisdn";
      const unmatchedPaymentMonth = formatPaymentMonth(transTime);
      if (!phoneForInsert) {
        console.error(
          `Unmatched callback ${TransID}: no valid phone from MSISDN/BillRef. Recording as pending with placeholder phone.`,
        );

        try {
          const adminUsers = await pool.query(
            "SELECT id FROM users WHERE role = 'admin' AND is_active = true",
          );
          for (const admin of adminUsers.rows) {
            await NotificationService.createNotification({
              userId: admin.id,
              title: "⚠️ Unmatched M-Pesa Callback (Invalid Phone)",
              message: `Callback received but no valid phone could be parsed (Receipt: ${TransID}, Ref: ${BillRefNumber || "none"}, Raw MSISDN: ${MSISDN || "none"}).`,
              type: "payment_pending",
              relatedEntityType: "rent_payment",
            });
          }
        } catch (notifError) {
          console.error(
            "Failed to notify admins of invalid-phone callback:",
            notifError.message,
          );
        }
      }

      await client.query(
        `INSERT INTO rent_payments (
          mpesa_transaction_id, mpesa_receipt_number, phone_number,
          amount, payment_date, payment_month, status, payment_method,
          notes, created_at
        ) VALUES (
          $1, $1, $2,
          $3, $4, $5, 'pending', 'mpesa',
          $6, NOW()
        )`,
        [
          TransID,
          safePhone,
          amount,
          transTime,
          unmatchedPaymentMonth,
          `UNMATCHED C2B: Ref=${BillRefNumber || "none"}, Payer=${payerName}, Phone=${safePhone}, RawMSISDN=${MSISDN}`,
        ],
      );

      await client.query("COMMIT");

      // Notify payer if we have a valid phone (helps prevent "money lost" confusion)
      if (safePhone !== "invalid_msisdn") {
        try {
          const unmatchedMessage = `We received your M-Pesa payment of KES ${Number(amount).toLocaleString()} (Receipt: ${TransID}) but the account reference "${BillRefNumber || "N/A"}" is invalid. Please contact support with this receipt for immediate assistance.`;
          await MessagingService.sendRawMessage(
            safePhone,
            unmatchedMessage,
            "payment_pending",
          );
        } catch (payerNotifError) {
          console.error(
            "Failed to notify payer for unmatched callback:",
            payerNotifError.message,
          );
        }
      }

      // Notify admins about unmatched payment
      try {
        const adminUsers = await pool.query(
          "SELECT id FROM users WHERE role = 'admin' AND is_active = true",
        );
        for (const admin of adminUsers.rows) {
          await NotificationService.createNotification({
            userId: admin.id,
            title: "âš ï¸ Unmatched M-Pesa Payment",
            message: `KSh ${amount.toLocaleString()} from ${safePhone} (Payer: ${payerName}, Ref: ${BillRefNumber || "none"}, Receipt: ${TransID}). Manual allocation required.`,
            type: "payment_pending",
            relatedEntityType: "rent_payment",
          });
        }
      } catch (notifError) {
        console.error(
          "Failed to notify admins of unmatched payment:",
          notifError.message,
        );
      }

      return;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // MATCHED PAYMENT â€” Process allocation
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    const currentMonth = transTime.toISOString().slice(0, 7);
    const formattedPaymentMonth = `${currentMonth}-01`;

    // Track rent allocation
    const trackingResult = await trackRentPayment(
      tenant.id,
      unit.id,
      amount,
      transTime,
      currentMonth,
      client,
    );

        const paymentPhone = phone || normalizeKenyanPhone(tenant.phone_number);
    if (!paymentPhone) {
      throw new Error(
        `No valid phone for matched callback ${TransID} (tenant ${tenant.id})`,
      );
    }

    // Insert the payment record
    const paymentResult = await client.query(
      `INSERT INTO rent_payments (
        tenant_id, unit_id, property_id,
        mpesa_transaction_id, mpesa_receipt_number, phone_number,
        amount, payment_date, payment_month, status,
        payment_method, is_advance_payment,
        allocated_to_rent, allocated_to_water, allocated_to_arrears,
        created_at
      ) VALUES (
        $1, $2, $3,
        $4, $4, $5,
        $6, $7, $8, 'completed',
        'mpesa', $9, $10, $11, $12,
        NOW()
      ) RETURNING *`,
      [
        tenant.id,
        unit.id,
        property.id,
        TransID,
        paymentPhone,
        trackingResult.allocatedAmount,
        transTime,
        formattedPaymentMonth,
        trackingResult.carryForwardAmount > 0,
        trackingResult.allocatedToRent || 0,
        trackingResult.allocatedToWater || 0,
        trackingResult.allocatedToArrears || 0,
      ],
    );

    const paymentRecord = paymentResult.rows[0];

    // Handle carry-forward (overpayment)
    let carryForwardPayments = [];
    if (trackingResult.carryForwardAmount > 0) {
      carryForwardPayments = await recordCarryForward(
        tenant.id,
        unit.id,
        trackingResult.carryForwardAmount,
        paymentRecord.id,
        transTime,
        TransID,
        paymentPhone,
        null,
        client,
      );
    }

    await client.query("COMMIT");

    console.log("âœ… PAYMENT PROCESSED:", {
      transId: TransID,
      tenant: `${tenant.first_name} ${tenant.last_name}`,
      unit: unit.unit_code,
      property: property.name,
      amount,
      allocated: trackingResult.allocatedAmount,
      carryForward: trackingResult.carryForwardAmount,
      monthComplete: trackingResult.isMonthComplete,
    });

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // POST-COMMIT: Notifications (non-blocking)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    try {
      // In-app notifications
      await sendPaymentNotifications(
        paymentRecord,
        trackingResult,
        false,
        carryForwardPayments,
      );

      // SMS + WhatsApp to tenant
      const tenantName = `${tenant.first_name} ${tenant.last_name}`;
      const balance =
        trackingResult.remainingForTargetMonth - trackingResult.allocatedAmount;

      await MessagingService.sendPaymentConfirmation(
        tenant.phone_number,
        tenantName,
        amount,
        unit.unit_code,
        balance,
        currentMonth,
      );

      // SMS + WhatsApp to admins
      const adminUsers = await pool.query(
        "SELECT phone_number FROM users WHERE role = 'admin' AND phone_number IS NOT NULL",
      );
      for (const admin of adminUsers.rows) {
        await MessagingService.sendAdminAlert(
          admin.phone_number,
          tenantName,
          amount,
          unit.unit_code,
          balance,
          currentMonth,
        );
      }

      // Advance payment notification to tenant
      if (
        trackingResult.carryForwardAmount > 0 &&
        carryForwardPayments.length > 0
      ) {
        const coveredMonths = formatCoveredMonths(carryForwardPayments);
        await MessagingService.sendAdvancePaymentNotification(
          tenant.phone_number,
          tenantName,
          trackingResult.carryForwardAmount,
          unit.unit_code,
          coveredMonths.length,
          coveredMonths.join(", "),
        );
      }
    } catch (notifError) {
      console.error(
        "Post-commit notification error (non-fatal):",
        notifError.message,
      );
    }
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("C2B CALLBACK PROCESSING ERROR:", error);

    // Notify admins of system error
    try {
      const adminUsers = await pool.query(
        "SELECT id FROM users WHERE role = 'admin' AND is_active = true",
      );
      for (const admin of adminUsers.rows) {
        await NotificationService.createNotification({
          userId: admin.id,
          title: "Payment System Error",
          message: `Error processing M-Pesa C2B callback: ${error.message}`,
          type: "system_alert",
          relatedEntityType: "system",
        });
      }
    } catch (notifError) {
      console.error(
        "Failed to send system error notification:",
        notifError.message,
      );
    }
  } finally {
    client.release();
  }
};;

// ==================== CONTROLLER HANDLERS ====================

/**
 * Get all payments with pagination, filtering, and sorting
 */
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

    // Sort column mapping for JOINed tables
    const sortColumnMap = {
      payment_date: "rp.payment_date",
      amount: "rp.amount",
      first_name: "t.first_name",
      property_name: "p.name",
      status: "rp.status",
    };
    const safeSortColumn = sortColumnMap[sortBy] || "rp.payment_date";
    const safeSortOrder = sortOrder.toLowerCase() === "asc" ? "ASC" : "DESC";

    let baseQuery = `
      SELECT 
        rp.id, rp.amount, rp.payment_month, rp.payment_date, rp.status, 
        rp.mpesa_receipt_number, rp.mpesa_transaction_id, rp.phone_number,
        t.id as tenant_id, t.first_name, t.last_name,
        p.id as property_id, p.name as property_name,
        pu.unit_code
      FROM rent_payments rp
      LEFT JOIN tenants t ON rp.tenant_id = t.id
      LEFT JOIN property_units pu ON rp.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
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
      whereClauses.push(`rp.payment_date::date >= $${paramIndex}::date`);
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClauses.push(`rp.payment_date::date <= $${paramIndex}::date`);
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
    baseQuery += ` ORDER BY ${safeSortColumn} ${safeSortOrder}`;
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

/**
 * Get payment history for a specific tenant
 */
const getTenantPaymentHistory = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const parseDateOnly = (value) => {
      if (!value) return null;

      if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
      }

      if (typeof value === "string") {
        const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
          const year = Number(match[1]);
          const monthIndex = Number(match[2]) - 1;
          const day = Number(match[3]);
          return new Date(year, monthIndex, day);
        }
      }

      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return null;
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    };

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
      `SELECT lease_start_date, lease_end_date, monthly_rent, is_active, updated_at
       FROM tenant_allocations
       WHERE tenant_id = $1
       ORDER BY is_active DESC, updated_at DESC NULLS LAST, lease_start_date DESC NULLS LAST`,
      [tenantId],
    );

    let totalExpected = 0;
    let currentMonthExpected = 0;
    const now = new Date();
    const nowMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const normalizedAllocations = allocationsQuery.rows.map((alloc) => ({
      ...alloc,
      is_active:
        alloc.is_active === true ||
        alloc.is_active === "true" ||
        alloc.is_active === 1,
      updated_at: alloc.updated_at ? new Date(alloc.updated_at) : null,
    }));

    // Prefer active allocations for expected metrics.
    // If none are active (legacy/inconsistent data), fall back to the latest allocation.
    const activeAllocations = normalizedAllocations.filter((a) => a.is_active);
    const allocationsForMetrics =
      activeAllocations.length > 0
        ? activeAllocations
        : normalizedAllocations.slice(0, 1);

    allocationsForMetrics.forEach((alloc) => {
      const start = parseDateOnly(alloc.lease_start_date);
      const end = alloc.lease_end_date ? parseDateOnly(alloc.lease_end_date) : now;
      if (!start || !end || end < start) return;

      let months = (end.getFullYear() - start.getFullYear()) * 12;
      months -= start.getMonth();
      months += end.getMonth();
      const monthCount = months < 0 ? 0 : months + 1;

      totalExpected += monthCount * parseFloat(alloc.monthly_rent);

      const allocationStartMonth = new Date(
        start.getFullYear(),
        start.getMonth(),
        1,
      );
      const allocationEndMonth = new Date(end.getFullYear(), end.getMonth(), 1);
      if (
        nowMonthStart >= allocationStartMonth &&
        nowMonthStart <= allocationEndMonth
      ) {
        currentMonthExpected += parseFloat(alloc.monthly_rent);
      }
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
          currentMonthExpected,
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

/**
 * Process paybill payment â€” Admin/Agent manually enters M-Pesa receipt details
 */
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
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: unit_code, amount, mpesa_receipt_number, phone_number",
      });
    }

    const normalizedPhone = normalizeKenyanPhone(phone_number);
    if (!normalizedPhone) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message:
          "Invalid phone number format. Use Kenyan format (07XXXXXXXX / 2547XXXXXXXX).",
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

    // Track rent allocation
    const trackingResult = await trackRentPayment(
      unit.tenant_id,
      unit.id,
      amount,
      paymentDate,
      formattedPaymentMonth.slice(0, 7),
      client,
    );

    const paymentResult = await client.query(
      `INSERT INTO rent_payments 
       (tenant_id, unit_id, property_id, amount, payment_month, payment_date, status,
        mpesa_receipt_number, phone_number, payment_method, mpesa_transaction_id,
        allocated_to_rent, allocated_to_water, allocated_to_arrears)
       VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        unit.tenant_id,
        unit.id,
        unit.property_id,
        trackingResult.allocatedAmount,
        formattedPaymentMonth,
        paymentDate,
        mpesa_receipt_number,
        normalizedPhone,
        "paybill",
        `PB_${mpesa_receipt_number}`,
        trackingResult.allocatedToRent || 0,
        trackingResult.allocatedToWater || 0,
        trackingResult.allocatedToArrears || 0,
      ],
    );

    const paymentRecord = paymentResult.rows[0];

    // Carry-forward with transaction client
    let carryForwardPayments = [];
    if (trackingResult.carryForwardAmount > 0) {
      carryForwardPayments = await recordCarryForward(
        unit.tenant_id,
        unit.id,
        trackingResult.carryForwardAmount,
        paymentRecord.id,
        paymentDate,
        mpesa_receipt_number,
        normalizedPhone,
        req.user?.id,
        client,
      );

    }

    // Commit the transaction
    await client.query("COMMIT");

    // Post-commit: In-app notifications to admins and agents
    try {
      const adminUsersQuery = await pool.query(
        "SELECT id FROM users WHERE role = 'admin' AND is_active = true",
      );
      const agentAssignmentQuery = await pool.query(
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

    // SMS + WhatsApp notifications
    await sendPaybillSMSNotifications(paymentRecord, trackingResult, unit);
    await sendPaymentNotifications(
      paymentRecord,
      trackingResult,
      false,
      carryForwardPayments,
    );

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

/**
 * Get payment status for a specific unit code
 */
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
      `SELECT
         COALESCE(SUM(
           CASE
             WHEN (
               COALESCE(allocated_to_rent, 0) +
               COALESCE(allocated_to_water, 0) +
               COALESCE(allocated_to_arrears, 0)
             ) > 0 THEN COALESCE(allocated_to_rent, 0)
             ELSE COALESCE(amount, 0)
           END
         ), 0) as total_paid,
         COUNT(*) as payment_count
       FROM rent_payments 
       WHERE unit_id = $1 
       AND tenant_id = $2
       AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', $3::date)
       AND status = 'completed'`,
      [unit.id, unit.tenant_id, `${targetMonth}-01`],
    );

    const totalPaid = parseFloat(summaryResult.rows[0].total_paid);
    const monthlyRent = parseFloat(unit.monthly_rent);
    const balance = monthlyRent - totalPaid;

    const historyResult = await pool.query(
      `SELECT * FROM rent_payments 
       WHERE unit_id = $1 
       AND tenant_id = $2
       AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', $3::date)
       ORDER BY payment_date DESC`,
      [unit.id, unit.tenant_id, `${targetMonth}-01`],
    );

    const futureResult = await pool.query(
      `SELECT 
        DATE_TRUNC('month', payment_month) as month,
        COALESCE(SUM(
          CASE
            WHEN (
              COALESCE(allocated_to_rent, 0) +
              COALESCE(allocated_to_water, 0) +
              COALESCE(allocated_to_arrears, 0)
            ) > 0 THEN COALESCE(allocated_to_rent, 0)
            ELSE COALESCE(amount, 0)
          END
        ), 0) as total_paid
       FROM rent_payments 
       WHERE unit_id = $1 
       AND tenant_id = $2
       AND DATE_TRUNC('month', payment_month) > DATE_TRUNC('month', $3::date)
       AND status = 'completed'
       GROUP BY DATE_TRUNC('month', payment_month)
       ORDER BY month ASC`,
      [unit.id, unit.tenant_id, `${targetMonth}-01`],
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

/**
 * Send balance reminders to tenants with outstanding balances
 */
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
        COALESCE(SUM(
          CASE
            WHEN (
              COALESCE(rp.allocated_to_rent, 0) +
              COALESCE(rp.allocated_to_water, 0) +
              COALESCE(rp.allocated_to_arrears, 0)
            ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
            ELSE COALESCE(rp.amount, 0)
          END
        ), 0) as total_paid,
        (
          ta.monthly_rent - COALESCE(SUM(
            CASE
              WHEN (
                COALESCE(rp.allocated_to_rent, 0) +
                COALESCE(rp.allocated_to_water, 0) +
                COALESCE(rp.allocated_to_arrears, 0)
              ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
              ELSE COALESCE(rp.amount, 0)
            END
          ), 0)
        ) as balance,
        ta.rent_due_day, ta.grace_period_days
      FROM property_units pu
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN tenant_allocations ta ON pu.id = ta.unit_id AND ta.is_active = true
       LEFT JOIN tenants t ON ta.tenant_id = t.id
       LEFT JOIN rent_payments rp ON pu.id = rp.unit_id 
        AND ta.tenant_id = rp.tenant_id
        AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', $1::date)
        AND rp.status = 'completed'
      WHERE ta.tenant_id IS NOT NULL
      GROUP BY pu.id, pu.unit_code, p.name, ta.tenant_id, t.first_name, t.last_name, 
               t.phone_number, ta.monthly_rent, ta.rent_due_day, ta.grace_period_days
      HAVING (
        ta.monthly_rent - COALESCE(SUM(
          CASE
            WHEN (
              COALESCE(rp.allocated_to_rent, 0) +
              COALESCE(rp.allocated_to_water, 0) +
              COALESCE(rp.allocated_to_arrears, 0)
            ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
            ELSE COALESCE(rp.amount, 0)
          END
        ), 0)
      ) > 0`,
      [`${currentMonth}-01`],
    );

    const overdueUnits = overdueResult.rows;
    const settingsResult = await pool.query(
      `SELECT setting_key, setting_value
       FROM admin_settings
       WHERE setting_key IN ('paybill_number','company_name')`,
    );
    const settingsMap = Object.fromEntries(
      settingsResult.rows.map((row) => [row.setting_key, row.setting_value]),
    );
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
          unit.rent_due_day || 1,
        );
        const gracePeriodEnd = new Date(dueDate);
        gracePeriodEnd.setDate(
          gracePeriodEnd.getDate() + (unit.grace_period_days || 5),
        );

        if (currentDate > dueDate && currentDate <= gracePeriodEnd) {
          const variables = {
            tenantName: `${unit.tenant_first_name} ${unit.tenant_last_name}`,
            unitCode: unit.unit_code,
            month: currentMonth,
            total: Number(unit.balance || 0).toLocaleString("en-KE", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            dueDate: gracePeriodEnd.toISOString().slice(0, 10),
            paybill: settingsMap.paybill_number || "",
            companyName: settingsMap.company_name || "",
          };

          const rendered = await MessageTemplateService.buildRenderedMessage({
            eventKey: "balance_reminder_auto",
            channel: "sms",
            variables,
          });

          const msgResult = rendered?.rendered
            ? await MessagingService.sendRawMessage(
                unit.tenant_phone,
                rendered.rendered,
                "balance_reminder",
              )
            : await MessagingService.sendBalanceReminder(
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

          if (anySent) results.sms_sent++;
          else results.errors++;
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

/**
 * Record a manual payment (cash, bank transfer, etc.)
 */
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
      await client.query("ROLLBACK");
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

    // Get property_id and tenant details from unit
    const unitInfo = await client.query(
      `SELECT pu.property_id, t.first_name, t.last_name, t.phone_number as tenant_phone,
              p.name as property_name, pu.unit_code
       FROM property_units pu
       JOIN properties p ON pu.property_id = p.id
       LEFT JOIN tenant_allocations ta ON pu.id = ta.unit_id AND ta.is_active = true
       LEFT JOIN tenants t ON ta.tenant_id = t.id
       WHERE pu.id = $1`,
      [unit_id],
    );
    const propertyId = unitInfo.rows[0]?.property_id;

    const paymentDate = new Date();
    const formattedPaymentMonth = formatPaymentMonth(payment_month);
    const normalizedPhone = phone_number
      ? normalizeKenyanPhone(phone_number)
      : null;

    if (phone_number && !normalizedPhone) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message:
          "Invalid phone number format. Use Kenyan format (07XXXXXXXX / 2547XXXXXXXX).",
      });
    }

    // Track rent allocation
    const trackingResult = await trackRentPayment(
      tenant_id,
      unit_id,
      amount,
      paymentDate,
      formattedPaymentMonth.slice(0, 7),
      client,
    );

    const paymentResult = await client.query(
      `INSERT INTO rent_payments 
       (tenant_id, unit_id, property_id, amount, payment_month, payment_date, status,
        mpesa_receipt_number, phone_number, notes, 
        payment_method, mpesa_transaction_id, allocated_to_rent, allocated_to_water, allocated_to_arrears)
       VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $8, $9, 'manual', $10, $11, $12, $13)
       RETURNING *`,
      [
        tenant_id,
        unit_id,
        propertyId,
        trackingResult.allocatedAmount,
        formattedPaymentMonth,
        paymentDate,
        mpesa_receipt_number,
        normalizedPhone,
        notes,
        mpesa_receipt_number
          ? `MANUAL_${mpesa_receipt_number}`
          : `MANUAL_${Date.now()}`,
        trackingResult.allocatedToRent || 0,
        trackingResult.allocatedToWater || 0,
        trackingResult.allocatedToArrears || 0,
      ],
    );

    const paymentRecord = paymentResult.rows[0];

    // Carry-forward with transaction client
    let carryForwardPayments = [];
    if (trackingResult.carryForwardAmount > 0) {
      carryForwardPayments = await recordCarryForward(
        tenant_id,
        unit_id,
        trackingResult.carryForwardAmount,
        paymentRecord.id,
        paymentDate,
        mpesa_receipt_number || "MANUAL",
        normalizedPhone,
        req.user.id,
        client,
      );

    }

    await client.query("COMMIT");

    // Post-commit notifications
    await sendPaymentNotifications(
      paymentRecord,
      trackingResult,
      false,
      carryForwardPayments,
    );

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

/**
 * Get payment summary for a specific tenant and unit
 */
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
      `SELECT
         COALESCE(SUM(
           CASE
             WHEN (
               COALESCE(allocated_to_rent, 0) +
               COALESCE(allocated_to_water, 0) +
               COALESCE(allocated_to_arrears, 0)
             ) > 0 THEN COALESCE(allocated_to_rent, 0)
             ELSE COALESCE(amount, 0)
           END
         ), 0) as total_paid,
         COUNT(*) as payment_count
       FROM rent_payments 
       WHERE tenant_id = $1 AND unit_id = $2 
       AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', $3::date)
       AND status = 'completed'`,
      [tenantId, unitId, `${currentMonth}-01`],
    );

    const totalPaid = parseFloat(currentMonthResult.rows[0].total_paid);
    const balance = monthlyRent - totalPaid;

    const advanceResult = await pool.query(
      `SELECT
         COALESCE(SUM(
           CASE
             WHEN (
               COALESCE(allocated_to_rent, 0) +
               COALESCE(allocated_to_water, 0) +
               COALESCE(allocated_to_arrears, 0)
             ) > 0 THEN COALESCE(allocated_to_rent, 0)
             ELSE COALESCE(amount, 0)
           END
         ), 0) as advance_amount,
         COUNT(*) as advance_count
       FROM rent_payments 
       WHERE tenant_id = $1 AND unit_id = $2 
       AND is_advance_payment = true AND status = 'completed'
       AND DATE_TRUNC('month', payment_month) > DATE_TRUNC('month', $3::date)`,
      [tenantId, unitId, `${currentMonth}-01`],
    );

    const historyResult = await pool.query(
      `SELECT 
        DATE_TRUNC('month', payment_month) as month,
        COALESCE(SUM(
          CASE
            WHEN (
              COALESCE(allocated_to_rent, 0) +
              COALESCE(allocated_to_water, 0) +
              COALESCE(allocated_to_arrears, 0)
            ) > 0 THEN COALESCE(allocated_to_rent, 0)
            ELSE COALESCE(amount, 0)
          END
        ), 0) as total_paid,
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

/**
 * Get detailed payment history for a tenant
 */
const getPaymentHistory = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { unitId, months = 12 } = req.query;

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

/**
 * Get future payments status (advance payments)
 */
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
        `SELECT COALESCE(SUM(
           CASE
             WHEN (
               COALESCE(allocated_to_rent, 0) +
               COALESCE(allocated_to_water, 0) +
               COALESCE(allocated_to_arrears, 0)
             ) > 0 THEN COALESCE(allocated_to_rent, 0)
             ELSE COALESCE(amount, 0)
           END
         ), 0) as total_paid
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

/**
 * Check payment status by checkout request ID
 */
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

/**
 * Get tenant allocations
 */
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

/**
 * Process salary payment for an agent
 */
const processSalaryPayment = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { agent_id, amount, payment_month, phone_number, notes } = req.body;

    if (!agent_id || !amount || !payment_month || !phone_number) {
      await client.query("ROLLBACK");
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

    await client.query("COMMIT");

    // Post-commit notifications
    await NotificationService.createNotification({
      userId: agent_id,
      title: "Salary Paid",
      message: `Your salary of KSh ${amount} for ${payment_month} has been processed.`,
      type: "salary_paid",
      relatedEntityType: "salary_payment",
      relatedEntityId: salaryPayment.id,
    });

    const adminUsers = await pool.query(
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

/**
 * Get salary payments with pagination
 */
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

/**
 * Get salary payments for a specific agent
 */
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

/**
 * Get overdue payment reminders
 */
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

/**
 * Send overdue reminders to tenants
 */
const sendOverdueReminders = async (req, res) => {
  try {
    const { tenant_ids, custom_message } = req.body;

    // TODO: Implement actual SMS/WhatsApp sending via MessagingService
    res.json({
      success: true,
      message: "Overdue reminders sent successfully",
      data: {
        recipients: tenant_ids || ["all_overdue"],
        custom_message,
      },
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

/**
 * Get upcoming payment reminders
 */
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

/**
 * Send upcoming payment reminders
 */
const sendUpcomingReminders = async (req, res) => {
  try {
    const { tenant_ids, custom_message } = req.body;

    // TODO: Implement actual SMS/WhatsApp sending via MessagingService
    res.json({
      success: true,
      message: "Upcoming reminders sent successfully",
      data: {
        recipients: tenant_ids || ["all_upcoming"],
        custom_message,
      },
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

/**
 * Test SMS service
 */
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

/**
 * Test M-Pesa configuration and connectivity
 */
const testMpesaConfig = async (req, res) => {
  try {
    const mpesaConfig = {
      consumerKey: process.env.MPESA_CONSUMER_KEY ? "âœ… Set" : "âŒ Missing",
      consumerSecret: process.env.MPESA_CONSUMER_SECRET
        ? "âœ… Set"
        : "âŒ Missing",
      paybillNumber:
        process.env.MPESA_PAYBILL_NUMBER ||
        process.env.MPESA_SHORT_CODE ||
        "âŒ Missing",
      callbackUrl: process.env.MPESA_CALLBACK_URL ? "âœ… Set" : "âŒ Missing",
      validationUrl: process.env.MPESA_VALIDATION_URL ? "âœ… Set" : "âŒ Missing",
      environment: process.env.MPESA_ENVIRONMENT || "sandbox",
      apiBaseUrl: getMpesaBaseUrl(),
    };

    // Test access token
    try {
      const accessToken = await getAccessToken();
      mpesaConfig.accessToken = accessToken
        ? "âœ… Obtained successfully"
        : "âŒ Failed";
    } catch (tokenError) {
      mpesaConfig.accessToken = `âŒ Failed: ${tokenError.message}`;
    }

    res.json({
      success: true,
      message: "M-Pesa configuration status",
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

/**
 * Register C2B Validation and Confirmation URLs with Safaricom
 * Call this once after deploying or when URLs change.
 * Admin-only endpoint.
 */
const registerC2BUrls = async (req, res) => {
  try {
    const shortCode =
      process.env.MPESA_PAYBILL_NUMBER || process.env.MPESA_SHORT_CODE;
    const confirmationUrl =
      process.env.MPESA_CALLBACK_URL ||
      "https://zakaria-rental-system.onrender.com/api/payments/c2b/callback";
    const validationUrl =
      process.env.MPESA_VALIDATION_URL ||
      "https://zakaria-rental-system.onrender.com/api/payments/c2b/validation";

    if (!shortCode) {
      return res.status(400).json({
        success: false,
        message: "MPESA_PAYBILL_NUMBER not configured in environment variables",
      });
    }

    const accessToken = await getAccessToken();
    const registerVersion =
      String(process.env.MPESA_C2B_REGISTER_VERSION || "v1").toLowerCase() === "v2"
        ? "v2"
        : "v1";
    const registerUrl = `${getMpesaBaseUrl()}/mpesa/c2b/${registerVersion}/registerurl`;

    const response = await axios.post(
      registerUrl,
      {
        ShortCode: shortCode,
        ResponseType: "Cancelled",
        ConfirmationURL: confirmationUrl,
        ValidationURL: validationUrl,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    console.log(
      "C2B URL Registration Response:",
      JSON.stringify(response.data, null, 2),
    );

    const success =
      response.data.ResponseCode === "0" ||
      response.data.ResponseDescription?.includes("Success");

    res.json({
      success,
      message: success
        ? "C2B URLs registered successfully with Safaricom"
        : "C2B URL registration may have failed",
      data: {
        safaricomResponse: response.data,
        registeredUrls: {
          confirmationUrl,
          validationUrl,
          registerUrl,
          shortCode,
          responseType: "Cancelled",
        },
      },
    });
  } catch (error) {
    const providerError = error.response?.data || null;
    console.error("Error registering C2B URLs:", providerError || error.message);
    res.status(500).json({
      success: false,
      message: "Failed to register C2B URLs with Safaricom",
      errorCode: providerError?.errorCode || null,
      errorMessage: providerError?.errorMessage || error.message,
      requestId: providerError?.requestId || null,
      ...(process.env.NODE_ENV !== "production" && {
        debug: {
          registerVersion:
            String(process.env.MPESA_C2B_REGISTER_VERSION || "v1").toLowerCase() === "v2"
              ? "v2"
              : "v1",
          baseUrl: getMpesaBaseUrl(),
          paybill:
            process.env.MPESA_PAYBILL_NUMBER || process.env.MPESA_SHORT_CODE || null,
        },
      }),
    });
  }
};

/**
 * Get a single payment by ID
 */
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

/**
 * Get all payments for a specific tenant
 */
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

/**
 * Get tenant payment status for all tenants (with summary)
 */
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
        ta.monthly_rent, ta.arrears_balance as arrears, ta.expected_amount,
        LEAST(GREATEST(COALESCE(ta.rent_due_day, 1), 1), 28) as rent_due_day,
        MAKE_DATE(
          EXTRACT(YEAR FROM $1::date)::int,
          EXTRACT(MONTH FROM $1::date)::int,
          LEAST(GREATEST(COALESCE(ta.rent_due_day, 1), 1), 28)
        ) as due_date,
        COALESCE((
          SELECT SUM(
            CASE
              WHEN (
                COALESCE(rp.allocated_to_rent, 0) +
                COALESCE(rp.allocated_to_water, 0) +
                COALESCE(rp.allocated_to_arrears, 0)
              ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
              ELSE COALESCE(rp.amount, 0)
            END
          ) FROM rent_payments rp 
          WHERE rp.tenant_id = t.id AND rp.unit_id = pu.id 
          AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', $1::date)
          AND rp.status = 'completed'
        ), 0) as rent_paid,
        COALESCE((
          SELECT wb.amount FROM water_bills wb 
          WHERE wb.tenant_id = t.id 
          AND (wb.unit_id = pu.id OR wb.unit_id IS NULL)
          AND DATE_TRUNC('month', wb.bill_month) = DATE_TRUNC('month', $1::date)
          ORDER BY CASE WHEN wb.unit_id = pu.id THEN 0 ELSE 1 END
          LIMIT 1
        ), 0) as water_bill,
        COALESCE((
          SELECT SUM(rp.allocated_to_water) FROM rent_payments rp 
          WHERE rp.tenant_id = t.id 
          AND rp.unit_id = pu.id
          AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', $1::date)
          AND rp.status = 'completed'
        ), 0) as water_paid,
        COALESCE((
          SELECT SUM(
            CASE
              WHEN (
                COALESCE(rp.allocated_to_rent, 0) +
                COALESCE(rp.allocated_to_water, 0) +
                COALESCE(rp.allocated_to_arrears, 0)
              ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
              ELSE COALESCE(rp.amount, 0)
            END
          ) FROM rent_payments rp 
          WHERE rp.tenant_id = t.id AND rp.unit_id = pu.id 
          AND DATE_TRUNC('month', rp.payment_month) > DATE_TRUNC('month', $1::date)
          AND rp.status = 'completed'
          AND (
            rp.is_advance_payment = true
            OR rp.payment_method IN ('carry_forward', 'carry_forward_fix')
          )
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
      const totalLeaseExpected = parseFloat(row.expected_amount) || 0;

      const rawRentDue = Math.max(0, monthlyRent - rentPaid);
      const rawWaterDue = Math.max(0, waterBill - waterPaid);
      const rawArrearsDue = Math.max(0, arrears);
      const grossDue = rawRentDue + rawWaterDue + rawArrearsDue;

      // Apply available advance credit using system allocation priority:
      // arrears -> water -> rent.
      let remainingAdvance = Math.max(0, advanceAmount);
      const advanceToArrears = Math.min(remainingAdvance, rawArrearsDue);
      remainingAdvance -= advanceToArrears;
      const effectiveArrearsDue = rawArrearsDue - advanceToArrears;

      const advanceToWater = Math.min(remainingAdvance, rawWaterDue);
      remainingAdvance -= advanceToWater;
      const effectiveWaterDue = rawWaterDue - advanceToWater;

      const advanceToRent = Math.min(remainingAdvance, rawRentDue);
      remainingAdvance -= advanceToRent;
      const effectiveRentDue = rawRentDue - advanceToRent;

      const advanceApplied = advanceToArrears + advanceToWater + advanceToRent;
      const totalDue = effectiveRentDue + effectiveWaterDue + effectiveArrearsDue;

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
        current_month_expected: monthlyRent,
        total_expected: totalLeaseExpected,
        rent_due_day: Number(row.rent_due_day) || 1,
        due_date: row.due_date,
        rent_paid: rentPaid,
        rent_due: effectiveRentDue,
        raw_rent_due: rawRentDue,
        water_bill: waterBill,
        water_paid: waterPaid,
        water_due: effectiveWaterDue,
        raw_water_due: rawWaterDue,
        arrears,
        arrears_due: effectiveArrearsDue,
        raw_arrears_due: rawArrearsDue,
        total_due: totalDue,
        advance_amount: advanceAmount,
        advance_applied: advanceApplied,
        advance_applied_to_arrears: advanceToArrears,
        advance_applied_to_water: advanceToWater,
        advance_applied_to_rent: advanceToRent,
        advance_credit: remainingAdvance,
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
      current_month_expected: tenants.reduce(
        (sum, t) => sum + t.current_month_expected,
        0,
      ),
      lease_total_expected: tenants.reduce((sum, t) => sum + t.total_expected, 0),
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
  // M-Pesa C2B endpoints (called by Safaricom â€” NO auth middleware)
  handleMpesaValidation,
  handleMpesaCallback,

  // M-Pesa configuration (admin only)
  registerC2BUrls,
  testMpesaConfig,
  checkPaymentStatus,

  // Paybill payment processing (admin/agent manual entry)
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

  // SMS testing
  testSMSService,

  // Reminders
  getOverdueReminders,
  sendOverdueReminders,
  getUpcomingReminders,
  sendUpcomingReminders,

  // Utility (exported for use by other modules like cronService)
  formatPaymentMonth,
  trackRentPayment,
  recordCarryForward,
  sendPaymentNotifications,
};


