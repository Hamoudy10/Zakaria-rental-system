const pool = require("../config/database");
const fs = require("fs");
const NotificationService = require("../services/notificationService");
const smsService = require("../services/smsService");
const { deleteCloudinaryImage } = require("../middleware/uploadMiddleware");
const cloudinary = require("../config/cloudinary");

// Format phone number to 254 format - UPDATED to support 01xxxxxxxx (new Safaricom)
const formatPhoneNumber = (phone) => {
  if (!phone) return null;

  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");

  console.log("📞 Formatting phone number:", { original: phone, digits });

  // Convert to 254 format
  if (digits.startsWith("0") && digits.length === 10) {
    // Format: 07xxxxxxxx or 01xxxxxxxx -> 2547xxxxxxxx or 2541xxxxxxxx
    const formatted = "254" + digits.substring(1);
    console.log("📞 Converted 0xx format:", formatted);
    return formatted;
  } else if (digits.startsWith("254") && digits.length === 12) {
    // Already in correct format: 2547xxxxxxxx or 2541xxxxxxxx
    console.log("📞 Already in 254 format:", digits);
    return digits;
  } else if (digits.startsWith("+254")) {
    // Format: +2547xxxxxxxx -> 2547xxxxxxxx
    const formatted = digits.substring(1);
    console.log("📞 Converted +254 format:", formatted);
    return formatted;
  } else if (
    (digits.startsWith("7") || digits.startsWith("1")) &&
    digits.length === 9
  ) {
    // Format: 7xxxxxxxx or 1xxxxxxxx -> 2547xxxxxxxx or 2541xxxxxxxx
    const formatted = "254" + digits;
    console.log("📞 Converted short format:", formatted);
    return formatted;
  } else {
    console.warn("⚠️ Unusual phone format, adding 254 prefix:", digits);
    return "254" + digits;
  }
};

const roundToTwo = (value) => {
  const num = Number(value) || 0;
  return Math.round(num * 100) / 100;
};

const calculateLeaseExpectedMetrics = ({
  leaseStartDate,
  leaseEndDate,
  monthlyRent,
  referenceDate = new Date(),
}) => {
  const parsedMonthlyRent = Number(monthlyRent) || 0;
  const start = leaseStartDate ? new Date(leaseStartDate) : null;

  if (!start || Number.isNaN(start.getTime()) || parsedMonthlyRent <= 0) {
    return { monthCount: 0, totalExpected: 0, currentMonthExpected: 0 };
  }

  const end = leaseEndDate ? new Date(leaseEndDate) : new Date(referenceDate);

  if (!end || Number.isNaN(end.getTime()) || end < start) {
    return { monthCount: 0, totalExpected: 0, currentMonthExpected: 0 };
  }

  const monthCount =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    1;

  const currentMonthStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1,
  );
  const leaseStartMonth = new Date(start.getFullYear(), start.getMonth(), 1);
  const leaseEndMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  const isCurrentMonthWithinLease =
    currentMonthStart >= leaseStartMonth && currentMonthStart <= leaseEndMonth;

  return {
    monthCount: Math.max(0, monthCount),
    totalExpected: roundToTwo(Math.max(0, monthCount) * parsedMonthlyRent),
    currentMonthExpected: isCurrentMonthWithinLease
      ? roundToTwo(parsedMonthlyRent)
      : 0,
  };
};

const extractCloudinaryPublicIdAndType = (fileUrl) => {
  if (!fileUrl || typeof fileUrl !== "string") {
    return {
      publicId: null,
      deliveryType: "authenticated",
      format: null,
      version: null,
    };
  }

  // Typical URL: /raw/<type>/v123/folder/file.ext
  const marker = "/raw/";
  const markerIndex = fileUrl.indexOf(marker);
  if (markerIndex === -1) {
    return {
      publicId: null,
      deliveryType: "authenticated",
      format: null,
      version: null,
    };
  }

  const rawPath = fileUrl.slice(markerIndex + marker.length);
  const segments = rawPath.split("/").filter(Boolean);
  if (segments.length < 2) {
    return {
      publicId: null,
      deliveryType: "authenticated",
      format: null,
      version: null,
    };
  }

  const deliveryType = segments[0] || "authenticated";
  const withoutType = segments.slice(1);
  const versionToken =
    withoutType[0] && withoutType[0].startsWith("v")
      ? withoutType[0].slice(1)
      : null;
  const version = versionToken ? Number(versionToken) : null;
  const withoutVersion = versionToken ? withoutType.slice(1) : withoutType;
  const pathWithExt = withoutVersion.join("/");
  const cleanPath = pathWithExt.split("?")[0];
  const extMatch = cleanPath.match(/\.([a-zA-Z0-9]+)$/);
  const format = extMatch ? extMatch[1].toLowerCase() : null;
  const publicId = cleanPath.replace(/\.[^/.]+$/, "");

  return { publicId, deliveryType, format, version };
};

