const axios = require("axios");
const db = require("../config/database");

const MAX_QUESTION_LENGTH = 600;
const MAX_HISTORY_ITEMS = 4;
const MAX_HISTORY_ITEM_LENGTH = 300;
const MAX_DYNAMIC_ROWS = 200;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DANGEROUS_SQL_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "truncate",
  "create",
  "grant",
  "revoke",
  "comment",
  "vacuum",
  "refresh",
  "merge",
  "copy",
  "call",
  "do",
  "execute",
];
const DEFAULT_ANALYST_TABLES = [
  "users",
  "tenants",
  "properties",
  "property_units",
  "tenant_allocations",
  "rent_payments",
  "water_bills",
  "complaints",
  "expenses",
  "notifications",
  "agent_property_assignments",
  "admin_settings",
  "chat_conversations",
  "chat_messages",
  "chat_participants",
];

const MUTATION_KEYWORDS = [
  "update",
  "change",
  "delete",
  "remove",
  "set",
  "edit",
  "fix",
  "reconcile",
  "create",
  "insert",
  "approve",
  "reject",
  "assign",
  "deactivate",
  "activate",
];

const SEARCH_STOPWORDS = new Set([
  "hello",
  "hi",
  "hey",
  "what",
  "which",
  "who",
  "where",
  "when",
  "why",
  "how",
  "show",
  "tell",
  "give",
  "please",
  "kindly",
  "tenant",
  "tenants",
  "property",
  "properties",
  "unit",
  "units",
  "payment",
  "payments",
  "complaint",
  "complaints",
  "with",
  "from",
  "into",
  "about",
  "this",
  "that",
  "their",
  "there",
  "they",
  "have",
  "has",
  "had",
  "the",
  "and",
  "for",
  "are",
  "was",
  "were",
  "due",
  "balance",
  "rent",
  "water",
  "arrears",
  "paid",
  "missing",
  "unpaid",
  "outstanding",
  "find",
  "out",
  "far",
]);
const MONTH_REGEX = /\b(20\d{2})[-\/](0[1-9]|1[0-2])\b/;
const PAYMENT_STATUS_KEYWORDS = ["pending", "completed", "failed", "overdue"];
const COMPLAINT_STATUS_KEYWORDS = ["open", "in_progress", "resolved", "closed"];

const ensureSafeQuestion = (question) => {
  const normalized = String(question || "").trim();
  if (!normalized) return "";
  return normalized.slice(0, MAX_QUESTION_LENGTH);
};

const normalizeConversationId = (conversationId) => {
  const value = String(conversationId || "").trim();
  if (!value || !UUID_REGEX.test(value)) return null;
  return value;
};

const isReadOnlySelectSql = (sql) => {
  const normalized = String(sql || "").trim().toLowerCase();
  if (!normalized) return false;
  if (!(normalized.startsWith("select") || normalized.startsWith("with"))) {
    return false;
  }

  const semicolonCount = (normalized.match(/;/g) || []).length;
  if (semicolonCount > 1) return false;
  if (semicolonCount === 1 && !normalized.endsWith(";")) return false;

  return !DANGEROUS_SQL_KEYWORDS.some((kw) =>
    new RegExp(`\\b${kw}\\b`, "i").test(normalized),
  );
};

const ensureLimitedSql = (sql) => {
  const trimmed = String(sql || "").trim().replace(/;+\s*$/, "");
  if (!/\blimit\s+\d+\b/i.test(trimmed)) {
    return `${trimmed}\nLIMIT ${MAX_DYNAMIC_ROWS}`;
  }
  return trimmed;
};

const extractJsonObject = (text) => {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (err) {
    // continue
  }

  const fencedMatch = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch (err) {
      // continue
    }
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const maybe = raw.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(maybe);
    } catch (err) {
      return null;
    }
  }

  return null;
};

const getSchemaContext = async () => {
  const columnsResult = await db.query(
    `
      SELECT
        c.table_name,
        c.column_name,
        c.data_type
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = ANY($1::text[])
      ORDER BY c.table_name, c.ordinal_position
    `,
    [DEFAULT_ANALYST_TABLES],
  );

  let routinesResult = [];
  try {
    const routines = await db.query(
      `
        SELECT
          routine_name,
          routine_type
        FROM information_schema.routines
        WHERE specific_schema = 'public'
        ORDER BY routine_name
        LIMIT 40
      `,
    );
    routinesResult = routines.rows || [];
  } catch (error) {
    routinesResult = [];
  }

  let triggersResult = [];
  try {
    const triggers = await db.query(
      `
        SELECT
          event_object_table AS table_name,
          trigger_name,
          event_manipulation
        FROM information_schema.triggers
        WHERE trigger_schema = 'public'
        ORDER BY event_object_table, trigger_name
        LIMIT 80
      `,
    );
    triggersResult = triggers.rows || [];
  } catch (error) {
    triggersResult = [];
  }

  const grouped = {};
  for (const row of columnsResult.rows) {
    if (!grouped[row.table_name]) grouped[row.table_name] = [];
    grouped[row.table_name].push(`${row.column_name}:${row.data_type}`);
  }

  const lines = Object.entries(grouped).map(
    ([table, cols]) => `${table}(${cols.slice(0, 40).join(", ")})`,
  );
  const routinesLine = `routines(${routinesResult
    .map((r) => `${r.routine_name}:${r.routine_type}`)
    .join(", ")})`;
  const triggersLine = `triggers(${triggersResult
    .map((t) => `${t.table_name}.${t.trigger_name}:${t.event_manipulation}`)
    .join(", ")})`;

  return `${lines.join("\n")}\n${routinesLine}\n${triggersLine}`.slice(0, 16000);
};

const normalizeHistory = (history) => {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-MAX_HISTORY_ITEMS)
    .map((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: String(item?.content || "").slice(0, MAX_HISTORY_ITEM_LENGTH),
    }))
    .filter((item) => item.content.trim().length > 0);
};

const resolveQuestionContext = (question, history) => {
  const q = String(question || "").trim();
  const lower = q.toLowerCase();
  const isCountCorrection =
    /\bnot\s+\d{1,3}\b/i.test(q) ||
    /\bonly\s+\d{1,3}\b/i.test(q) ||
    /\b(?:you gave|you gave me|you gave us|got|received)\s+\d{1,3}\b/i.test(q);
  const isVagueFollowUp =
    q.length < 70 &&
    (lower.includes("find it") ||
      lower.includes("that") ||
      lower.includes("this") ||
      lower.includes("it") ||
      lower.includes("same") ||
      lower.includes("continue") ||
      lower.includes("not ") ||
      lower.includes("only "));

  if (!(isVagueFollowUp || isCountCorrection) || !Array.isArray(history) || history.length === 0) {
    return q;
  }

  const previousUser = [...history]
    .reverse()
    .find((item) => item.role === "user" && item.content?.trim());
  if (!previousUser) return q;

  return `${previousUser.content.trim()} ${q}`.trim();
};

const isMutationIntent = (question) => {
  const q = question.toLowerCase();
  return MUTATION_KEYWORDS.some((word) => q.includes(word));
};

const extractSearchPatterns = (question) => {
  const tokens = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 3 && !SEARCH_STOPWORDS.has(token) && !/^\d{1,2}$/.test(token),
    )
    .slice(0, 4);

  if (tokens.length === 0) return ["%%"];
  return tokens.map((token) => `%${token}%`);
};

const extractMonthFromQuestion = (question) => {
  const match = String(question || "").match(MONTH_REGEX);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
};

const toMonthDate = (monthValue) => {
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) return null;
  return `${monthValue}-01`;
};

const extractTopLimit = (question, fallback = 30, max = 200) => {
  const text = String(question || "").toLowerCase();
  const match = text.match(/\b(?:top|first|latest|last)\s+(\d{1,3})\b/);
  if (!match) return fallback;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const extractCorrectionTargetCount = (question) => {
  const q = String(question || "").toLowerCase();
  const paired = q.match(/\bnot\s+(\d{1,3})\b[\s\S]{0,40}\bonly\s+(\d{1,3})\b/);
  if (paired?.[1]) {
    const expected = Number(paired[1]);
    if (Number.isFinite(expected) && expected > 0) return Math.min(expected, 200);
  }

  const want = q.match(/\b(?:need|want|expect|expected)\s+(\d{1,3})\b/);
  if (want?.[1]) {
    const expected = Number(want[1]);
    if (Number.isFinite(expected) && expected > 0) return Math.min(expected, 200);
  }

  return null;
};

const extractKeywordStatus = (question, allowedStatuses) => {
  const lower = String(question || "").toLowerCase();
  return allowedStatuses.find((status) => lower.includes(status)) || null;
};

const extractPriority = (question) => {
  const q = String(question || "").toLowerCase();
  if (
    q.includes("high priority") ||
    q.includes("priority high") ||
    q.includes("priority: high")
  ) {
    return "high";
  }
  if (
    q.includes("medium priority") ||
    q.includes("priority medium") ||
    q.includes("priority: medium")
  ) {
    return "medium";
  }
  if (
    q.includes("low priority") ||
    q.includes("priority low") ||
    q.includes("priority: low")
  ) {
    return "low";
  }
  return null;
};

const extractSearchPhrase = (question) => {
  const text = String(question || "").trim();
  const quoted = text.match(/"([^"]{2,80})"/);
  if (quoted?.[1]) return quoted[1].trim();

  // Only treat the prompt as search text when user explicitly asks to search/find by a term.
  const hasExplicitSearchIntent =
    /\b(search|find|lookup|named|called|phone|id|unit|receipt)\b/i.test(text);
  if (!hasExplicitSearchIntent) return "";

  const patterns = extractSearchPatterns(text);
  if (patterns.length === 1 && patterns[0] === "%%") return "";
  return patterns
    .map((pattern) => pattern.replace(/%/g, ""))
    .join(" ")
    .trim();
};

const getMonthRange = (month) => {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return { startDate: null, endDate: null };
  }
  const [year, monthPart] = month.split("-").map(Number);
  const start = new Date(year, monthPart - 1, 1);
  const end = new Date(year, monthPart, 0);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
};

const resolvePropertyFromQuestion = async ({ user, question }) => {
  const patterns = extractSearchPatterns(question);
  if (patterns.length === 1 && patterns[0] === "%%") {
    return null;
  }

  let query = `
    SELECT p.id, p.name
    FROM properties p
    WHERE (
      p.name ILIKE ANY($1::text[])
      OR p.property_code ILIKE ANY($1::text[])
      OR p.address ILIKE ANY($1::text[])
      OR p.town ILIKE ANY($1::text[])
      OR p.county ILIKE ANY($1::text[])
    )
  `;
  const params = [patterns];

  if (user.role === "agent") {
    query += `
      AND EXISTS (
        SELECT 1
        FROM agent_property_assignments apa
        WHERE apa.agent_id = $2
          AND apa.property_id = p.id
          AND apa.is_active = true
      )
    `;
    params.push(user.id);
  }

  query += " ORDER BY p.name ASC LIMIT 1";
  const result = await db.query(query, params);
  return result.rows[0] || null;
};

