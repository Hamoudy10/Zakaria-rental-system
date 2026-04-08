# MARCH 2026 PAYMENT RECONCILIATION - ACTION PLAN

## 📊 Current Situation

Based on payment data analysis, here's what actually happened in March 2026:

### ✅ PAID TENANTS (30 tenants)
Most tenants paid correctly. Frontend may be showing them as unpaid incorrectly.

### ⚠️ SPECIAL CASES (Need Action)

#### 1. **Zam Zam Abdi** - Unit MJB4
- **Expected:** KSh 35,000
- **Status:** PAID (cash or bank transfer) ❌ Not recorded in system
- **Action Required:** Manual payment entry needed
- **Details:** Payment confirmed but not reconciled in system

#### 2. **Maryam Omar** - Multiple Units
- **Unit MJG2B:** KSh 20,000 ✅ PAID
  - M-Pesa: UC9I08TFH4 on 9/3/26 at 5:40 PM
  - From: MARYAM OMAR MOHAMMED (254704298371)
  - Account Number: MJB2
  
- **Unit MJG1A:** KSh 23,000 ❌ UNPAID
  - No payment record found
  - **IMPORTANT:** This is a SEPARATE unit that needs separate payment

- **Question:** Does Maryam owe for BOTH units or just one?

#### 3. **Mohamed Abdirahman Idris** - Unit MJA7
- **Expected:** KSh 19,000
- **Status:** ❌ NO PAYMENT RECORD
- **Action Required:** Confirm if tenant should pay or if unit is vacant

#### 4. **New Tenants Starting in April**
These tenants were not active in March (no payment expected):
- Ibrahim Mutembei - KBS03 (KSh 8,000)
- Rahma Isfaq - KBS04 (KSh 8,000)
- Sara Mohamed - KLBND01 (KSh 100,000)

**Note:** These should NOT appear in March unpaid list

---

## 🔧 ACTIONS TO TAKE

### Action 1: Record Zam Zam's Cash Payment

Run this SQL in Supabase:

```sql
INSERT INTO rent_payments (
    tenant_id,
    unit_id,
    property_id,
    mpesa_transaction_id,
    mpesa_receipt_number,
    phone_number,
    amount,
    payment_date,
    payment_month,
    status,
    allocated_to_arrears,
    allocated_to_water,
    allocated_to_rent,
    remaining_balance,
    is_advance_payment,
    payment_method,
    created_at,
    updated_at
)
SELECT
    t.id AS tenant_id,
    pu.id AS unit_id,
    p.id AS property_id,
    'CASH_MARCH_2026_ZAMZAM' AS mpesa_transaction_id,
    NULL AS mpesa_receipt_number,
    t.phone_number,
    35000.00 AS amount,
    '2026-03-15 10:00:00'::timestamp AS payment_date,
    '2026-03-01'::date AS payment_month,
    'completed' AS status,
    0 AS allocated_to_arrears,
    0 AS allocated_to_water,
    35000.00 AS allocated_to_rent,
    0 AS remaining_balance,
    false AS is_advance_payment,
    'cash' AS payment_method,
    NOW() AS created_at,
    NOW() AS updated_at
FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = ta.unit_id
INNER JOIN properties p ON p.id = pu.property_id
WHERE
    t.first_name = 'zam zam'
    AND t.last_name = 'Abdi'
    AND pu.unit_code = 'MJB4';
```

### Action 2: Clarify Maryam Omar's Situation

**Questions to answer:**
1. Does Maryam rent BOTH MJG2B and MJG1A?
2. Or was she transferred from one unit to another?
3. What does "Account Number MJB2" in M-Pesa refer to?

**Possible scenarios:**

**Scenario A: Maryam has TWO active units**
- MJG2B: PAID ✅ (KSh 20,000)
- MJG1A: UNPAID ❌ (KSh 23,000 still owed)
- **Action:** Create manual payment request for MJG1A or mark as arrears

**Scenario B: Maryam moved from MJG2B to MJG1A**
- The KSh 20,000 payment was for MJG2B (previous unit)
- MJG1A needs KSh 23,000 for March
- **Action:** Confirm move-out date for MJG2B, create new allocation for MJG1A

### Action 3: Mohamed Abdirahman Idris - Unit MJA7

**Investigate:**
- Is the unit occupied?
- Should there be an active allocation?
- Is the tenant in arrears from previous months?

Run this query:

```sql
SELECT 
    t.first_name || ' ' || t.last_name AS tenant_name,
    pu.unit_code,
    ta.monthly_rent,
    ta.arrears_balance,
    ta.lease_start_date,
    ta.lease_end_date,
    ta.is_active,
    pu.is_occupied
FROM tenants t
LEFT JOIN tenant_allocations ta ON ta.tenant_id = t.id
LEFT JOIN property_units pu ON pu.id = ta.unit_id
WHERE t.first_name = 'Mohamed'
AND t.last_name = 'Abdirahman idris';
```

### Action 4: Exclude April-Start Tenants from March Report

These tenants should NOT be in March unpaid list since they start in April:
- Ibrahim Mutembei - KBS03
- Rahma Isfaq - KBS04
- Sara Mohamed - KLBND01

**No action needed** - they correctly show as unpaid for March.

---

## 📋 MARCH 2026 ACTUAL UNPAID TENANTS (After Fixes)

After applying fixes, these tenants should remain in "Unpaid" tab:

| Tenant | Unit | Expected | Status |
|--------|------|----------|--------|
| HANAN HUBII | MJA3 | KSh 35,000 | ❌ NO PAYMENT |
| Mohamed Abdirahman idris | MJA7 | KSh 19,000 | ❌ NO RECORD (investigate) |
| Maryam Omar (MJG1A only) | MJG1A | KSh 23,000 | ❌ OWES (if has 2 units) |

### April-Start Tenants (Expected to be unpaid for March):
| Tenant | Unit | Expected |
|--------|------|----------|
| IBRAHIM MUTEMBEI | KBS03 | KSh 8,000 |
| RAHMA ISFAQ | KBS04 | KSh 8,000 |
| SARA Mohamed | KLBND01 | KSh 100,000 |

---

## ✅ VERIFICATION STEPS

After making changes:

1. **Run this verification query:**

```sql
SELECT
    t.first_name || ' ' || t.last_name AS tenant_name,
    pu.unit_code,
    p.name AS property_name,
    ta.monthly_rent AS expected_rent,
    COALESCE(SUM(rp.allocated_to_rent), 0) AS paid_to_rent,
    ta.arrears_balance AS current_arrears,
    
    CASE
        WHEN COALESCE(SUM(rp.allocated_to_rent), 0) >= ta.monthly_rent THEN '✅ Paid'
        WHEN COALESCE(SUM(rp.allocated_to_rent), 0) > 0 THEN '⚠️ Partial'
        ELSE '❌ Unpaid'
    END AS march_status

FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = ta.unit_id AND pu.is_active = true
INNER JOIN properties p ON p.id = pu.property_id
LEFT JOIN rent_payments rp ON rp.tenant_id = t.id
    AND rp.unit_id = ta.unit_id
    AND rp.status = 'completed'
    AND rp.payment_month = '2026-03-01'::date
WHERE
    t.first_name IN ('zam zam', 'Maryam', 'Mohamed', 'HANAN')
    OR pu.unit_code IN ('MJB4', 'MJG2B', 'MJG1A', 'MJA7', 'MJA3')
GROUP BY t.id, t.first_name, t.last_name, pu.unit_code, p.name, ta.monthly_rent, ta.arrears_balance
ORDER BY march_status, tenant_name;
```

2. **Refresh the frontend** PaymentManagement component
3. **Verify Unpaid tab** shows only actual defaulters
4. **Check Paid tab** includes Zam Zam and all March payers

---

## 🎯 FINAL EXPECTED STATE

After all fixes:

### Paid Tab Should Include:
- All 30 tenants who paid ✅
- Zam Zam Abdi (MJB4) - after manual entry
- Maryam Omar (MJG2B) - already showing as paid

### Unpaid Tab Should Include:
- HANAN HUBII (MJA3) - KSh 35,000
- Mohamed Abdirahman idris (MJA7) - KSh 19,000 *(if applicable)*
- Maryam Omar (MJG1A) - KSh 23,000 *(only if she has 2 units)*
- April-start tenants (Ibrahim, Rahma, Sara)

---

## 📝 NOTES

1. **M-Pesa Account Number MJB2:** This doesn't match any unit code exactly. It might be:
   - An internal reference number
   - A typo in the M-Pesa message
   - A third unit we haven't identified

2. **Maryam Omar's Two Units:** This needs clarification from the tenant or property manager

3. **Arrears Balance:** After recording all payments, run the arrears recalculation query in `march_2026_reconciliation_fixes.sql`

4. **Frontend Bug:** The frontend is likely showing ALL tenants with ANY arrears balance, not just current-month unpaid tenants. This needs to be fixed separately.

---

**Last Updated:** April 8, 2026
