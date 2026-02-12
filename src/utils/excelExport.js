// src/utils/excelExport.js
// COMPLETE EXCEL EXPORT UTILITY - Handles all report types including tenant payment status

/**
 * Export data to Excel
 * @param {Object} config - Export configuration
 * @param {string} config.reportType - Type of report (payments, tenants, unpaid_tenants, paid_tenants, etc.)
 * @param {Array} config.data - Data to export
 * @param {Object} config.filters - Applied filters
 * @param {Object} config.companyInfo - Company information
 * @param {Object} config.user - Current user
 * @param {string} config.title - Report title
 */
export const exportToExcel = async (config) => {
  const { reportType, data, filters, companyInfo, user, title } = config;

  if (!data || data.length === 0) {
    throw new Error("No data to export");
  }

  try {
    // Try to use ExcelJS if available
    let useExcelJS = false;
    let ExcelJS;

    try {
      ExcelJS = await import("exceljs");
      useExcelJS = true;
    } catch (e) {
      console.log("ExcelJS not available, falling back to CSV export");
    }

    if (useExcelJS && ExcelJS.default) {
      return await exportWithExcelJS(ExcelJS.default, config);
    } else {
      // Fallback to CSV export
      return await exportToCSV(config);
    }
  } catch (error) {
    console.error("❌ Excel export error:", error);
    // Fallback to CSV
    console.log("Falling back to CSV export...");
    return await exportToCSV(config);
  }
};

/**
 * Export using ExcelJS library
 */
async function exportWithExcelJS(ExcelJS, config) {
  const { reportType, data, filters, companyInfo, user, title } = config;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = companyInfo?.name || "Zakaria Housing Agency";
  workbook.lastModifiedBy =
    `${user?.first_name || ""} ${user?.last_name || ""}`.trim() || "System";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet(title?.substring(0, 31) || "Report");

  // ========================================
  // HEADER SECTION
  // ========================================

  // Company name
  worksheet.mergeCells("A1:H1");
  const companyCell = worksheet.getCell("A1");
  companyCell.value = companyInfo?.name || "Zakaria Housing Agency";
  companyCell.font = {
    name: "Arial",
    size: 16,
    bold: true,
    color: { argb: "FF2C3E50" },
  };
  companyCell.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.getRow(1).height = 30;

  // Report title
  worksheet.mergeCells("A2:H2");
  const titleCell = worksheet.getCell("A2");
  titleCell.value =
    title || `${reportType?.replace(/_/g, " ").toUpperCase()} REPORT`;
  titleCell.font = {
    name: "Arial",
    size: 12,
    bold: true,
    color: { argb: "FF34495E" },
  };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.getRow(2).height = 25;

  // Generation info
  worksheet.mergeCells("A3:D3");
  const dateCell = worksheet.getCell("A3");
  dateCell.value = `Generated: ${new Date().toLocaleString("en-GB")}`;
  dateCell.font = { name: "Arial", size: 9, color: { argb: "FF7F8C8D" } };

  worksheet.mergeCells("E3:H3");
  const userCell = worksheet.getCell("E3");
  userCell.value = `By: ${user?.first_name || ""} ${user?.last_name || ""} (${user?.role || "User"})`;
  userCell.font = { name: "Arial", size: 9, color: { argb: "FF7F8C8D" } };
  userCell.alignment = { horizontal: "right" };

  // Filters row
  if (filters) {
    const filterParts = [];
    if (filters.month) filterParts.push(`Month: ${filters.month}`);
    if (filters.period)
      filterParts.push(`Period: ${filters.period.replace("_", " ")}`);
    if (filters.startDate && filters.endDate) {
      filterParts.push(`Date: ${filters.startDate} to ${filters.endDate}`);
    }

    if (filterParts.length > 0) {
      worksheet.mergeCells("A4:H4");
      const filterCell = worksheet.getCell("A4");
      filterCell.value = `Filters: ${filterParts.join(" | ")}`;
      filterCell.font = {
        name: "Arial",
        size: 9,
        italic: true,
        color: { argb: "FF7F8C8D" },
      };
    }
  }

  // Empty row before data
  const dataStartRow = 6;

  // ========================================
  // TABLE DATA BASED ON REPORT TYPE
  // ========================================
  const { headers, rows, columnWidths } = getExcelTableConfig(reportType, data);

  // Add headers
  const headerRow = worksheet.getRow(dataStartRow);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = {
      name: "Arial",
      size: 10,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF34495E" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF34495E" } },
      bottom: { style: "thin", color: { argb: "FF34495E" } },
      left: { style: "thin", color: { argb: "FF34495E" } },
      right: { style: "thin", color: { argb: "FF34495E" } },
    };
  });
  headerRow.height = 25;

  // Add data rows
  rows.forEach((rowData, rowIndex) => {
    const row = worksheet.getRow(dataStartRow + 1 + rowIndex);
    rowData.forEach((value, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      cell.value = value;
      cell.font = { name: "Arial", size: 9 };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFBDC3C7" } },
        bottom: { style: "thin", color: { argb: "FFBDC3C7" } },
        left: { style: "thin", color: { argb: "FFBDC3C7" } },
        right: { style: "thin", color: { argb: "FFBDC3C7" } },
      };

      // Alternate row colors
      if (rowIndex % 2 === 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8F9FA" },
        };
      }

      // Right-align currency columns
      if (typeof value === "string" && value.startsWith("KSh")) {
        cell.alignment = { horizontal: "right", vertical: "middle" };
      }
    });
    row.height = 20;
  });

  // Set column widths
  columnWidths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });

  // ========================================
  // SUMMARY SECTION
  // ========================================
  const summaryStartRow = dataStartRow + rows.length + 3;

  if (reportType === "unpaid_tenants" || reportType === "paid_tenants") {
    addExcelTenantSummary(worksheet, data, summaryStartRow, reportType);
  } else if (reportType === "payments") {
    addExcelPaymentSummary(worksheet, data, summaryStartRow);
  }

  // Generate and download file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement("a");
  const fileName = `${reportType}_report_${new Date().toISOString().split("T")[0]}.xlsx`;
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);

  console.log(`✅ Excel exported successfully: ${fileName}`);
  return { success: true, fileName };
}

