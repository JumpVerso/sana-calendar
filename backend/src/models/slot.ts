// Tipos básicos para slots
export type EventType = 'online' | 'presential' | 'personal';
export type PriceCategory = 'padrao' | 'promocional' | 'emergencial' | '1h' | '30m' | '60m' | '90m' | '1h30' | '120m' | '2h';
export type SlotStatus = 'Vago' | 'AGUARDANDO' | 'RESERVADO' | 'CONFIRMADO' | 'CONTRATADO' | 'INDISPONIVEL';
export type FlowStatus = 'Enviado' | null;

export interface TimeSlot {
  id?: string;
  date?: string; // Derivado de start_time (compatibilidade)
  time?: string; // Derivado de start_time (compatibilidade)
  start_time: string; // ISO String (TIMESTAMPTZ) - OBRIGATÓRIO
  end_time: string;   // ISO String (TIMESTAMPTZ) - OBRIGATÓRIO
  event_type: EventType | null;
  price_category: PriceCategory | null;
  price: number | null; // Preço em centavos (ex: R$ 150,00 = 15000)
  status: SlotStatus | string;
  personal_activity: string | null;
  patient_id: string | null; // FK para tabela patients
  sibling_order: number;
  flow_status: FlowStatus;
  is_paid?: boolean;
  is_inaugural?: boolean; // Marca se o slot é inaugural (gratuito)
  contract_id?: string | null; // FK para tabela contracts
  created_at?: string;
  updated_at?: string;
  // Campos do paciente virão via JOIN quando necessário
  patient?: {
    name: string;
    phone: string | null;
    email: string | null;
    privacy_terms_accepted: boolean;
  };
}

export interface CreateSlotInput {
  date: string;
  time: string;
  eventType: EventType;
  priceCategory?: PriceCategory;
  // Preço em centavos (opcional). Se informado, deve ser usado em vez do cálculo padrão.
  price?: number | null;
  status?: string;
  patientId?: string;
  patientName?: string;
  patientPhone?: string;
  patientEmail?: string;
}

export interface UpdateSlotInput {
  eventType?: EventType;
  priceCategory?: PriceCategory | null;
  price?: number | null;
  status?: string; // Changed to string to match Zod generic string or specific union
  personalActivity?: string | null;
  patientId?: string | null; // FK para paciente
  flowStatus?: FlowStatus | null;
  contractId?: string | null; // FK para contrato
  isPaid?: boolean; // Status de pagamento
  isInaugural?: boolean; // Marca se o slot é inaugural (gratuito)
  reminderOneHour?: boolean;
  reminderTwentyFourHours?: boolean;
}

export interface CreateDoubleSlotInput {
  date: string;
  time: string;
  slot1Type: EventType;
  slot2Type: EventType;
  priceCategory?: PriceCategory;
  status?: string; // Para atividades pessoais (nome da atividade)
}

export interface ReserveSlotInput {
  patientName: string;
  patientPhone?: string;
}

export interface SendFlowInput {
  patientName: string;
  patientPhone?: string;
}

export interface CreateRecurringSlotsInput {
  originalSlotId: string;
  frequency: 'weekly' | 'biweekly' | 'monthly' | string;
  range: 'current_and_next_month' | string;
  slots?: Array<{ date: string; time: string }>; // Array de slots com data e hora
  dates?: string[]; // DEPRECATED - manter temporariamente para compatibilidade
  patientName?: string;
  patientPhone?: string;
  patientEmail?: string;
  occurrenceCount?: number;
  payments?: Record<string, boolean>;
  inaugurals?: Record<string, boolean>; // Marca se cada data é inaugural (gratuito)
  reminders?: { oneHour: boolean; twentyFourHours: boolean };
  skipDates?: string[]; // Datas a pular durante geração
}

export interface PreviewRecurringSlotsInput {
  originalSlotId: string;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  range: 'current_and_next_month';
  occurrenceCount?: number;
  skipDates?: string[]; // Datas a pular durante geração
}
