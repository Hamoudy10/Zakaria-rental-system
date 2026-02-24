// src/utils/excelExport.js
// UPDATED: Added unpaid_tenants, paid_tenants, and messaging support
// All original company info implementation preserved

import ExcelJS from "exceljs";
import { API } from "../services/api";

// Default company branding (fallback)
const DEFAULT_COMPANY = {
  name: "Rental Management System",
  email: "",
  phone: "",
  address: "",
  logo: "",
};

// Cache for company info
let cachedCompanyInfo = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Validate company info has all required fields
 */
const isValidCompanyInfo = (info) => {
  if (!info || typeof info !== "object") return false;
  return info.name && (info.email || info.phone || info.address || info.logo);
};

/**
 * Fetch company info from API with caching
 */
const fetchCompanyInfo = async () => {
  const now = Date.now();

  if (
    cachedCompanyInfo &&
    cacheTimestamp &&
    now - cacheTimestamp < CACHE_DURATION
  ) {
    if (isValidCompanyInfo(cachedCompanyInfo)) {
      console.log("📦 Using cached company info for Excel:", cachedCompanyInfo);
      return cachedCompanyInfo;
    } else {
      console.log("⚠️ Cached data is incomplete, refetching...");
    }
  }

  try {
    console.log("🔄 Fetching company info from API for Excel...");
    const response = await API.settings.getCompanyInfo();
    console.log("📥 API Response:", response.data);

    if (response.data?.success && response.data?.data) {
      const companyData = response.data.data;

      cachedCompanyInfo = {
        name: companyData.name || DEFAULT_COMPANY.name,
        email: companyData.email || "",
        phone: companyData.phone || "",
        address: companyData.address || "",
        logo: companyData.logo || "",
      };

      cacheTimestamp = now;
      console.log(
        "✅ Company info fetched and cached for Excel:",
        cachedCompanyInfo,
      );
      return cachedCompanyInfo;
    } else {
      console.warn("⚠️ API returned unexpected structure:", response.data);
    }
  } catch (error) {
    console.error("❌ Could not fetch company info for Excel:", error.message);
  }

  console.log("⚠️ Using default company info for Excel");
  return DEFAULT_COMPANY;
};

/**
 * Fetch image as base64 for Excel embedding
 */