const ROUTER_ACTIONS = [
  "route_tenant_payment_status",
  "route_payments",
  "route_tenants",
  "route_properties",
  "route_complaints",
  "route_water_bills",
  "route_water_profitability",
  "route_dashboard_comprehensive",
  "unpaid_tenants_property_month",
  "monthly_property_arrears",
  "outstanding_rent",
  "complaints",
  "properties",
  "dashboard",
  "tenant_or_payments",
  "tenant",
  "dynamic_sql",
];

const buildRouterMessages = ({ user, question, history }) => {
  const routeCatalog = `
Available actions:
- route_tenant_payment_status: mirrors /api/payments/tenant-status for who owes/paid/dues per tenant.
- route_payments: mirrors /api/payments for payment records and filters.
- route_tenants: mirrors /api/tenants for tenant lists/search by tenant or property context.
- route_properties: mirrors /api/properties for property/unit occupancy overviews.
- route_complaints: mirrors /api/complaints for complaint status/priority tracking.
- route_water_bills: mirrors /api/water-bills for billed water records.
- route_water_profitability: mirrors /api/water-bills/profitability for billed vs collected vs expense.
- route_dashboard_comprehensive: mirrors /api/admin/dashboard/comprehensive-stats for broad dashboard KPIs.
- unpaid_tenants_property_month: focused list of unpaid tenants in a property this month.
- monthly_property_arrears: arrears by property.
- outstanding_rent: global arrears summary.
- complaints/properties/dashboard/tenant_or_payments/tenant: legacy focused tools.
- dynamic_sql: only when no route/tool can answer accurately.
`;

  const historySnippet = history
    .slice(-4)
    .map((h) => `${h.role}: ${h.content}`)
    .join("\n");

  return [
    {
      role: "system",
      content:
        "You are a routing planner for a rental ops AI assistant. Pick ONE best action. Prefer route_* actions when possible. Use dynamic_sql only as last resort.",
    },
    {
      role: "system",
      content:
        `Return STRICT JSON only with keys: action, confidence, rationale, response_mode, hints.\n` +
        `action must be one of: ${ROUTER_ACTIONS.join(", ")}\n` +
        `confidence must be 0..1.\n` +
        `response_mode: \"summary\" or \"list\".\n` +
        `hints: object with optional fields property, tenant, month, status, priority, limit.\n` +
        `Never ask for all data unless explicitly requested.\n` +
        routeCatalog,
    },
    {
      role: "user",
      content:
        `User role: ${user.role}\n` +
        `User question: ${question}\n` +
        `Recent context:\n${historySnippet || "none"}`,
    },
  ];
};

const callGroqToolRouter = async ({ user, question, history }) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { success: false, error: "GROQ_API_KEY is not configured." };
  }

  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  const baseURL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

  const response = await axios.post(
    `${baseURL}/chat/completions`,
    {
      model,
      temperature: 0.0,
      max_tokens: 260,
      messages: buildRouterMessages({ user, question, history }),
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    },
  );

  const content = response.data?.choices?.[0]?.message?.content || "";
  const parsed = extractJsonObject(content);
  const action = String(parsed?.action || "").trim();
  const confidence = Number(parsed?.confidence);
  const responseMode = String(parsed?.response_mode || "summary").trim();
  const hints = typeof parsed?.hints === "object" && parsed.hints ? parsed.hints : {};

  if (!ROUTER_ACTIONS.includes(action)) {
    return { success: false, error: "Router returned invalid action." };
  }

  return {
    success: true,
    data: {
      action,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
      response_mode: responseMode === "list" ? "list" : "summary",
      hints,
      usage: response.data?.usage || null,
    },
  };
};

const heuristicRouter = (question) => {
  const lower = String(question || "").toLowerCase();
  const correctionTarget = extractCorrectionTargetCount(question);
  const action = chooseTool(question);
  const isListCorrection =
    correctionTarget &&
    (lower.includes("tenant") ||
      lower.includes("list") ||
      lower.includes("not ") ||
      lower.includes("only "));

  return {
    action: isListCorrection ? "route_tenants" : action,
    confidence: 0.55,
    response_mode: /list|all|show/i.test(String(question || "")) ? "list" : "summary",
    hints: correctionTarget ? { limit: correctionTarget } : {},
  };
};

const buildQuestionWithHints = (question, hints = {}) => {
  const parts = [String(question || "").trim()];
  if (hints.property) parts.push(`property ${hints.property}`);
  if (hints.tenant) parts.push(`tenant ${hints.tenant}`);
  if (hints.month) parts.push(`month ${hints.month}`);
  if (hints.status) parts.push(`status ${hints.status}`);
  if (hints.priority) parts.push(`priority ${hints.priority}`);
  if (hints.limit) parts.push(`top ${hints.limit}`);
  return parts.join(" ").trim();
};

const addAgentPropertyScope = ({ query, params, user, propertyRef = "p.id" }) => {
  if (user.role !== "agent") {
    return { query, params };
  }

  const scopedQuery = `${query}
    AND EXISTS (
      SELECT 1
      FROM agent_property_assignments apa
      WHERE apa.agent_id = $${params.length + 1}
        AND apa.property_id = ${propertyRef}
        AND apa.is_active = true
    )`;

  return {
    query: scopedQuery,
    params: [...params, user.id],
  };
};

const chooseTool = (question) => {
  const q = question.toLowerCase();

  if (
    q.includes("tenant status") ||
    q.includes("who paid") ||
    q.includes("who has paid") ||
    q.includes("who has not paid") ||
    q.includes("unpaid this month") ||
    q.includes("rent due") ||
    q.includes("payments/tenant-status")
  ) {
    return "route_tenant_payment_status";
  }

  if (
    (q.includes("payments list") || q.includes("payment list") || q.includes("payment records")) &&
    !q.includes("tenant status")
  ) {
    return "route_payments";
  }

  if (q.includes("complaints list") || q.includes("complaint list")) {
    return "route_complaints";
  }

  if (
    q.includes("properties list") ||
    q.includes("properties data") ||
    q.includes("property stats")
  ) {
    return "route_properties";
  }

  if (
    q.includes("water bill list") ||
    q.includes("water bills list") ||
    q.includes("water profitability")
  ) {
    return q.includes("profitability")
      ? "route_water_profitability"
      : "route_water_bills";
  }

  if (q.includes("tenants list") || q.includes("tenant list")) {
    return "route_tenants";
  }

  if (
    q.includes("tenant") &&
    (q.includes("list") || q.includes("all"))
  ) {
    return "route_tenants";
  }

  if (
    q.includes("comprehensive stats") ||
    q.includes("dashboard comprehensive")
  ) {
    return "route_dashboard_comprehensive";
  }

  if (
    (q.includes("not paid") || q.includes("unpaid")) &&
    (q.includes("this month") || q.includes("current month")) &&
    (q.includes("building") || q.includes("property") || q.includes("in "))
  ) {
    return "unpaid_tenants_property_month";
  }

  if (
    q.includes("arrears") &&
    (q.includes("this month") || q.includes("current month") || q.includes("month")) &&
    (q.includes("all properties") || q.includes("properties") || q.includes("property"))
  ) {
    return "monthly_property_arrears";
  }

  if (
    q.includes("all data") ||
    q.includes("everything") ||
    q.includes("database") ||
    q.includes("system data") ||
    q.includes("full data")
  ) {
    return "global_data_pack";
  }

  if (
    (q.includes("missing rent") ||
      q.includes("unpaid rent") ||
      q.includes("outstanding rent") ||
      q.includes("rent not paid")) &&
    (q.includes("so far") ||
      q.includes("overall") ||
      q.includes("total") ||
      q.includes("all") ||
      q.includes("current"))
  ) {
    return "outstanding_rent";
  }

  if (q.includes("complaint") || q.includes("maintenance")) return "complaints";
  if (q.includes("dashboard") || q.includes("overview") || q.includes("stat"))
    return "dashboard";
  if (q.includes("property") || q.includes("vacant") || q.includes("occupied"))
    return "properties";
  if (
    q.includes("payment") ||
    q.includes("mpesa") ||
    q.includes("arrears") ||
    q.includes("balance") ||
    q.includes("owe")
  ) {
    return "tenant_or_payments";
  }

  return "tenant";
};

const getUnpaidTenantsForPropertyThisMonth = async ({ user, question }) => {
  const patterns = extractSearchPatterns(question);
  const propertyQueryBase = `
    SELECT p.id, p.name, p.property_code
    FROM properties p
    WHERE (
      p.name ILIKE ANY($1::text[])
      OR p.property_code ILIKE ANY($1::text[])
    )
  `;
  const propertyQuery =
    user.role === "agent"
      ? `${propertyQueryBase}
         AND EXISTS (
           SELECT 1
           FROM agent_property_assignments apa
           WHERE apa.agent_id = $2
             AND apa.property_id = p.id
             AND apa.is_active = true
         )
         ORDER BY p.name ASC
         LIMIT 1`
      : `${propertyQueryBase}
         ORDER BY p.name ASC
         LIMIT 1`;

  const propertyParams = user.role === "agent" ? [patterns, user.id] : [patterns];
  const propertyResult = await db.query(propertyQuery, propertyParams);
  const property = propertyResult.rows[0];
  if (!property) {
    return {
      label: "Unpaid Tenants This Month",
      rows: [],
    };
  }

  const unpaidQuery = `
    SELECT
      t.id AS tenant_id,
      t.first_name,
      t.last_name,
      t.phone_number,
      pu.unit_code,
      p.name AS property_name,
      p.property_code,
      COALESCE(ta.monthly_rent, pu.rent_amount, 0) AS monthly_rent,
      COALESCE(pm.rent_paid, 0) AS rent_paid_this_month,
      GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) AS unpaid_rent_this_month
    FROM tenant_allocations ta
    JOIN tenants t ON t.id = ta.tenant_id
    JOIN property_units pu ON pu.id = ta.unit_id
    JOIN properties p ON p.id = pu.property_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(
        CASE
          WHEN (
            COALESCE(rp.allocated_to_rent, 0) +
            COALESCE(rp.allocated_to_water, 0) +
            COALESCE(rp.allocated_to_arrears, 0)
          ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
          ELSE COALESCE(rp.amount, 0)
        END
      ), 0) AS rent_paid
      FROM rent_payments rp
      WHERE rp.tenant_id = ta.tenant_id
        AND rp.unit_id = ta.unit_id
        AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', CURRENT_DATE)
        AND rp.status = 'completed'
    ) pm ON TRUE
    WHERE ta.is_active = true
      AND p.id = $1
      AND GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) > 0
    ORDER BY unpaid_rent_this_month DESC, t.first_name ASC
    LIMIT 100
  `;

  const unpaidResult = await db.query(unpaidQuery, [property.id]);

  return {
    label: "Unpaid Tenants This Month",
    rows: unpaidResult.rows,
  };
};