/**
 * Fallback CSV export
 */
async function exportToCSV(config) {
  const { reportType, data, title } = config;

  const { headers, rows } = getExcelTableConfig(reportType, data);

  // Build CSV content
  let csvContent = "";

  // Add headers
  csvContent += headers.map((h) => `"${h}"`).join(",") + "\n";

  // Add rows
  rows.forEach((row) => {
    csvContent +=
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? "" : String(cell);
          // Escape quotes and wrap in quotes
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(",") + "\n";
  });

  // Download CSV
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement("a");
  const fileName = `${reportType}_report_${new Date().toISOString().split("T")[0]}.csv`;
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);

  console.log(`✅ CSV exported successfully: ${fileName}`);
  return { success: true, fileName };
}

/**
 * Get Excel table configuration based on report type
 */
function getExcelTableConfig(reportType, data) {
  let headers = [];
  let rows = [];
  let columnWidths = [];

  switch (reportType) {
    case "unpaid_tenants":
    case "paid_tenants":
      // Check if data uses object keys (from handleExportTenantStatus)
      if (data[0] && data[0]["Tenant Name"] !== undefined) {
        headers = [
          "Tenant Name",
          "Property",
          "Unit",
          "Phone",
          "Monthly Rent",
          "Rent Paid",
          "Rent Due",
          "Water Bill",
          "Arrears",
          "Total Due",
          "Advance",
          "Status",
        ];
        rows = data.map((row) => [
          row["Tenant Name"] || "N/A",
          row["Property"] || "N/A",
          row["Unit"] || "N/A",
          row["Phone"] || "N/A",
          formatCurrency(row["Monthly Rent"]),
          formatCurrency(row["Rent Paid"]),
          formatCurrency(row["Rent Due"]),
          formatCurrency(row["Water Bill"]),
          formatCurrency(row["Arrears"]),
          formatCurrency(row["Total Due"]),
          formatCurrency(row["Advance"]),
          row["Status"] || "N/A",
        ]);
      } else {
        // Raw data format
        headers = [
          "Tenant Name",
          "Property",
          "Unit",
          "Phone",
          "Monthly Rent",
          "Rent Paid",
          "Rent Due",
          "Water Bill",
          "Arrears",
          "Total Due",
          "Advance",
          "Status",
        ];
        rows = data.map((row) => [
          row.tenant_name ||
            `${row.first_name || ""} ${row.last_name || ""}`.trim() ||
            "N/A",
          row.property_name || "N/A",
          row.unit_code || "N/A",
          formatPhone(row.phone_number),
          formatCurrency(row.monthly_rent),
          formatCurrency(row.rent_paid),
          formatCurrency(row.rent_due),
          formatCurrency(row.water_bill),
          formatCurrency(row.arrears),
          formatCurrency(row.total_due),
          formatCurrency(row.advance_amount),
          row.total_due <= 0 ? "Paid" : "Unpaid",
        ]);
      }
      columnWidths = [25, 20, 15, 15, 15, 15, 15, 15, 15, 15, 15, 12];
      break;

    case "payments":
      headers = [
        "Tenant",
        "Property",
        "Unit",
        "Amount",
        "Receipt",
        "Payment Month",
        "Date",
        "Status",
      ];
      rows = data.map((row) => [
        row.tenant_name ||
          `${row.first_name || ""} ${row.last_name || ""}`.trim() ||
          "N/A",
        row.property_name || "N/A",
        row.unit_code || "N/A",
        formatCurrency(row.amount),
        row.mpesa_receipt_number || row.mpesa_transaction_id || "N/A",
        row.payment_month || "N/A",
        formatDate(row.payment_date || row.created_at),
        row.status || "N/A",
      ]);
      columnWidths = [25, 25, 15, 18, 20, 15, 15, 15];
      break;

    case "tenants":
      headers = [
        "Name",
        "Phone",
        "Email",
        "Property",
        "Unit",
        "Monthly Rent",
        "Lease Start",
        "Status",
      ];
      rows = data.map((row) => [
        row.tenant_name ||
          `${row.first_name || ""} ${row.last_name || ""}`.trim() ||
          "N/A",
        formatPhone(row.phone_number),
        row.email || "N/A",
        row.property_name || "N/A",
        row.unit_code || "N/A",
        formatCurrency(row.monthly_rent || row.rent_amount),
        formatDate(row.lease_start_date || row.allocation_date),
        row.is_active ? "Active" : row.status || "Inactive",
      ]);
      columnWidths = [25, 15, 25, 25, 15, 18, 15, 12];
      break;

    case "sms":
      headers = [
        "Recipient",
        "Message",
        "Type",
        "Channel",
        "Status",
        "Sent By",
        "Date",
      ];
      rows = data.map((row) => [
        formatPhone(row.recipient_phone),
        row.message || row.template_name || "N/A",
        row.message_type || "General",
        row.channel || "SMS",
        row.status || "Pending",
        row.sent_by_name || "System",
        formatDate(row.created_at),
      ]);
      columnWidths = [15, 50, 18, 12, 12, 20, 15];
      break;

    case "water":
      headers = [
        "Tenant",
        "Property",
        "Unit",
        "Amount",
        "Bill Month",
        "Status",
        "Created",
      ];
      rows = data.map((row) => [
        row.tenant_name ||
          `${row.first_name || ""} ${row.last_name || ""}`.trim() ||
          "N/A",
        row.property_name || "N/A",
        row.unit_code || "N/A",
        formatCurrency(row.amount),
        row.bill_month || "N/A",
        row.status || "Pending",
        formatDate(row.created_at),
      ]);
      columnWidths = [25, 25, 15, 18, 15, 15, 15];
      break;

    case "complaints":
      headers = [
        "Title",
        "Description",
        "Property",
        "Unit",
        "Priority",
        "Status",
        "Raised Date",
      ];
      rows = data.map((row) => [
        row.title || "N/A",
        (row.description || "").substring(0, 100) || "N/A",
        row.property_name || "N/A",
        row.unit_code || "N/A",
        row.priority || "Medium",
        row.status || "Open",
        formatDate(row.raised_at || row.created_at),
      ]);
      columnWidths = [30, 50, 25, 15, 15, 15, 15];
      break;

    case "properties":
      headers = [
        "Code",
        "Name",
        "Address",
        "County",
        "Town",
        "Total Units",
        "Occupied",
        "Available",
      ];
      rows = data.map((row) => [
        row.property_code || "N/A",
        row.name || "N/A",
        row.address || "N/A",
        row.county || "N/A",
        row.town || "N/A",
        row.total_units || row.unit_count || 0,
        row.occupied_units || 0,
        row.available_units || 0,
      ]);
      columnWidths = [12, 25, 30, 15, 15, 12, 12, 12];
      break;

    case "revenue":
      headers = [
        "Month",
        "Total Revenue",
        "Payment Count",
        "Properties",
        "Tenants",
        "Avg Payment",
      ];
      rows = data.map((row) => [
        row.month || "N/A",
        formatCurrency(row.total_revenue),
        row.payment_count || 0,
        row.property_count || 0,
        row.tenant_count || 0,
        formatCurrency(row.average_payment),
      ]);
      columnWidths = [15, 20, 15, 15, 15, 20];
      break;

    default:
      // Generic table for unknown report types
      if (data.length > 0) {
        const firstRow = data[0];
        headers = Object.keys(firstRow);
        rows = data.map((row) =>
          headers.map((key) => {
            const value = row[key];
            if (value === null || value === undefined) return "N/A";
            if (typeof value === "number") return value.toLocaleString();
            return String(value);
          }),
        );
        columnWidths = headers.map(() => 20);
      }
      break;
  }

  return { headers, rows, columnWidths };
}