const fetchImageAsBase64 = async (imageUrl) => {
  if (!imageUrl) return null;

  try {
    console.log("🔄 Loading logo for Excel from:", imageUrl);

    const response = await fetch(imageUrl, {
      mode: "cors",
      cache: "force-cache",
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    console.log("✅ Logo loaded for Excel");
    return {
      buffer: arrayBuffer,
      extension: "png",
    };
  } catch (error) {
    console.warn("Could not load logo for Excel:", error);
    return null;
  }
};

/**
 * Add company header with logo to worksheet
 */
const addCompanyHeader = async (
  workbook,
  worksheet,
  companyInfo,
  columnCount,
) => {
  const lastCol = String.fromCharCode(64 + Math.min(columnCount, 26));
  let currentRow = 1;

  // Try to add logo
  if (companyInfo.logo) {
    try {
      const logoData = await fetchImageAsBase64(companyInfo.logo);

      if (logoData) {
        const imageId = workbook.addImage({
          buffer: logoData.buffer,
          extension: logoData.extension,
        });

        // Add image to worksheet (centered)
        const logoCol = Math.floor(columnCount / 2);
        worksheet.addImage(imageId, {
          tl: { col: logoCol - 0.5, row: 0 },
          ext: { width: 60, height: 60 },
        });

        // Add empty rows for logo space (increased spacing)
        worksheet.addRow([]);
        worksheet.addRow([]);
        worksheet.addRow([]);
        worksheet.addRow([]); // Extra row for spacing
        currentRow = 5;

        // Set row heights for logo area
        worksheet.getRow(1).height = 20;
        worksheet.getRow(2).height = 20;
        worksheet.getRow(3).height = 20;
        worksheet.getRow(4).height = 10; // Spacer row

        console.log("✅ Logo added to Excel");
      }
    } catch (error) {
      console.warn("Could not add logo to Excel:", error);
    }
  }

  // Company Name (with spacing from logo)
  const nameRow = worksheet.addRow([companyInfo.name || DEFAULT_COMPANY.name]);
  nameRow.font = { size: 16, bold: true, color: { argb: "FF1E40AF" } };
  nameRow.alignment = { horizontal: "center", vertical: "middle" };
  nameRow.height = 28;
  worksheet.mergeCells(`A${currentRow}:${lastCol}${currentRow}`);
  currentRow++;

  // Address line
  if (companyInfo.address) {
    const addressRow = worksheet.addRow([companyInfo.address]);
    addressRow.font = { size: 10, color: { argb: "FF6B7280" } };
    addressRow.alignment = { horizontal: "center" };
    addressRow.height = 18;
    worksheet.mergeCells(`A${currentRow}:${lastCol}${currentRow}`);
    currentRow++;
  }

  // Contact Info line (Phone & Email)
  const contactParts = [];
  if (companyInfo.phone) contactParts.push(`Tel: ${companyInfo.phone}`);
  if (companyInfo.email) contactParts.push(`Email: ${companyInfo.email}`);

  if (contactParts.length > 0) {
    const contactRow = worksheet.addRow([contactParts.join("  |  ")]);
    contactRow.font = { size: 10, color: { argb: "FF6B7280" } };
    contactRow.alignment = { horizontal: "center" };
    contactRow.height = 18;
    worksheet.mergeCells(`A${currentRow}:${lastCol}${currentRow}`);
    currentRow++;
  }

  // Empty row for spacing
  const spacerRow = worksheet.addRow([]);
  spacerRow.height = 12;
  currentRow++;

  return currentRow;
};

/**
 * Add report metadata
 */
const addReportMetadata = (
  worksheet,
  title,
  user,
  filters,
  dataLength,
  columnCount,
  startRow,
) => {
  const lastCol = String.fromCharCode(64 + Math.min(columnCount, 26));
  let currentRow = startRow;

  // Report Title
  const titleRow = worksheet.addRow([title]);
  titleRow.font = { size: 14, bold: true };
  titleRow.alignment = { horizontal: "center" };
  titleRow.height = 24;
  worksheet.mergeCells(`A${currentRow}:${lastCol}${currentRow}`);
  currentRow++;

  // Empty row
  worksheet.addRow([]);
  currentRow++;

  // Metadata rows
  const userName =
    user?.first_name && user?.last_name
      ? `${user.first_name} ${user.last_name}`
      : "System User";
  const userRole = user?.role || "user";

  const metaRow1 = worksheet.addRow([
    "Generated by:",
    `${userName} (${userRole})`,
  ]);
  metaRow1.getCell(1).font = { bold: true };
  currentRow++;

  const metaRow2 = worksheet.addRow([
    "Generated on:",
    new Date().toLocaleString("en-GB"),
  ]);
  metaRow2.getCell(1).font = { bold: true };
  currentRow++;

  const metaRow3 = worksheet.addRow(["Total Records:", dataLength]);
  metaRow3.getCell(1).font = { bold: true };
  currentRow++;

  // Date range if present
  if (filters?.startDate || filters?.endDate) {
    const dateRange = `${filters.startDate || "Start"} to ${filters.endDate || "Present"}`;
    const metaRow4 = worksheet.addRow(["Date Range:", dateRange]);
    metaRow4.getCell(1).font = { bold: true };
    currentRow++;
  }

  // Search filter if present
  if (filters?.search) {
    const metaRow5 = worksheet.addRow(["Search Filter:", filters.search]);
    metaRow5.getCell(1).font = { bold: true };
    currentRow++;
  }

  // Empty row before data
  worksheet.addRow([]);
  currentRow++;

  return currentRow;
};

/**
 * Style the header row
 */
const styleHeaderRow = (row) => {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E40AF" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF1E40AF" } },
      left: { style: "thin", color: { argb: "FF1E40AF" } },
      bottom: { style: "thin", color: { argb: "FF1E40AF" } },
      right: { style: "thin", color: { argb: "FF1E40AF" } },
    };
  });
  row.height = 22;
};

/**
 * Style data rows
 */
const styleDataRow = (row, isAlternate) => {
  row.eachCell((cell) => {
    cell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    };

    if (isAlternate) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8FAFC" },
      };
    }
  });
};

/**
 * Add totals row
 */
const addTotalsRow = (worksheet, totals) => {
  worksheet.addRow([]);

  Object.entries(totals).forEach(([label, value]) => {
    const row = worksheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).font = { bold: true, color: { argb: "FF1E40AF" } };
  });
};

/**
 * Add footer
 */