const getMonthlyPropertyArrears = async ({ user }) => {
  const scopeCondition =
    user.role === "agent"
      ? `
      AND EXISTS (
        SELECT 1
        FROM agent_property_assignments apa
        WHERE apa.agent_id = $1
          AND apa.property_id = p.id
          AND apa.is_active = true
      )`
      : "";
  const scopeParams = user.role === "agent" ? [user.id] : [];

  const query = `
    SELECT
      p.id AS property_id,
      p.name AS property_name,
      p.property_code,
      COUNT(*)::int AS active_allocations,
      COALESCE(SUM(
        GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0))
      ), 0) AS current_month_unpaid_rent,
      COALESCE(SUM(GREATEST(0, COALESCE(ta.arrears_balance, 0))), 0) AS arrears_balance_total,
      COALESCE(SUM(
        GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) +
        GREATEST(0, COALESCE(ta.arrears_balance, 0))
      ), 0) AS total_rent_arrears_this_month
    FROM tenant_allocations ta
    JOIN property_units pu ON pu.id = ta.unit_id
    JOIN properties p ON p.id = pu.property_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(
        CASE
          WHEN (
            COALESCE(rp.allocated_to_rent, 0) +
            COALESCE(rp.allocated_to_water, 0) +
            COALESCE(rp.allocated_to_arrears, 0)
          ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
          ELSE COALESCE(rp.amount, 0)
        END
      ), 0) AS rent_paid
      FROM rent_payments rp
      WHERE rp.tenant_id = ta.tenant_id
        AND rp.unit_id = ta.unit_id
        AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', CURRENT_DATE)
        AND rp.status = 'completed'
    ) pm ON TRUE
    WHERE ta.is_active = true
    ${scopeCondition}
    GROUP BY p.id, p.name, p.property_code
    HAVING COALESCE(SUM(
      GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) +
      GREATEST(0, COALESCE(ta.arrears_balance, 0))
    ), 0) > 0
    ORDER BY total_rent_arrears_this_month DESC, p.name ASC
    LIMIT 50
  `;

  const result = await db.query(query, scopeParams);
  return {
    label: "Monthly Property Arrears",
    rows: result.rows,
  };
};

const runSafeQuery = async (query, params = []) => {
  try {
    const result = await db.query(query, params);
    return result.rows || [];
  } catch (error) {
    return [];
  }
};

const getGlobalDataPack = async ({ user }) => {
  const scopeCondition =
    user.role === "agent"
      ? `
      AND EXISTS (
        SELECT 1
        FROM agent_property_assignments apa
        WHERE apa.agent_id = $1
          AND apa.property_id = p.id
          AND apa.is_active = true
      )`
      : "";
  const scopeParams = user.role === "agent" ? [user.id] : [];

  const propertiesSummaryQ = `
    SELECT
      COUNT(*)::int AS properties_count,
      COALESCE(SUM(p.total_units), 0)::int AS units_declared
    FROM properties p
    WHERE 1=1
    ${scopeCondition}
  `;

  const activeTenantsQ = `
    SELECT
      COUNT(*)::int AS active_tenants
    FROM tenant_allocations ta
    JOIN property_units pu ON pu.id = ta.unit_id
    JOIN properties p ON p.id = pu.property_id
    WHERE ta.is_active = true
    ${scopeCondition}
  `;

  const paymentsSummaryQ = `
    SELECT
      COUNT(*)::int AS payments_count_45d,
      COALESCE(SUM(COALESCE(rp.amount, 0)), 0) AS payments_amount_45d
    FROM rent_payments rp
    JOIN properties p ON p.id = rp.property_id
    WHERE rp.created_at >= NOW() - INTERVAL '45 days'
      AND rp.status = 'completed'
    ${scopeCondition}
  `;

  const complaintsSummaryQ = `
    SELECT
      COUNT(*)::int AS open_complaints
    FROM complaints c
    JOIN property_units pu ON pu.id = c.unit_id
    JOIN properties p ON p.id = pu.property_id
    WHERE c.status IN ('open','in_progress')
    ${scopeCondition}
  `;

  const topTenantsDueQ = `
    SELECT
      t.first_name,
      t.last_name,
      pu.unit_code,
      p.name AS property_name,
      (
        GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) +
        GREATEST(0, COALESCE(ta.arrears_balance, 0))
      ) AS missing_rent
    FROM tenant_allocations ta
    JOIN tenants t ON t.id = ta.tenant_id
    JOIN property_units pu ON pu.id = ta.unit_id
    JOIN properties p ON p.id = pu.property_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(
        CASE
          WHEN (
            COALESCE(rp.allocated_to_rent, 0) +
            COALESCE(rp.allocated_to_water, 0) +
            COALESCE(rp.allocated_to_arrears, 0)
          ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
          ELSE COALESCE(rp.amount, 0)
        END
      ), 0) AS rent_paid
      FROM rent_payments rp
      WHERE rp.tenant_id = ta.tenant_id
        AND rp.unit_id = ta.unit_id
        AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', CURRENT_DATE)
        AND rp.status = 'completed'
    ) pm ON TRUE
    WHERE ta.is_active = true
      AND (
        GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) +
        GREATEST(0, COALESCE(ta.arrears_balance, 0))
      ) > 0
    ${scopeCondition}
    ORDER BY missing_rent DESC
    LIMIT 8
  `;

  const recentPaymentsQ = `
    SELECT
      rp.payment_date,
      rp.amount,
      rp.status,
      rp.mpesa_receipt_number,
      t.first_name,
      t.last_name,
      pu.unit_code,
      p.name AS property_name
    FROM rent_payments rp
    LEFT JOIN tenants t ON t.id = rp.tenant_id
    LEFT JOIN property_units pu ON pu.id = rp.unit_id
    LEFT JOIN properties p ON p.id = rp.property_id
    WHERE rp.created_at >= NOW() - INTERVAL '30 days'
    ${scopeCondition}
    ORDER BY COALESCE(rp.payment_date, rp.created_at) DESC
    LIMIT 10
  `;

  const [propertiesSummaryRows, activeTenantsRows, paymentsSummaryRows, complaintsSummaryRows] =
    await Promise.all([
      runSafeQuery(propertiesSummaryQ, scopeParams),
      runSafeQuery(activeTenantsQ, scopeParams),
      runSafeQuery(paymentsSummaryQ, scopeParams),
      runSafeQuery(complaintsSummaryQ, scopeParams),
    ]);

  const [topTenantsDueRows, recentPaymentsRows] = await Promise.all([
    runSafeQuery(topTenantsDueQ, scopeParams),
    runSafeQuery(recentPaymentsQ, scopeParams),
  ]);

  return {
    label: "Global Data Pack",
    rows: [
      {
        properties_summary: propertiesSummaryRows[0] || {},
        active_tenants_summary: activeTenantsRows[0] || {},
        payments_summary: paymentsSummaryRows[0] || {},
        complaints_summary: complaintsSummaryRows[0] || {},
        top_tenants_due: topTenantsDueRows,
        recent_payments: recentPaymentsRows,
      },
    ],
  };
};

const getOutstandingRentSummary = async ({ user }) => {
  const scopeCondition =
    user.role === "agent"
      ? `
      AND EXISTS (
        SELECT 1
        FROM agent_property_assignments apa
        WHERE apa.agent_id = $1
          AND apa.property_id = p.id
          AND apa.is_active = true
      )`
      : "";
  const scopeParams = user.role === "agent" ? [user.id] : [];

  const summaryQuery = `
    SELECT
      COUNT(*)::int AS active_tenants,
      COALESCE(SUM(
        GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0))
      ), 0) AS current_month_unpaid_rent,
      COALESCE(SUM(GREATEST(0, COALESCE(ta.arrears_balance, 0))), 0) AS total_arrears,
      COALESCE(SUM(
        GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) +
        GREATEST(0, COALESCE(ta.arrears_balance, 0))
      ), 0) AS total_missing_rent_so_far
    FROM tenant_allocations ta
    JOIN property_units pu ON pu.id = ta.unit_id
    JOIN properties p ON p.id = pu.property_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(
        CASE
          WHEN (
            COALESCE(rp.allocated_to_rent, 0) +
            COALESCE(rp.allocated_to_water, 0) +
            COALESCE(rp.allocated_to_arrears, 0)
          ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
          ELSE COALESCE(rp.amount, 0)
        END
      ), 0) AS rent_paid
      FROM rent_payments rp
      WHERE rp.tenant_id = ta.tenant_id
        AND rp.unit_id = ta.unit_id
        AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', CURRENT_DATE)
        AND rp.status = 'completed'
    ) pm ON TRUE
    WHERE ta.is_active = true
    ${scopeCondition}
  `;

  const topDebtorsQuery = `
    SELECT
      t.first_name,
      t.last_name,
      pu.unit_code,
      p.name AS property_name,
      (
        GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) +
        GREATEST(0, COALESCE(ta.arrears_balance, 0))
      ) AS missing_rent
    FROM tenant_allocations ta
    JOIN tenants t ON t.id = ta.tenant_id
    JOIN property_units pu ON pu.id = ta.unit_id
    JOIN properties p ON p.id = pu.property_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(
        CASE
          WHEN (
            COALESCE(rp.allocated_to_rent, 0) +
            COALESCE(rp.allocated_to_water, 0) +
            COALESCE(rp.allocated_to_arrears, 0)
          ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
          ELSE COALESCE(rp.amount, 0)
        END
      ), 0) AS rent_paid
      FROM rent_payments rp
      WHERE rp.tenant_id = ta.tenant_id
        AND rp.unit_id = ta.unit_id
        AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', CURRENT_DATE)
        AND rp.status = 'completed'
    ) pm ON TRUE
    WHERE ta.is_active = true
      AND (
        GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) +
        GREATEST(0, COALESCE(ta.arrears_balance, 0))
      ) > 0
    ${scopeCondition}
    ORDER BY missing_rent DESC
    LIMIT 5
  `;

  const [summaryResult, topDebtorsResult] = await Promise.all([
    db.query(summaryQuery, scopeParams),
    db.query(topDebtorsQuery, scopeParams),
  ]);

  const summary = summaryResult.rows[0] || {
    active_tenants: 0,
    current_month_unpaid_rent: 0,
    total_arrears: 0,
    total_missing_rent_so_far: 0,
  };

  return {
    label: "Outstanding Rent Summary",
    rows: [
      {
        ...summary,
        top_debtors: topDebtorsResult.rows || [],
      },
    ],
  };
};

