-- Migration: Atualizar trigger de exclusividade para usar start_time
-- Data: 2024
-- Descrição: Atualiza o trigger handle_slot_exclusivity para usar start_time
--             em vez de date e time (que foram removidos)

-- Atualizar a função do trigger
CREATE OR REPLACE FUNCTION public.handle_slot_exclusivity()
RETURNS TRIGGER AS $$
BEGIN
    -- Se virou CONFIRMADO, CONTRATADO, ou Personal -> Delete siblings
    IF (NEW.status = 'CONFIRMADO' OR 
        NEW.status = 'CONTRATADO' OR 
        NEW.event_type = 'personal') THEN
        
        -- Deletar todos os outros slots do mesmo start_time
        DELETE FROM time_slots
        WHERE start_time = NEW.start_time
          AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
