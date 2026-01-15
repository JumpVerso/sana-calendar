import { z } from 'zod';

// Schema de categorias de preço (reutilizável)
const priceCategorySchema = z.enum(['padrao', 'promocional', 'emergencial', '1h', '30m', '60m', '90m', '1h30', '120m', '2h']);

// Schema para criar um slot
export const createSlotSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
    time: z.string().regex(/^\d{2}:\d{2}$/, 'Hora deve estar no formato HH:MM'),
    eventType: z.enum(['online', 'presential', 'personal']),
    priceCategory: priceCategorySchema.optional(),
    // Preço em centavos (opcional). Se enviado, sobrescreve o cálculo padrão.
    price: z.number().nullable().optional(),
    status: z.string().optional(), // Para atividades pessoais
    patientId: z.string().uuid().optional(),
    patientName: z.string().optional(),
    patientPhone: z.string().optional(),
    patientEmail: z.string().optional(),
});

// Schema para atualizar um slot
export const updateSlotSchema = z.object({
    eventType: z.enum(['online', 'presential', 'personal']).optional(),
    priceCategory: priceCategorySchema.nullable().optional(),
    price: z.number().nullable().optional(),
    status: z.string().optional(),
    personalActivity: z.string().nullable().optional(),
    patientName: z.string().nullable().optional(),
    patientPhone: z.string().nullable().optional(),
    patientEmail: z.union([z.literal(''), z.string().email('Email inválido'), z.null()]).optional(),
    patientId: z.string().uuid().nullable().optional(), // ID do paciente
    privacyTermsAccepted: z.boolean().nullable().optional(),
    flowStatus: z.enum(['Enviado']).nullable().optional(),
    contractId: z.string().nullable().optional(),
    isPaid: z.boolean().optional(),
    isInaugural: z.boolean().optional(),
    reminderOneHour: z.boolean().optional(),
    reminderTwentyFourHours: z.boolean().optional(),
});

// Schema para criar horário duplo
export const createDoubleSlotSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    slot1Type: z.enum(['online', 'presential', 'personal']),
    slot2Type: z.enum(['online', 'presential', 'personal']),
    priceCategory: priceCategorySchema.optional(),
    status: z.string().optional(), // Para atividades pessoais
});

// Schema para reservar slot
export const reserveSlotSchema = z.object({
    patientName: z.string().min(1, 'Nome do paciente é obrigatório'),
    patientPhone: z.string().optional().or(z.literal('')), // Telefone opcional
});

// Schema para enviar flow
export const sendFlowSchema = z.object({
    patientName: z.string().min(1),
    patientPhone: z.string().optional().or(z.literal('')), // Telefone opcional
});

// Schema para query params de buscar slots
export const getSlotsQuerySchema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Schema para criar slots recorrentes
export const createRecurringSlotsSchema = z.object({
    originalSlotId: z.string().uuid(),
    frequency: z.enum(['weekly', 'biweekly', 'monthly']),
    range: z.enum(['current_and_next_month']),
    slots: z.array(z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: z.string().regex(/^\d{2}:\d{2}$/)
    })).optional(), // NOVO: array de slots com data e hora
    dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(), // Mantido para compatibilidade
    occurrenceCount: z.number().int().min(1).max(5).optional(),
    patientName: z.string().optional(),
    patientPhone: z.string().optional(),
    patientEmail: z.string().optional(),
    payments: z.record(z.string(), z.boolean()).optional(), // Map <DateString, IsPaid>
    inaugurals: z.record(z.string(), z.boolean()).optional(), // Map <DateString, IsInaugural>
    reminders: z.object({
        oneHour: z.boolean(),
        twentyFourHours: z.boolean()
    }).optional(),
    skipDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(), // Datas a pular
});

// Schema para preview da recorrência
export const previewRecurringSlotsSchema = z.object({
    originalSlotId: z.string().uuid(),
    frequency: z.enum(['weekly', 'biweekly', 'monthly']),
    range: z.enum(['current_and_next_month']),
    occurrenceCount: z.number().int().min(1).max(5).optional(),
    skipDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(), // Datas a pular
});

// Schema para bloquear dia (mantido para compatibilidade)
export const blockDaySchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
});

// Schemas para blocked_days (CRUD)
export const createBlockedDaySchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
    reason: z.string().nullable().optional(),
});

export const updateBlockedDaySchema = z.object({
    reason: z.string().nullable().optional(),
});

export const getBlockedDaysQuerySchema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
