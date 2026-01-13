-- Migration: Enforce Slot Exclusivity via Trigger
-- Description: Deletes sibling slots (same date/time) when a slot is Confirmed, Contracted, or Personal.

-- 1. Create the function
CREATE OR REPLACE FUNCTION public.handle_slot_exclusivity()
RETURNS TRIGGER AS $$
BEGIN
    -- Se virou CONFIRMADO, CONTRATADO, ou Personal -> Delete siblings
    IF (NEW.status = 'CONFIRMADO' OR 
        NEW.status = 'CONTRATADO' OR 
        NEW.event_type = 'personal') THEN
        
        -- Deletar todos os outros slots do mesmo horário
        DELETE FROM time_slots
        WHERE date = NEW.date
          AND time = NEW.time
          AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the trigger
DROP TRIGGER IF EXISTS trigger_slot_exclusivity ON time_slots;

CREATE TRIGGER trigger_slot_exclusivity
AFTER INSERT OR UPDATE ON time_slots
FOR EACH ROW
EXECUTE FUNCTION public.handle_slot_exclusivity();