const getTenantSnapshot = async ({ user, question }) => {
  const patterns = extractSearchPatterns(question);

  let query = `
    SELECT
      t.id,
      t.first_name,
      t.last_name,
      t.phone_number,
      p.name AS property_name,
      pu.unit_code,
      COALESCE(ta.monthly_rent, pu.rent_amount, 0) AS monthly_rent,
      GREATEST(0, COALESCE(ta.arrears_balance, 0)) AS arrears_balance,
      COALESCE(pm.rent_paid, 0) AS rent_paid,
      COALESCE(wp.water_bill, 0) AS water_bill,
      COALESCE(wp.water_paid, 0) AS water_paid,
      (
        GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) +
        GREATEST(0, COALESCE(wp.water_bill, 0) - COALESCE(wp.water_paid, 0)) +
        GREATEST(0, COALESCE(ta.arrears_balance, 0))
      ) AS total_due
    FROM tenants t
    JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
    JOIN property_units pu ON pu.id = ta.unit_id
    JOIN properties p ON p.id = pu.property_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(
        CASE
          WHEN (
            COALESCE(rp.allocated_to_rent, 0) +
            COALESCE(rp.allocated_to_water, 0) +
            COALESCE(rp.allocated_to_arrears, 0)
          ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
          ELSE COALESCE(rp.amount, 0)
        END
      ), 0) AS rent_paid
      FROM rent_payments rp
      WHERE rp.tenant_id = t.id
        AND rp.unit_id = pu.id
        AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', CURRENT_DATE)
        AND rp.status = 'completed'
    ) pm ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COALESCE((
          SELECT wb.amount
          FROM water_bills wb
          WHERE wb.tenant_id = t.id
            AND (wb.unit_id = pu.id OR wb.unit_id IS NULL)
            AND DATE_TRUNC('month', wb.bill_month) = DATE_TRUNC('month', CURRENT_DATE)
          ORDER BY CASE WHEN wb.unit_id = pu.id THEN 0 ELSE 1 END
          LIMIT 1
        ), 0) AS water_bill,
        COALESCE((
          SELECT SUM(COALESCE(rp.allocated_to_water, 0))
          FROM rent_payments rp
          WHERE rp.tenant_id = t.id
            AND rp.unit_id = pu.id
            AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', CURRENT_DATE)
            AND rp.status = 'completed'
        ), 0) AS water_paid
    ) wp ON TRUE
    WHERE (
      (t.first_name || ' ' || t.last_name) ILIKE ANY($1::text[]) OR
      t.first_name ILIKE ANY($1::text[]) OR
      t.last_name ILIKE ANY($1::text[]) OR
      COALESCE(t.phone_number, '') ILIKE ANY($1::text[]) OR
      COALESCE(pu.unit_code, '') ILIKE ANY($1::text[])
    )
  `;

  let params = [patterns];
  ({ query, params } = addAgentPropertyScope({ query, params, user, propertyRef: "p.id" }));
  query += " ORDER BY total_due DESC, t.first_name ASC LIMIT 5";

  const result = await db.query(query, params);

  return {
    label: "Tenant Snapshot",
    rows: result.rows,
  };
};

const getRecentPayments = async ({ user }) => {
  let query = `
    SELECT
      rp.id,
      rp.payment_date,
      rp.payment_month,
      rp.amount,
      rp.status,
      rp.mpesa_receipt_number,
      t.first_name,
      t.last_name,
      pu.unit_code,
      p.name AS property_name
    FROM rent_payments rp
    LEFT JOIN tenants t ON t.id = rp.tenant_id
    LEFT JOIN property_units pu ON pu.id = rp.unit_id
    LEFT JOIN properties p ON p.id = rp.property_id
    WHERE rp.created_at >= NOW() - INTERVAL '45 days'
  `;

  let params = [];
  ({ query, params } = addAgentPropertyScope({ query, params, user, propertyRef: "p.id" }));
  query += " ORDER BY COALESCE(rp.payment_date, rp.created_at) DESC LIMIT 10";

  const result = await db.query(query, params);
  return {
    label: "Recent Payments",
    rows: result.rows,
  };
};

const getOpenComplaints = async ({ user }) => {
  let query = `
    SELECT
      c.id,
      c.title,
      c.status,
      c.priority,
      c.raised_at,
      t.first_name AS tenant_first_name,
      t.last_name AS tenant_last_name,
      pu.unit_code,
      p.name AS property_name
    FROM complaints c
    LEFT JOIN tenants t ON t.id = c.tenant_id
    LEFT JOIN property_units pu ON pu.id = c.unit_id
    LEFT JOIN properties p ON p.id = pu.property_id
    WHERE c.status IN ('open', 'in_progress')
  `;

  let params = [];
  ({ query, params } = addAgentPropertyScope({ query, params, user, propertyRef: "p.id" }));
  query += " ORDER BY c.raised_at DESC LIMIT 10";

  const result = await db.query(query, params);
  return {
    label: "Open Complaints",
    rows: result.rows,
  };
};

const getPropertySummary = async ({ user }) => {
  let query = `
    SELECT
      p.id,
      p.name,
      p.property_code,
      COUNT(pu.id)::int AS total_units,
      COUNT(CASE WHEN pu.is_occupied = true THEN 1 END)::int AS occupied_units,
      COUNT(CASE WHEN pu.is_occupied = false THEN 1 END)::int AS vacant_units
    FROM properties p
    LEFT JOIN property_units pu ON pu.property_id = p.id AND pu.is_active = true
    WHERE 1 = 1
  `;

  let params = [];
  ({ query, params } = addAgentPropertyScope({ query, params, user, propertyRef: "p.id" }));
  query += `
    GROUP BY p.id, p.name, p.property_code
    ORDER BY p.name ASC
    LIMIT 20
  `;

  const result = await db.query(query, params);
  return {
    label: "Property Summary",
    rows: result.rows,
  };
};

const getDashboardSummary = async ({ user }) => {
  const scopeCondition =
    user.role === "agent"
      ? `
      AND EXISTS (
        SELECT 1
        FROM agent_property_assignments apa
        WHERE apa.agent_id = $1
          AND apa.property_id = p.id
          AND apa.is_active = true
      )`
      : "";
  const scopeParams = user.role === "agent" ? [user.id] : [];

  const propertiesQ = `
    SELECT
      COUNT(*)::int AS properties_count
    FROM properties p
    WHERE 1 = 1
    ${scopeCondition}
  `;

  const tenantsQ = `
    SELECT
      COUNT(*)::int AS active_tenants
    FROM tenant_allocations ta
    JOIN property_units pu ON pu.id = ta.unit_id
    JOIN properties p ON p.id = pu.property_id
    WHERE ta.is_active = true
    ${scopeCondition}
  `;

  const dueQ = `
    SELECT
      COALESCE(SUM(
        GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0)) +
        GREATEST(0, COALESCE(ta.arrears_balance, 0))
      ), 0) AS gross_due_estimate
    FROM tenant_allocations ta
    JOIN property_units pu ON pu.id = ta.unit_id
    JOIN properties p ON p.id = pu.property_id
    WHERE ta.is_active = true
    ${scopeCondition}
  `;

  const [propertiesResult, tenantsResult, dueResult] = await Promise.all([
    db.query(propertiesQ, scopeParams),
    db.query(tenantsQ, scopeParams),
    db.query(dueQ, scopeParams),
  ]);

  return {
    label: "Dashboard Summary",
    rows: [
      {
        properties_count: propertiesResult.rows[0]?.properties_count || 0,
        active_tenants: tenantsResult.rows[0]?.active_tenants || 0,
        gross_due_estimate: dueResult.rows[0]?.gross_due_estimate || 0,
      },
    ],
  };
};

