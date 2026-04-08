-- Migration: Add default values for is_active and is_occupied in property_units
-- Fixes new units not appearing in tenant allocation dropdown

-- Add is_active column if it doesn't exist with default true
ALTER TABLE property_units ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add is_occupied column if it doesn't exist with default false
ALTER TABLE property_units ADD COLUMN IF NOT EXISTS is_occupied BOOLEAN DEFAULT false;

-- Update any existing null values
UPDATE property_units SET is_active = true WHERE is_active IS NULL;
UPDATE property_units SET is_occupied = false WHERE is_occupied IS NULL;

-- Set defaults using a trigger
CREATE OR REPLACE FUNCTION set_property_units_defaults()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active IS NULL THEN
    NEW.is_active := true;
  END IF;
  IF NEW.is_occupied IS NULL THEN
    NEW.is_occupied := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS trigger_set_property_units_defaults ON property_units;
CREATE TRIGGER trigger_set_property_units_defaults
  BEFORE INSERT ON property_units
  FOR EACH ROW
  EXECUTE FUNCTION set_property_units_defaults();

SELECT 'Migration 021: Added is_active and is_occupied defaults to property_units' as status;