const addFooter = (worksheet, companyName, columnCount) => {
  const lastCol = String.fromCharCode(64 + Math.min(columnCount, 26));

  worksheet.addRow([]);

  const footerRow = worksheet.addRow([`${companyName} - Confidential Report`]);
  footerRow.font = { italic: true, color: { argb: "FF9CA3AF" }, size: 9 };
  footerRow.alignment = { horizontal: "center" };
  worksheet.mergeCells(`A${footerRow.number}:${lastCol}${footerRow.number}`);
};

// ============================================================
// NEW HELPER FUNCTIONS FOR PAYMENT MANAGEMENT SUPPORT
// ============================================================

/**
 * Parse currency value from various formats
 * Handles: "KSh 15,000", "15,000", 15000, "15000"
 */
const parseCurrencyValue = (value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    // Remove KSh, commas, spaces and parse
    const cleaned = value.replace(/[KSh,\s]/g, "").trim();
    return parseFloat(cleaned) || 0;
  }
  return 0;
};

/**
 * Check if data is in transformed format (from PaymentManagement component)
 * Transformed data uses readable keys like 'Tenant Name', 'Monthly Rent'
 */
const isTransformedData = (data) => {
  if (!data || data.length === 0) return false;
  const firstItem = data[0];
  // Check for transformed keys (with spaces and capitalized)
  return (
    firstItem.hasOwnProperty("Tenant Name") ||
    firstItem.hasOwnProperty("Monthly Rent") ||
    firstItem.hasOwnProperty("Total Due") ||
    firstItem.hasOwnProperty("Rent Paid")
  );
};

/**
 * Main Excel export function
 */