const deleteTenantAgreementFromCloudinary = async (fileUrl) => {
  const { publicId, deliveryType } = extractCloudinaryPublicIdAndType(fileUrl);

  if (publicId) {
    return cloudinary.uploader.destroy(publicId, {
      resource_type: "raw",
      type: deliveryType || "upload",
      invalidate: true,
    });
  }

  // Fallback for any older non-raw URL shape.
  return deleteCloudinaryImage(fileUrl);
};

// Get all tenants with agent data isolation
const getTenants = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        t.*,
        COUNT(*) OVER() as total_count,
        ta.unit_id,
        ta.monthly_rent,
        ta.security_deposit,
        ta.lease_start_date,
        ta.lease_end_date,
        ta.arrears_balance,
        ta.month_count,
        ta.expected_amount,
        ta.current_month_expected,
        pu.unit_code,
        pu.unit_number,
        p.name as property_name,
        p.property_code,
        u.first_name as created_by_name,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', td.id,
                'file_name', td.file_name,
                'file_url', td.file_url,
                'file_type', td.file_type,
                'file_size', td.file_size,
                'created_at', td.created_at,
                'uploaded_by', td.uploaded_by
              )
              ORDER BY td.created_at DESC
            )
            FROM tenant_documents td
            WHERE td.tenant_id = t.id AND td.is_active = true
          ),
          '[]'::json
        ) as agreement_documents
      FROM tenants t
      LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN users u ON t.created_by = u.id
    `;

    let countQuery = `SELECT COUNT(*) FROM tenants t`;
    const queryParams = [];
    const countParams = [];

    // Add agent property assignment filter only for agents
    if (req.user.role === "agent") {
      query += ` 
        INNER JOIN agent_property_assignments apa ON p.id = apa.property_id
        WHERE apa.agent_id = $${queryParams.length + 1} 
        AND apa.is_active = true
      `;
      countQuery += ` 
        LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
        LEFT JOIN property_units pu ON ta.unit_id = pu.id
        LEFT JOIN properties p ON pu.property_id = p.id
        INNER JOIN agent_property_assignments apa ON p.id = apa.property_id
        WHERE apa.agent_id = $1 
        AND apa.is_active = true
      `;
      queryParams.push(req.user.id);
      countParams.push(req.user.id);

      if (search) {
        const searchCondition = ` AND (t.first_name ILIKE $${queryParams.length + 1} OR t.last_name ILIKE $${queryParams.length + 1} OR t.phone_number ILIKE $${queryParams.length + 1} OR t.national_id ILIKE $${queryParams.length + 1})`;
        query += searchCondition;
        countQuery += ` AND (t.first_name ILIKE $2 OR t.last_name ILIKE $2 OR t.phone_number ILIKE $2 OR t.national_id ILIKE $2)`;
        queryParams.push(`%${search}%`);
        countParams.push(`%${search}%`);
      }
    } else {
      // Admin sees all tenants (original logic)
      if (search) {
        const searchCondition = ` WHERE (t.first_name ILIKE $${queryParams.length + 1} OR t.last_name ILIKE $${queryParams.length + 1} OR t.phone_number ILIKE $${queryParams.length + 1} OR t.national_id ILIKE $${queryParams.length + 1})`;
        query += searchCondition;
        countQuery += searchCondition;
        queryParams.push(`%${search}%`);
        countParams.push(`%${search}%`);
      }
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);
    const countResult = await pool.query(countQuery, countParams);
    const enrichedTenants = result.rows.map((row) => {
      const metrics = calculateLeaseExpectedMetrics({
        leaseStartDate: row.lease_start_date,
        leaseEndDate: row.lease_end_date,
        monthlyRent: row.monthly_rent,
      });

      return {
        ...row,
        month_count: metrics.monthCount,
        total_expected: metrics.totalExpected,
        current_month_expected: metrics.currentMonthExpected,
        stored_expected_amount: roundToTwo(row.expected_amount),
      };
    });

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: {
        tenants: enrichedTenants,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get tenants error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching tenants",
      error: error.message,
    });
  }
};

// Get tenant by ID with agent data isolation
const getTenant = async (req, res) => {
  try {
    const { id } = req.params;

    let query = `
      SELECT 
        t.*,
        ta.unit_id,
        pu.unit_code,
        pu.unit_number,
        p.name as property_name,
        p.property_code,
        ta.lease_start_date,
        ta.lease_end_date,
        ta.monthly_rent,
        ta.security_deposit,
        ta.month_count,
        ta.expected_amount,
        ta.current_month_expected,
        u.first_name as created_by_name,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', td.id,
                'file_name', td.file_name,
                'file_url', td.file_url,
                'file_type', td.file_type,
                'file_size', td.file_size,
                'created_at', td.created_at,
                'uploaded_by', td.uploaded_by
              )
              ORDER BY td.created_at DESC
            )
            FROM tenant_documents td
            WHERE td.tenant_id = t.id AND td.is_active = true
          ),
          '[]'::json
        ) as agreement_documents
      FROM tenants t
      LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.id = $1
    `;

    const queryParams = [id];

    // Add agent property assignment filter only for agents
    if (req.user.role === "agent") {
      query += ` 
        AND EXISTS (
          SELECT 1 FROM agent_property_assignments apa 
          WHERE apa.property_id = p.id 
          AND apa.agent_id = $2 
          AND apa.is_active = true
        )
      `;
      queryParams.push(req.user.id);
    }

    const { rows } = await pool.query(query, queryParams);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found or not accessible",
      });
    }

    // Get payment history (only accessible if tenant is accessible)
    const paymentsQuery = `
      SELECT * FROM rent_payments 
      WHERE tenant_id = $1 
      ORDER BY payment_month DESC, created_at DESC 
      LIMIT 12
    `;
    const paymentsResult = await pool.query(paymentsQuery, [id]);

    const metrics = calculateLeaseExpectedMetrics({
      leaseStartDate: rows[0].lease_start_date,
      leaseEndDate: rows[0].lease_end_date,
      monthlyRent: rows[0].monthly_rent,
    });

    res.json({
      success: true,
      data: {
        ...rows[0],
        month_count: metrics.monthCount,
        total_expected: metrics.totalExpected,
        current_month_expected: metrics.currentMonthExpected,
        stored_expected_amount: roundToTwo(rows[0].expected_amount),
        paymentHistory: paymentsResult.rows,
      },
    });
  } catch (error) {
    console.error("Get tenant error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching tenant",
      error: error.message,
    });
  }
};

// Create new tenant with agent property validation
const createTenant = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      national_id,
      first_name,
      last_name,
      email,
      phone_number,
      emergency_contact_name,
      emergency_contact_phone,
      unit_id,
      lease_start_date,
      lease_end_date,
      monthly_rent,
      security_deposit,
    } = req.body;

    console.log("📝 Creating tenant with data:", req.body);

    // Validate required fields
    if (!national_id || !first_name || !last_name || !phone_number) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: national_id, first_name, last_name, phone_number",
      });
    }

    // Format phone numbers
    const formattedPhone = formatPhoneNumber(phone_number);
    const formattedEmergencyPhone = emergency_contact_phone
      ? formatPhoneNumber(emergency_contact_phone)
      : null;

    console.log("📞 Formatted phone:", formattedPhone);

    // Check if national ID already exists
    const existingNationalId = await client.query(
      "SELECT id FROM tenants WHERE national_id = $1",
      [national_id],
    );

    if (existingNationalId.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Tenant with this national ID already exists",
      });
    }

    // Check if phone number already exists
    const existingPhone = await client.query(
      "SELECT id FROM tenants WHERE phone_number = $1",
      [formattedPhone],
    );

    if (existingPhone.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Tenant with this phone number already exists",
      });
    }

    // Create tenant
    const tenantResult = await client.query(
      `INSERT INTO tenants 
        (national_id, first_name, last_name, email, phone_number, 
         emergency_contact_name, emergency_contact_phone, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        national_id,
        first_name,
        last_name,
        email,
        formattedPhone,
        emergency_contact_name,
        formattedEmergencyPhone,
        req.user.id,
      ],
    );

    console.log("✅ Tenant created:", tenantResult.rows[0].id);

    // Variables to store unit info for SMS
    let unitCode = null;
    let propertyName = null;
    let rentAmount = monthly_rent;

    // If unit_id is provided, create tenant allocation
    if (unit_id) {
      if (!lease_start_date || !monthly_rent) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message:
            "Missing required fields for allocation: lease_start_date, monthly_rent",
        });
      }

      // Check if unit is available with agent property assignment validation
      let unitCheckQuery = `
        SELECT pu.id, pu.is_occupied, pu.property_id, pu.unit_code, p.name as property_name
        FROM property_units pu
        JOIN properties p ON pu.property_id = p.id
        WHERE pu.id = $1
      `;

      const unitCheckParams = [unit_id];

      // If user is agent, check if they're assigned to this property
      if (req.user.role === "agent") {
        unitCheckQuery += `
          AND EXISTS (
            SELECT 1 FROM agent_property_assignments apa 
            WHERE apa.property_id = pu.property_id 
            AND apa.agent_id = $2 
            AND apa.is_active = true
          )
        `;
        unitCheckParams.push(req.user.id);
      }

      const unitCheck = await client.query(unitCheckQuery, unitCheckParams);

      if (unitCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(req.user.role === "agent" ? 403 : 404).json({
          success: false,
          message:
            req.user.role === "agent"
              ? "Unit not found or you are not assigned to this property"
              : "Unit not found",
        });
      }

      if (unitCheck.rows[0].is_occupied) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Unit is already occupied",
        });
      }

      // Store unit info for SMS
      unitCode = unitCheck.rows[0].unit_code;
      propertyName = unitCheck.rows[0].property_name;

      const allocationMetrics = calculateLeaseExpectedMetrics({
        leaseStartDate: lease_start_date,
        leaseEndDate: lease_end_date,
        monthlyRent: monthly_rent,
      });

      // Create tenant allocation
      await client.query(
        `INSERT INTO tenant_allocations 
          (
            tenant_id, unit_id, lease_start_date, lease_end_date, monthly_rent, security_deposit, allocated_by,
            month_count, expected_amount, current_month_expected
          )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          tenantResult.rows[0].id,
          unit_id,
          lease_start_date,
          lease_end_date,
          monthly_rent,
          security_deposit || 0,
          req.user.id,
          allocationMetrics.monthCount,
          allocationMetrics.totalExpected,
          allocationMetrics.currentMonthExpected,
        ],
      );

      // Mark unit as occupied
      await client.query(
        `UPDATE property_units SET is_occupied = true WHERE id = $1`,
        [unit_id],
      );

      // Update property available units count
      await client.query(
        `UPDATE properties 
         SET available_units = (
           SELECT COUNT(*) FROM property_units 
           WHERE property_id = properties.id AND is_active = true AND is_occupied = false
         )
         WHERE id = (SELECT property_id FROM property_units WHERE id = $1)`,
        [unit_id],
      );

      console.log("✅ Tenant allocated to unit:", unitCode);
    }

    await client.query("COMMIT");

    // ============================================================
    // SEND WELCOME SMS TO NEW TENANT (if allocated to a unit)
    // ============================================================
    if (unit_id && unitCode && formattedPhone) {
      try {
        console.log("📱 Sending welcome SMS to new tenant...");

        const tenantName = `${first_name} ${last_name}`;
        const dueDate = "1st"; // Default due date

        const smsResult = await smsService.sendWelcomeMessage(
          formattedPhone,
          tenantName,
          unitCode,
          parseFloat(rentAmount),
          dueDate,
        );

        if (smsResult.success) {
          console.log("✅ Welcome SMS sent successfully to:", formattedPhone);
        } else {
          console.warn(
            "⚠️ Welcome SMS failed:",
            smsResult.error || smsResult.message,
          );
        }
      } catch (smsError) {
        // Don't fail the tenant creation if SMS fails
        console.error("❌ Error sending welcome SMS:", smsError.message);
      }
    }
    // ============================================================

    // ============================================================
    // NOTIFY ADMINS ABOUT NEW TENANT
    // ============================================================
    try {
      const tenantName = `${tenantResult.rows[0].first_name} ${tenantResult.rows[0].last_name}`;
      const tenantPhone = tenantResult.rows[0].phone_number;

      let notificationMessage = `${tenantName} has been registered in the system. Phone: ${tenantPhone}`;
      if (unitCode) {
        notificationMessage += `. Allocated to ${unitCode} at ${propertyName}.`;
      }

      await NotificationService.createAdminNotification(
        "New Tenant Registered",
        notificationMessage,
        "tenant_created",
        tenantResult.rows[0].id,
      );

      console.log("✅ New tenant notification sent to all admins");
    } catch (notificationError) {
      console.error(
        "⚠️ Failed to send tenant notification:",
        notificationError,
      );
    }
    // ============================================================

    res.status(201).json({
      success: true,
      message:
        "Tenant created successfully" +
        (unitCode ? ` and allocated to ${unitCode}` : ""),
      data: tenantResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Create tenant error:", error);

    // Handle unique constraint violations
    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "Tenant with this national ID, phone, or email already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error creating tenant",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

// Update tenant with agent property validation
const updateTenant = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { id } = req.params;
    const {
      national_id,
      first_name,
      last_name,
      email,
      phone_number,
      emergency_contact_name,
      emergency_contact_phone,
      is_active,
      unit_id,
      lease_start_date,
      lease_end_date,
      monthly_rent,
      security_deposit,
    } = req.body;

    // Check if tenant exists with agent property validation
    let tenantCheckQuery = `
      SELECT t.id, t.first_name, t.last_name, p.id as property_id
      FROM tenants t
      LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE t.id = $1
    `;

    const tenantCheckParams = [id];

    // If user is agent, check if they're assigned to this tenant's property
    if (req.user.role === "agent") {
      tenantCheckQuery += `
        AND EXISTS (
          SELECT 1 FROM agent_property_assignments apa 
          WHERE apa.property_id = p.id 
          AND apa.agent_id = $2 
          AND apa.is_active = true
        )
      `;
      tenantCheckParams.push(req.user.id);
    }

    const tenantCheck = await client.query(tenantCheckQuery, tenantCheckParams);

    if (tenantCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(req.user.role === "agent" ? 403 : 404).json({
        success: false,
        message:
          req.user.role === "agent"
            ? "Tenant not found or you are not assigned to this property"
            : "Tenant not found",
      });
    }

    // Check for duplicate national ID
    if (national_id) {
      const existingNationalId = await client.query(
        "SELECT id FROM tenants WHERE national_id = $1 AND id != $2",
        [national_id, id],
      );

      if (existingNationalId.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Another tenant with this national ID already exists",
        });
      }
    }

    // Check for duplicate phone number
    if (phone_number) {
      const formattedPhone = formatPhoneNumber(phone_number);
      const existingPhone = await client.query(
        "SELECT id FROM tenants WHERE phone_number = $1 AND id != $2",
        [formattedPhone, id],
      );

      if (existingPhone.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Another tenant with this phone number already exists",
        });
      }
    }

    // Format phone numbers if provided
    const formattedPhone = phone_number
      ? formatPhoneNumber(phone_number)
      : undefined;
    const formattedEmergencyPhone = emergency_contact_phone
      ? formatPhoneNumber(emergency_contact_phone)
      : undefined;

    const result = await client.query(
      `UPDATE tenants 
       SET national_id = COALESCE($1, national_id),
           first_name = COALESCE($2, first_name),
           last_name = COALESCE($3, last_name),
           email = COALESCE($4, email),
           phone_number = COALESCE($5, phone_number),
           emergency_contact_name = COALESCE($6, emergency_contact_name),
           emergency_contact_phone = COALESCE($7, emergency_contact_phone),
           is_active = COALESCE($8, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING *`,
      [
        national_id,
        first_name,
        last_name,
        email,
        formattedPhone,
        emergency_contact_name,
        formattedEmergencyPhone,
        is_active,
        id,
      ],
    );

    const normalizedUnitId =
      typeof unit_id === "string" && unit_id.trim() === ""
        ? null
        : (unit_id ?? null);
    const normalizedLeaseEndDate =
      lease_end_date === "" ? null : (lease_end_date ?? undefined);
    const normalizedMonthlyRent =
      monthly_rent === undefined ||
      monthly_rent === null ||
      monthly_rent === ""
        ? undefined
        : Number(monthly_rent);
    const normalizedSecurityDeposit =
      security_deposit === undefined ||
      security_deposit === null ||
      security_deposit === ""
        ? undefined
        : Number(security_deposit);

    const allocationFieldsProvided =
      normalizedUnitId !== null ||
      lease_start_date !== undefined ||
      lease_end_date !== undefined ||
      monthly_rent !== undefined ||
      security_deposit !== undefined;

    if (allocationFieldsProvided) {
      const activeAllocationQuery = await client.query(
        `SELECT ta.id, ta.unit_id, ta.lease_start_date, ta.lease_end_date, ta.monthly_rent, ta.security_deposit,
                pu.property_id
         FROM tenant_allocations ta
         LEFT JOIN property_units pu ON ta.unit_id = pu.id
         WHERE ta.tenant_id = $1 AND ta.is_active = true
         ORDER BY ta.allocation_date DESC
         LIMIT 1`,
        [id],
      );

      const activeAllocation = activeAllocationQuery.rows[0];

      if (!activeAllocation && !normalizedUnitId) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message:
            "No active allocation found. Provide unit_id to create an allocation.",
        });
      }

      const targetUnitId = normalizedUnitId || activeAllocation?.unit_id;

      if (!targetUnitId) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Unit allocation is required",
        });
      }

      let targetUnitPropertyId = activeAllocation?.property_id || null;
      let unitChanged = false;

      if (!activeAllocation || targetUnitId !== activeAllocation.unit_id) {
        let unitCheckQuery = `
          SELECT pu.id, pu.is_occupied, pu.property_id
          FROM property_units pu
          WHERE pu.id = $1
        `;
        const unitCheckParams = [targetUnitId];

        if (req.user.role === "agent") {
          unitCheckQuery += `
            AND EXISTS (
              SELECT 1 FROM agent_property_assignments apa
              WHERE apa.property_id = pu.property_id
              AND apa.agent_id = $2
              AND apa.is_active = true
            )
          `;
          unitCheckParams.push(req.user.id);
        }

        const unitCheck = await client.query(unitCheckQuery, unitCheckParams);
        if (unitCheck.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(req.user.role === "agent" ? 403 : 404).json({
            success: false,
            message:
              req.user.role === "agent"
                ? "Unit not found or you are not assigned to this property"
                : "Unit not found",
          });
        }

        if (unitCheck.rows[0].is_occupied) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: "Selected unit is already occupied",
          });
        }

        targetUnitPropertyId = unitCheck.rows[0].property_id;
        unitChanged = !!activeAllocation;
      }

      const finalLeaseStartDate =
        lease_start_date || activeAllocation?.lease_start_date;
      const finalLeaseEndDate =
        normalizedLeaseEndDate !== undefined
          ? normalizedLeaseEndDate
          : (activeAllocation?.lease_end_date ?? null);
      const finalMonthlyRent =
        normalizedMonthlyRent ?? Number(activeAllocation?.monthly_rent);
      const finalSecurityDeposit =
        normalizedSecurityDeposit ?? Number(activeAllocation?.security_deposit || 0);

      if (!finalLeaseStartDate || !finalMonthlyRent) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message:
            "Allocation updates require lease_start_date and monthly_rent",
        });
      }

      const allocationMetrics = calculateLeaseExpectedMetrics({
        leaseStartDate: finalLeaseStartDate,
        leaseEndDate: finalLeaseEndDate,
        monthlyRent: finalMonthlyRent,
      });

      if (activeAllocation) {
        if (unitChanged) {
          await client.query(
            "UPDATE property_units SET is_occupied = false WHERE id = $1",
            [activeAllocation.unit_id],
          );
          if (activeAllocation.property_id) {
            await client.query(
              `UPDATE properties
               SET available_units = (
                 SELECT COUNT(*) FROM property_units
                 WHERE property_id = $1 AND is_active = true AND is_occupied = false
               )
               WHERE id = $1`,
              [activeAllocation.property_id],
            );
          }

          await client.query(
            "UPDATE property_units SET is_occupied = true WHERE id = $1",
            [targetUnitId],
          );
          if (targetUnitPropertyId) {
            await client.query(
              `UPDATE properties
               SET available_units = (
                 SELECT COUNT(*) FROM property_units
                 WHERE property_id = $1 AND is_active = true AND is_occupied = false
               )
               WHERE id = $1`,
              [targetUnitPropertyId],
            );
          }
        }

        await client.query(
          `UPDATE tenant_allocations
           SET unit_id = $1,
               lease_start_date = $2,
               lease_end_date = $3,
               monthly_rent = $4,
               security_deposit = $5,
               month_count = $6,
               expected_amount = $7,
               current_month_expected = $8,
               updated_at = NOW()
           WHERE id = $9`,
          [
            targetUnitId,
            finalLeaseStartDate,
            finalLeaseEndDate,
            finalMonthlyRent,
            finalSecurityDeposit,
            allocationMetrics.monthCount,
            allocationMetrics.totalExpected,
            allocationMetrics.currentMonthExpected,
            activeAllocation.id,
          ],
        );
      } else {
        await client.query(
          `INSERT INTO tenant_allocations
           (
             tenant_id, unit_id, lease_start_date, lease_end_date, monthly_rent, security_deposit,
             allocated_by, month_count, expected_amount, current_month_expected
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            id,
            targetUnitId,
            finalLeaseStartDate,
            finalLeaseEndDate,
            finalMonthlyRent,
            finalSecurityDeposit,
            req.user.id,
            allocationMetrics.monthCount,
            allocationMetrics.totalExpected,
            allocationMetrics.currentMonthExpected,
          ],
        );

        await client.query(
          "UPDATE property_units SET is_occupied = true WHERE id = $1",
          [targetUnitId],
        );

        if (targetUnitPropertyId) {
          await client.query(
            `UPDATE properties
             SET available_units = (
               SELECT COUNT(*) FROM property_units
               WHERE property_id = $1 AND is_active = true AND is_occupied = false
             )
             WHERE id = $1`,
            [targetUnitPropertyId],
          );
        }
      }
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Tenant updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update tenant error:", error);

    // Handle unique constraint violations
    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message:
          "Another tenant with this national ID, phone, or email already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error updating tenant",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