const getRouteTenantPaymentStatus = async ({ user, question }) => {
  const month = extractMonthFromQuestion(question) || new Date().toISOString().slice(0, 7);
  const monthStart = toMonthDate(month);
  const property = await resolvePropertyFromQuestion({ user, question });
  const search = extractSearchPhrase(question);

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
            ) > 0 THEN COALESCE(rp.allocated_to_rent, 0) + COALESCE(rp.allocated_to_arrears, 0)
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
        SELECT SUM(wb.amount) FROM water_bills wb
        WHERE wb.tenant_id = t.id
        AND (wb.unit_id = pu.id OR wb.unit_id IS NULL)
        AND DATE_TRUNC('month', wb.bill_month) < DATE_TRUNC('month', $1::date)
      ), 0) - COALESCE((
        SELECT SUM(rp.allocated_to_water) FROM rent_payments rp
        WHERE rp.tenant_id = t.id
        AND rp.unit_id = pu.id
        AND rp.status = 'completed'
        AND DATE_TRUNC('month', rp.payment_month) < DATE_TRUNC('month', $1::date)
      ), 0) as water_arrears,
      COALESCE((
        SELECT SUM(COALESCE(rp.allocated_to_arrears, 0))
        FROM rent_payments rp
        WHERE rp.tenant_id = t.id
        AND rp.unit_id = pu.id
        AND rp.status = 'completed'
      ), 0) as arrears_paid,
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
      ), 0) as advance_amount
    FROM tenants t
    INNER JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
    INNER JOIN property_units pu ON ta.unit_id = pu.id AND pu.is_active = true
    INNER JOIN properties p ON pu.property_id = p.id
    WHERE (ta.lease_start_date IS NULL OR ta.lease_start_date < ($1::date + INTERVAL '1 month'))
  `;

  const whereClauses = [];
  const params = [monthStart];
  let paramIndex = 2;

  if (user.role === "agent") {
    whereClauses.push(`
      p.id IN (
        SELECT property_id FROM agent_property_assignments
        WHERE agent_id = $${paramIndex}::uuid AND is_active = true
      )
    `);
    params.push(user.id);
    paramIndex += 1;
  }

  if (property?.id) {
    whereClauses.push(`p.id = $${paramIndex}::uuid`);
    params.push(property.id);
    paramIndex += 1;
  }

  if (search) {
    whereClauses.push(`(
      t.first_name ILIKE $${paramIndex} OR t.last_name ILIKE $${paramIndex} OR
      pu.unit_code ILIKE $${paramIndex} OR p.name ILIKE $${paramIndex} OR
      t.phone_number ILIKE $${paramIndex} OR
      CONCAT(t.first_name, ' ', t.last_name) ILIKE $${paramIndex}
    )`);
    params.push(`%${search}%`);
    paramIndex += 1;
  }

  if (whereClauses.length > 0) {
    baseQuery += ` AND ${whereClauses.join(" AND ")}`;
  }

  baseQuery += " ORDER BY p.name, pu.unit_code";
  const result = await db.query(baseQuery, params);

  const tenants = result.rows.map((row) => {
    const monthlyRent = parseFloat(row.monthly_rent) || 0;
    const rentPaid = parseFloat(row.rent_paid) || 0;
    const waterBill = parseFloat(row.water_bill) || 0;
    const waterPaid = parseFloat(row.water_paid) || 0;
    const waterArrears = Math.max(0, parseFloat(row.water_arrears) || 0);
    const arrears = parseFloat(row.arrears) || 0;
    const arrearsPaid = parseFloat(row.arrears_paid) || 0;
    const advanceAmount = Math.max(0, parseFloat(row.advance_amount) || 0);
    const totalLeaseExpected = parseFloat(row.expected_amount) || 0;

    const rawRentDue = Math.max(0, monthlyRent - rentPaid);
    const rawWaterDue = Math.max(0, waterBill - waterPaid) + waterArrears;
    const rawArrearsDue = Math.max(0, arrears - arrearsPaid);
    const arrearsForPriorMonths = Math.max(0, rawArrearsDue);

    let remainingAdvance = advanceAmount;
    const advanceToArrears = Math.min(remainingAdvance, arrearsForPriorMonths);
    remainingAdvance -= advanceToArrears;
    const effectiveArrearsDue = arrearsForPriorMonths - advanceToArrears;

    const advanceToWater = Math.min(remainingAdvance, rawWaterDue);
    remainingAdvance -= advanceToWater;
    const effectiveWaterDue = rawWaterDue - advanceToWater;

    const advanceToRent = Math.min(remainingAdvance, rawRentDue);
    remainingAdvance -= advanceToRent;
    const effectiveRentDue = rawRentDue - advanceToRent;

    const totalDue = effectiveRentDue + effectiveWaterDue + effectiveArrearsDue;

    return {
      tenant_id: row.tenant_id,
      tenant_name: row.tenant_name,
      phone_number: row.phone_number,
      property_id: row.property_id,
      property_name: row.property_name,
      unit_id: row.unit_id,
      unit_code: row.unit_code,
      monthly_rent: monthlyRent,
      total_expected: totalLeaseExpected,
      rent_paid: rentPaid,
      rent_due: effectiveRentDue,
      water_bill: waterBill,
      water_paid: waterPaid,
      water_due: effectiveWaterDue,
      arrears: arrears,
      arrears_due: effectiveArrearsDue,
      advance_amount: advanceAmount,
      advance_credit: remainingAdvance,
      total_due: totalDue,
      is_fully_paid: totalDue <= 0,
      due_date: row.due_date,
      rent_due_day: Number(row.rent_due_day) || 1,
    };
  });

  const summary = {
    total_tenants: tenants.length,
    paid_count: tenants.filter((t) => t.total_due <= 0).length,
    unpaid_count: tenants.filter((t) => t.total_due > 0).length,
    total_outstanding: tenants.reduce((sum, t) => sum + t.total_due, 0),
  };

  return {
    label: "Tenant Payment Status Route",
    rows: [
      {
        route: "/api/payments/tenant-status",
        month,
        filters: {
          property_id: property?.id || null,
          property_name: property?.name || null,
          search: search || null,
        },
        summary,
        tenants_count: tenants.length,
        tenants_preview: tenants.slice(0, extractTopLimit(question, 40, 200)),
      },
    ],
  };
};

const getRoutePaymentsList = async ({ user, question }) => {
  const month = extractMonthFromQuestion(question);
  const monthRange = getMonthRange(month);
  const search = extractSearchPhrase(question);
  const status = extractKeywordStatus(question, PAYMENT_STATUS_KEYWORDS);
  const property = await resolvePropertyFromQuestion({ user, question });
  const limit = extractTopLimit(question, 25, 200);

  let baseQuery = `
    SELECT
      rp.id,
      (
        GREATEST(
          COALESCE(rp.amount, 0),
          COALESCE(rp.allocated_to_rent, 0) +
            COALESCE(rp.allocated_to_water, 0) +
            COALESCE(rp.allocated_to_arrears, 0)
        ) + COALESCE(cf.carry_forward_amount, 0)
      ) as amount,
      rp.payment_month, rp.payment_date, rp.status, rp.payment_method,
      rp.mpesa_receipt_number, rp.phone_number,
      t.id as tenant_id, t.first_name, t.last_name,
      p.id as property_id, p.name as property_name,
      pu.unit_code
    FROM rent_payments rp
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(child.amount), 0) as carry_forward_amount
      FROM rent_payments child
      WHERE child.original_payment_id = rp.id
    ) cf ON true
    LEFT JOIN tenants t ON rp.tenant_id = t.id
    LEFT JOIN property_units pu ON rp.unit_id = pu.id
    LEFT JOIN properties p ON pu.property_id = p.id
  `;

  const whereClauses = [
    "COALESCE(rp.original_payment_id, rp.id) = rp.id",
    `NOT (
      rp.tenant_id IS NULL AND rp.unit_id IS NULL AND rp.property_id IS NULL
    )`,
  ];
  const params = [];
  let paramIndex = 1;

  if (user.role === "agent") {
    whereClauses.push(`
      p.id IN (
        SELECT property_id FROM agent_property_assignments
        WHERE agent_id = $${paramIndex}::uuid AND is_active = true
      )
    `);
    params.push(user.id);
    paramIndex += 1;
  }

  if (property?.id) {
    whereClauses.push(`p.id = $${paramIndex}::uuid`);
    params.push(property.id);
    paramIndex += 1;
  }

  if (monthRange.startDate) {
    whereClauses.push(`rp.payment_date::date >= $${paramIndex}::date`);
    params.push(monthRange.startDate);
    paramIndex += 1;
  }

  if (monthRange.endDate) {
    whereClauses.push(`rp.payment_date::date <= $${paramIndex}::date`);
    params.push(monthRange.endDate);
    paramIndex += 1;
  }

  if (status) {
    whereClauses.push(`rp.status = $${paramIndex}`);
    params.push(status);
    paramIndex += 1;
  }

  if (search) {
    whereClauses.push(`(
      t.first_name ILIKE $${paramIndex} OR
      t.last_name ILIKE $${paramIndex} OR
      rp.mpesa_receipt_number ILIKE $${paramIndex} OR
      p.name ILIKE $${paramIndex} OR
      pu.unit_code ILIKE $${paramIndex} OR
      rp.phone_number ILIKE $${paramIndex}
    )`);
    params.push(`%${search}%`);
    paramIndex += 1;
  }

  baseQuery += ` WHERE ${whereClauses.join(" AND ")}`;
  const countQuery = `SELECT COUNT(*)::int as count FROM (${baseQuery}) payments`;
  const countResult = await db.query(countQuery, params);

  const query = `${baseQuery} ORDER BY rp.payment_date DESC NULLS LAST LIMIT $${paramIndex}`;
  const result = await db.query(query, [...params, limit]);

  return {
    label: "Payments List Route",
    rows: [
      {
        route: "/api/payments",
        filters: {
          property_id: property?.id || null,
          property_name: property?.name || null,
          month: month || null,
          status: status || null,
          search: search || null,
        },
        count: Number(countResult.rows[0]?.count || 0),
        payments_preview: result.rows,
      },
    ],
  };
};

const getRoutePropertiesList = async ({ user }) => {
  let query = "";
  let params = [];

  if (user.role === "agent") {
    query = `
      SELECT DISTINCT p.*,
        COUNT(pu.id) as unit_count,
        COUNT(CASE WHEN pu.is_occupied = true THEN 1 END) as occupied_units,
        COUNT(CASE WHEN pu.is_occupied = false THEN 1 END) as available_units_count
      FROM properties p
      LEFT JOIN property_units pu ON p.id = pu.property_id
      INNER JOIN agent_property_assignments apa ON p.id = apa.property_id
      WHERE apa.agent_id = $1
        AND apa.is_active = true
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;
    params = [user.id];
  } else {
    query = `
      SELECT p.*,
        COUNT(pu.id) as unit_count,
        COUNT(CASE WHEN pu.is_occupied = true THEN 1 END) as occupied_units,
        COUNT(CASE WHEN pu.is_occupied = false THEN 1 END) as available_units_count
      FROM properties p
      LEFT JOIN property_units pu ON p.id = pu.property_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;
  }

  const result = await db.query(query, params);
  return {
    label: "Properties List Route",
    rows: [
      {
        route: "/api/properties",
        count: result.rows.length,
        properties: result.rows,
      },
    ],
  };
};

const getRouteTenantsList = async ({ user, question }) => {
  const search = extractSearchPhrase(question);
  const property = await resolvePropertyFromQuestion({ user, question });
  const limit = extractTopLimit(question, 20, 200);
  const offset = 0;

  let query = `
    SELECT
      t.id, t.first_name, t.last_name, t.phone_number, t.email, t.national_id,
      ca.unit_code, ca.property_name, ca.monthly_rent, ca.lease_start_date, ca.lease_end_date
    FROM tenants t
    LEFT JOIN LATERAL (
      SELECT
        ta.monthly_rent, ta.lease_start_date, ta.lease_end_date,
        pu.unit_code, p.name as property_name
      FROM tenant_allocations ta
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE ta.tenant_id = t.id AND ta.is_active = true
      ORDER BY ta.allocation_date DESC NULLS LAST, ta.id DESC
      LIMIT 1
    ) ca ON true
  `;

  let countQuery = "SELECT COUNT(*)::int as count FROM tenants t";
  const queryParams = [];
  const countParams = [];

  if (user.role === "agent") {
    query += `
      WHERE EXISTS (
        SELECT 1
        FROM tenant_allocations ta_agent
        JOIN property_units pu_agent ON ta_agent.unit_id = pu_agent.id
        JOIN agent_property_assignments apa ON apa.property_id = pu_agent.property_id
        WHERE ta_agent.tenant_id = t.id
          AND ta_agent.is_active = true
          AND apa.agent_id = $1
          AND apa.is_active = true
      )
    `;
    countQuery += `
      WHERE EXISTS (
        SELECT 1
        FROM tenant_allocations ta_agent
        JOIN property_units pu_agent ON ta_agent.unit_id = pu_agent.id
        JOIN agent_property_assignments apa ON apa.property_id = pu_agent.property_id
        WHERE ta_agent.tenant_id = t.id
          AND ta_agent.is_active = true
          AND apa.agent_id = $1
          AND apa.is_active = true
      )
    `;
    queryParams.push(user.id);
    countParams.push(user.id);

    if (property?.id) {
      query += ` AND EXISTS (
        SELECT 1
        FROM tenant_allocations ta_prop
        JOIN property_units pu_prop ON ta_prop.unit_id = pu_prop.id
        WHERE ta_prop.tenant_id = t.id
          AND ta_prop.is_active = true
          AND pu_prop.property_id = $2::uuid
      )`;
      countQuery += ` AND EXISTS (
        SELECT 1
        FROM tenant_allocations ta_prop
        JOIN property_units pu_prop ON ta_prop.unit_id = pu_prop.id
        WHERE ta_prop.tenant_id = t.id
          AND ta_prop.is_active = true
          AND pu_prop.property_id = $2::uuid
      )`;
      queryParams.push(property.id);
      countParams.push(property.id);
    }

    if (search) {
      const nextParam = queryParams.length + 1;
      query += ` AND (
        t.first_name ILIKE $${nextParam} OR t.last_name ILIKE $${nextParam}
        OR t.phone_number ILIKE $${nextParam} OR t.national_id ILIKE $${nextParam}
      )`;
      countQuery += ` AND (
        t.first_name ILIKE $${countParams.length + 1} OR t.last_name ILIKE $${countParams.length + 1}
        OR t.phone_number ILIKE $${countParams.length + 1} OR t.national_id ILIKE $${countParams.length + 1}
      )`;
      queryParams.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }
  } else if (search) {
    query += ` WHERE (
      t.first_name ILIKE $1 OR t.last_name ILIKE $1
      OR t.phone_number ILIKE $1 OR t.national_id ILIKE $1
    )`;
    countQuery += ` WHERE (
      t.first_name ILIKE $1 OR t.last_name ILIKE $1
      OR t.phone_number ILIKE $1 OR t.national_id ILIKE $1
    )`;
    queryParams.push(`%${search}%`);
    countParams.push(`%${search}%`);
  }

  if (user.role !== "agent" && property?.id) {
    if (query.includes(" WHERE ")) {
      query += ` AND EXISTS (
        SELECT 1
        FROM tenant_allocations ta_prop
        JOIN property_units pu_prop ON ta_prop.unit_id = pu_prop.id
        WHERE ta_prop.tenant_id = t.id
          AND ta_prop.is_active = true
          AND pu_prop.property_id = $${queryParams.length + 1}::uuid
      )`;
      countQuery += ` AND EXISTS (
        SELECT 1
        FROM tenant_allocations ta_prop
        JOIN property_units pu_prop ON ta_prop.unit_id = pu_prop.id
        WHERE ta_prop.tenant_id = t.id
          AND ta_prop.is_active = true
          AND pu_prop.property_id = $${countParams.length + 1}::uuid
      )`;
    } else {
      query += ` WHERE EXISTS (
        SELECT 1
        FROM tenant_allocations ta_prop
        JOIN property_units pu_prop ON ta_prop.unit_id = pu_prop.id
        WHERE ta_prop.tenant_id = t.id
          AND ta_prop.is_active = true
          AND pu_prop.property_id = $${queryParams.length + 1}::uuid
      )`;
      countQuery += ` WHERE EXISTS (
        SELECT 1
        FROM tenant_allocations ta_prop
        JOIN property_units pu_prop ON ta_prop.unit_id = pu_prop.id
        WHERE ta_prop.tenant_id = t.id
          AND ta_prop.is_active = true
          AND pu_prop.property_id = $${countParams.length + 1}::uuid
      )`;
    }
    queryParams.push(property.id);
    countParams.push(property.id);
  }

  query += ` ORDER BY t.created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
  queryParams.push(limit, offset);

  const [rowsResult, countResult] = await Promise.all([
    db.query(query, queryParams),
    db.query(countQuery, countParams),
  ]);

  return {
    label: "Tenants List Route",
    rows: [
      {
        route: "/api/tenants",
        filters: {
          property_id: property?.id || null,
          property_name: property?.name || null,
          search: search || null,
          limit,
        },
        count: Number(countResult.rows[0]?.count || 0),
        tenants: rowsResult.rows,
      },
    ],
  };
};

