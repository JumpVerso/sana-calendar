-- Migração de price de TEXT para INTEGER (centavos)
-- R$ 1,00 = 100 centavos
-- Data: 2025-12-22

BEGIN;

-- 1. Adicionar coluna temporária
ALTER TABLE time_slots ADD COLUMN price_new INTEGER;

-- 2. Converter dados existentes
-- Assumindo que os valores atuais estão em formato numérico (150, 200, etc.)
-- Multiplicar por 100 para converter para centavos
UPDATE time_slots 
SET price_new = CASE 
  WHEN price IS NULL THEN NULL
  WHEN price ~ '^[0-9]+\.?[0-9]*$' THEN (price::numeric * 100)::integer
  ELSE NULL
END;

-- 3. Remover coluna antiga e renomear a nova
ALTER TABLE time_slots DROP COLUMN price;
ALTER TABLE time_slots RENAME COLUMN price_new TO price;

-- 4. Comentário para documentação
COMMENT ON COLUMN time_slots.price IS 'Preço em centavos (ex: R$ 1,00 = 100)';

COMMIT;
