const axios = require("axios");
const db = require("../config/database");

const MAX_QUESTION_LENGTH = 600;
const MAX_HISTORY_ITEMS = 4;
const MAX_HISTORY_ITEM_LENGTH = 300;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const isVagueFollowUp =
    q.length < 40 &&
    (lower.includes("find it") ||
      lower.includes("that") ||
      lower.includes("this") ||
      lower.includes("it") ||
      lower.includes("same") ||
      lower.includes("continue"));

  if (!isVagueFollowUp || !Array.isArray(history) || history.length === 0) {
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
        "You are a rental operations assistant. Use only provided facts. Be concise. If data is insufficient, say what is missing. Explain errors in simple language and give one practical next step.",
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

  return `I found ${rows.length} matching records for your request.`;
};

const runReadOnlyTool = async ({ user, question }) => {
  const selected = chooseTool(question);

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
  return getTenantSnapshot({ user, question });
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
  const toolResult = await runReadOnlyTool({ user, question: contextualQuestion });

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
  const answer = narration.usedFallback
    ? fallbackAnswer
    : narration.answer || fallbackAnswer;

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
    },
  };
};

module.exports = {
  answerQuestion,
  getConversationHistory,
};
