-- Adicionar campo huggy_contact_id
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS huggy_contact_id TEXT;

-- Adicionar campo deleted_at para soft delete
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Criar índice para busca rápida por huggy_contact_id
CREATE INDEX IF NOT EXISTS idx_patients_huggy_contact_id 
ON patients(huggy_contact_id) 
WHERE deleted_at IS NULL;

-- Criar índice para filtrar pacientes não deletados
CREATE INDEX IF NOT EXISTS idx_patients_deleted_at 
ON patients(deleted_at) 
WHERE deleted_at IS NULL;

-- Comentário explicativo
COMMENT ON COLUMN patients.huggy_contact_id IS 'ID do contato na Huggy para integração com WhatsApp API';
COMMENT ON COLUMN patients.deleted_at IS 'Data de exclusão (soft delete). NULL = paciente ativo';