export const exportToExcel = async (config) => {
  const {
    reportType,
    data,
    filters = {},
    companyInfo: providedCompanyInfo,
    user,
    title = "Report",
    totalsOverride,
  } = config;

  if (!data || data.length === 0) {
    alert("No data available to export. Please generate a report first.");
    return false;
  }

  try {
    console.log("📊 Starting Excel export...");
    console.log("📋 Provided company info:", providedCompanyInfo);

    // Fetch fresh company info if provided is incomplete
    let companyInfo;
    if (
      providedCompanyInfo &&
      isValidCompanyInfo(providedCompanyInfo) &&
      providedCompanyInfo.logo
    ) {
      console.log("✅ Using provided company info (complete)");
      companyInfo = providedCompanyInfo;
    } else {
      console.log(
        "🔄 Fetching company info (provided was incomplete or missing)",
      );
      companyInfo = await fetchCompanyInfo();
    }

    console.log("📋 Final company info for Excel export:", companyInfo);

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = companyInfo.name || DEFAULT_COMPANY.name;
    workbook.lastModifiedBy = user
      ? `${user.first_name} ${user.last_name}`
      : "System";
    workbook.created = new Date();
    workbook.modified = new Date();

    // Create worksheet
    const sheetName = title.substring(0, 31).replace(/[\\/*?:\[\]]/g, "");
    const worksheet = workbook.addWorksheet(sheetName);

    // Prepare data
    const { headers, rows, columnFormats } = prepareExcelData(reportType, data);
    const columnCount = headers.length;

    // Add company header with logo
    let currentRow = await addCompanyHeader(
      workbook,
      worksheet,
      companyInfo,
      columnCount,
    );

    // Add report metadata
    currentRow = addReportMetadata(
      worksheet,
      title,
      user,
      filters,
      data.length,
      columnCount,
      currentRow,
    );

    // Add table headers
    const headerRow = worksheet.addRow(headers);
    styleHeaderRow(headerRow);

    // Add data rows
    rows.forEach((rowData, index) => {
      const row = worksheet.addRow(rowData);
      styleDataRow(row, index % 2 === 1);

      // Apply column-specific formatting
      if (columnFormats) {
        Object.entries(columnFormats).forEach(([colIndex, format]) => {
          const cell = row.getCell(parseInt(colIndex) + 1);
          if (format.numFmt) cell.numFmt = format.numFmt;
          if (format.alignment) cell.alignment = format.alignment;
        });
      }
    });

    // Calculate and add totals
    const totals = totalsOverride || calculateTotals(reportType, data);
    if (totals) {
      addTotalsRow(worksheet, totals);
    }

    // Add footer
    addFooter(worksheet, companyInfo.name || DEFAULT_COMPANY.name, columnCount);

    // Auto-fit columns
    worksheet.columns.forEach((column, index) => {
      let maxLength = headers[index]?.length || 10;

      rows.forEach((row) => {
        const cellValue = row[index];
        const cellLength = cellValue ? cellValue.toString().length : 0;
        if (cellLength > maxLength) {
          maxLength = cellLength;
        }
      });

      column.width = Math.min(Math.max(maxLength + 2, 10), 40);
    });

    // Generate and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${reportType}_report_${timestamp}.xlsx`;

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    console.log("✅ Excel exported successfully:", filename);
    return true;
  } catch (error) {
    console.error("❌ Excel export failed:", error);
    alert(`Export failed: ${error.message}`);
    return false;
  }
};

/**
 * Prepare data for Excel based on report type
 */
const prepareExcelData = (reportType, data) => {
  let headers = [];
  let rows = [];
  let columnFormats = {};

  // Check if data is in transformed format (from PaymentManagement)
  const isTransformed = isTransformedData(data);

  switch (reportType) {
    case "tenants":
      headers = [
        "#",
        "First Name",
        "Last Name",
        "Phone",
        "National ID",
        "Property",
        "Unit",
        "Rent (KSh)",
        "Status",
      ];
      rows = data.map((item, index) => [
        index + 1,
        item.first_name || "",
        item.last_name || "",
        formatPhone(item.phone_number),
        item.national_id || "N/A",
        item.property_name || "N/A",
        item.unit_code || "N/A",
        parseCurrencyValue(item.rent_amount || item.monthly_rent),
        item.is_active ? "Active" : "Inactive",
      ]);
      columnFormats = {
        7: { numFmt: "#,##0", alignment: { horizontal: "right" } },
      };
      break;

    // NEW: Unpaid Tenants Report (for PaymentManagement component)
    case "unpaid_tenants":
      if (isTransformed) {
        // Data from PaymentManagement component - uses readable keys
        headers = [
          "#",
          "Tenant Name",
          "Phone",
          "Property",
          "Unit",
          "Monthly Rent",
          "Rent Paid",
          "Rent Due",
          "Water Bill",
          "Arrears",
          "Total Due",
        ];
        rows = data.map((item, index) => [
          index + 1,
          item["Tenant Name"] || "N/A",
          item["Phone"] || "N/A",
          item["Property"] || "N/A",
          item["Unit"] || "N/A",
          parseCurrencyValue(item["Monthly Rent"]),
          parseCurrencyValue(item["Rent Paid"]),
          parseCurrencyValue(item["Rent Due"]),
          parseCurrencyValue(item["Water Bill"]),
          parseCurrencyValue(item["Arrears"]),
          parseCurrencyValue(item["Total Due"]),
        ]);
      } else {
        // Raw API data
        headers = [
          "#",
          "Tenant Name",
          "Phone",
          "Property",
          "Unit",
          "Monthly Rent",
          "Rent Paid",
          "Rent Due",
          "Water Bill",
          "Arrears",
          "Total Due",
        ];
        rows = data.map((item, index) => [
          index + 1,
          item.tenant_name ||
            `${item.first_name || ""} ${item.last_name || ""}`.trim() ||
            "N/A",
          formatPhone(item.phone_number),
          item.property_name || "N/A",
          item.unit_code || "N/A",
          parseCurrencyValue(item.monthly_rent),
          parseCurrencyValue(item.rent_paid),
          parseCurrencyValue(item.rent_due),
          parseCurrencyValue(item.water_bill),
          parseCurrencyValue(item.arrears),
          parseCurrencyValue(item.total_due),
        ]);
      }
      columnFormats = {
        5: { numFmt: "#,##0", alignment: { horizontal: "right" } },
        6: { numFmt: "#,##0", alignment: { horizontal: "right" } },
        7: { numFmt: "#,##0", alignment: { horizontal: "right" } },
        8: { numFmt: "#,##0", alignment: { horizontal: "right" } },
        9: { numFmt: "#,##0", alignment: { horizontal: "right" } },
        10: { numFmt: "#,##0", alignment: { horizontal: "right" } },
      };
      break;

    // NEW: Paid Tenants Report (for PaymentManagement component)
    case "paid_tenants":
      if (isTransformed) {
        // Data from PaymentManagement component - uses readable keys
        headers = [
          "#",
          "Tenant Name",
          "Phone",
          "Property",
          "Unit",
          "Monthly Rent",
          "Rent Paid",
          "Water Paid",
          "Advance",
          "Last Payment",
          "Status",
        ];
        rows = data.map((item, index) => [
          index + 1,
          item["Tenant Name"] || "N/A",
          item["Phone"] || "N/A",
          item["Property"] || "N/A",
          item["Unit"] || "N/A",
          parseCurrencyValue(item["Monthly Rent"]),
          parseCurrencyValue(item["Rent Paid"]),
          parseCurrencyValue(item["Water Paid"]),
          parseCurrencyValue(item["Advance"]),
          item["Last Payment"] || "N/A",
          item["Status"] || "Paid",
        ]);
      } else {
        // Raw API data
        headers = [
          "#",
          "Tenant Name",
          "Phone",
          "Property",
          "Unit",
          "Monthly Rent",
          "Rent Paid",
          "Water Paid",
          "Advance",
          "Last Payment",
          "Status",
        ];
        rows = data.map((item, index) => [
          index + 1,
          item.tenant_name ||
            `${item.first_name || ""} ${item.last_name || ""}`.trim() ||
            "N/A",
          formatPhone(item.phone_number),
          item.property_name || "N/A",
          item.unit_code || "N/A",
          parseCurrencyValue(item.monthly_rent),
          parseCurrencyValue(item.rent_paid),
          parseCurrencyValue(item.water_paid),
          parseCurrencyValue(item.advance_amount),
          formatDate(item.last_payment_date),
          "Paid",
        ]);
      }
      columnFormats = {
        5: { numFmt: "#,##0", alignment: { horizontal: "right" } },
        6: { numFmt: "#,##0", alignment: { horizontal: "right" } },
        7: { numFmt: "#,##0", alignment: { horizontal: "right" } },
        8: { numFmt: "#,##0", alignment: { horizontal: "right" } },
      };
      break;

    case "payments":
      headers = [
        "#",
        "Receipt No.",
        "Tenant Name",
        "Phone",
        "Amount (KSh)",
        "Month",
        "M-Pesa Code",
        "Status",
        "Date",
      ];
      rows = data.map((item, index) => [
        index + 1,
        item.id?.substring(0, 8) || "N/A",
        item.tenant_name ||
          `${item.first_name || ""} ${item.last_name || ""}`.trim() ||
          "N/A",
        formatPhone(item.phone_number),
        parseCurrencyValue(item.amount),
        formatMonth(item.payment_month),
        item.mpesa_receipt_number || "N/A",
        capitalizeFirst(item.status) || "Pending",
        formatDate(item.created_at || item.payment_date),
      ]);
      columnFormats = {
        4: { numFmt: "#,##0", alignment: { horizontal: "right" } },
      };
      break;

    case "tenant_statement":
      headers = [
        "#",
        "Payment Date",
        "Amount (KSh)",
        "Ref Code",
        "Payment Month",
        "Method",
        "Status",
      ];
      rows = data.map((item, index) => [
        index + 1,
        formatDate(item.payment_date),
        parseCurrencyValue(item.amount),
        item.mpesa_receipt_number || item.mpesa_transaction_id || "N/A",
        formatMonth(item.payment_month),
        item.payment_method || "N/A",
        item.status || "N/A",
      ]);
      columnFormats = {
        2: { numFmt: "#,##0", alignment: { horizontal: "right" } },
      };
      break;

    case "properties":
      headers = [
        "#",
        "Code",
        "Property Name",
        "Address",
        "County",
        "Town",
        "Total Units",
        "Occupied",
        "Available",
        "Occupancy %",
      ];
      rows = data.map((item, index) => {
        const total = item.total_units || item.unit_count || 0;
        const occupied = item.occupied_units || 0;
        const available =
          item.available_units || item.available_units_count || 0;
        const occupancyRate = total > 0 ? occupied / total : 0;

        return [
          index + 1,
          item.property_code || "N/A",
          item.name || "N/A",
          item.address || "N/A",
          item.county || "N/A",
          item.town || "N/A",
          total,
          occupied,
          available,
          occupancyRate,
        ];
      });
      columnFormats = {
        9: { numFmt: "0%", alignment: { horizontal: "center" } },
      };
      break;

    case "complaints":
      headers = [
        "#",
        "Title",
        "Description",
        "Property",
        "Unit",
        "Tenant",
        "Priority",
        "Status",
        "Date Raised",
        "Date Resolved",
      ];
      rows = data.map((item, index) => [
        index + 1,
        item.title || "N/A",
        truncateText(item.description, 50),
        item.property_name || "N/A",
        item.unit_code || "N/A",
        item.tenant_name ||
          `${item.first_name || ""} ${item.last_name || ""}`.trim() ||
          "N/A",
        capitalizeFirst(item.priority) || "Medium",
        capitalizeFirst(item.status) || "Open",
        formatDate(item.created_at || item.raised_at),
        formatDate(item.resolved_at),
      ]);
      break;

    case "water":
      headers = [
        "#",
        "Tenant Name",
        "Phone",
        "Property",
        "Unit",
        "Amount (KSh)",
        "Bill Month",
        "Status",
        "Notes",
      ];
      rows = data.map((item, index) => [
        index + 1,
        item.tenant_name ||
          `${item.first_name || ""} ${item.last_name || ""}`.trim() ||
          "N/A",
        formatPhone(item.phone_number),
        item.property_name || "N/A",
        item.unit_code || "N/A",
        parseCurrencyValue(item.amount),
        formatMonth(item.bill_month),
        capitalizeFirst(item.status) || "Pending",
        item.notes || "",
      ]);
      columnFormats = {
        5: { numFmt: "#,##0", alignment: { horizontal: "right" } },
      };
      break;

    // UPDATED: SMS Report with channel support
    case "sms":
    case "messaging":
      headers = [
        "#",
        "Channel",
        "Recipient Phone",
        "Message",
        "Type",
        "Status",
        "Attempts",
        "Error",
        "Date",
      ];
      rows = data.map((item, index) => [
        index + 1,
        item.channel || "SMS",
        formatPhone(item.recipient_phone || item.phone_number),
        truncateText(item.message, 60),
        item.message_type || item.template_name || "General",
        capitalizeFirst(item.status) || "Pending",
        item.attempts || 0,
        item.error_message || "",
        formatDate(item.created_at || item.sent_at),
      ]);
      break;

    case "revenue":
      headers = [
        "#",
        "Month",
        "Total Revenue (KSh)",
        "Payment Count",
        "Properties",
        "Tenants",
        "Average Payment (KSh)",
      ];
      rows = data.map((item, index) => [
        index + 1,
        formatMonth(item.month),
        parseCurrencyValue(item.total_revenue),
        item.payment_count || 0,
        item.property_count || 0,
        item.tenant_count || 0,
        parseCurrencyValue(item.average_payment),
      ]);
      columnFormats = {
        2: { numFmt: "#,##0", alignment: { horizontal: "right" } },
        6: { numFmt: "#,##0", alignment: { horizontal: "right" } },
      };
      break;

    case "expenses":
      headers = [
        "#",
        "Date",
        "Category",
        "Subcategory",
        "Description",
        "Property",
        "Unit",
        "Amount (KSh)",
        "Payment Method",
        "Vendor",
        "Receipt No.",
        "Status",
        "Recorded By",
        "Notes",
      ];
      rows = data.map((item, index) => [
        index + 1,
        formatDate(item.expense_date),
        item.category || "N/A",
        item.subcategory || "",
        item.description || "N/A",
        item.property_name || "General",
        item.unit_code || "",
        parseCurrencyValue(item.amount),
        capitalizeFirst(item.payment_method) || "Cash",
        item.vendor_name || "",
        item.receipt_number || "",
        capitalizeFirst(item.status) || "Pending",
        item.recorded_by_name || "N/A",
        item.notes || "",
      ]);
      columnFormats = {
        7: { numFmt: "#,##0", alignment: { horizontal: "right" } },
      };
      break;

    default:
      headers = ["#", "Name", "Description", "Date", "Amount (KSh)", "Status"];
      rows = data.map((item, index) => [
        index + 1,
        item.name || item.first_name || item.tenant_name || item.title || "N/A",
        truncateText(item.description || item.notes || "", 40),
        formatDate(item.created_at),
        parseCurrencyValue(item.amount),
        capitalizeFirst(item.status) || "Active",
      ]);
      columnFormats = {
        4: { numFmt: "#,##0", alignment: { horizontal: "right" } },
      };
  }

  return { headers, rows, columnFormats };
};

/**
 * Calculate totals for the report
 */
const calculateTotals = (reportType, data) => {
  // Check if data is in transformed format
  const isTransformed = isTransformedData(data);

  switch (reportType) {
    // NEW: Unpaid Tenants Totals
    case "unpaid_tenants":
      if (isTransformed) {
        const totalRentDue = data.reduce(
          (sum, item) => sum + parseCurrencyValue(item["Rent Due"]),
          0,
        );
        const totalWaterDue = data.reduce(
          (sum, item) => sum + parseCurrencyValue(item["Water Bill"]),
          0,
        );
        const totalArrears = data.reduce(
          (sum, item) => sum + parseCurrencyValue(item["Arrears"]),
          0,
        );
        const totalDue = data.reduce(
          (sum, item) => sum + parseCurrencyValue(item["Total Due"]),
          0,
        );
        return {
          "Total Rent Due": `KSh ${totalRentDue.toLocaleString()}`,
          "Total Water Due": `KSh ${totalWaterDue.toLocaleString()}`,
          "Total Arrears": `KSh ${totalArrears.toLocaleString()}`,
          "Grand Total Due": `KSh ${totalDue.toLocaleString()}`,
          "Unpaid Tenants": `${data.length}`,
        };
      } else {
        const totalRentDue = data.reduce(
          (sum, item) => sum + parseCurrencyValue(item.rent_due),
          0,
        );
        const totalWaterDue = data.reduce(
          (sum, item) => sum + parseCurrencyValue(item.water_bill),
          0,
        );
        const totalArrears = data.reduce(
          (sum, item) => sum + parseCurrencyValue(item.arrears),
          0,
        );
        const totalDue = data.reduce(
          (sum, item) => sum + parseCurrencyValue(item.total_due),
          0,
        );
        return {
          "Total Rent Due": `KSh ${totalRentDue.toLocaleString()}`,
          "Total Water Due": `KSh ${totalWaterDue.toLocaleString()}`,
          "Total Arrears": `KSh ${totalArrears.toLocaleString()}`,
          "Grand Total Due": `KSh ${totalDue.toLocaleString()}`,
          "Unpaid Tenants": `${data.length}`,
        };
      }

    // NEW: Paid Tenants Totals
    case "paid_tenants":
      if (isTransformed) {
        const totalRentPaid = data.reduce(
          (sum, item) => sum + parseCurrencyValue(item["Rent Paid"]),
          0,
        );
        const totalWaterPaid = data.reduce(
          (sum, item) => sum + parseCurrencyValue(item["Water Paid"]),
          0,
        );
        const totalAdvance = data.reduce(
          (sum, item) => sum + parseCurrencyValue(item["Advance"]),
          0,
        );
        const tenantsWithAdvance = data.filter(
          (item) => parseCurrencyValue(item["Advance"]) > 0,
        ).length;
        return {
          "Total Rent Paid": `KSh ${totalRentPaid.toLocaleString()}`,
          "Total Water Paid": `KSh ${totalWaterPaid.toLocaleString()}`,
          "Total Advance": `KSh ${totalAdvance.toLocaleString()}`,
          "Paid Tenants": `${data.length}`,
          "With Advance": `${tenantsWithAdvance} tenants`,
        };
      } else {
        const totalRentPaid = data.reduce(
          (sum, item) => sum + parseCurrencyValue(item.rent_paid),
          0,
        );
        const totalWaterPaid = data.reduce(
          (sum, item) => sum + parseCurrencyValue(item.water_paid),
          0,
        );
        const totalAdvance = data.reduce(
          (sum, item) => sum + parseCurrencyValue(item.advance_amount),
          0,
        );
        const tenantsWithAdvance = data.filter(
          (item) => parseCurrencyValue(item.advance_amount) > 0,
        ).length;
        return {
          "Total Rent Paid": `KSh ${totalRentPaid.toLocaleString()}`,
          "Total Water Paid": `KSh ${totalWaterPaid.toLocaleString()}`,
          "Total Advance": `KSh ${totalAdvance.toLocaleString()}`,
          "Paid Tenants": `${data.length}`,
          "With Advance": `${tenantsWithAdvance} tenants`,
        };
      }

    case "payments":
      const totalPayments = data.reduce(
        (sum, item) => sum + parseCurrencyValue(item.amount),
        0,
      );
      const completedCount = data.filter(
        (item) => item.status === "completed",
      ).length;
      return {
        "Total Amount": `KSh ${totalPayments.toLocaleString()}`,
        "Completed Payments": `${completedCount} of ${data.length}`,
      };

    case "revenue":
      const totalRevenue = data.reduce(
        (sum, item) => sum + parseCurrencyValue(item.total_revenue),
        0,
      );
      const totalPaymentCount = data.reduce(
        (sum, item) => sum + (item.payment_count || 0),
        0,
      );
      return {
        "Total Revenue": `KSh ${totalRevenue.toLocaleString()}`,
        "Total Payments": totalPaymentCount.toLocaleString(),
      };

    case "tenants":
      const totalRent = data.reduce(
        (sum, item) =>
          sum + parseCurrencyValue(item.rent_amount || item.monthly_rent),
        0,
      );
      const activeCount = data.filter((item) => item.is_active).length;
      return {
        "Total Monthly Rent": `KSh ${totalRent.toLocaleString()}`,
        "Active Tenants": `${activeCount} of ${data.length}`,
      };

    case "water":
      const totalWater = data.reduce(
        (sum, item) => sum + parseCurrencyValue(item.amount),
        0,
      );
      return {
        "Total Water Bills": `KSh ${totalWater.toLocaleString()}`,
      };

    case "properties":
      const totalUnits = data.reduce(
        (sum, item) => sum + (item.total_units || item.unit_count || 0),
        0,
      );
      const occupiedUnits = data.reduce(
        (sum, item) => sum + (item.occupied_units || 0),
        0,
      );
      const overallOccupancy =
        totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
      return {
        "Total Units": totalUnits.toLocaleString(),
        "Occupied Units": occupiedUnits.toLocaleString(),
        "Overall Occupancy": `${overallOccupancy}%`,
      };

    case "expenses":
      const totalExpenses = data.reduce(
        (sum, item) => sum + parseCurrencyValue(item.amount),
        0,
      );
      const approvedExpenses = data.filter(
        (item) => item.status === "approved",
      );
      const approvedTotal = approvedExpenses.reduce(
        (sum, item) => sum + parseCurrencyValue(item.amount),
        0,
      );
      const pendingCount = data.filter(
        (item) => item.status === "pending",
      ).length;
      const rejectedCount = data.filter(
        (item) => item.status === "rejected",
      ).length;
      return {
        "Total Expenses": `KSh ${totalExpenses.toLocaleString()}`,
        "Approved Total": `KSh ${approvedTotal.toLocaleString()}`,
        "Pending Approval": `${pendingCount} expense(s)`,
        Rejected: `${rejectedCount} expense(s)`,
      };

    // NEW: SMS/Messaging Totals
    case "sms":
    case "messaging":
      const smsCount = data.filter(
        (item) => (item.channel || "SMS") === "SMS",
      ).length;
      const whatsappCount = data.filter(
        (item) => item.channel === "WhatsApp",
      ).length;
      const sentCount = data.filter((item) => item.status === "sent").length;
      const failedCount = data.filter(
        (item) => item.status === "failed",
      ).length;
      return {
        "Total Messages": `${data.length}`,
        "SMS Messages": `${smsCount}`,
        "WhatsApp Messages": `${whatsappCount}`,
        "Sent Successfully": `${sentCount}`,
        Failed: `${failedCount}`,
      };

    default:
      return null;
  }
};

/* ---------------- Helper Functions ---------------- */

const formatPhone = (phone) => {
  if (!phone) return "N/A";
  if (phone.startsWith("254")) {
    return "0" + phone.substring(3);
  }
  return phone;
};

const formatDate = (dateStr) => {
  if (!dateStr) return "N/A";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "N/A";
  }
};

const formatMonth = (monthStr) => {
  if (!monthStr) return "N/A";
  try {
    if (monthStr.match(/^\d{4}-\d{2}$/)) {
      const [year, month] = monthStr.split("-");
      const date = new Date(year, parseInt(month) - 1);
      return date.toLocaleDateString("en-GB", {
        month: "short",
        year: "numeric",
      });
    }
    const date = new Date(monthStr);
    return date.toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    });
  } catch {
    return monthStr;
  }
};

const truncateText = (text, maxLength) => {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
};

const capitalizeFirst = (str) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Clear cached company info
 */
export const clearCompanyInfoCache = () => {
  cachedCompanyInfo = null;
  cacheTimestamp = null;
  console.log("🗑️ Excel company info cache cleared");
};