/**
 * Add tenant summary to Excel
 */
function addExcelTenantSummary(worksheet, data, startRow, reportType) {
  let totalExpected = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;

  data.forEach((row) => {
    const monthlyRent = parseCurrencyValue(
      row["Monthly Rent"] || row.monthly_rent || 0,
    );
    const rentPaid = parseCurrencyValue(row["Rent Paid"] || row.rent_paid || 0);
    const totalDue = parseCurrencyValue(row["Total Due"] || row.total_due || 0);

    totalExpected += monthlyRent;
    totalPaid += rentPaid;
    totalOutstanding += totalDue;
  });

  // Summary header
  const headerCell = worksheet.getCell(`A${startRow}`);
  headerCell.value = "SUMMARY";
  headerCell.font = {
    name: "Arial",
    size: 11,
    bold: true,
    color: { argb: "FF2C3E50" },
  };

  // Summary data
  const summaryData = [
    ["Total Tenants:", data.length],
    ["Total Expected:", formatCurrency(totalExpected)],
    ["Total Paid:", formatCurrency(totalPaid)],
    ["Total Outstanding:", formatCurrency(totalOutstanding)],
  ];

  summaryData.forEach((row, index) => {
    const labelCell = worksheet.getCell(`A${startRow + 1 + index}`);
    labelCell.value = row[0];
    labelCell.font = { name: "Arial", size: 9, bold: true };

    const valueCell = worksheet.getCell(`B${startRow + 1 + index}`);
    valueCell.value = row[1];
    valueCell.font = { name: "Arial", size: 9 };
  });
}

