// src/utils/pdfExport.js
// ORIGINAL FILE WITH MINIMAL ADDITIONS FOR unpaid_tenants AND paid_tenants SUPPORT
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { API } from "../services/api";

// Default company branding (fallback)
const DEFAULT_COMPANY = {
  name: "Rental Management System",
  email: "",
  phone: "",
  address: "",
  logo: "",
};

// Cache for company info to avoid repeated API calls
let cachedCompanyInfo = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Cache for logo base64
let cachedLogoBase64 = null;
let cachedLogoUrl = null;

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
      console.log("📦 Using cached company info:", cachedCompanyInfo);
      return cachedCompanyInfo;
    } else {
      console.log("⚠️ Cached data is incomplete, refetching...");
    }
  }

  try {
    console.log("🔄 Fetching company info from API...");
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
      console.log("✅ Company info fetched and cached:", cachedCompanyInfo);
      return cachedCompanyInfo;
    } else {
      console.warn("⚠️ API returned unexpected structure:", response.data);
    }
  } catch (error) {
    console.error("❌ Could not fetch company info:", error.message);
  }

  console.log("⚠️ Using default company info");
  return DEFAULT_COMPANY;
};

/**
 * Create a circular image from a base64 image
 */
const createCircularImage = (base64Image) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const size = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext("2d");

        // Create circular clipping path
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // Draw image centered in the circle
        const offsetX = (img.width - size) / 2;
        const offsetY = (img.height - size) / 2;
        ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, size, size);

        // Add subtle border
        ctx.strokeStyle = "#1E40AF";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
        ctx.stroke();

        const circularDataUrl = canvas.toDataURL("image/png");
        console.log("✅ Circular logo created");
        resolve(circularDataUrl);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error("Failed to load image for circular crop"));
    };

    img.src = base64Image;
  });
};

/**
 * Convert image URL to base64 for PDF embedding
 */
const getImageAsBase64 = async (imageUrl, makeCircular = true) => {
  if (!imageUrl) {
    console.log("⚠️ No logo URL provided");
    return null;
  }

  // Return cached logo if URL matches
  if (cachedLogoBase64 && cachedLogoUrl === imageUrl) {
    console.log("✅ Using cached logo base64");
    return cachedLogoBase64;
  }

  console.log("🔄 Loading logo from:", imageUrl);

  try {
    // Method 1: Using fetch with CORS
    const response = await fetch(imageUrl, {
      mode: "cors",
      cache: "force-cache",
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();

    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });

    // Make the image circular
    let finalImage = base64;
    if (makeCircular) {
      try {
        finalImage = await createCircularImage(base64);
      } catch (circleError) {
        console.warn(
          "Could not create circular image, using original:",
          circleError,
        );
      }
    }

    cachedLogoBase64 = finalImage;
    cachedLogoUrl = imageUrl;
    console.log("✅ Logo loaded successfully via fetch");
    return finalImage;
  } catch (fetchError) {
    console.warn("Fetch method failed:", fetchError.message);

    // Method 2: Using Image element (fallback)
    try {
      return await loadImageViaElement(imageUrl, makeCircular);
    } catch (imgError) {
      console.warn("Image element method also failed:", imgError.message);
      return null;
    }
  }
};

/**
 * Alternative method to load image using Image element
 */
const loadImageViaElement = (imageUrl, makeCircular = true) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = async () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        let dataUrl = canvas.toDataURL("image/png");

        // Make circular if requested
        if (makeCircular) {
          try {
            dataUrl = await createCircularImage(dataUrl);
          } catch (circleError) {
            console.warn("Could not create circular image:", circleError);
          }
        }

        cachedLogoBase64 = dataUrl;
        cachedLogoUrl = imageUrl;
        console.log("✅ Logo loaded successfully via Image element");
        resolve(dataUrl);
      } catch (canvasError) {
        reject(canvasError);
      }
    };

    img.onerror = () => {
      reject(new Error("Image failed to load"));
    };

    img.src =
      imageUrl + (imageUrl.includes("?") ? "&" : "?") + "t=" + Date.now();
  });
};