const getRouteComplaintsList = async ({ user, question }) => {
  const property = await resolvePropertyFromQuestion({ user, question });
  const status = extractKeywordStatus(question, COMPLAINT_STATUS_KEYWORDS);
  const priority = extractPriority(question);
  const search = extractSearchPhrase(question);
  const limit = extractTopLimit(question, 30, 200);

  let query = `
    SELECT
      c.id, c.title, c.status, c.priority, c.raised_at,
      t.first_name as tenant_first_name, t.last_name as tenant_last_name,
      p.id as property_id, p.name as property_name, pu.unit_code
    FROM complaints c
    LEFT JOIN tenants t ON c.tenant_id = t.id
    LEFT JOIN property_units pu ON c.unit_id = pu.id
    LEFT JOIN properties p ON pu.property_id = p.id
    WHERE 1=1
  `;
  const params = [];
  let paramCount = 0;

  if (user.role === "agent") {
    paramCount += 1;
    query += ` AND pu.property_id IN (
      SELECT property_id FROM agent_property_assignments
      WHERE agent_id = $${paramCount}::uuid AND is_active = true
    )`;
    params.push(user.id);
  }
  if (property?.id) {
    paramCount += 1;
    query += ` AND p.id = $${paramCount}::uuid`;
    params.push(property.id);
  }
  if (status) {
    paramCount += 1;
    query += ` AND c.status = $${paramCount}`;
    params.push(status);
  }
  if (priority) {
    paramCount += 1;
    query += ` AND c.priority = $${paramCount}`;
    params.push(priority);
  }
  if (search) {
    paramCount += 1;
    query += ` AND (
      c.title ILIKE $${paramCount} OR c.description ILIKE $${paramCount}
      OR t.first_name ILIKE $${paramCount} OR t.last_name ILIKE $${paramCount}
      OR pu.unit_code ILIKE $${paramCount}
    )`;
    params.push(`%${search}%`);
  }
  query += ` ORDER BY c.raised_at DESC LIMIT $${paramCount + 1}`;
  params.push(limit);

  const result = await db.query(query, params);
  return {
    label: "Complaints List Route",
    rows: [
      {
        route: "/api/complaints",
        filters: {
          property_id: property?.id || null,
          property_name: property?.name || null,
          status: status || null,
          priority: priority || null,
          search: search || null,
        },
        count: result.rows.length,
        complaints: result.rows,
      },
    ],
  };
};

const getRouteWaterBillsList = async ({ user, question }) => {
  const property = await resolvePropertyFromQuestion({ user, question });
  const month = extractMonthFromQuestion(question);
  const limit = extractTopLimit(question, 50, 300);
  const params = [];
  let where = "WHERE 1=1";

  if (user.role !== "admin") {
    params.push(user.id);
    where += `
      AND (
        wb.property_id IN (
          SELECT property_id
          FROM agent_property_assignments
          WHERE agent_id = $1 AND is_active = true
        )
        OR wb.agent_id = $1
      )
    `;
  }
  if (property?.id) {
    params.push(property.id);
    where += ` AND wb.property_id = $${params.length}`;
  }
  if (month) {
    params.push(`${month}-01`);
    where += ` AND wb.bill_month = $${params.length}`;
  }

  const query = `
    SELECT wb.*, t.first_name, t.last_name, pu.unit_code, p.name as property_name
    FROM water_bills wb
    LEFT JOIN tenants t ON t.id = wb.tenant_id
    LEFT JOIN property_units pu ON pu.id = wb.unit_id
    LEFT JOIN properties p ON p.id = wb.property_id
    ${where}
    ORDER BY wb.bill_month DESC, wb.created_at DESC
    LIMIT $${params.length + 1}
  `;
  const result = await db.query(query, [...params, limit]);

  return {
    label: "Water Bills Route",
    rows: [
      {
        route: "/api/water-bills",
        filters: {
          property_id: property?.id || null,
          property_name: property?.name || null,
          month: month || null,
        },
        count: result.rows.length,
        water_bills: result.rows,
      },
    ],
  };
};

const getRouteWaterProfitability = async ({ user, question }) => {
  const property = await resolvePropertyFromQuestion({ user, question });
  const months = [...String(question || "").matchAll(new RegExp(MONTH_REGEX.source, "g"))].map(
    (m) => `${m[1]}-${m[2]}`,
  );
  const fromMonth = months[0] || new Date().toISOString().slice(0, 7);
  const toMonth = months[1] || fromMonth;
  const startMonth = `${fromMonth}-01`;
  const endMonth = `${toMonth}-01`;

  const params = [startMonth, endMonth];
  let propertyFilterForBills = "";
  let propertyFilterForPaid = "";
  let propertyFilterForExpense = "";

  if (property?.id) {
    params.push(property.id);
    propertyFilterForBills += ` AND wb.property_id = $${params.length}`;
    propertyFilterForPaid += ` AND rp.property_id = $${params.length}`;
    propertyFilterForExpense += ` AND wde.property_id = $${params.length}`;
  }

  if (user.role !== "admin") {
    params.push(user.id);
    const agentParam = `$${params.length}`;
    propertyFilterForBills += ` AND wb.property_id IN (
      SELECT property_id FROM agent_property_assignments
      WHERE agent_id = ${agentParam} AND is_active = true
    )`;
    propertyFilterForPaid += ` AND rp.property_id IN (
      SELECT property_id FROM agent_property_assignments
      WHERE agent_id = ${agentParam} AND is_active = true
    )`;
    propertyFilterForExpense += ` AND wde.property_id IN (
      SELECT property_id FROM agent_property_assignments
      WHERE agent_id = ${agentParam} AND is_active = true
    )`;
  }

  const query = `
    WITH months AS (
      SELECT generate_series(
        DATE_TRUNC('month', $1::date),
        DATE_TRUNC('month', $2::date),
        INTERVAL '1 month'
      )::date AS month
    ),
    billed AS (
      SELECT DATE_TRUNC('month', wb.bill_month)::date AS month,
             COALESCE(SUM(wb.amount), 0)::numeric AS water_billed
      FROM water_bills wb
      WHERE wb.bill_month >= DATE_TRUNC('month', $1::date)
        AND wb.bill_month <= DATE_TRUNC('month', $2::date)
        ${propertyFilterForBills}
      GROUP BY DATE_TRUNC('month', wb.bill_month)::date
    ),
    paid AS (
      SELECT DATE_TRUNC('month', rp.payment_month)::date AS month,
             COALESCE(SUM(rp.allocated_to_water), 0)::numeric AS water_collected
      FROM rent_payments rp
      WHERE rp.status = 'completed'
        AND rp.payment_month >= DATE_TRUNC('month', $1::date)
        AND rp.payment_month <= DATE_TRUNC('month', $2::date)
        ${propertyFilterForPaid}
      GROUP BY DATE_TRUNC('month', rp.payment_month)::date
    ),
    expenses AS (
      SELECT DATE_TRUNC('month', wde.bill_month)::date AS month,
             COALESCE(SUM(wde.amount), 0)::numeric AS water_expense
      FROM water_delivery_expenses wde
      WHERE wde.is_active = true
        AND wde.bill_month >= DATE_TRUNC('month', $1::date)
        AND wde.bill_month <= DATE_TRUNC('month', $2::date)
        ${propertyFilterForExpense}
      GROUP BY DATE_TRUNC('month', wde.bill_month)::date
    )
    SELECT
      m.month,
      COALESCE(b.water_billed, 0) AS water_billed,
      COALESCE(p.water_collected, 0) AS water_collected,
      COALESCE(e.water_expense, 0) AS water_expense,
      (COALESCE(p.water_collected, 0) - COALESCE(e.water_expense, 0)) AS water_profit_or_loss
    FROM months m
    LEFT JOIN billed b ON b.month = m.month
    LEFT JOIN paid p ON p.month = m.month
    LEFT JOIN expenses e ON e.month = m.month
    ORDER BY m.month ASC
  `;

  const result = await db.query(query, params);
  const totals = (result.rows || []).reduce(
    (acc, row) => {
      acc.water_billed += Number(row.water_billed) || 0;
      acc.water_collected += Number(row.water_collected) || 0;
      acc.water_expense += Number(row.water_expense) || 0;
      acc.water_profit_or_loss += Number(row.water_profit_or_loss) || 0;
      return acc;
    },
    { water_billed: 0, water_collected: 0, water_expense: 0, water_profit_or_loss: 0 },
  );

  return {
    label: "Water Profitability Route",
    rows: [
      {
        route: "/api/water-bills/profitability",
        filters: {
          property_id: property?.id || null,
          property_name: property?.name || null,
          from_month: fromMonth,
          to_month: toMonth,
        },
        totals,
        monthly: result.rows || [],
      },
    ],
  };
};

