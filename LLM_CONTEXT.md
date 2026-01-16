# Contexto do Projeto e Regras de Negócio (LLM GUIDE)

Este documento descreve a arquitetura, regras de negócio críticas e peculiaridades do projeto **Mobile Sheet Calendar**. 
**ATENÇÃO:** LLMs e Desenvolvedores DEVEM ler este documento antes de propor alterações na lógica de agendamento.

## 1. Arquitetura Geral

*   **Frontend**: React (Vite) + TailwindCSS + Shadcn/UI.
*   **Backend**: Node.js (Express). Atua como intermediário para regras complexas.
*   **Banco de Dados**: Supabase (PostgreSQL).
*   **Comunicação**: O Frontend **EVITA** chamar o Supabase diretamente para escritas (INSERT/UPDATE/DELETE). Todas as operações de mutação devem passar pela API do Backend (`/api/slots/*`) para garantir que as validações e efeitos colaterais ocorram.

## 2. Conceitos Principais

*   **Time Slots**: A unidade básica da agenda. Representa um horário (ex: 10:00) em uma data específica.
*   **Double Slots (Horários Duplos)**: Em alguns casos, o profissional pode deixar reservado dois tipos de horários, online e presencial, (ex: 10:00 - Online e 10:00 - Presencial).
    *   No Banco: São duas linhas na tabela `time_slots` com o mesmo `date` e `time`.
    *   Regra: O sistema permite criar irmãos (siblings) enquanto o status for `Vago`, `Reservado` enquanto isso o outro fica `Aguardando`.

## 3. Regras de Negócio Críticas

### 3.1. Exclusividade e Remoção de Irmãos (Sibling Deletion)
**REGRA SUPREMA:** Quando um agendamento é **CONFIRMADO**, ele se torna exclusivo para aquele horário.

*   **Gatilho**: O status muda para `'CONFIRMADO'`, `'CONTRATADO'` ou o tipo é `'personal'`.
*   **Ação**: O sistema DEVE deletar imediatamente qualquer outro slot (irmão) que exista no mesmo dia e horário.
*   **Implementação (Dupla Proteção)**:
    1.  **Backend (`slotsService.ts`)**: Ao receber uma confirmação, o serviço tenta deletar os irmãos.
    2.  **Banco de Dados (Trigger)**: Existe um Trigger (`trigger_slot_exclusivity`) que força essa deletação no nível do banco.
        *   **Motivo**: Aplicações externas (n8n, Webhooks) podem atualizar o banco diretamente sem passar pela API. O Trigger garante a integridade.

### 3.2. Fluxo de Status
Os status seguem uma progressão lógica:
1.  **VAGO**: Slot livre.
2.  **RESERVADO**: Cliente demonstrou interesse (ex: "Enviar Flow"). *Não é exclusivo ainda.*
3.  **CONFIRMADO**: Cliente confirmou. *Torna-se exclusivo (deleta irmãos).*
4.  **CONTRATADO**: Pagamento/Contrato formalizado. *Exclusivo.*

> **Nota Peculiar**: Se o status voltar para `VAGO` (ex: cancelamento), o sistema deve limpar campos sensíveis (`flow_status`, `patient_id`, `is_paid`, etc.) para evitar "lixo" no slot.

### 3.3. Atividades Pessoais (Personal Slots)
Agendamentos do tipo `personal` (almoço, médico, etc.) têm comportamento visual específico.
*   **Duração Padrão**: 30 minutos.
*   **Duração de 1h**: Se o usuário criar um "Pessoal de 1h", o sistema cria visualmente um bloco maior (dependendo da implementação vigente).
    *   *Frontend*: O `DayColumn.tsx` trata o render (altura 60px vs 120px) baseado na tag `#1h` ou na duração.
*   **Exclusividade**: Atividades pessoais são sempre exclusivas. Criar um slot pessoal deleta concorrentes do mesmo horário.

### 3.5. Conflitos de Sobreposição (Overlap Logic)
**Novas regras de 1h**: Agendamentos comerciais (Online/Presencial) têm duração fixa de **1 hora**.
*   **Problema**: Como o sistema permite horários "quebrados" (ex: 09:30), um agendamento das 09:30 às 10:30 conflita com:
    *   09:00 - 10:00 (Overlap das 09:30 às 10:00)
    *   10:00 - 11:00 (Overlap das 10:00 às 10:30)
