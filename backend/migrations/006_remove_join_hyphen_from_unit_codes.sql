-- Remove only the separator hyphen between property_code and the unit suffix.
-- Example: PROP001-001 -> PROP001001
--          ABC-UNIT-7 -> ABCUNIT-7 (only the join hyphen is removed)

UPDATE property_units pu
SET
  unit_code = p.property_code || SUBSTRING(pu.unit_code FROM CHAR_LENGTH(p.property_code) + 2),
  updated_at = NOW()
FROM properties p
WHERE pu.property_id = p.id
  AND pu.unit_code LIKE (p.property_code || '-%');