const getRouteDashboardComprehensive = async () => {
  const propertyStats = await db.query(`
    SELECT
      COUNT(DISTINCT p.id) as total_properties,
      COUNT(DISTINCT pu.id) as total_units,
      COUNT(DISTINCT CASE WHEN pu.is_occupied = true AND pu.is_active = true THEN pu.id END) as occupied_units,
      COUNT(DISTINCT CASE WHEN pu.is_occupied = false AND pu.is_active = true THEN pu.id END) as vacant_units
    FROM properties p
    LEFT JOIN property_units pu ON p.id = pu.property_id
  `);

  const tenantStats = await db.query(`
    SELECT
      COUNT(DISTINCT t.id) as total_tenants,
      COUNT(DISTINCT CASE WHEN ta.is_active = true THEN t.id END) as active_tenants,
      COUNT(DISTINCT CASE WHEN COALESCE(ta.arrears_balance, 0) > 0 AND ta.is_active = true THEN t.id END) as tenants_with_arrears,
      COALESCE(SUM(CASE WHEN ta.is_active = true THEN COALESCE(ta.arrears_balance, 0) ELSE 0 END), 0) as total_arrears
    FROM tenants t
    LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id
  `);

  return {
    label: "Comprehensive Dashboard Route",
    rows: [
      {
        route: "/api/admin/dashboard/comprehensive-stats",
        data: {
          property: propertyStats.rows[0] || {},
          tenant: tenantStats.rows[0] || {},
          generated_at: new Date().toISOString(),
        },
      },
    ],
  };
};

const callGroqForNarrative = async ({ question, history, toolLabel, toolRows, user }) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      usedFallback: true,
      answer:
        "I processed your request, but AI narration is unavailable because GROQ_API_KEY is not configured.",
      usage: null,
    };
  }

  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  const baseURL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
  const compactFacts = JSON.stringify(toolRows).slice(0, 5000);

  const messages = [
    {
      role: "system",
      content:
        "You are a rental operations assistant. Use only provided facts. Be concise. If data is insufficient, say what is missing. Explain errors in simple language and give one practical next step. Always present money in Kenyan shillings as KES. Never use USD or '$'.",
    },
    ...history,
    {
      role: "user",
      content: `Role: ${user.role}\nQuestion: ${question}\nData Source: ${toolLabel}\nFacts: ${compactFacts}`,
    },
  ];

  const response = await axios.post(
    `${baseURL}/chat/completions`,
    {
      model,
      temperature: 0.1,
      max_tokens: 350,
      messages,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    },
  );

  const answer = response.data?.choices?.[0]?.message?.content?.trim();
  return {
    usedFallback: false,
    answer:
      answer ||
      "I could not generate a narrative answer, but the data query succeeded.",
    usage: response.data?.usage || null,
  };
};

const buildPlannerMessages = ({ user, question, schemaContext, previousError = null }) => {
  const roleScopeInstruction =
    user.role === "agent"
      ? `You MUST enforce agent scope by filtering properties through active assignments for agent_id='${user.id}' (table: agent_property_assignments).`
      : "Admin scope: no property restriction required.";

  const errorHint = previousError
    ? `Previous SQL failed with error: ${previousError}. Fix the SQL accordingly.`
    : "No previous SQL error.";

  return [
    {
      role: "system",
      content:
        "You are a PostgreSQL analytics planner for a rental management system. Return ONLY JSON with keys: sql, reason. sql must be a single read-only SELECT/WITH query. No markdown. No extra keys.",
    },
    {
      role: "system",
      content: `${roleScopeInstruction}\n${errorHint}\nAlways prefer meaningful aggregations when the user asks broad questions.\nWhen user asks who has not paid this month in a property/building, compute unpaid rent from tenant_allocations + rent_payments for CURRENT_DATE month and return tenant-level rows with unpaid amount.`,
    },
    {
      role: "user",
      content: `Schema:\n${schemaContext}\n\nQuestion:\n${question}`,
    },
  ];
};

const callGroqSqlPlanner = async ({ user, question, schemaContext, previousError = null }) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { success: false, error: "GROQ_API_KEY is not configured." };
  }

  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  const baseURL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

  const response = await axios.post(
    `${baseURL}/chat/completions`,
    {
      model,
      temperature: 0.0,
      max_tokens: 450,
      messages: buildPlannerMessages({ user, question, schemaContext, previousError }),
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 25000,
    },
  );

  const content = response.data?.choices?.[0]?.message?.content || "";
  const parsed = extractJsonObject(content);
  const sql = String(parsed?.sql || "").trim();
  const reason = String(parsed?.reason || "").trim();

  if (!sql) {
    return { success: false, error: "Planner did not return SQL." };
  }

  return {
    success: true,
    data: {
      sql,
      reason,
      usage: response.data?.usage || null,
    },
  };
};

const executeReadOnlySql = async (sql) => {
  if (!isReadOnlySelectSql(sql)) {
    return { success: false, error: "Generated SQL failed read-only safety checks." };
  }

  const safeSql = ensureLimitedSql(sql);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '12000ms'");
    const result = await client.query(safeSql);
    await client.query("COMMIT");
    return {
      success: true,
      data: {
        sql: safeSql,
        rows: result.rows || [],
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    return { success: false, error: error.message || "SQL execution failed." };
  } finally {
    client.release();
  }
};

const runSchemaAwareDynamicQuery = async ({ user, question }) => {
  const schemaContext = await getSchemaContext();
  let plannerError = null;
  let plannerUsage = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const planned = await callGroqSqlPlanner({
      user,
      question,
      schemaContext,
      previousError: plannerError,
    });

    if (!planned.success) {
      plannerError = planned.error || "Planner failed.";
      continue;
    }

    plannerUsage = planned.data.usage || plannerUsage;
    const executed = await executeReadOnlySql(planned.data.sql);
    if (executed.success) {
      return {
        success: true,
        data: {
          label: "Dynamic Database Query",
          rows: executed.data.rows,
          sql: executed.data.sql,
          planner_reason: planned.data.reason,
          planner_usage: plannerUsage,
        },
      };
    }

    plannerError = executed.error;
  }

  return {
    success: false,
    error:
      plannerError ||
      "Could not generate a safe dynamic query for this request.",
  };
};

const normalizeCurrencyText = (text) => {
  const value = String(text || "");
  return value
    .replace(/(^|[^\w])\$\s?(\d[\d,]*(?:\.\d+)?)/g, "$1KES $2")
    .replace(/\bUSD\b/gi, "KES")
    .replace(/\bdollars?\b/gi, "Kenyan shillings");
};

const formatFallbackResponse = ({ question, toolLabel, rows }) => {
  if (!rows || rows.length === 0) {
    return `I could not find matching records for "${question}". Try including a tenant name, phone number, or unit code.`;
  }

  if (toolLabel === "Tenant Snapshot") {
    const first = rows[0];
    return `${first.first_name} ${first.last_name} (${first.unit_code}) has an estimated total due of KES ${Number(first.total_due || 0).toLocaleString()}.`;
  }

  if (toolLabel === "Recent Payments") {
    return `I found ${rows.length} recent payment records. The latest amount is KES ${Number(rows[0].amount || 0).toLocaleString()} with status "${rows[0].status}".`;
  }

  if (toolLabel === "Open Complaints") {
    return `There are ${rows.length} open/in-progress complaints in scope right now.`;
  }

  if (toolLabel === "Property Summary") {
    return `I found ${rows.length} properties in scope.`;
  }

  if (toolLabel === "Outstanding Rent Summary") {
    const summary = rows[0] || {};
    return `Total missing rent so far is KES ${Number(summary.total_missing_rent_so_far || 0).toLocaleString()} (current month unpaid rent: KES ${Number(summary.current_month_unpaid_rent || 0).toLocaleString()}, arrears: KES ${Number(summary.total_arrears || 0).toLocaleString()}).`;
  }

  if (toolLabel === "Monthly Property Arrears") {
    const total = rows.reduce(
      (sum, row) => sum + Number(row.total_rent_arrears_this_month || 0),
      0,
    );
    return `I found ${rows.length} properties with rent arrears this month. Total arrears across those properties is KES ${total.toLocaleString()}.`;
  }

  if (toolLabel === "Unpaid Tenants This Month") {
    const totalUnpaid = rows.reduce(
      (sum, row) => sum + Number(row.unpaid_rent_this_month || 0),
      0,
    );
    const propertyName = rows[0]?.property_name || "the selected property";
    return `I found ${rows.length} tenant(s) with unpaid rent this month in ${propertyName}. Total unpaid rent is KES ${totalUnpaid.toLocaleString()}.`;
  }

  if (toolLabel === "Global Data Pack") {
    const pack = rows[0] || {};
    const payments = pack.payments_summary || {};
    const complaints = pack.complaints_summary || {};
    const activeTenants = pack.active_tenants_summary || {};
    return `I gathered system-wide data in your access scope: active tenants ${Number(activeTenants.active_tenants || 0)}, payments in last 45 days KES ${Number(payments.payments_amount_45d || 0).toLocaleString()}, and open complaints ${Number(complaints.open_complaints || 0)}.`;
  }

  if (toolLabel === "Dynamic Database Query") {
    return `I queried the database directly and found ${rows.length} matching record(s).`;
  }

  if (toolLabel === "Tenant Payment Status Route") {
    const summary = rows[0]?.summary || {};
    return `I used /api/payments/tenant-status and found ${Number(summary.total_tenants || 0)} tenant records for the selected scope, with outstanding balance of KES ${Number(summary.total_outstanding || 0).toLocaleString()}.`;
  }

  if (toolLabel === "Payments List Route") {
    const count = Number(rows[0]?.count || 0);
    return `I used /api/payments and found ${count} matching payment record(s) in your current scope.`;
  }

  if (toolLabel === "Tenants List Route") {
    const count = Number(rows[0]?.count || 0);
    return `I used /api/tenants and found ${count} tenant record(s).`;
  }

  if (toolLabel === "Properties List Route") {
    const count = Number(rows[0]?.count || 0);
    return `I used /api/properties and found ${count} property record(s).`;
  }

  if (toolLabel === "Complaints List Route") {
    const count = Number(rows[0]?.count || 0);
    return `I used /api/complaints and found ${count} complaint record(s).`;
  }

  if (toolLabel === "Water Bills Route") {
    const count = Number(rows[0]?.count || 0);
    return `I used /api/water-bills and found ${count} water bill record(s).`;
  }

  if (toolLabel === "Water Profitability Route") {
    const totals = rows[0]?.totals || {};
    return `I used /api/water-bills/profitability. Net water profit/loss for the selected period is KES ${Number(totals.water_profit_or_loss || 0).toLocaleString()}.`;
  }

  if (toolLabel === "Comprehensive Dashboard Route") {
    const property = rows[0]?.data?.property || {};
    const tenant = rows[0]?.data?.tenant || {};
    return `I used /api/admin/dashboard/comprehensive-stats and found ${Number(property.total_properties || 0)} properties and ${Number(tenant.active_tenants || 0)} active tenants.`;
  }

  return `I found ${rows.length} matching records for your request.`;
};

