-- Migration: Limpar sufixos de duração do campo personal_activity
-- Data: 2026-01-14
-- Descrição: Remove sufixos de duração (#1h, #30m, #90m, #120m, #2h) do campo personal_activity,
--             padronizando para usar apenas start_time e end_time para calcular duração.

-- Passo 1: Garantir que todos os slots pessoais tenham start_time e end_time
-- (Primeiro calcular end_time baseado em personal_activity antigo, se necessário)
UPDATE time_slots
SET end_time = COALESCE(
    end_time,
    CASE 
        WHEN start_time IS NOT NULL THEN
            CASE 
                -- Tentar inferir duração do personal_activity antigo (antes de limpar)
                WHEN personal_activity LIKE '%#120m' OR personal_activity LIKE '%#2h' THEN
                    start_time + INTERVAL '2 hours'
                WHEN personal_activity LIKE '%#90m' OR personal_activity LIKE '%#1h30' THEN
                    start_time + INTERVAL '90 minutes'
                WHEN personal_activity LIKE '%#60m' OR personal_activity LIKE '%#1h' THEN
                    start_time + INTERVAL '1 hour'
                ELSE
                    start_time + INTERVAL '30 minutes' -- Padrão 30min
            END
        ELSE NULL
    END
)
WHERE event_type = 'personal'
  AND end_time IS NULL
  AND start_time IS NOT NULL;

-- Passo 2: Atualizar personal_activity removendo sufixos de duração
-- Usar REGEXP_REPLACE para remover tudo após o primeiro # (mais robusto)
UPDATE time_slots
SET personal_activity = REGEXP_REPLACE(personal_activity, '#.*$', '')
WHERE event_type = 'personal' 
  AND personal_activity IS NOT NULL
  AND personal_activity LIKE '%#%';

-- Passo 3: Garantir que end_time está correto baseado em start_time (recalcular se necessário)
-- Isso garante consistência mesmo se algum slot não foi atualizado no passo 1
UPDATE time_slots
SET end_time = start_time + INTERVAL '30 minutes'
WHERE event_type = 'personal'
  AND start_time IS NOT NULL
  AND (end_time IS NULL OR end_time < start_time);