/**
 * Add company header with logo to PDF document
 */
const addCompanyHeader = async (doc, companyInfo, pageWidth) => {
  let yPos = 10;
  const centerX = pageWidth / 2;
  let logoAdded = false;

  // Try to add logo
  if (companyInfo.logo) {
    try {
      console.log("🖼️ Attempting to add logo to PDF...");
      const logoBase64 = await getImageAsBase64(companyInfo.logo, true);

      if (logoBase64) {
        // Logo dimensions (circular, so width = height)
        const logoSize = 28;
        const logoX = centerX - logoSize / 2;

        // Add the circular logo
        doc.addImage(logoBase64, "PNG", logoX, yPos, logoSize, logoSize);

        // Add spacing after logo (increased from 4 to 8)
        yPos += logoSize + 8;
        logoAdded = true;
        console.log("✅ Circular logo added to PDF");
      }
    } catch (error) {
      console.warn("⚠️ Could not add logo to PDF:", error.message);
    }
  }

  // If no logo, add some spacing
  if (!logoAdded) {
    yPos += 8;
  }

  // Company Name (with extra spacing from logo)
  doc.setFontSize(18);
  doc.setTextColor(30, 64, 175); // Blue color
  doc.setFont("helvetica", "bold");
  doc.text(companyInfo.name || DEFAULT_COMPANY.name, centerX, yPos, {
    align: "center",
  });
  yPos += 8; // Increased spacing after company name

  // Contact Information
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.setFont("helvetica", "normal");

  // Address line
  if (companyInfo.address) {
    doc.text(companyInfo.address, centerX, yPos, { align: "center" });
    yPos += 5;
  }

  // Phone and Email line
  const contactParts = [];
  if (companyInfo.phone) contactParts.push(`Tel: ${companyInfo.phone}`);
  if (companyInfo.email) contactParts.push(`Email: ${companyInfo.email}`);

  if (contactParts.length > 0) {
    doc.text(contactParts.join("  |  "), centerX, yPos, { align: "center" });
    yPos += 5;
  }

  // Divider line (with more spacing)
  yPos += 4;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(14, yPos, pageWidth - 14, yPos);
  yPos += 6;

  return yPos;
};

/**
 * Add report title and metadata
 */
const addReportMetadata = (doc, title, user, filters, dataLength, startY) => {
  let yPos = startY;
  const pageWidth = doc.internal.pageSize.getWidth();

  // Report Title
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text(title, pageWidth / 2, yPos, { align: "center" });
  yPos += 10;

  // Metadata
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.setFont("helvetica", "normal");

  const userName =
    user?.first_name && user?.last_name
      ? `${user.first_name} ${user.last_name}`
      : "System User";
  const userRole = user?.role ? `(${user.role})` : "";

  // Left side metadata
  doc.text(`Generated by: ${userName} ${userRole}`, 14, yPos);

  // Right side - date
  const dateStr = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.text(`Date: ${dateStr}`, pageWidth - 14, yPos, { align: "right" });
  yPos += 5;

  // Records count
  doc.text(`Total Records: ${dataLength}`, 14, yPos);

  // Date range filter if present
  if (filters?.startDate || filters?.endDate) {
    const dateRange = `Period: ${filters.startDate || "Start"} to ${filters.endDate || "Present"}`;
    doc.text(dateRange, pageWidth - 14, yPos, { align: "right" });
  }
  yPos += 5;

  // Month filter if present
  if (filters?.month) {
    doc.text(`Month: ${filters.month}`, 14, yPos);
    yPos += 5;
  }

  // Search filter if present
  if (filters?.search) {
    doc.text(`Search Filter: "${filters.search}"`, 14, yPos);
    yPos += 5;
  }

  // Property filter if present
  if (filters?.propertyId) {
    doc.text(`Property Filter Applied`, 14, yPos);
    yPos += 5;
  }

  yPos += 3;

  return yPos;
};

/**
 * Add footer to each page
 */
