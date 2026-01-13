# 📚 Documentação da API - Mobile Sheet Calendar

## Base URL
```
http://localhost:3001/api
```

---

## 🔐 Autenticação

### POST /auth/login
**Descrição:** Autenticar usuário no sistema

**Request:**
```json
{
  "email": "user@example.com",
  "password": "senha123"
}
```

**Response:**
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

---

## 👤 Pacientes (Patients)

### GET /patients
**Descrição:** Listar todos os pacientes

**Query Params:** Nenhum

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "João Silva",
    "phone": "(54) 99999-9999",
    "email": "joao@email.com",
    "privacy_terms_accepted": true,
    "created_at": "2025-12-21T10:00:00Z",
    "updated_at": "2025-12-21T10:00:00Z"
  }
]
```

---

### GET /patients/:id
**Descrição:** Buscar paciente por ID

**Params:**
- `id` (UUID) - ID do paciente

**Response:**
```json
{
  "id": "uuid",
  "name": "João Silva",
  "phone": "(54) 99999-9999",
  "email": "joao@email.com",
  "privacy_terms_accepted": true,
  "created_at": "2025-12-21T10:00:00Z",
  "updated_at": "2025-12-21T10:00:00Z"
}
```

---

### POST /patients
**Descrição:** Criar novo paciente

**Request:**
```json
{
  "name": "João Silva",
  "phone": "(54) 99999-9999",
  "email": "joao@email.com",
  "privacy_terms_accepted": true
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "João Silva",
  "phone": "(54) 99999-9999",
  "email": "joao@email.com",
  "privacy_terms_accepted": true,
  "created_at": "2025-12-21T10:00:00Z",
  "updated_at": "2025-12-21T10:00:00Z"
}
```

---

### PUT /patients/:id
**Descrição:** Atualizar dados do paciente

**Params:**
- `id` (UUID) - ID do paciente

**Request:**
```json
{
  "name": "João Silva Santos",
  "phone": "(54) 99999-9999",
  "email": "joao.novo@email.com"
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "João Silva Santos",
  "phone": "(54) 99999-9999",
  "email": "joao.novo@email.com",
  "privacy_terms_accepted": true,
  "created_at": "2025-12-21T10:00:00Z",
  "updated_at": "2025-12-21T11:00:00Z"
}
```

---

### DELETE /patients/:id
**Descrição:** Deletar paciente

**Params:**
- `id` (UUID) - ID do paciente

**Response:**
```json
{
  "success": true
}
```

---

## 📅 Slots (Agendamentos)

### GET /slots
**Descrição:** Buscar slots por período

**Query Params:**
- `startDate` (string) - Data inicial (YYYY-MM-DD)
- `endDate` (string) - Data final (YYYY-MM-DD)

**Exemplo:**
```
GET /slots?startDate=2025-12-01&endDate=2025-12-31
```

**Response:**
```json
[
  {
    "id": "uuid",
    "date": "2025-12-21",
    "time": "09:00:00",
    "event_type": "online",
    "price_category": "padrao",
    "price": "150",
    "status": "CONTRATADO",
    "is_paid": true,
    "flow_status": "Enviado",
    "contract_id": "uuid",
    "patient_id": "uuid",
    "patient": {
      "name": "João Silva",
      "phone": "(54) 99999-9999",
      "email": "joao@email.com",
      "privacy_terms_accepted": true
    },
    "reminder_one_hour": true,
    "reminder_twenty_four_hours": true,
    "created_at": "2025-12-21T10:00:00Z",
    "updated_at": "2025-12-21T10:00:00Z"
  }
]
```

---

### POST /slots
**Descrição:** Criar novo slot

**Request:**
```json
{
  "date": "2025-12-21",
  "time": "09:00",
  "eventType": "online",
  "priceCategory": "padrao"
}
```

**Response:**
```json
{
  "id": "uuid",
  "date": "2025-12-21",
  "time": "09:00:00",
  "event_type": "online",
  "price_category": "padrao",
  "price": "150",
  "status": "Vago",
  "created_at": "2025-12-21T10:00:00Z"
}
```

---

### POST /slots/double
**Descrição:** Criar slot duplo (2 slots no mesmo horário)

**Request:**
```json
{
  "date": "2025-12-21",
  "time": "09:00",
  "slot1Type": "online",
  "slot2Type": "presential",
  "priceCategory": "padrao"
}
```

**Response:**
```json
{
  "slot1": { "id": "uuid1", ... },
  "slot2": { "id": "uuid2", ... }
}
```

---

### PUT /slots/:id
**Descrição:** Atualizar slot

**Params:**
- `id` (UUID) - ID do slot

**Request:**
```json
{
  "status": "CONFIRMADO",
  "patientId": "uuid",
  "isPaid": true,
  "reminderOneHour": true,
  "reminderTwentyFourHours": true
}
```

**Response:**
```json
{
  "id": "uuid",
  "status": "CONFIRMADO",
  "patient_id": "uuid",
  "is_paid": true,
  "patient": {
    "name": "João Silva",
    ...
  }
}
```

---

### PUT /slots/:id/change-time
**Descrição:** Alterar data/hora do slot

**Params:**
- `id` (UUID) - ID do slot

**Request:**
```json
{
  "newDate": "2025-12-22",
  "newTime": "10:00"
}
```

**Response:**
```json
{
  "success": true,
  "slot": { ... }
}
```

---

### DELETE /slots/:id
**Descrição:** Deletar slot

**Params:**
- `id` (UUID) - ID do slot

**Response:**
```json
{
  "success": true
}
```

---

### POST /slots/:id/reserve
**Descrição:** Reservar slot (status → RESERVADO)

**Params:**
- `id` (UUID) - ID do slot

**Request:**
```json
{
  "patientName": "João Silva",
  "patientPhone": "(54) 99999-9999"
}
```

**Response:**
```json
{
  "id": "uuid",
  "status": "RESERVADO",
  ...
}
```

---

### POST /slots/:id/confirm
**Descrição:** Confirmar slot (status → CONFIRMADO)

**Params:**
- `id` (UUID) - ID do slot

**Request:**
```json
{
  "patientName": "João Silva",
  "patientPhone": "(54) 99999-9999"
}
```

**Response:**
```json
{
  "id": "uuid",
  "status": "CONFIRMADO",
  ...
}
```

---

### POST /slots/:id/send-flow
**Descrição:** Enviar flow do WhatsApp para o paciente

**Params:**
- `id` (UUID) - ID do slot

**Request:**
```json
{
  "patientName": "João Silva",
  "patientPhone": "(54) 99999-9999"
}
```

**Response:**
```json
{
  "success": true,
  "flowStatus": "Enviado"
}
```

---

## 📋 Contratos (Contracts)

### POST /slots/recurring
**Descrição:** Criar slots recorrentes (contrato)

**Request:**
```json
{
  "originalSlotId": "uuid",
  "frequency": "weekly",
  "range": "current_and_next_month",
  "dates": ["2025-12-21", "2025-12-28", "2026-01-04"],
  "patientName": "João Silva",
  "patientPhone": "(54) 99999-9999",
  "patientEmail": "joao@email.com",
  "occurrenceCount": 4,
  "payments": {
    "2025-12-21": true,
    "2025-12-28": false,
    "2026-01-04": false
  },
  "reminders": {
    "oneHour": true,
    "twentyFourHours": true
  }
}
```

**Response:**
```json
{
  "createdCount": 3,
  "conflicts": [],
  "contractId": "uuid",
  "contractShortId": "12345"
}
```

---

### POST /slots/recurring/preview
**Descrição:** Prévia de datas de recorrência (sem criar)

**Request:**
```json
{
  "originalSlotId": "uuid",
  "frequency": "weekly",
  "range": "current_and_next_month",
  "occurrenceCount": 4
}
```

**Response:**
```json
{
  "dates": ["2025-12-21", "2025-12-28", "2026-01-04", "2026-01-11"],
  "conflicts": []
}
```

---

### GET /slots/contracts/:contractId
**Descrição:** Buscar todos os slots de um contrato

**Params:**
- `contractId` (UUID) - ID do contrato

**Response:**
```json
[
  {
    "id": "uuid1",
    "date": "2025-12-21",
    "time": "09:00:00",
    "status": "CONTRATADO",
    "is_paid": true,
    ...
  },
  {
    "id": "uuid2",
    "date": "2025-12-28",
    "time": "09:00:00",
    "status": "CONTRATADO",
    "is_paid": false,
    ...
  }
]
```

---

### PUT /slots/contracts/:contractId
**Descrição:** Atualizar informações do contrato

**Params:**
- `contractId` (UUID) - ID do contrato

**Request:**
```json
{
  "patientName": "João Silva Santos",
  "patientPhone": "(54) 99999-9999",
  "patientEmail": "joao.novo@email.com",
  "remindersPerDate": {
    "2025-12-21": {
      "oneHour": true,
      "twentyFourHours": true
    },
    "2025-12-28": {
      "oneHour": false,
      "twentyFourHours": true
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "updatedCount": 2
}
```

---

## 📊 Resumo por Recurso

| Recurso | Rotas Disponíveis |
|---------|-------------------|
| **Auth** | 1 rota (login) |
| **Patients** | 5 rotas (CRUD completo) |
| **Slots** | 11 rotas (CRUD + ações especiais) |
| **Contracts** | 3 rotas (criar, buscar, atualizar) |

**Total:** 20 rotas ativas

---

## 🔄 Mudanças Recentes

### ❌ Removido:
- `POST /api/patients/find-or-create` - Rota ambígua removida

### ✅ Mantido:
- Todas as rotas RESTful claras e profissionais
- Separação clara entre criar, buscar, atualizar e deletar
 