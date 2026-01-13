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

## 4. Peculiaridades Técnicas

*   **Conflitos de Horário**: O Frontend (`DayColumn`) possui lógica visual para "pular" horários. Se existe um slot de 1h às 10:00, o slot das 10:30 não deve ser renderizado (ou deve ser renderizado como "bloqueado").
*   **Trigger de Exclusividade**: Nunca remova o trigger `trigger_slot_exclusivity` sem entender que ele protege o sistema contra edições externas.
*   **Validação de Telefone**: O sistema é rigoroso com duplicidade de pacientes. O telefone é chave única. O Frontend deve tratar o erro `23505` (Duplicate Key) amigavelmente.

### 3.6. Formatação Monetária
*   **Armazenamento**: Todos os valores monetários são armazenados no banco de dados como **centavos** (inteiros).
    *   Exemplo: R$ 150,00 é armazenado como `15000`.
*   **Frontend**: O Frontend deve sempre converter esses valores para exibição (dividir por 100) e converter de volta para centavos ao enviar para a API (multiplicar por 100).
    *   **Input**: Inputs de valor devem tratar essa conversão, exibindo o valor formatado (ex: "150,00") mas manipulando internamente o valor em centavos ou convertendo no submit.


---
**Para LLMs:** Ao modificar `slotsService.ts` ou criar novas features de agendamento, verifique sempre se a regra de **Exclusividade (3.1)** está sendo respeitada e se a limpeza de dados em cancelamentos (3.2) está ativa. Para funcionalidades de renovação, use `renewalService.ts` e respeite a lógica de conflitos (3.7).
