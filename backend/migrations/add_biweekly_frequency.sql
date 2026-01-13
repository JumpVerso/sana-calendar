-- Migration: Adicionar 'biweekly' (quinzenal) à constraint de frequency
-- Data: 2025-12-22

-- 1. Remover a constraint antiga
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS recurrence_groups_frequency_check;

-- 2. Adicionar nova constraint incluindo 'biweekly'
ALTER TABLE contracts ADD CONSTRAINT recurrence_groups_frequency_check 
    CHECK (frequency IN ('weekly', 'biweekly', 'monthly'));

-- Comentário para documentação
COMMENT ON CONSTRAINT recurrence_groups_frequency_check ON contracts IS 
    'Valida frequência: weekly (semanal), biweekly (quinzenal), monthly (mensal)';
