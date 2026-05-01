-- ================================================================
-- Migration: Unit Update Propagation
-- Purpose: Automatically update tenant allocations when unit
--          code or rent amount changes
-- ================================================================

-- Function to propagate unit changes to active allocations
CREATE OR REPLACE FUNCTION propagate_unit_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Only propagate if rent_amount OR unit_code actually changed
    IF NEW.rent_amount IS DISTINCT FROM OLD.rent_amount 
       OR NEW.unit_code IS DISTINCT FROM OLD.unit_code THEN
        
        -- Update active allocations for this unit
        UPDATE tenant_allocations
        SET
            monthly_rent = NEW.rent_amount,
            unit_code = NEW.unit_code,
            updated_at = NOW()
        WHERE unit_id = NEW.id
          AND is_active = true;
        
        -- Update tenant records for active allocations
        UPDATE tenants t
        SET
            monthly_rent = NEW.rent_amount,
            unit_code = NEW.unit_code,
            updated_at = NOW()
        FROM tenant_allocations ta
        WHERE ta.tenant_id = t.id
          AND ta.unit_id = NEW.id
          AND ta.is_active = true;
          
        -- Log the change for audit purposes
        INSERT INTO system_activity_logs (
            action_type,
            entity_type,
            entity_id,
            description,
            created_at
        ) VALUES (
            'UNIT_UPDATED',
            'property_units',
            NEW.id,
            format('Unit %s updated: rent %s->%s, code %s->%s', 
                    OLD.unit_code, OLD.rent_amount, NEW.rent_amount, 
                    OLD.unit_code, NEW.unit_code),
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_propagate_unit_changes ON property_units;

CREATE TRIGGER trg_propagate_unit_changes
AFTER UPDATE OF rent_amount, unit_code
ON property_units
FOR EACH ROW
EXECUTE FUNCTION propagate_unit_changes();

-- ================================================================
-- Add comments
-- ================================================================
COMMENT ON FUNCTION propagate_unit_changes() IS 
'Automatically updates tenant_allocations and tenants tables when unit rent_amount or unit_code changes. Only affects active allocations.';

COMMENT ON TRIGGER trg_propagate_unit_changes ON property_units IS 
'Trigger to propagate unit code and rent changes to active tenant allocations.';
