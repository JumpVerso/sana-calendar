-- Adicionar coluna is_inaugural à tabela time_slots
-- Este campo marca se um slot é inaugural (gratuito)

ALTER TABLE time_slots 
ADD COLUMN IF NOT EXISTS is_inaugural BOOLEAN DEFAULT FALSE;

-- Adicionar comentário explicativo
COMMENT ON COLUMN time_slots.is_inaugural IS 'Indica se o slot é inaugural (gratuito). Slots inaugurais não afetam cálculos de pagamento mas são contados no total de sessões.';
