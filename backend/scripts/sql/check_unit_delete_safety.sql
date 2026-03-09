WITH target_units AS (
  SELECT pu.id AS unit_id, pu.unit_code, pu.property_id, pu.is_active, pu.is_occupied
  FROM property_units pu
  WHERE UPPER(pu.unit_code) = ANY($1::text[])
),
allocation_counts AS (
  SELECT
    ta.unit_id,
    COUNT(*) AS allocation_history_count,
    COUNT(*) FILTER (WHERE ta.is_active = true) AS active_allocations
  FROM tenant_allocations ta
  INNER JOIN target_units tu ON tu.unit_id = ta.unit_id
  GROUP BY ta.unit_id
),
payment_counts AS (
  SELECT
    rp.unit_id,
    COUNT(*) AS payment_count
  FROM rent_payments rp
  INNER JOIN target_units tu ON tu.unit_id = rp.unit_id
  GROUP BY rp.unit_id
),
complaint_counts AS (
  SELECT
    c.unit_id,
    COUNT(*) AS complaint_count
  FROM complaints c
  INNER JOIN target_units tu ON tu.unit_id = c.unit_id
  GROUP BY c.unit_id
),
active_tenants AS (
  SELECT
    ta.unit_id,
    STRING_AGG(
      CONCAT(COALESCE(t.first_name, ''), ' ', COALESCE(t.last_name, '')),
      ', ' ORDER BY t.first_name, t.last_name
    ) AS active_tenants
  FROM tenant_allocations ta
  LEFT JOIN tenants t ON t.id = ta.tenant_id
  INNER JOIN target_units tu ON tu.unit_id = ta.unit_id
  WHERE ta.is_active = true
  GROUP BY ta.unit_id
)
SELECT
  tu.unit_id,
  tu.unit_code,
  p.name AS property_name,
  tu.is_active,
  tu.is_occupied,
  COALESCE(ac.active_allocations, 0) AS active_allocations,
  COALESCE(ac.allocation_history_count, 0) AS allocation_history_count,
  COALESCE(pc.payment_count, 0) AS payment_count,
  COALESCE(cc.complaint_count, 0) AS complaint_count,
  at.active_tenants,
  (
    tu.is_active = true
    AND tu.is_occupied = false
    AND COALESCE(ac.allocation_history_count, 0) = 0
    AND COALESCE(pc.payment_count, 0) = 0
    AND COALESCE(cc.complaint_count, 0) = 0
  ) AS safe_to_hard_delete
FROM target_units tu
LEFT JOIN properties p ON p.id = tu.property_id
LEFT JOIN allocation_counts ac ON ac.unit_id = tu.unit_id
LEFT JOIN payment_counts pc ON pc.unit_id = tu.unit_id
LEFT JOIN complaint_counts cc ON cc.unit_id = tu.unit_id
LEFT JOIN active_tenants at ON at.unit_id = tu.unit_id
ORDER BY tu.unit_code;
