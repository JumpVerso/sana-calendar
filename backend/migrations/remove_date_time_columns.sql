-- Migration: Remover colunas date e time da tabela time_slots
-- Data: 2024
-- Descrição: Remove as colunas date (texto) e time (texto) da tabela time_slots,
--             garantindo que apenas start_time e end_time (timestampz) sejam utilizados.

-- 1. Dropar views que dependem das colunas date/time
DROP VIEW IF EXISTS time_slots_grouped CASCADE;

-- 2. Verificar se as colunas existem antes de remover
DO $$
BEGIN
    -- Remover coluna date se existir
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'time_slots' 
        AND column_name = 'date'
    ) THEN
        ALTER TABLE time_slots DROP COLUMN date;
        RAISE NOTICE 'Coluna date removida com sucesso';
    ELSE
        RAISE NOTICE 'Coluna date não existe, pulando remoção';
    END IF;

    -- Remover coluna time se existir
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'time_slots' 
        AND column_name = 'time'
    ) THEN
        ALTER TABLE time_slots DROP COLUMN time;
        RAISE NOTICE 'Coluna time removida com sucesso';
    ELSE
        RAISE NOTICE 'Coluna time não existe, pulando remoção';
    END IF;
END $$;