/**
 * Add payment summary to Excel
 */
function addExcelPaymentSummary(worksheet, data, startRow) {
  const totalAmount = data.reduce(
    (sum, row) => sum + parseFloat(row.amount || 0),
    0,
  );
  const completedCount = data.filter(
    (row) => row.status === "completed",
  ).length;

  // Summary header
  const headerCell = worksheet.getCell(`A${startRow}`);
  headerCell.value = "SUMMARY";
  headerCell.font = {
    name: "Arial",
    size: 11,
    bold: true,
    color: { argb: "FF2C3E50" },
  };

  // Summary data
  const summaryData = [
    ["Total Transactions:", data.length],
    ["Completed:", completedCount],
    ["Total Amount:", formatCurrency(totalAmount)],
  ];

  summaryData.forEach((row, index) => {
    const labelCell = worksheet.getCell(`A${startRow + 1 + index}`);
    labelCell.value = row[0];
    labelCell.font = { name: "Arial", size: 9, bold: true };

    const valueCell = worksheet.getCell(`B${startRow + 1 + index}`);
    valueCell.value = row[1];
    valueCell.font = { name: "Arial", size: 9 };
  });
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Parse currency string or number to numeric value
 */
function parseCurrencyValue(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    // Remove KSh, commas, spaces and parse
    const cleaned = value.replace(/[KSh,\s]/g, "").trim();
    return parseFloat(cleaned) || 0;
  }
  return 0;
}

function formatCurrency(amount) {
  // If already formatted as string with KSh, return as-is
  if (typeof amount === "string" && amount.includes("KSh")) {
    return amount;
  }
  // If it's a formatted number string like "15,000", extract the number
  if (typeof amount === "string" && amount.includes(",")) {
    const cleaned = amount.replace(/[^0-9.-]/g, "");
    const num = parseFloat(cleaned) || 0;
    return `KSh ${num.toLocaleString("en-KE")}`;
  }
  // Regular number parsing
  const num = parseFloat(amount) || 0;
  return `KSh ${num.toLocaleString("en-KE")}`;
}

function formatDate(dateString) {
  if (!dateString) return "N/A";
  try {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "N/A";
  }
}

function formatPhone(phone) {
  if (!phone) return "N/A";
  return phone.toString().replace(/^254/, "0");
}

export default exportToExcel;