*   **Regra de Bloqueio**: O sistema **NÃO PODE PERMITIR** a criação de agendamentos de 1h se houver conflito de sobreposição com slots vizinhos (30min antes ou depois).
    *   *Exceção*: Atividades pessoais de 30min podem se encaixar nos "buracos" (ex: Se tenho agenda 09:30-10:30, o horário 09:00-09:30 está livre para pessoal de 30m).

### 3.4. Recorrência e Contratos
*   **Group ID / Contract ID**: Agendamentos recorrentes são linkados por um ID.
*   **Edição**: Ao editar um contrato recorrente, o sistema frequentemente deleta os slots futuros e recria-os para evitar conflitos de "shift" (deslocamento).

### 3.7. Renovação de Contratos
O sistema possui um mecanismo de renovação automática de contratos recorrentes.

*   **Último Dia do Contrato**: O sistema identifica automaticamente quando um contrato atinge seu último slot através do campo `end_date` na tabela `contracts`.
*   **Pseudo-reserva Automática**: Um job diário (00:00) verifica contratos que precisam de renovação e cria sugestões na tabela `pending_renewals` com:
    *   Próxima data baseada na frequência (semanal: +7 dias, quinzenal: +14 dias, mensal: +1 mês)
    *   Horário original ou alternativo se houver conflito
*   **Resolução de Conflitos**: Se o horário original estiver ocupado:
    1.  O sistema busca o próximo horário disponível no mesmo dia (30 em 30 minutos)
    2.  Se encontrar, marca `time_was_changed = true` para destacar ao doutor
    3.  Se não encontrar nenhum horário, marca `no_availability = true`
*   **Confirmação Obrigatória**: O doutor deve confirmar a renovação para que o slot seja criado com status `CONTRATADO`. Isso evita inconsistências.
*   **Expiração**: Renovações pendentes por mais de 7 dias são marcadas como `expired`.

**Componentes envolvidos:**
*   Backend: `renewalService.ts`, `dailyRenewalJob.ts`, rotas em `/api/renewals/*`
*   Frontend: `ContractRenewalDialog.tsx`, badge "Renovar" no `TimeSlotCard.tsx`
*   Banco: Tabelas `contracts` (campos `end_date`, `auto_renewal_enabled`) e `pending_renewals`

## 4. Gestão de Pacientes