// Delete tenant - ADMIN ONLY, must be unallocated
const deleteTenant = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { id } = req.params;

    // Check if tenant exists
    const tenantCheck = await client.query(
      `SELECT id, first_name, last_name FROM tenants WHERE id = $1`,
      [id],
    );

    if (tenantCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    const tenant = tenantCheck.rows[0];

    // Check if tenant has active allocations
    const activeAllocations = await client.query(
      `SELECT id FROM tenant_allocations WHERE tenant_id = $1 AND is_active = true`,
      [id],
    );

    if (activeAllocations.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete tenant with active allocation. Please deallocate the tenant first.",
      });
    }

    // Delete related records first (to avoid foreign key constraints)
    // Delete inactive allocations
    await client.query("DELETE FROM tenant_allocations WHERE tenant_id = $1", [
      id,
    ]);

    // Delete rent payments
    await client.query("DELETE FROM rent_payments WHERE tenant_id = $1", [id]);

    // Delete water bills
    await client.query("DELETE FROM water_bills WHERE tenant_id = $1", [id]);

    // Delete complaints
    await client.query("DELETE FROM complaints WHERE tenant_id = $1", [id]);

    // Finally delete the tenant
    await client.query("DELETE FROM tenants WHERE id = $1", [id]);

    await client.query("COMMIT");

    console.log(
      `✅ Tenant ${tenant.first_name} ${tenant.last_name} (ID: ${id}) deleted by admin ${req.user.id}`,
    );

    res.json({
      success: true,
      message: `Tenant ${tenant.first_name} ${tenant.last_name} has been permanently deleted`,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Delete tenant error:", error);

    // Handle foreign key constraint errors
    if (error.code === "23503") {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete tenant due to related records. Please contact system administrator.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error deleting tenant",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

// Get available units for tenant allocation with agent property validation
const getAvailableUnits = async (req, res) => {
  try {
    const { tenant_id } = req.query; // Optional: get tenant ID if editing
    const agentId = req.user.id;

    let query = `
      SELECT pu.*, p.name as property_name, p.property_code
      FROM property_units pu
      JOIN properties p ON pu.property_id = p.id
      WHERE pu.is_active = true 
      AND p.id IN (SELECT property_id FROM agent_property_assignments WHERE agent_id = $1 AND is_active = true)`;

    const params = [agentId];

    if (tenant_id) {
      // When editing a tenant, include their current unit even if occupied
      query += ` AND (pu.is_occupied = false OR pu.id IN (
        SELECT unit_id FROM tenant_allocations 
        WHERE tenant_id = $2 AND is_active = true
      ))`;
      params.push(tenant_id);
    } else {
      // When creating new tenant, only show unoccupied units
      query += ` AND pu.is_occupied = false`;
    }

    query += ` ORDER BY p.name, pu.unit_number`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching available units:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching available units",
    });
  }
};

// Upload ID images
const uploadIDImages = async (req, res) => {
  const { id } = req.params;

  try {
    console.log("🔵 [Upload Start] Tenant ID:", id);
    console.log(
      "🔵 [Upload Start] Files received:",
      req.files ? Object.keys(req.files) : "none",
    );

    // Validate files were uploaded (via the middleware)
    if (!req.files || (!req.files.id_front_image && !req.files.id_back_image)) {
      console.log("❌ [Upload] No files received");
      return res.status(400).json({
        success: false,
        message: "At least one ID image (front or back) is required",
      });
    }

    const updateFields = {};
    const values = [];
    let querySetPart = "";
    let paramCount = 1;

    // Process front ID image (Cloudinary URL)
    if (req.files.id_front_image && req.files.id_front_image[0]) {
      const frontFile = req.files.id_front_image[0];
      console.log("✅ [Front Image] Uploaded to Cloudinary");
      console.log("   Original:", frontFile.originalname);
      console.log("   URL:", frontFile.path);
      console.log("   Size:", (frontFile.size / 1024).toFixed(2), "KB");

      updateFields.id_front_image = frontFile.path; // Cloudinary secure URL
      querySetPart += `id_front_image = $${paramCount}, `;
      values.push(updateFields.id_front_image);
      paramCount++;
    }

    // Process back ID image (Cloudinary URL)
    if (req.files.id_back_image && req.files.id_back_image[0]) {
      const backFile = req.files.id_back_image[0];
      console.log("✅ [Back Image] Uploaded to Cloudinary");
      console.log("   Original:", backFile.originalname);
      console.log("   URL:", backFile.path);
      console.log("   Size:", (backFile.size / 1024).toFixed(2), "KB");

      updateFields.id_back_image = backFile.path; // Cloudinary secure URL
      querySetPart += `id_back_image = $${paramCount}, `;
      values.push(updateFields.id_back_image);
      paramCount++;
    }

    // Remove trailing comma and space from the SET clause
    querySetPart = querySetPart.slice(0, -2);

    // Add the tenant ID as the last parameter
    values.push(id);

    // Update the tenant record in the database
    console.log("🔄 [Database] Updating tenant record...");
    const query = `
      UPDATE tenants 
      SET ${querySetPart}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING id, national_id, first_name, last_name, id_front_image, id_back_image
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      console.log("❌ [Database] Tenant not found:", id);
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    console.log("✅ [Database] Tenant updated successfully");
    console.log("✅ [Complete] Upload process finished for tenant:", id);

    return res.status(200).json({
      success: true,
      message: "ID images uploaded successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("❌ [Error] Upload failed:", error.message);
    console.error("   Stack:", error.stack);

    // Check for specific error types
    if (error.code === "ETIMEDOUT" || error.code === "ESOCKETTIMEDOUT") {
      return res.status(504).json({
        success: false,
        message:
          "Upload timed out. Please try again with a smaller image or check your connection.",
      });
    }

    if (error.message && error.message.includes("Cloudinary")) {
      return res.status(500).json({
        success: false,
        message: "Cloudinary upload error. Please verify your credentials.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }

    // Generic error response
    return res.status(500).json({
      success: false,
      message: "Server error uploading ID images",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const uploadTenantAgreement = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate tenant access
    let accessQuery = `
      SELECT t.id, p.id as property_id
      FROM tenants t
      LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE t.id = $1
    `;
    const accessParams = [id];
    if (req.user.role === "agent") {
      accessQuery += `
        AND EXISTS (
          SELECT 1 FROM agent_property_assignments apa
          WHERE apa.property_id = p.id
          AND apa.agent_id = $2
          AND apa.is_active = true
        )
      `;
      accessParams.push(req.user.id);
    }

    const accessResult = await pool.query(accessQuery, accessParams);
    if (accessResult.rows.length === 0) {
      return res.status(req.user.role === "agent" ? 403 : 404).json({
        success: false,
        message:
          req.user.role === "agent"
            ? "Tenant not found or you are not assigned to this property"
            : "Tenant not found",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No agreement file uploaded",
      });
    }

    const fileName = req.body?.file_name || req.file.originalname || "Agreement";
    const fileType = req.file.mimetype || "application/octet-stream";
    const fileSize = Number(req.file.size || 0);
    const fileUrl = req.file.path;

    const result = await pool.query(
      `INSERT INTO tenant_documents
        (tenant_id, file_name, file_url, file_type, file_size, uploaded_by, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [id, fileName, fileUrl, fileType, fileSize, req.user.id],
    );

    return res.status(201).json({
      success: true,
      message: "Agreement file uploaded successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Upload tenant agreement error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error uploading agreement file",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const getTenantAgreements = async (req, res) => {
  try {
    const { id } = req.params;

    let accessQuery = `
      SELECT t.id, p.id as property_id
      FROM tenants t
      LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE t.id = $1
    `;
    const accessParams = [id];
    if (req.user.role === "agent") {
      accessQuery += `
        AND EXISTS (
          SELECT 1 FROM agent_property_assignments apa
          WHERE apa.property_id = p.id
          AND apa.agent_id = $2
          AND apa.is_active = true
        )
      `;
      accessParams.push(req.user.id);
    }

    const accessResult = await pool.query(accessQuery, accessParams);
    if (accessResult.rows.length === 0) {
      return res.status(req.user.role === "agent" ? 403 : 404).json({
        success: false,
        message:
          req.user.role === "agent"
            ? "Tenant not found or you are not assigned to this property"
            : "Tenant not found",
      });
    }

    const result = await pool.query(
      `SELECT td.*,
              u.first_name || ' ' || u.last_name as uploaded_by_name
       FROM tenant_documents td
       LEFT JOIN users u ON td.uploaded_by = u.id
       WHERE td.tenant_id = $1 AND td.is_active = true
       ORDER BY td.created_at DESC`,
      [id],
    );

    return res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error("Get tenant agreements error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching agreement files",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const deleteTenantAgreement = async (req, res) => {
  try {
    const { id, documentId } = req.params;

    const existing = await pool.query(
      `SELECT td.*, t.id as tenant_id, p.id as property_id
       FROM tenant_documents td
       JOIN tenants t ON td.tenant_id = t.id
       LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
       LEFT JOIN property_units pu ON ta.unit_id = pu.id
       LEFT JOIN properties p ON pu.property_id = p.id
       WHERE td.id = $1 AND td.tenant_id = $2 AND td.is_active = true`,
      [documentId, id],
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Agreement file not found",
      });
    }

    if (req.user.role === "agent") {
      const canAccess = await pool.query(
        `SELECT 1 FROM agent_property_assignments
         WHERE property_id = $1 AND agent_id = $2 AND is_active = true`,
        [existing.rows[0].property_id, req.user.id],
      );

      if (canAccess.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to delete this agreement file",
        });
      }
    }

    await pool.query(`DELETE FROM tenant_documents WHERE id = $1`, [documentId]);

    if (existing.rows[0].file_url) {
      try {
        await deleteTenantAgreementFromCloudinary(existing.rows[0].file_url);
      } catch (cloudinaryError) {
        console.warn(
          "Agreement was removed from DB but Cloudinary deletion failed:",
          cloudinaryError?.message || cloudinaryError,
        );
      }
    }

    return res.json({
      success: true,
      message: "Agreement file deleted successfully",
    });
  } catch (error) {
    console.error("Delete tenant agreement error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error deleting agreement file",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const getTenantAgreementDownloadUrl = async (req, res) => {
  try {
    const { id, documentId } = req.params;

    const existing = await pool.query(
      `SELECT td.*, t.id as tenant_id, p.id as property_id
       FROM tenant_documents td
       JOIN tenants t ON td.tenant_id = t.id
       LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
       LEFT JOIN property_units pu ON ta.unit_id = pu.id
       LEFT JOIN properties p ON pu.property_id = p.id
       WHERE td.id = $1 AND td.tenant_id = $2 AND td.is_active = true`,
      [documentId, id],
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Agreement file not found",
      });
    }

    if (req.user.role === "agent") {
      const canAccess = await pool.query(
        `SELECT 1 FROM agent_property_assignments
         WHERE property_id = $1 AND agent_id = $2 AND is_active = true`,
        [existing.rows[0].property_id, req.user.id],
      );

      if (canAccess.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to access this agreement file",
        });
      }
    }

    const { publicId, deliveryType, format, version } = extractCloudinaryPublicIdAndType(
      existing.rows[0].file_url,
    );

    if (!publicId) {
      return res.status(400).json({
        success: false,
        message: "Invalid agreement file URL",
      });
    }

    const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 minutes
    const extension =
      format ||
      (existing.rows[0].file_name || "").split(".").pop()?.toLowerCase() ||
      "pdf";

    // Build a signed resource URL (works for both legacy upload and authenticated raw assets).
    // Keep version when available so Cloudinary resolves the exact stored object.
    const signedUrl = cloudinary.url(publicId, {
      resource_type: "raw",
      type: deliveryType || "upload",
      secure: true,
      sign_url: true,
      expires_at: expiresAt,
      version: Number.isFinite(version) ? version : undefined,
      format: extension,
      attachment: existing.rows[0].file_name || true,
    });

    return res.json({
      success: true,
      data: {
        url: signedUrl,
        expires_at: expiresAt,
      },
    });
  } catch (error) {
    console.error("Get tenant agreement download URL error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error creating secure download link",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  getTenants,
  getTenant,
  createTenant,
  updateTenant,
  deleteTenant,
  getAvailableUnits,
  uploadIDImages,
  uploadTenantAgreement,
  getTenantAgreements,
  deleteTenantAgreement,
  getTenantAgreementDownloadUrl,
};