const addPageFooter = (doc, companyName, pageNumber, totalPages) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.setFont("helvetica", "italic");

  // Company name on left
  doc.text(`${companyName} - Confidential`, 14, pageHeight - 10);

  // Page number on right
  doc.text(
    `Page ${pageNumber} of ${totalPages}`,
    pageWidth - 14,
    pageHeight - 10,
    { align: "right" },
  );
};

/**
 * Main PDF export function
 */
export const exportToPDF = async (config) => {
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
    console.log("📄 Starting PDF export...");
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

    console.log("📋 Final company info for export:", companyInfo);

    // Use landscape for reports with many columns
    const useLandscape = [
      "unpaid_tenants",
      "paid_tenants",
      "expenses",
      "water",
      "sms",
      "messaging",
      "complaints",
      "properties",
    ].includes(reportType);
    const doc = new jsPDF(useLandscape ? "landscape" : "portrait");
    const pageWidth = doc.internal.pageSize.getWidth();

    // Add company header with logo
    let yPos = await addCompanyHeader(doc, companyInfo, pageWidth);

    // Add report title and metadata
    yPos = addReportMetadata(doc, title, user, filters, data.length, yPos);

    // Prepare table data
    const { headers, rows, columnStyles } = prepareTableData(reportType, data);

    // Calculate totals for financial reports
    const totals = totalsOverride || calculateTotals(reportType, data);

    // Store company name for footer
    const companyName = companyInfo.name || DEFAULT_COMPANY.name;

    // Generate table
    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: yPos,
      margin: { left: 14, right: 14, bottom: 25 },
      headStyles: {
        fillColor: [30, 64, 175],
        textColor: [255, 255, 255],
        fontSize: useLandscape ? 8 : 9,
        fontStyle: "bold",
        halign: "center",
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: useLandscape ? 7 : 8,
        cellPadding: 2.5,
        lineColor: [220, 220, 220],
        lineWidth: 0.1,
        overflow: "linebreak",
        valign: "top",
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: columnStyles,
      theme: "striped",
      showHead: "everyPage",
      tableWidth: "auto",
      horizontalPageBreak: true,
      horizontalPageBreakRepeat: 0,
      didDrawPage: (data) => {
        const pageCount = doc.internal.getNumberOfPages();
        addPageFooter(doc, companyName, data.pageNumber, pageCount);
      },
    });

    // Add totals row if applicable
    if (totals) {
      const finalY = doc.lastAutoTable?.finalY || 200;

      if (finalY < doc.internal.pageSize.getHeight() - 40) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 64, 175);

        let totalY = finalY + 8;

        Object.entries(totals).forEach(([label, value]) => {
          doc.text(`${label}: ${value}`, 14, totalY);
          totalY += 6;
        });
      }
    }

    // Generate filename
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${reportType}_report_${timestamp}.pdf`;

    // Save the PDF
    doc.save(filename);

    console.log("✅ PDF exported successfully:", filename);
    return true;
  } catch (error) {
    console.error("❌ PDF export failed:", error);
    alert(`Export failed: ${error.message}`);
    return false;
  }
};

/* ---------------- Helper Functions ---------------- */

/**
 * Parse currency value from various formats
 * Handles: "KSh 15,000", "15,000", 15000, "15000"
 * ADDED: This is a new helper to handle pre-formatted currency strings
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
 * Format currency - handles pre-formatted strings and raw numbers
 * UPDATED: Now handles pre-formatted strings from PaymentManagement component
 */
const formatCurrency = (amount) => {
  // If already formatted as string with KSh, return as-is (just the number part)
  if (typeof amount === "string" && amount.includes("KSh")) {
    return amount.replace("KSh", "").trim();
  }
  // If it's a formatted number string like "15,000", return as-is
  if (typeof amount === "string" && amount.includes(",")) {
    return amount;
  }
  const num = parseFloat(amount) || 0;
  return num.toLocaleString("en-KE");
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

const formatPhone = (phone) => {
  if (!phone) return "N/A";
  if (phone.startsWith("254")) {
    return "0" + phone.substring(3);
  }
  return phone;
};

const capitalizeFirst = (str) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Detect if data is in transformed format (from PaymentManagement component)
 * ADDED: Helper to detect pre-transformed data
 */
const isTransformedData = (data) => {
  if (!data || data.length === 0) return false;
  const firstItem = data[0];
  // Check for transformed keys (readable format)
  return (
    firstItem["Tenant Name"] !== undefined ||
    firstItem["Monthly Rent"] !== undefined ||
    firstItem["Total Due"] !== undefined
  );
};

/**
 * Prepare table data based on report type
 */
const prepareTableData = (reportType, data) => {
  let headers = [];
  let rows = [];
  let columnStyles = {};

  switch (reportType) {
    case "tenants":
      headers = [
        "#",
        "Tenant Name",
        "Phone",
        "Property",
        "Unit",
        "Rent (KSh)",
        "Status",
      ];
      rows = data.map((item, index) => [
        index + 1,
        `${item.first_name || ""} ${item.last_name || ""}`.trim() ||
          item.name ||
          "N/A",
        formatPhone(item.phone_number),
        item.property_name || "N/A",
        item.unit_code || "N/A",
        formatCurrency(item.rent_amount || item.monthly_rent),
        item.is_active ? "Active" : "Inactive",
      ]);
      columnStyles = {
        0: { halign: "center", cellWidth: 10 },
        5: { halign: "right" },
        6: { halign: "center" },
      };
      break;

    // ==================== ADDED: Unpaid Tenants Report ====================
    case "unpaid_tenants":
      if (isTransformedData(data)) {
        // Data from PaymentManagement component (pre-formatted with readable keys)
        headers = [
          "#",
          "Tenant Name",
          "Phone",
          "Property",
          "Unit",
          "Monthly Rent",
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
          item["Monthly Rent"] || "KSh 0",
          item["Rent Due"] || "KSh 0",
          item["Water Bill"] || "KSh 0",
          item["Arrears"] || "KSh 0",
          item["Total Due"] || "KSh 0",
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
          "Rent Due",
          "Water Due",
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
          formatCurrency(item.monthly_rent),
          formatCurrency(item.rent_due),
          formatCurrency(item.water_due || item.water_bill),
          formatCurrency(item.arrears_balance || item.arrears),
          formatCurrency(item.total_due),
        ]);
      }
      columnStyles = {
        0: { halign: "center", cellWidth: 10 },
        5: { halign: "right" },
        6: { halign: "right" },
        7: { halign: "right" },
        8: { halign: "right" },
        9: { halign: "right" },
      };
      break;

    // ==================== ADDED: Paid Tenants Report ====================
    case "paid_tenants":
      if (isTransformedData(data)) {
        // Data from PaymentManagement component (pre-formatted with readable keys)
        headers = [
          "#",
          "Tenant Name",
          "Phone",
          "Property",
          "Unit",
          "Monthly Rent",
          "Rent Paid",
          "Advance",
          "Status",
        ];
        rows = data.map((item, index) => [
          index + 1,
          item["Tenant Name"] || "N/A",
          item["Phone"] || "N/A",
          item["Property"] || "N/A",
          item["Unit"] || "N/A",
          item["Monthly Rent"] || "KSh 0",
          item["Rent Paid"] || "KSh 0",
          item["Advance"] || "KSh 0",
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
          "Amount Paid",
          "Advance",
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
          formatCurrency(item.monthly_rent),
          formatCurrency(item.rent_paid || item.amount_paid),
          formatCurrency(item.advance_amount || item.advance_payment),
          item.payment_status || "Paid",
        ]);
      }
      columnStyles = {
        0: { halign: "center", cellWidth: 10 },
        5: { halign: "right" },
        6: { halign: "right" },
        7: { halign: "right" },
        8: { halign: "center" },
      };
      break;

    case "payments":
      headers = [
        "#",
        "Receipt No.",
        "Tenant",
        "Amount (KSh)",
        "Month",
        "Status",
        "Date",
      ];
      rows = data.map((item, index) => [
        index + 1,
        item.mpesa_receipt_number || item.id?.substring(0, 8) || "N/A",
        item.tenant_name ||
          `${item.first_name || ""} ${item.last_name || ""}`.trim() ||
          "N/A",
        formatCurrency(item.amount),
        formatMonth(item.payment_month),
        item.status || "Pending",
        formatDate(item.created_at || item.payment_date),
      ]);
      columnStyles = {
        0: { halign: "center", cellWidth: 10 },
        3: { halign: "right" },
        5: { halign: "center" },
        6: { halign: "center" },
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
        formatCurrency(item.amount),
        item.mpesa_receipt_number || item.mpesa_transaction_id || "N/A",
        formatMonth(item.payment_month),
        item.payment_method || "N/A",
        item.status || "N/A",
      ]);
      columnStyles = {
        0: { halign: "center", cellWidth: 10 },
        2: { halign: "right" },
        6: { halign: "center" },
      };
      break;

    case "properties":
      headers = [
        "#",
        "Code",
        "Property Name",
        "Address",
        "Total Units",
        "Occupied",
        "Available",
        "Occupancy",
      ];
      rows = data.map((item, index) => {
        const total = item.total_units || item.unit_count || 0;
        const occupied = item.occupied_units || 0;
        const available =
          item.available_units || item.available_units_count || 0;
        const occupancyRate =
          total > 0 ? Math.round((occupied / total) * 100) : 0;

        return [
          index + 1,
          item.property_code || "N/A",
          item.name || "N/A",
          item.address || "N/A",
          total,
          occupied,
          available,
          `${occupancyRate}%`,
        ];
      });
      columnStyles = {
        0: { halign: "center", cellWidth: 10 },
        4: { halign: "center" },
        5: { halign: "center" },
        6: { halign: "center" },
        7: { halign: "center" },
      };
      break;

    case "complaints":
      headers = [
        "#",
        "Title",
        "Property",
        "Unit",
        "Priority",
        "Status",
        "Date",
      ];
      rows = data.map((item, index) => [
        index + 1,
        item.title || "N/A",
        item.property_name || "N/A",
        item.unit_code || "N/A",
        capitalizeFirst(item.priority) || "Medium",
        capitalizeFirst(item.status) || "Open",
        formatDate(item.created_at || item.raised_at),
      ]);
      columnStyles = {
        0: { halign: "center", cellWidth: 10 },
        4: { halign: "center" },
        5: { halign: "center" },
        6: { halign: "center" },
      };
      break;

    case "water":
      headers = [
        "#",
        "Tenant",
        "Phone",
        "Property",
        "Unit",
        "Amount (KSh)",
        "Bill Month",
        "Status",
        "Notes",
        "Created",
      ];
      rows = data.map((item, index) => [
        index + 1,
        item.tenant_name ||
          `${item.first_name || ""} ${item.last_name || ""}`.trim() ||
          "N/A",
        formatPhone(item.phone_number),
        item.property_name || "N/A",
        item.unit_code || "N/A",
        formatCurrency(item.amount),
        formatMonth(item.bill_month),
        item.status || "Billed",
        item.notes || "N/A",
        formatDate(item.created_at),
      ]);
      columnStyles = {
        0: { halign: "center", cellWidth: 10 },
        5: { halign: "right" },
        6: { halign: "center" },
        7: { halign: "center" },
      };
      break;

    case "sms":
    case "messaging":
      headers = [
        "#",
        "Channel",
        "Recipient",
        "Message",
        "Type",
        "Status",
        "Date",
      ];
      rows = data.map((item, index) => [
        index + 1,
        item.channel || "SMS",
        formatPhone(item.recipient_phone || item.phone_number),
        item.message || "N/A",
        item.message_type || item.template_name || "General",
        capitalizeFirst(item.status) || "Pending",
        formatDate(item.created_at || item.sent_at),
      ]);
      columnStyles = {
        0: { halign: "center", cellWidth: 10 },
        1: { halign: "center" },
        5: { halign: "center" },
        6: { halign: "center" },
      };
      break;

    case "revenue":
      headers = [
        "#",
        "Month",
        "Total Revenue (KSh)",
        "Payments",
        "Properties",
        "Tenants",
        "Avg Payment (KSh)",
      ];
      rows = data.map((item, index) => [
        index + 1,
        formatMonth(item.month),
        formatCurrency(item.total_revenue),
        item.payment_count || 0,
        item.property_count || 0,
        item.tenant_count || 0,
        formatCurrency(item.average_payment),
      ]);
      columnStyles = {
        0: { halign: "center", cellWidth: 10 },
        1: { halign: "center" },
        2: { halign: "right" },
        3: { halign: "center" },
        4: { halign: "center" },
        5: { halign: "center" },
        6: { halign: "right" },
      };
      break;

    case "expenses":
      headers = [
        "#",
        "Date",
        "Category",
        "Description",
        "Property",
        "Amount (KSh)",
        "Payment",
        "Status",
      ];
      rows = data.map((item, index) => [
        index + 1,
        formatDate(item.expense_date),
        item.category || "N/A",
        item.description || "N/A",
        item.property_name || "General",
        formatCurrency(item.amount),
        capitalizeFirst(item.payment_method) || "Cash",
        capitalizeFirst(item.status) || "Pending",
      ]);
      columnStyles = {
        0: { halign: "center", cellWidth: 10 },
        1: { halign: "center" },
        5: { halign: "right" },
        7: { halign: "center" },
      };
      break;

    default:
      headers = ["#", "Name", "Description", "Date", "Amount (KSh)", "Status"];
      rows = data.map((item, index) => [
        index + 1,
        item.name || item.first_name || item.tenant_name || item.title || "N/A",
        item.description || item.notes || "N/A",
        formatDate(item.created_at),
        formatCurrency(item.amount),
        capitalizeFirst(item.status) || "Active",
      ]);
      columnStyles = {
        0: { halign: "center", cellWidth: 10 },
        4: { halign: "right" },
        5: { halign: "center" },
      };
  }

  rows = rows.map((row) => {
    const paddedRow = [...row];
    while (paddedRow.length < headers.length) {
      paddedRow.push("N/A");
    }
    return paddedRow.slice(0, headers.length);
  });

  return { headers, rows, columnStyles };
};

/**
 * Calculate totals for financial reports
 */
const calculateTotals = (reportType, data) => {
  switch (reportType) {
    // ==================== ADDED: Unpaid Tenants Totals ====================
    case "unpaid_tenants": {
      let totalRentDue = 0,
        totalWaterDue = 0,
        totalArrears = 0,
        totalDue = 0;

      if (isTransformedData(data)) {
        data.forEach((item) => {
          totalRentDue += parseCurrencyValue(item["Rent Due"]);
          totalWaterDue += parseCurrencyValue(item["Water Bill"]);
          totalArrears += parseCurrencyValue(item["Arrears"]);
          totalDue += parseCurrencyValue(item["Total Due"]);
        });
      } else {
        data.forEach((item) => {
          totalRentDue += parseCurrencyValue(item.rent_due);
          totalWaterDue += parseCurrencyValue(
            item.water_due || item.water_bill,
          );
          totalArrears += parseCurrencyValue(
            item.arrears_balance || item.arrears,
          );
          totalDue += parseCurrencyValue(item.total_due);
        });
      }

      return {
        "Total Rent Due": `KSh ${totalRentDue.toLocaleString()}`,
        "Total Water Due": `KSh ${totalWaterDue.toLocaleString()}`,
        "Total Arrears": `KSh ${totalArrears.toLocaleString()}`,
        "Grand Total Due": `KSh ${totalDue.toLocaleString()}`,
        "Unpaid Tenants": `${data.length}`,
      };
    }

    // ==================== ADDED: Paid Tenants Totals ====================
    case "paid_tenants": {
      let totalPaid = 0,
        totalAdvance = 0,
        tenantsWithAdvance = 0;

      if (isTransformedData(data)) {
        data.forEach((item) => {
          totalPaid += parseCurrencyValue(item["Rent Paid"]);
          const advance = parseCurrencyValue(item["Advance"]);
          totalAdvance += advance;
          if (advance > 0) tenantsWithAdvance++;
        });
      } else {
        data.forEach((item) => {
          totalPaid += parseCurrencyValue(item.rent_paid || item.amount_paid);
          const advance = parseCurrencyValue(
            item.advance_amount || item.advance_payment,
          );
          totalAdvance += advance;
          if (advance > 0) tenantsWithAdvance++;
        });
      }

      return {
        "Total Paid": `KSh ${totalPaid.toLocaleString()}`,
        "Total Advance": `KSh ${totalAdvance.toLocaleString()}`,
        "Paid Tenants": `${data.length}`,
        "With Advance": `${tenantsWithAdvance} tenant(s)`,
      };
    }

    case "payments":
      const totalPayments = data.reduce(
        (sum, item) => sum + (parseFloat(item.amount) || 0),
        0,
      );
      const completedPayments = data.filter(
        (item) => item.status === "completed",
      ).length;
      return {
        "Total Amount": `KSh ${totalPayments.toLocaleString()}`,
        "Completed Payments": `${completedPayments} of ${data.length}`,
      };

    case "revenue":
      const totalRevenue = data.reduce(
        (sum, item) => sum + (parseFloat(item.total_revenue) || 0),
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
          sum + (parseFloat(item.rent_amount || item.monthly_rent) || 0),
        0,
      );
      const activeTenants = data.filter((item) => item.is_active).length;
      return {
        "Total Monthly Rent": `KSh ${totalRent.toLocaleString()}`,
        "Active Tenants": `${activeTenants} of ${data.length}`,
      };

    case "water":
      const totalWater = data.reduce(
        (sum, item) => sum + (parseFloat(item.amount) || 0),
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
        (sum, item) => sum + (parseFloat(item.amount) || 0),
        0,
      );
      const approvedExpenses = data.filter(
        (item) => item.status === "approved",
      );
      const approvedTotal = approvedExpenses.reduce(
        (sum, item) => sum + (parseFloat(item.amount) || 0),
        0,
      );
      const pendingCount = data.filter(
        (item) => item.status === "pending",
      ).length;
      return {
        "Total Expenses": `KSh ${totalExpenses.toLocaleString()}`,
        "Approved Total": `KSh ${approvedTotal.toLocaleString()}`,
        "Pending Approval": `${pendingCount} expense(s)`,
      };

    case "sms":
    case "messaging":
      const sentCount = data.filter((item) => item.status === "sent").length;
      const failedCount = data.filter(
        (item) => item.status === "failed",
      ).length;
      const pendingSmsCount = data.filter(
        (item) => item.status === "pending",
      ).length;
      return {
        "Total Messages": `${data.length}`,
        Sent: `${sentCount}`,
        Failed: `${failedCount}`,
        Pending: `${pendingSmsCount}`,
      };

    default:
      return null;
  }
};

/**
 * Clear cached company info (call when company info is updated)
 */
export const clearCompanyInfoCache = () => {
  cachedCompanyInfo = null;
  cacheTimestamp = null;
  cachedLogoBase64 = null;
  cachedLogoUrl = null;
  console.log("🗑️ Company info cache cleared");
};

/**
 * Pre-load company logo (call on app init for faster exports)
 */
export const preloadCompanyLogo = async () => {
  try {
    const companyInfo = await fetchCompanyInfo();
    if (companyInfo.logo) {
      await getImageAsBase64(companyInfo.logo, true);
      console.log("✅ Company logo pre-loaded");
    }
  } catch (error) {
    console.warn("Could not pre-load company logo:", error);
  }
};

/**
 * Debug helper - check if autoTable is working
 */
export const checkAutoTable = () => {
  try {
    const doc = new jsPDF();
    autoTable(doc, { head: [["Test"]], body: [["Test"]] });
    console.log("✅ autoTable is working correctly");
    return true;
  } catch (error) {
    console.error("❌ autoTable check failed:", error);
    return false;
  }
};