const runReadOnlyToolByAction = async ({ user, question, selected }) => {
  if (selected === "dynamic_sql") {
    return {
      label: "Dynamic Database Query",
      rows: [],
      metadata: { requested_dynamic_sql: true },
    };
  }

  if (selected === "route_tenant_payment_status") {
    return getRouteTenantPaymentStatus({ user, question });
  }

  if (selected === "route_payments") {
    return getRoutePaymentsList({ user, question });
  }

  if (selected === "route_tenants") {
    return getRouteTenantsList({ user, question });
  }

  if (selected === "route_properties") {
    return getRoutePropertiesList({ user, question });
  }

  if (selected === "route_complaints") {
    return getRouteComplaintsList({ user, question });
  }

  if (selected === "route_water_bills") {
    return getRouteWaterBillsList({ user, question });
  }

  if (selected === "route_water_profitability") {
    return getRouteWaterProfitability({ user, question });
  }

  if (selected === "route_dashboard_comprehensive") {
    return getRouteDashboardComprehensive({ user, question });
  }

  if (selected === "unpaid_tenants_property_month") {
    return getUnpaidTenantsForPropertyThisMonth({ user, question });
  }

  if (selected === "monthly_property_arrears") {
    return getMonthlyPropertyArrears({ user });
  }

  if (selected === "global_data_pack") {
    return getGlobalDataPack({ user });
  }

  if (selected === "outstanding_rent") {
    return getOutstandingRentSummary({ user });
  }

  if (selected === "complaints") {
    return getOpenComplaints({ user });
  }
  if (selected === "properties") {
    return getPropertySummary({ user });
  }
  if (selected === "dashboard") {
    return getDashboardSummary({ user });
  }
  if (selected === "tenant_or_payments") {
    const patterns = extractSearchPatterns(question);
    if (patterns[0] === "%%") {
      return getRecentPayments({ user });
    }
    const tenantResult = await getTenantSnapshot({ user, question });
    if (tenantResult.rows.length > 0) return tenantResult;
    return getRecentPayments({ user });
  }
  const tenantSnapshot = await getTenantSnapshot({ user, question });
  if (tenantSnapshot.rows.length === 0) {
    return getGlobalDataPack({ user });
  }
  return tenantSnapshot;
};

const runReadOnlyTool = async ({ user, question }) => {
  const selected = chooseTool(question);
  return runReadOnlyToolByAction({ user, question, selected });
};

const saveHistoryMessage = async ({
  conversationId,
  userId,
  role,
  messageText,
  aiMode = "read_only",
  toolUsed = null,
  blocked = false,
  fallback = false,
  recordsCount = null,
  usage = null,
  metadata = null,
}) => {
  if (!conversationId || !userId || !role || !messageText) return;

  await db.query(
    `
      INSERT INTO ai_chat_history (
        conversation_id,
        user_id,
        role,
        message_text,
        ai_mode,
        tool_used,
        blocked,
        fallback,
        records_count,
        usage_prompt_tokens,
        usage_completion_tokens,
        usage_total_tokens,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
    `,
    [
      conversationId,
      userId,
      role,
      messageText,
      aiMode,
      toolUsed,
      blocked,
      fallback,
      recordsCount,
      usage?.prompt_tokens || null,
      usage?.completion_tokens || null,
      usage?.total_tokens || null,
      metadata ? JSON.stringify(metadata) : "{}",
    ],
  );
};

const getConversationHistory = async ({ user, conversationId, limit = 80 }) => {
  const safeConversationId = normalizeConversationId(conversationId);
  if (!safeConversationId) {
    return {
      success: false,
      status: 400,
      message: "A valid conversationId is required.",
    };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 80, 1), 200);
  const result = await db.query(
    `
      SELECT
        id,
        role,
        message_text,
        ai_mode,
        tool_used,
        blocked,
        fallback,
        records_count,
        created_at
      FROM ai_chat_history
      WHERE conversation_id = $1
        AND user_id = $2
      ORDER BY created_at ASC
      LIMIT $3
    `,
    [safeConversationId, user.id, safeLimit],
  );

  return {
    success: true,
    data: {
      conversationId: safeConversationId,
      items: result.rows,
    },
  };
};

const answerQuestion = async ({ user, question, history, conversationId }) => {
  const safeQuestion = ensureSafeQuestion(question);
  const safeConversationId = normalizeConversationId(conversationId);
  if (!safeQuestion) {
    return {
      success: false,
      status: 400,
      message: "Question is required.",
    };
  }

  if (isMutationIntent(safeQuestion)) {
    const blockedAnswer =
      "Phase 1 is read-only. I can check and explain data, but I cannot make changes yet. Please ask for the current state, balances, or diagnostics.";
    if (safeConversationId) {
      await saveHistoryMessage({
        conversationId: safeConversationId,
        userId: user.id,
        role: "user",
        messageText: safeQuestion,
        metadata: { intent: "mutation_blocked" },
      });
      await saveHistoryMessage({
        conversationId: safeConversationId,
        userId: user.id,
        role: "assistant",
        messageText: blockedAnswer,
        blocked: true,
        toolUsed: "none",
      });
    }

    return {
      success: true,
      data: {
        mode: "read_only",
        blocked: true,
        answer: blockedAnswer,
        tool: "none",
      },
    };
  }

  const safeHistory = normalizeHistory(history);
  const contextualQuestion = resolveQuestionContext(safeQuestion, safeHistory);
  let routerDecision = heuristicRouter(contextualQuestion);
  let routerUsage = null;
  try {
    const routed = await callGroqToolRouter({
      user,
      question: contextualQuestion,
      history: safeHistory,
    });
    if (routed.success) {
      routerDecision = routed.data;
      routerUsage = routed.data.usage || null;
    }
  } catch (error) {
    // Fallback to heuristic router
  }

  const correctionTarget = extractCorrectionTargetCount(contextualQuestion);
  if (correctionTarget) {
    const actionIsListCapable =
      String(routerDecision.action || "").startsWith("route_") ||
      routerDecision.action === "unpaid_tenants_property_month";
    if (!actionIsListCapable || routerDecision.action === "tenant") {
      routerDecision.action = "route_tenants";
      routerDecision.confidence = Math.max(Number(routerDecision.confidence || 0), 0.6);
    }
    routerDecision.response_mode = "list";
    routerDecision.hints = {
      ...(routerDecision.hints || {}),
      limit: correctionTarget,
    };
  }

  const routedQuestion = buildQuestionWithHints(
    contextualQuestion,
    routerDecision.hints || {},
  );
  let toolResult = await runReadOnlyToolByAction({
    user,
    question: routedQuestion,
    selected: routerDecision.action,
  });
  let dynamicSqlInfo = null;
  const dynamicEnabled = String(process.env.AI_DYNAMIC_SQL_ENABLED || "true").toLowerCase() !== "false";

  const shouldTryDynamicSql =
    dynamicEnabled &&
    (routerDecision.action === "dynamic_sql" ||
      !toolResult ||
      !toolResult.rows ||
      toolResult.rows.length === 0);

  if (shouldTryDynamicSql) {
    const dynamicResult = await runSchemaAwareDynamicQuery({
      user,
      question: routedQuestion,
    });
    if (dynamicResult.success) {
      toolResult = {
        label: dynamicResult.data.label,
        rows: dynamicResult.data.rows,
      };
      dynamicSqlInfo = {
        sql: dynamicResult.data.sql,
        planner_reason: dynamicResult.data.planner_reason,
        planner_usage: dynamicResult.data.planner_usage,
      };
    }
  }

  const narration = await callGroqForNarrative({
    question: contextualQuestion,
    history: safeHistory,
    toolLabel: toolResult.label,
    toolRows: toolResult.rows,
    user,
  }).catch(() => ({
    usedFallback: true,
    answer: formatFallbackResponse({
      question: contextualQuestion,
      toolLabel: toolResult.label,
      rows: toolResult.rows,
    }),
    usage: null,
  }));

  const fallbackAnswer = formatFallbackResponse({
    question: contextualQuestion,
    toolLabel: toolResult.label,
    rows: toolResult.rows,
  });
  const rawAnswer = narration.usedFallback
    ? fallbackAnswer
    : narration.answer || fallbackAnswer;
  const answer = normalizeCurrencyText(rawAnswer);

  if (safeConversationId) {
    await saveHistoryMessage({
      conversationId: safeConversationId,
      userId: user.id,
      role: "user",
      messageText: safeQuestion,
      metadata: { source: "prompt", contextual_question: contextualQuestion },
    });

    await saveHistoryMessage({
      conversationId: safeConversationId,
      userId: user.id,
      role: "assistant",
      messageText: answer,
      toolUsed: toolResult.label,
      fallback: narration.usedFallback,
      recordsCount: toolResult.rows.length,
      usage: narration.usage,
      metadata: {
        sample: toolResult.rows.slice(0, 3),
        generated_sql: dynamicSqlInfo?.sql || null,
        planner_reason: dynamicSqlInfo?.planner_reason || null,
        router_action: routerDecision.action,
        router_confidence: routerDecision.confidence,
        router_mode: routerDecision.response_mode,
        router_hints: routerDecision.hints || {},
        router_usage: routerUsage,
      },
    });
  }

  return {
    success: true,
    data: {
      mode: "read_only",
      blocked: false,
      tool: toolResult.label,
      answer,
      usage: narration.usage,
      fallback: narration.usedFallback,
      records: toolResult.rows.length,
      sample: toolResult.rows.slice(0, 3),
      generated_sql: dynamicSqlInfo?.sql || null,
      routed_action: routerDecision.action,
      routed_confidence: routerDecision.confidence,
    },
  };
};

module.exports = {
  answerQuestion,
  getConversationHistory,
};