### 4.1. Validação de Dados
*   **Email**: O email é **opcional**, mas quando preenchido, **DEVE** ter formato válido. A validação é feita tanto no frontend (tempo real) quanto no backend.
    *   **Frontend**: Função `validateEmail()` em `PatientForm.tsx` valida em tempo real durante a digitação.
    *   **Validação**: Regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` garante formato básico de email.
    *   **Regra**: Email vazio é permitido, mas email preenchido incorretamente bloqueia o cadastro/edição.
*   **Telefone**: Mínimo de 10 dígitos (formatação automática no frontend). Telefone é chave única no banco - duplicidade gera erro `23505`.
*   **Nome**: Campo obrigatório.

### 4.2. Criação e Edição de Pacientes
*   **Criação**: Disponível no `PatientSelector.tsx` através do formulário "Novo Paciente".
*   **Edição**: Implementada com ícone de lápis (Pencil) ao lado de cada paciente na lista.
    *   **Localização**: Cada item da lista de pacientes no `PatientSelector` possui um botão de edição que aparece no hover.
    *   **Dialog**: Ao clicar no ícone, abre um Dialog modal com o formulário de edição (`PatientForm`).
    *   **API**: Utiliza `patientsAPI.updatePatient()` para persistir alterações.
    *   **Atualização Automática**: Após edição, a lista é atualizada automaticamente e, se o paciente estava selecionado, a seleção é atualizada.

**Componentes envolvidos:**
*   Frontend: `PatientSelector.tsx`, `PatientForm.tsx`, `patientsAPI.ts`
*   Backend: `/api/patients` (PUT `/api/patients/:id`)
*   Utilitário: `validateEmail()` exportado de `PatientForm.tsx`

## 5. Gestão Financeira e Status

### 5.1. Status Financeiro de Contratos
O sistema calcula o status financeiro de um contrato baseado em:
1. **Em Dia**: Todas as sessões contratadas estão pagas.
2. **Regular**: Existem sessões futuras a pagar, sem pendências vencidas.
3. **Atenção**: 
    *   Existem sessões já realizadas sem pagamento, OU
    *   **Há débitos de contratos anteriores** (prioridade alta).

### 5.2. Débitos de Contratos Anteriores
*   **Detecção**: O sistema busca automaticamente contratos anteriores com débitos ao visualizar um contrato.
*   **Filtragem**: Apenas contratos com `start_time` anterior ao contrato atual são considerados.
*   **Indicadores Visuais**:
    1. **Tag de Status**: Quando há débitos pendentes, o status financeiro muda automaticamente para "Atenção" (vermelho).
    2. **Modal de Alerta**: Card vermelho abaixo dos dados financeiros informa sobre débitos com valores e quantidades.
    3. **Descrição**: Texto explicativo abaixo da tag indica: "🔴 Atenção: Existem débitos de contratos anteriores (veja abaixo)".
*   **Resolução**: Ao marcar pagamentos como "Pago" no contrato anterior, o alerta desaparece automaticamente após atualização.

**Componentes envolvidos:**
*   Frontend: `ContractViewDialog.tsx` (função `getFinancialStatus()`)
*   Backend: `slotsService.ts` (`getPendingContractsByContact()`)
*   API: `/api/slots/pending-contracts` (GET)

### 3.6. Formatação Monetária
*   **Armazenamento**: Todos os valores monetários são armazenados no banco de dados como **centavos** (inteiros).
    *   Exemplo: R$ 150,00 é armazenado como `15000`.
*   **Frontend**: O Frontend deve sempre converter esses valores para exibição (dividir por 100) e converter de volta para centavos ao enviar para a API (multiplicar por 100).
    *   **Input**: Inputs de valor devem tratar essa conversão, exibindo o valor formatado (ex: "150,00") mas manipulando internamente o valor em centavos ou convertendo no submit.

## 6. Gerenciamento de Cache e Storage

O sistema utiliza **TanStack Query (React Query)** para gerenciar cache de dados com persistência no `localStorage`.

### 6.1. Configuração do Cache

*   **QueryClient**: Configurado globalmente em `App.tsx` com:
    *   `staleTime`: 5 minutos - dados considerados "frescos" sem necessidade de refetch
    *   `gcTime`: 30 minutos - tempo que dados ficam no cache após não serem usados
    *   `refetchOnWindowFocus`: `false` - não refaz requisição ao focar janela
    *   `retry`: 2 tentativas em caso de erro

### 6.2. Persistência no localStorage

*   **Persister**: Utiliza `@tanstack/query-sync-storage-persister` para salvar cache no `localStorage`
*   **Chave**: `'sana-calendar-cache'` - identificador único do cache no storage
*   **MaxAge**: 30 minutos - tempo máximo que dados ficam no storage persistido
*   **Comportamento**: 
    *   Cache é restaurado automaticamente ao recarregar a página (F5)
    *   Mesmo com cache persistido, refaz requisição em background (`refetchOnMount: "always"`) para garantir sincronização se eventos Realtime foram perdidos

### 6.3. Query Keys Estruturados

O sistema utiliza **Query Keys Factory** para manter consistência nas chaves de cache:

```typescript
slotsKeys = {
  all: ['slots'],
  week: (startDate, endDate) => ['slots', startDate, endDate],
  contract: (contractId) => ['slots', 'contract', contractId]
}
```

*   **Slots por Semana**: Cada semana tem sua própria chave de cache `['slots', startDate, endDate]`
*   **Invalidação Granular**: Permite invalidar cache de semanas específicas ou todas de uma vez
*   **Prefetch**: Semanas adjacentes são pré-carregadas em background para navegação instantânea

### 6.4. Estratégias de Invalidação

Após qualquer **mutação** (create, update, delete), o cache é invalidado:

*   **Invalidação Ampliativa**: Após mutações via hooks (`useCreateSlotMutation`, `useUpdateSlotMutation`, etc.), invalida `slotsKeys.all` para garantir consistência
*   **Invalidação Granular**: Para operações específicas (ex: bloquear dia), invalida também queries relacionadas (`['blocked-days']`)
*   **Invalidação + Refetch**: Em operações críticas, usa `invalidateAndRefetch()` para aguardar atualização antes de continuar

### 6.5. Prefetch de Semanas Adjacentes

*   **Objetivo**: Navegação entre semanas sem delay
*   **Implementação**: 
    *   Ao carregar semana atual, prefetch automático das semanas anterior e próxima
    *   Se semanas adjacentes já estão no cache, atualiza em background (`prefetchQuery`)
    *   Respeita `staleTime` para evitar requisições desnecessárias

### 6.6. Integração com Supabase Realtime

*   **Subscrição**: Sistema subscreve mudanças na tabela `time_slots` via Supabase Realtime
*   **Debounce**: Eventos são debounced (300ms) para evitar múltiplas invalidações em bulk operations
*   **Invalidação Inteligente**: 
    *   Invalida semana atual ± semanas adjacentes (prefetch UX)
    *   Invalida semanas especificamente afetadas pelos eventos recebidos
    *   Identifica semana afetada através de `date` ou `start_time` do payload
*   **Backup de Refetch**: Mesmo com Realtime, mantém `refetchOnMount: "always"` como segurança

### 6.7. Regras Importantes

*   **SEMPRE** invalide cache após mutações - nunca confie apenas em atualização local
*   **USE** `queryClient.invalidateQueries()` ao invés de `refetch()` direto para manter consistência
*   **NÃO** modifique cache diretamente - sempre via invalidação + refetch da API
*   **RESPEITE** `staleTime` ao fazer prefetch - evita requisições desnecessárias
*   **TESTE** comportamento após F5 - cache persistido deve restaurar mas refetch em background

**Componentes envolvidos:**
*   Frontend: `App.tsx` (QueryClient config), `useTimeSlots.tsx` (Realtime + cache), `useSlotsQuery.ts` (hooks)
*   Biblioteca: `@tanstack/react-query`, `@tanstack/react-query-persist-client`, `@tanstack/query-sync-storage-persister`
*   Storage: `window.localStorage` (chave `'sana-calendar-cache'`)

## 7. Peculiaridades Técnicas

*   **Conflitos de Horário**: O Frontend (`DayColumn`) possui lógica visual para "pular" horários. Se existe um slot de 1h às 10:00, o slot das 10:30 não deve ser renderizado (ou deve ser renderizado como "bloqueado").
*   **Trigger de Exclusividade**: Nunca remova o trigger `trigger_slot_exclusivity` sem entender que ele protege o sistema contra edições externas.
*   **Validação de Telefone**: O sistema é rigoroso com duplicidade de pacientes. O telefone é chave única. O Frontend deve tratar o erro `23505` (Duplicate Key) amigavelmente.
*   **UUID vs String**: O campo `contractId` deve sempre ser um UUID válido. Nunca enviar IDs numéricos como strings (erro `22P02` do PostgreSQL).


---
## 8. Resumo de Funcionalidades Implementadas

### ✅ Funcionalidades Principais
*   **Criação e Edição de Agendamentos**: Slots simples, duplos e recorrentes
*   **Gestão de Pacientes**: Criação, edição, busca e seleção
*   **Validação de Dados**: Email (formato), telefone (duplicidade, formato) e campos obrigatórios
*   **Status Financeiro**: Cálculo automático baseado em pagamentos e débitos
*   **Débitos de Contratos**: Detecção e exibição de débitos de contratos anteriores
*   **Renovação de Contratos**: Sistema de renovação manual (automática ainda pendente)
*   **Atividades em Lote**: Criação múltipla com detecção de conflitos

### ⏳ Funcionalidades Pendentes
*   **Renovação Automática**: Configuração de renovação automática vs manual por contrato (campo `auto_renewal_enabled` já existe no banco)

---
**Para LLMs:** 
1. Ao modificar `slotsService.ts` ou criar novas features de agendamento, verifique sempre se a regra de **Exclusividade (3.1)** está sendo respeitada e se a limpeza de dados em cancelamentos (3.2) está ativa.
2. Para funcionalidades de renovação, use `renewalService.ts` e respeite a lógica de conflitos (3.7).
3. Ao trabalhar com pacientes, sempre use `validateEmail()` de `PatientForm.tsx` para validar emails. Telefone deve ser verificado para duplicidade (erro `23505`).
4. Ao calcular status financeiro, sempre verifique primeiro se há débitos de contratos anteriores (`pendingContracts`) antes de calcular o status do contrato atual.
5. **NUNCA** envie `contractId` como string numérica. Sempre valide que é um UUID válido.
6. **SEMPRE** invalide cache após mutações usando `queryClient.invalidateQueries()`. Nunca modifique cache diretamente. Use `slotsKeys.all` para invalidar todas as queries de slots.
7. Ao criar novos hooks de mutação, sempre invalide cache no `onSuccess`. Use `slotsKeys` factory para manter consistência.
8. Lembre-se que cache é persistido no `localStorage`. Ao testar, limpe o cache do navegador se necessário.
