import { supabase } from '../db/supabase.js';
import { addWeeks, addDays, addMonths, format, endOfMonth, parseISO, isBefore, isSameDay } from 'date-fns';
import * as patientsService from './patientsService.js';
import type {
    TimeSlot,
    CreateSlotInput,
    UpdateSlotInput,
    CreateDoubleSlotInput,
    ReserveSlotInput,
    SendFlowInput,
    CreateRecurringSlotsInput,
    PreviewRecurringSlotsInput,
} from '../models/slot.js';

// Função auxiliar para calcular preço baseado no tipo e categoria
// Retorna o preço em centavos (ex: R$ 150,00 = 15000)
function calculatePrice(eventType: string, priceCategory: string | null): number | null {
    if (eventType === 'personal') return null;
    if (!priceCategory) return null;

    const prices: Record<string, Record<string, number>> = {
        online: { padrao: 15000, promocional: 8000, emergencial: 20000 }, // R$ 150,00, R$ 80,00 e R$ 200,00
        presential: { padrao: 20000, promocional: 10000, emergencial: 25000 }, // R$ 200,00, R$ 100,00 e R$ 250,00
    };

    return prices[eventType]?.[priceCategory] || null;
}

// Helpers de Tempo para validação de Overlap
function parseTime(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

function formatTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function addMinutesStr(time: string, minutes: number): string {
    return formatTime(parseTime(time) + minutes);
}

// Helpers para converter entre start_time/end_time e date/time
function extractDateFromTimestamp(timestamp: string): string {
    return format(parseISO(timestamp), 'yyyy-MM-dd');
}

function extractTimeFromTimestamp(timestamp: string): string {
    return format(parseISO(timestamp), 'HH:mm');
}

function createTimestamp(date: string, time: string): string {
    // Criar timestamp assumindo que o horário é de Brasília (UTC-3)
    // Formato: 2026-01-16T09:00:00-03:00
    return new Date(`${date}T${formatDbTime(time)}-03:00`).toISOString();
}

function parseDurationMinutes(duration: string): number {
    if (duration === '2h' || duration === '120m') return 120;
    if (duration === '1h30' || duration === '90m') return 90;
    if (duration === '1h' || duration === '60m') return 60;
    return 30;
}

function isSlotOccupiedForOverlap(slot: { event_type?: string | null; status?: string | null }): boolean {
    // Replica a regra usada em checkOverlapConflicts:
    // ignora slot vazio (sem event_type e status Vago/VAGO/undefined)
    if (slot.event_type) return true;
    const status = slot.status || '';
    return !(status === '' || status === 'Vago' || status === 'VAGO');
}

function normalizePatientRelation<T extends { patient?: any }>(slot: T): T {
    // Em alguns selects, o PostgREST pode retornar relação como array.
    // O modelo TimeSlot espera paciente como objeto (1:1), então normalizamos.
    const anySlot: any = slot as any;
    if (anySlot && Array.isArray(anySlot.patient)) {
        anySlot.patient = anySlot.patient[0] || null;
    }
    return slot;
}

// Helper para calcular duração do slot em minutos
function getSlotDuration(slot: { event_type: string | null, personal_activity: string | null, price_category: string | null, status?: string, start_time?: string | null, end_time?: string | null }): number {
    // Se for comercial
    if (slot.event_type !== 'personal') {
        // Regra de Negócio: Agendamentos comerciais (Online/Presencial) têm duração fixa de 1 hora.
        return 60;
    }

    // Se for pessoal, usar start_time e end_time para calcular duração
    if (slot.start_time && slot.end_time) {
        const start = new Date(slot.start_time);
        const end = new Date(slot.end_time);
        const durationMs = end.getTime() - start.getTime();
        const durationMinutes = Math.round(durationMs / 60000);
        return durationMinutes;
    }

    // Fallback: se não tiver start_time/end_time, tentar inferir de personal_activity (legacy)
    // Isso só deve acontecer com dados antigos antes da migração
    if (slot.personal_activity) {
        if (slot.personal_activity.includes('#120m') || slot.personal_activity.includes('#2h')) return 120;
        if (slot.personal_activity.includes('#90m') || slot.personal_activity.includes('#1h30')) return 90;
        if (slot.personal_activity.includes('#60m') || slot.personal_activity.includes('#1h')) return 60;
    }

    // Padrão: 30 minutos
    return 30;
}

// Verificar Sobreposição (Generalizada para N durações)
async function checkOverlapConflicts(date: string, time: string, durationMinutes: number, excludeSlotId?: string): Promise<void> {
    // Verificar se o dia está bloqueado
    const { isDayBlocked } = await import('./blockedDaysService.js');
    const dayIsBlocked = await isDayBlocked(date);
    if (dayIsBlocked) {
        throw new Error('Este dia está bloqueado. Não é possível criar novos agendamentos.');
    }

    // Converter para timestamp para buscar por start_time
    const proposedStartTime = createTimestamp(date, time);
    const proposedStartDate = new Date(proposedStartTime);
    const proposedEndDate = new Date(proposedStartDate.getTime() + durationMinutes * 60000);
    
    // Buscar slots que se sobrepõem usando start_time e end_time
    let query = supabase
        .from('time_slots')
        .select('id, event_type, personal_activity, price_category, status, start_time, end_time')
        .gte('start_time', new Date(date + 'T00:00:00-03:00').toISOString())
        .lte('start_time', new Date(date + 'T23:59:59-03:00').toISOString());
    
    // Excluir o slot atual se fornecido (para UPDATE)
    if (excludeSlotId) {
        query = query.neq('id', excludeSlotId);
    }
    
    const { data: overlappingSlots, error } = await query;

    if (error) {
        console.error('[checkOverlapConflicts] Erro ao buscar slots:', error);
        throw error;
    }

    if (!overlappingSlots || overlappingSlots.length === 0) {
        return; // Nenhum slot no dia, sem conflitos
    }

    // Verificar sobreposição com cada slot existente
    for (const slot of overlappingSlots) {
        if (!slot.start_time || !slot.end_time) continue;

        const slotStart = new Date(slot.start_time);
        const slotEnd = new Date(slot.end_time);

        // Verificar se há sobreposição: dois intervalos se sobrepõem se start1 < end2 E end1 > start2
        const overlaps = proposedStartDate < slotEnd && proposedEndDate > slotStart;

        if (overlaps) {
            // Ignorar slots vagos
            if (!slot.event_type && (!slot.status || slot.status === 'Vago' || slot.status === 'VAGO')) {
                continue;
            }

            // Se o slot está INDISPONIVEL, bloqueia completamente
            if (slot.status === 'INDISPONIVEL') {
                const slotTimeStr = extractTimeFromTimestamp(slot.start_time);
                throw new Error(`Conflito: Horário indisponível às ${slotTimeStr} bloqueia este horário.`);
            }

            // Calcular duração do slot existente
            const slotDuration = getSlotDuration(slot);
            const slotTimeStr = extractTimeFromTimestamp(slot.start_time);
            throw new Error(`Conflito: Um agendamento iniciado às ${slotTimeStr} tem duração de ${formatDurationLabel(slotDuration)} e bloqueia este horário.`);
        }
    }
}

function formatDurationLabel(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `${h}h${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
}

// Função auxiliar para verificar sobreposição de slots
// Verifica se um slot proposto conflita com slots existentes na mesma data
async function checkSlotOverlap(
    date: string,
    proposedStartTime: string,
    proposedDurationMinutes: number,
    excludeSlotId?: string
): Promise<{ hasConflict: boolean; conflictingSlot?: any; conflictReason?: string }> {
    // Converter para timestamps
    const proposedStartTimestamp = createTimestamp(date, proposedStartTime);
    const proposedStart = new Date(proposedStartTimestamp);
    const proposedEnd = new Date(proposedStart.getTime() + proposedDurationMinutes * 60000);

    // Buscar todos os slots da data usando start_time
    const { data: allSlots, error } = await supabase
        .from('time_slots')
        .select('id, event_type, status, personal_activity, price_category, start_time, end_time')
        .gte('start_time', new Date(date + 'T00:00:00-03:00').toISOString())
        .lte('start_time', new Date(date + 'T23:59:59-03:00').toISOString());

    if (error) {
        console.error(`[checkSlotOverlap] Erro ao buscar slots:`, error);
        return { hasConflict: false };
    }

    if (!allSlots || allSlots.length === 0) {
        return { hasConflict: false };
    }

    // Verificar cada slot existente
    for (const existingSlot of allSlots) {
        // Ignorar o slot excluído (slot original)
        if (excludeSlotId && existingSlot.id === excludeSlotId) {
            continue;
        }

        // Ignorar slots sem start_time ou end_time
        if (!existingSlot.start_time || !existingSlot.end_time) {
            continue;
        }

        // Normalizar status para comparação (case-insensitive)
        const statusUpper = existingSlot.status ? existingSlot.status.toUpperCase() : '';
        
        // Ignorar apenas slots realmente vagos
        // Slots ocupados têm event_type OU status relevante (CONFIRMADO, RESERVADO, CONTRATADO, INDISPONIVEL)
        const isOccupied = existingSlot.event_type || 
                          (statusUpper && 
                           statusUpper !== 'VAGO' &&
                           ['CONFIRMADO', 'RESERVADO', 'CONTRATADO', 'INDISPONIVEL', 'AGUARDANDO'].includes(statusUpper));
        
        if (!isOccupied) {
            continue;
        }

        // Calcular intervalo do slot existente usando start_time e end_time
        const existingStart = new Date(existingSlot.start_time);
        const existingEnd = new Date(existingSlot.end_time);

        // Verificar sobreposição de intervalos
        // Dois intervalos se sobrepõem se: start1 < end2 E end1 > start2
        const overlaps = proposedStart < existingEnd && proposedEnd > existingStart;

        if (overlaps) {
            // Determinar motivo do conflito (usar statusUpper já calculado)
            let conflictReason = 'Ocupado';
            
            if (statusUpper === 'INDISPONIVEL') {
                conflictReason = 'Horário indisponível';
            } else if (statusUpper === 'CONFIRMADO') {
                conflictReason = 'Horário confirmado';
            } else if (statusUpper === 'RESERVADO') {
                conflictReason = 'Horário reservado';
            } else if (statusUpper === 'CONTRATADO') {
                conflictReason = 'Horário contratado';
            } else if (existingSlot.event_type === 'personal') {
                conflictReason = 'Atividade Pessoal';
            } else if (existingSlot.event_type) {
                conflictReason = existingSlot.status || 'Ocupado';
            }

            return {
                hasConflict: true,
                conflictingSlot: existingSlot,
                conflictReason
            };
        }
    }

    return { hasConflict: false };
}

// Função auxiliar para formatar horário para o banco (HH:MM:00)
function formatDbTime(time: string): string {
    // Se já tiver segundos (HH:MM:SS), retorna como está
    if (time.length === 8) return time;
    // Se for HH:MM, adiciona :00
    if (time.length === 5) return `${time}:00`;
    return time;
}

// Função para gerar ID curto (5 caracteres numéricos)
function generateShortId(): string {
    return Math.floor(10000 + Math.random() * 90000).toString();
}

// Calcular próximo sibling_order disponível para um horário
async function calculateSiblingOrder(date: string, time: string): Promise<number> {
    const startTimestamp = createTimestamp(date, time);
    const { data, error } = await supabase
        .from('time_slots')
        .select('sibling_order')
        .eq('start_time', startTimestamp)
        .order('sibling_order', { ascending: false })
        .limit(1);

    if (error) throw error;

    // Se não houver slots, retorna 0. Senão, retorna o próximo número
    return data && data.length > 0 ? data[0].sibling_order + 1 : 0;
}

// Recalcular sibling_order após deletar um slot
async function recalculateSiblingOrders(date: string, time: string): Promise<void> {
    const startTimestamp = createTimestamp(date, time);
    const { data: slots, error } = await supabase
        .from('time_slots')
        .select('id, sibling_order')
        .eq('start_time', startTimestamp)
        .order('sibling_order', { ascending: true });

    if (error) throw error;
    if (!slots || slots.length === 0) return;

    // Reorganizar para 0, 1, 2...
    for (let i = 0; i < slots.length; i++) {
        if (slots[i].sibling_order !== i) {
            await supabase
                .from('time_slots')
                .update({ sibling_order: i })
                .eq('id', slots[i].id);
        }
    }
}

// Aplicar regras de exclusividade
async function applyExclusivityRules(
    slotId: string,
    date: string,
    time: string,
    status: string,
    eventType: string | null
): Promise<void> {
    // Se CONFIRMADO, CONTRATADO ou Personal → deletar siblings
    if (status === 'CONFIRMADO' || status === 'CONTRATADO' || eventType === 'personal') {
        const startTimestamp = createTimestamp(date, time);
        console.log(`[applyExclusivityRules] Checking for siblings to delete - Date: ${date}, Time: ${time}, TriggerStatus: ${status}, ExcludeID: ${slotId}`);

        const { data, error, count } = await supabase
            .from('time_slots')
            .delete({ count: 'exact' })
            .eq('start_time', startTimestamp)
            .neq('id', slotId)
            .select();

        if (error) {
            console.error('[applyExclusivityRules] Error deleting siblings:', error);
        } else {
            console.log(`[applyExclusivityRules] Success. Deleted ${data?.length} siblings.`);
        }
    } else {
        console.log(`[applyExclusivityRules] Skipping deletion (Status ${status} is not exclusive)`);
    }
}

// Ajustar status de siblings
async function adjustSiblingStatus(
    slotId: string,
    date: string,
    time: string,
    newStatus: string
): Promise<void> {
    const startTimestamp = createTimestamp(date, time);
    if (newStatus === 'RESERVADO' || newStatus === 'CONFIRMADO') {
        // Siblings viram AGUARDANDO
        await supabase
            .from('time_slots')
            .update({ status: 'AGUARDANDO' })
            .eq('start_time', startTimestamp)
            .neq('id', slotId)
            .neq('status', 'AGUARDANDO');
    } else if (newStatus === 'Vago') {
        // Se sibling é AGUARDANDO, vira Vago também
        await supabase
            .from('time_slots')
            .update({
                status: 'Vago',
                patient_id: null,
                contract_id: null,
                flow_status: null,
            })
            .eq('start_time', startTimestamp)
            .neq('id', slotId)
            .eq('status', 'AGUARDANDO');
    }
}

// BUSCAR SLOTS
export async function getSlots(startDate: string, endDate: string): Promise<TimeSlot[]> {
    // Converter datas para timestamps para filtrar por start_time (horário de Brasília)
    const startTimestamp = new Date(`${startDate}T00:00:00-03:00`).toISOString();
    const endTimestamp = new Date(`${endDate}T23:59:59-03:00`).toISOString();
    
    const { data, error } = await supabase
        .from('time_slots')
        .select(`
            *,
            patient:patients(
                name,
                phone,
                email,
                privacy_terms_accepted
            ),
            contract:contracts(
                id,
                end_date,
                auto_renewal_enabled
            )
        `)
        .gte('start_time', startTimestamp)
        .lte('start_time', endTimestamp)
        .order('start_time', { ascending: true })
        .order('sibling_order', { ascending: true });

    if (error) throw error;
    
    const slots = data || [];
    
    // Calcular início e fim da semana atual (segunda a domingo)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
    
    // Agrupar slots por contract_id para encontrar o último slot de cada contrato (usando end_time)
    const contractMaxEndTimes: Record<string, string> = {}; // contract_id -> end_time máximo (ISO string)
    
    // Buscar o end_time máximo de cada contrato presente nos slots
    const contractIds = [...new Set(slots.filter(s => s.contract_id).map(s => s.contract_id))];
    
    if (contractIds.length > 0) {
        // Para cada contrato, buscar o end_time máximo dos seus slots
        const { data: maxEndTimesData } = await supabase
            .from('time_slots')
            .select('contract_id, end_time')
            .in('contract_id', contractIds)
            .not('end_time', 'is', null)
            .order('end_time', { ascending: false });
        
        if (maxEndTimesData) {
            // Encontrar o end_time máximo para cada contrato
            for (const row of maxEndTimesData) {
                if (row.contract_id && row.end_time) {
                    if (!contractMaxEndTimes[row.contract_id] || row.end_time > contractMaxEndTimes[row.contract_id]) {
                        contractMaxEndTimes[row.contract_id] = row.end_time;
                    }
                }
            }
        }
    }
    
    // Para cada paciente, encontrar qual contrato tem o end_time máximo mais recente (último contrato)
    const patientLastContracts: Record<string, string> = {}; // patient_id -> contract_id do último contrato
    
    // Primeiro, identificar todos os patient_ids únicos dos slots com contrato
    const patientIds = [...new Set(slots.filter(s => s.patient_id && s.contract_id).map(s => s.patient_id))];
    
    if (patientIds.length > 0) {
        // Para cada paciente, buscar TODOS os contratos (não apenas os do intervalo visível)
        for (const patientId of patientIds) {
            // Buscar TODOS os slots do paciente que têm contrato e end_time (sem limitar pelo intervalo)
            const { data: allPatientSlots, error: patientError } = await supabase
                .from('time_slots')
                .select('contract_id, end_time')
                .eq('patient_id', patientId)
                .not('contract_id', 'is', null)
                .not('end_time', 'is', null)
                .order('end_time', { ascending: false });
            
            if (patientError) {
                console.error(`[getSlots] Erro ao buscar slots do paciente ${patientId}:`, patientError);
                continue;
            }
            
            if (allPatientSlots && allPatientSlots.length > 0) {
                // Calcular o end_time máximo para cada contrato do paciente
                const contractMaxEndTimesForPatient: Record<string, string> = {};
                
                for (const row of allPatientSlots) {
                    if (row.contract_id && row.end_time) {
                        if (!contractMaxEndTimesForPatient[row.contract_id] || row.end_time > contractMaxEndTimesForPatient[row.contract_id]) {
                            contractMaxEndTimesForPatient[row.contract_id] = row.end_time;
                        }
                    }
                }
                
                // Encontrar qual contrato tem o end_time máximo mais recente (último contrato do paciente)
                let lastContractId: string | null = null;
                let lastContractMaxEndTime: string | null = null;
                
                for (const [contractId, maxEndTime] of Object.entries(contractMaxEndTimesForPatient)) {
                    if (!lastContractMaxEndTime || maxEndTime > lastContractMaxEndTime) {
                        lastContractMaxEndTime = maxEndTime;
                        lastContractId = contractId;
                    }
                }
                
                if (lastContractId) {
                    patientLastContracts[patientId] = lastContractId;
                }
            }
        }
    }
    
    // Calcular flags de renovação para cada slot
    return slots.map(slot => {
        let isLastSlotOfContract = false;
        let needsRenewal = false;
        
        if (slot.contract_id && slot.patient_id && slot.end_time) {
            const maxEndTime = contractMaxEndTimes[slot.contract_id];
            
            // Verificar se é o último slot do contrato (comparando end_time)
            if (maxEndTime && slot.end_time === maxEndTime) {
                isLastSlotOfContract = true;
                
                // Verificar se este é o último contrato do paciente
                const lastContractId = patientLastContracts[slot.patient_id];
                const isLastContract = lastContractId === slot.contract_id;
                
                // Verificar se o end_time está na semana atual
                const slotEndDate = format(parseISO(slot.end_time), 'yyyy-MM-dd');
                const isInCurrentWeek = slotEndDate >= weekStartStr && slotEndDate <= weekEndStr;
                
                // Mostrar RENOVAR apenas se:
                // 1. É o último slot do contrato (end_time máximo do contrato)
                // 2. Este contrato é o último contrato do paciente (end_time máximo mais recente)
                // 3. O end_time está na semana atual
                if (isLastContract && isInCurrentWeek) {
                    needsRenewal = true;
                }
            }
        }
        
        return {
            ...slot,
            isLastSlotOfContract,
            needsRenewal
        };
    });
}

// CRIAR SLOT
export async function createSlot(input: CreateSlotInput): Promise<TimeSlot> {
    const { date, time, eventType, priceCategory, status } = input;

    // Verificar se o dia está bloqueado
    const { isDayBlocked } = await import('./blockedDaysService.js');
    const dayIsBlocked = await isDayBlocked(date);
    if (dayIsBlocked) {
        throw new Error('Este dia está bloqueado. Não é possível criar novos agendamentos.');
    }

    // Verificar se o dia está bloqueado (verificação deve ser feita via blocked_days, não via slots INDISPONIVEL)
    // Removida verificação de slots INDISPONIVEL - usar apenas blocked_days

    // Validar Overlap
    let duration = 30; // Minutos

    // Determine duration from category/input
    if (eventType === 'personal') {
        if (priceCategory === '2h' || priceCategory === '120m') duration = 120;
        else if (priceCategory === '1h30' || priceCategory === '90m') duration = 90;
        else if (priceCategory === '1h' || priceCategory === '60m') duration = 60;
        else duration = 30;
    } else {
        // Comercial geralmente 30m, a menos que definido diferente
        duration = (priceCategory === '1h') ? 60 : 30;
    }

    await checkOverlapConflicts(date, time, duration);

    const siblingOrder = await calculateSiblingOrder(date, time);
    const price = calculatePrice(eventType, priceCategory || null);

    // LOGIC: Suffix Strategy for Personal Duration
    // If personal, we append the duration (from priceCategory) to the personal_activity
    // Status should be independent (PENDENTE by default for new slots)
    let finalStatus = status;
    let finalCategory: any = priceCategory;
    let personalActivityValue: string | null = null;

    if (eventType === 'personal') {
        finalCategory = null; // DB doesn't accept '1h'
        // status input here is actually the Activity Label coming from frontend initially
        // Frontend sends: 
        // eventType: 'personal'
        // status: 'Almoço' (nome da atividade)
        // duration: '1h' -> priceCategory

        // Salvar apenas o nome da atividade (sem sufixo de duração)
        // A duração será calculada de start_time e end_time
        const activityLabel = status || 'Atividade Pessoal';
        personalActivityValue = activityLabel;

        // Set actual status to PENDENTE for new personal slots
        finalStatus = 'PENDENTE';
    } else {
        finalStatus = status || 'Vago';
        personalActivityValue = null;
    }

    let finalPatientId: string | null = null;

    // Se patientId foi fornecido, usá-lo.
    // Se não, e tivermos dados do paciente, criar ou buscar.
    if (input.patientId) {
        finalPatientId = input.patientId;
    } else if (input.patientName) {
        const patient = await patientsService.findOrCreatePatient({
            name: input.patientName,
            phone: input.patientPhone,
            email: input.patientEmail
        });
        finalPatientId = patient.id;
    }

    const startTimestamp = createTimestamp(date, time);
    const endTimestamp = new Date(new Date(startTimestamp).getTime() + duration * 60000).toISOString();

    const slotData = {
        event_type: eventType,
        price_category: finalCategory,
        price,
        status: finalStatus,
        patient_id: finalPatientId, // Vincular paciente
        personal_activity: personalActivityValue,
        sibling_order: siblingOrder,
        start_time: startTimestamp, // UTC/ISO
        end_time: endTimestamp,
    };

    const { data, error } = await supabase
        .from('time_slots')
        .insert([slotData])
        .select()
        .single();

    if (error) throw error;
    return data;
}

// CRIAR MÚLTIPLAS ATIVIDADES PESSOAIS EM LOTE
export async function createBulkPersonalSlots(slots: Array<{
    date: string;
    time: string;
    activity: string;
    duration: string;
}>): Promise<{
    created: Array<{ id: string; start_time: string; end_time: string }>;
    failed: Array<{ slot: any; error: string }>;
}> {
    const { data, error } = await supabase.rpc('create_bulk_personal_slots', {
        payload: { slots },
    });

    if (error) {
        console.error('[createBulkPersonalSlots] Erro no RPC create_bulk_personal_slots:', error);
        throw error;
    }

    // RPC retorna { created: [...], failed: [...] }
    return data as any;
}

// CRIAR HORÁRIO DUPLO
export async function createDoubleSlot(input: CreateDoubleSlotInput): Promise<TimeSlot[]> {
    const { date, time, slot1Type, slot2Type, priceCategory, status } = input;

    // Validar Overlap
    // A criação de um double slot é sempre a criação de dois slots de 30min,
    // ou seja, não é um slot de 1h que se sobrepõe.
    // A menos que o double slot seja interpretado como um slot de 1h.
    // Pelo contexto, parece que são dois slots de 30min.
    // Se fosse um slot de 1h, o `isOneHour` seria true.
    // Assumindo que `createDoubleSlot` cria dois slots de 30min, `isOneHour` é false.
    // No entanto, se um dos slots for 'personal' com '1h' category, isso mudaria.
    // A lógica de `checkOverlapConflicts` é para o slot *que está sendo criado*.
    // Se estamos criando dois slots de 30min, nenhum deles é de 1h.
    // Mas se a intenção é que o "double slot" *ocupe* 1h, então a verificação deve ser para 1h.
    // A instrução não especifica para `createDoubleSlot`, então vou adicionar a verificação
    // como se fosse um slot de 30min, pois são dois slots individuais.
    // Se a intenção é que o "double slot" seja tratado como um bloco de 1h para conflitos,
    // então `isOneHour` deveria ser `true`.
    // Dado que `createDoubleSlot` cria *dois* slots, e `checkOverlapConflicts` verifica *um* slot,
    // a verificação mais segura é assumir que o "double slot" em si não é um slot de 1h,
    // mas sim dois slots de 30min.
    // Se a intenção é que a *combinação* dos dois slots de 30min forme um bloco de 1h,
    // e que esse bloco de 1h não se sobreponha, então `isOneHour` deveria ser `true`.
    // Pela definição de `checkOverlapConflicts`, ela verifica se *o slot em questão* é de 1h.
    // Aqui estamos criando dois slots de 30min. Então, `isOneHour` é `false`.
    // No entanto, se o `priceCategory` for '1h' para um slot pessoal, isso indica 1h.
    // A instrução não forneceu um snippet para `createDoubleSlot`, então vou inferir.
    // Se `createDoubleSlot` é para criar dois slots de 30min, então `isOneHour` é `false`.
    // Se a intenção é que a *combinação* dos dois slots de 30min seja tratada como 1h para conflitos,
    // então `isOneHour` deveria ser `true`.
    // Vou assumir que a intenção é que a *combinação* dos dois slots de 30min seja tratada como 1h para conflitos.
    // Isso significa que o `checkOverlapConflicts` deve ser chamado com `duration = 60`.
    // Isso é consistente com a ideia de que um "double slot" ocupa um período de 1h.
    await checkOverlapConflicts(date, time, 60);


    const price1 = calculatePrice(slot1Type, priceCategory || 'padrao');
    const price2 = calculatePrice(slot2Type, priceCategory || 'padrao');

    // Helper to format personal activity name (sem sufixo de duração)
    const formatPersonalActivity = (type: string, activityName?: string) => {
        if (type !== 'personal') return null;
        return activityName || 'Atividade Pessoal';
    };

    const slot1Activity = formatPersonalActivity(slot1Type, status);
    const slot2Activity = formatPersonalActivity(slot2Type, status);

    // Initial status for personal is PENDENTE
    const slot1Status = slot1Type === 'personal' ? 'PENDENTE' : (status || 'Vago');
    const slot2Status = slot2Type === 'personal' ? 'PENDENTE' : (status || 'Vago');

    const startTimestamp = createTimestamp(date, time);
    const endTimestamp = new Date(new Date(startTimestamp).getTime() + 60 * 60000).toISOString(); // Assume 60m block for double slots

    const slot1Data = {
        event_type: slot1Type,
        price_category: slot1Type !== 'personal' ? (priceCategory || 'padrao') : null,
        price: price1,
        status: slot1Status,
        personal_activity: slot1Activity,
        sibling_order: 0,
        start_time: startTimestamp,
        end_time: endTimestamp,
    };

    const slot2Data = {
        event_type: slot2Type,
        price_category: slot2Type !== 'personal' ? (priceCategory || 'padrao') : null,
        price: price2,
        status: slot2Status,
        personal_activity: slot2Activity,
        sibling_order: 1,
        start_time: startTimestamp,
        end_time: endTimestamp,
    };

    const { data, error } = await supabase
        .from('time_slots')
        .insert([slot1Data, slot2Data])
        .select();

    if (error) throw error;
    return data || [];
}

// ATUALIZAR SLOT
export async function updateSlot(id: string, input: UpdateSlotInput): Promise<TimeSlot> {
    // Buscar slot atual
    const { data: currentSlot, error: fetchError } = await supabase
        .from('time_slots')
        .select('id, start_time, end_time, event_type, price_category, price, status, personal_activity, patient_id, contract_id, is_paid, is_inaugural, reminder_one_hour, reminder_twenty_four_hours, sibling_order, flow_status')
        .eq('id', id)
        .single();

    if (fetchError) throw fetchError;
    if (!currentSlot) throw new Error('Slot not found');

    // Preparar dados para atualização
    const updateData: any = {};

    if (input.eventType !== undefined) updateData.event_type = input.eventType;

    // Handle Price Category / Duration
    if (input.priceCategory !== undefined) {
        if (currentSlot.event_type === 'personal') {
            // It's a personal slot, input.priceCategory contains '1h', '1h30', '2h', etc.
            // A duração será atualizada via end_time baseado em start_time
            // Não precisamos modificar personal_activity (apenas nome da atividade)
            updateData.price_category = null;
            
            // Recalcular end_time baseado na nova duração
            if (currentSlot.start_time) {
                let durationMinutes = 30;
                if (input.priceCategory === '2h' || input.priceCategory === '120m') durationMinutes = 120;
                else if (input.priceCategory === '1h30' || input.priceCategory === '90m') durationMinutes = 90;
                else if (input.priceCategory === '1h' || input.priceCategory === '60m') durationMinutes = 60;
                
                const startTimeEpoch = new Date(currentSlot.start_time).getTime();
                const newEndTimeIso = new Date(startTimeEpoch + durationMinutes * 60000).toISOString();
                updateData.end_time = newEndTimeIso;
            }
        } else {
            // Comercial slot
            updateData.price_category = input.priceCategory;
        }
    }

    if (input.price !== undefined) updateData.price = input.price;

    // Status is now independent for personal slots too
    if (input.status !== undefined) {
        updateData.status = input.status;
    }

    // Rename activity
    if (input.personalActivity !== undefined) {
        if (currentSlot.event_type === 'personal') {
            // Renaming the activity - salvar apenas o nome (sem sufixo de duração)
            // A duração é gerenciada via start_time/end_time
            updateData.personal_activity = input.personalActivity;
        } else {
            updateData.personal_activity = input.personalActivity;
        }
    }

    // Auto-clear fields if status becomes Vago
    if (updateData.status === 'Vago' || updateData.status === 'VAGO' || input.status === 'Vago' || input.status === 'VAGO') {
        updateData.flow_status = null;
        updateData.patient_id = null;
        updateData.contract_id = null;
        updateData.is_paid = false;
        updateData.is_inaugural = false;
    }

    if (input.patientId !== undefined && updateData.patient_id === undefined) updateData.patient_id = input.patientId || null;
    if (input.flowStatus !== undefined && updateData.flow_status === undefined) updateData.flow_status = input.flowStatus;
    if (input.contractId !== undefined) updateData.contract_id = input.contractId;
    if (input.isPaid !== undefined) updateData.is_paid = input.isPaid;
    if (input.isInaugural !== undefined) updateData.is_inaugural = input.isInaugural;

    // Force clear if Vago
    const isVago = (input.status === 'Vago' || input.status === 'VAGO');
    if (isVago) {
        if (input.flowStatus === undefined) updateData.flow_status = null;
        if (input.patientId === undefined) updateData.patient_id = null;
        if (input.contractId === undefined) updateData.contract_id = null;
        if (input.isPaid === undefined) updateData.is_paid = false;
        if (input.isInaugural === undefined) updateData.is_inaugural = false;
    }

    if (input.reminderOneHour !== undefined) updateData.reminder_one_hour = input.reminderOneHour;
    if (input.reminderTwentyFourHours !== undefined) updateData.reminder_twenty_four_hours = input.reminderTwentyFourHours;

    // Validar Overlap para atualização
    // Calcular "finalDuration" - usar start_time/end_time se disponível, senão calcular
    let finalDuration: number;
    
    if (updateData.end_time) {
        // Se end_time foi atualizado, calcular duração dele
        const startTime = new Date(currentSlot.start_time || updateData.start_time || '');
        const endTime = new Date(updateData.end_time);
        finalDuration = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
    } else {
        // Usar getSlotDuration com os dados atualizados
        const simulatedSlot = {
            event_type: updateData.event_type || currentSlot.event_type,
            personal_activity: updateData.personal_activity !== undefined ? updateData.personal_activity : currentSlot.personal_activity,
            price_category: updateData.price_category !== undefined ? updateData.price_category : currentSlot.price_category,
            status: updateData.status || currentSlot.status,
            start_time: currentSlot.start_time,
            end_time: currentSlot.end_time
        };
        finalDuration = getSlotDuration(simulatedSlot);
    }

    // Extrair date e time de start_time
    if (!currentSlot.start_time) {
        throw new Error('Slot não possui start_time. Não é possível verificar conflitos.');
    }
    const slotDate = extractDateFromTimestamp(currentSlot.start_time);
    const slotTime = extractTimeFromTimestamp(currentSlot.start_time);
    
    // Excluir o slot atual da verificação de conflitos (para UPDATE)
    await checkOverlapConflicts(slotDate, slotTime, finalDuration, id);

    // Update end_time if needed
    // Se end_time não foi atualizado ainda (ex: mudança de duração via priceCategory),
    // recalcular baseado em start_time e duração final
    if (!updateData.end_time && currentSlot.start_time) {
        const startTimeEpoch = new Date(currentSlot.start_time).getTime();
        const newEndTimeIso = new Date(startTimeEpoch + finalDuration * 60000).toISOString();
        updateData.end_time = newEndTimeIso;
    }

    // Atualizar
    const { data, error } = await supabase
        .from('time_slots')
        .update(updateData)
        .eq('id', id)
        .select(`
            id, start_time, end_time, event_type, price_category, price, status, personal_activity, patient_id, contract_id, is_paid, is_inaugural, reminder_one_hour, reminder_twenty_four_hours, sibling_order, flow_status,
            patient:patients(
                name,
                phone,
                email,
                privacy_terms_accepted
            )
        `)
        .single();

    if (error) throw error;

    // Aplicar regras de negócio se status mudou (reutilizando slotDate/slotTime calculados acima)
    if (input.status) {
        console.log(`[updateSlot] Status alterado para ${input.status}. SlotID: ${id}. Executando regras de exclusividade.`);
        await applyExclusivityRules(id, slotDate, slotTime, input.status, currentSlot.event_type);
        await adjustSiblingStatus(id, slotDate, slotTime, input.status);
    } else {
        console.log(`[updateSlot] Status NÂO alterado (input.status undefined). SlotID: ${id}`);
    }

    return normalizePatientRelation(data as any) as any;
}

// DELETAR SLOT
export async function deleteSlot(id: string): Promise<void> {
    // Buscar slot antes de deletar para recalcular sibling_order
    const { data: slot, error: fetchError } = await supabase
        .from('time_slots')
        .select('start_time, status, event_type')
        .eq('id', id)
        .single();

    if (fetchError) throw fetchError;
    if (!slot) throw new Error('Slot not found');
    if (!slot.start_time) throw new Error('Slot não possui start_time');

    // Sempre deletar o slot (não converter para INDISPONIVEL)
    const { error } = await supabase
        .from('time_slots')
        .delete()
        .eq('id', id);

    if (error) throw error;

    // Extrair date e time de start_time para recalcular sibling_order
    const slotDate = extractDateFromTimestamp(slot.start_time);
    const slotTime = extractTimeFromTimestamp(slot.start_time);

    // Recalcular sibling_order dos slots restantes
    await recalculateSiblingOrders(slotDate, slotTime);
}

// BLOQUEAR DIA COMPLETO (mantido para compatibilidade, mas agora usa blocked_days)
export async function blockDay(date: string): Promise<{ deletedCount: number; keptCount: number }> {
    // Importar service de blocked_days
    const { createBlockedDay } = await import('./blockedDaysService.js');
    
    // Buscar todos os slots do dia usando start_time (horário de Brasília)
    const startTimestamp = new Date(`${date}T00:00:00-03:00`).toISOString();
    const endTimestamp = new Date(`${date}T23:59:59-03:00`).toISOString();
    
    const { data: allSlots, error: fetchError } = await supabase
        .from('time_slots')
        .select('id, status, event_type, start_time')
        .gte('start_time', startTimestamp)
        .lte('start_time', endTimestamp);

    if (fetchError) throw fetchError;

    if (!allSlots || allSlots.length === 0) {
        // Se não há slots, apenas criar bloqueio na tabela
        try {
            await createBlockedDay({ date, reason: null });
        } catch (error: any) {
            // Se já existe bloqueio, tudo bem
            if (!error.message.includes('já está bloqueado')) {
                throw error;
            }
        }
        return { deletedCount: 0, keptCount: 0 };
    }

    // Status válidos acima de "Vago" (devem ser mantidos)
    // INDISPONIVEL não deve ser mantido - slots INDISPONIVEL devem ser deletados junto com os vagos
    const validStatuses = ['AGUARDANDO', 'RESERVADO', 'CONFIRMADO', 'CONTRATADO'];

    // Função auxiliar para verificar se o status é "Vago"
    const isVagoStatus = (status: string | null | undefined): boolean => {
        if (!status) return true;
        const normalizedStatus = status.trim().toUpperCase();
        return normalizedStatus === 'VAGO' || normalizedStatus === '';
    };

    // Separar slots vagos dos outros
    // Deletar: slots que NÃO são pessoais E são "Vago" (ou NULL) OU são INDISPONIVEL
    const emptySlots = allSlots.filter(slot => {
        const isPersonal = slot.event_type === 'personal';
        const isVago = isVagoStatus(slot.status);
        const isIndisponivel = slot.status === 'INDISPONIVEL' || slot.status === 'INDISPONÍVEL';
        // Deletar se: não é pessoal E (é vago OU é INDISPONIVEL)
        return !isPersonal && (isVago || isIndisponivel);
    });
    
    // Manter: slots pessoais OU slots com status válido acima de "Vago" (mas não INDISPONIVEL)
    const keptSlots = allSlots.filter(slot => {
        const isPersonal = slot.event_type === 'personal';
        const hasValidStatus = slot.status && validStatuses.includes(slot.status);
        return isPersonal || hasValidStatus;
    });

    // Coletar os horários únicos dos slots que serão deletados (usando start_time)
    const timesToRecalculate = new Set<{ date: string; time: string }>();

    // Deletar slots vagos
    if (emptySlots.length > 0) {
        const idsToDelete = emptySlots.map(s => s.id);
        
        // Coletar os times diretamente dos slots que serão deletados
        emptySlots.forEach(slot => {
            if (slot.start_time) {
                const slotDate = extractDateFromTimestamp(slot.start_time);
                const slotTime = extractTimeFromTimestamp(slot.start_time);
                timesToRecalculate.add({ date: slotDate, time: slotTime });
            }
        });

        const { error: deleteError } = await supabase
            .from('time_slots')
            .delete()
            .in('id', idsToDelete);

        if (deleteError) throw deleteError;

        // Recalcular sibling_order para cada horário afetado
        for (const { date: slotDate, time: slotTime } of timesToRecalculate) {
            await recalculateSiblingOrders(slotDate, slotTime);
        }
    }

    // Criar registro na tabela blocked_days para marcar o dia como bloqueado
    try {
        await createBlockedDay({ date, reason: null });
    } catch (error: any) {
        // Se já existe bloqueio, tudo bem - apenas atualiza
        if (!error.message.includes('já está bloqueado')) {
            throw error;
        }
    }

    return {
        deletedCount: emptySlots.length,
        keptCount: keptSlots.length
    };
}

// RESERVAR SLOT
export async function reserveSlot(id: string, input: ReserveSlotInput): Promise<TimeSlot> {
    const { patientName, patientPhone } = input;

    // Buscar slot
    const { data: currentSlot, error: fetchError } = await supabase
        .from('time_slots')
        .select('id, start_time, end_time, event_type, price_category, price, status, personal_activity, patient_id, contract_id, is_paid, is_inaugural, reminder_one_hour, reminder_twenty_four_hours, sibling_order, flow_status')
        .eq('id', id)
        .single();

    if (fetchError) throw fetchError;
    if (!currentSlot) throw new Error('Slot not found');

    // Criar ou buscar paciente
    const patient = await patientsService.findOrCreatePatient({
        name: patientName,
        phone: patientPhone
    });

    // Atualizar para RESERVADO
    const { data, error } = await supabase
        .from('time_slots')
        .update({
            status: 'RESERVADO',
            patient_id: patient.id,
        })
        .eq('id', id)
        .select(`
            id, start_time, end_time, event_type, price_category, price, status, personal_activity, patient_id, contract_id, is_paid, is_inaugural, reminder_one_hour, reminder_twenty_four_hours, sibling_order, flow_status,
            patient:patients(
                name,
                phone,
                email,
                privacy_terms_accepted
            )
        `)
        .single();

    if (error) throw error;

    // Extrair date e time de start_time para ajustar siblings
    if (!currentSlot.start_time) {
        throw new Error('Slot não possui start_time');
    }
    const slotDate = extractDateFromTimestamp(currentSlot.start_time);
    const slotTime = extractTimeFromTimestamp(currentSlot.start_time);
    
    // Ajustar siblings
    await adjustSiblingStatus(id, slotDate, slotTime, 'RESERVADO');

    return normalizePatientRelation(data as any) as any;
}

// CONFIRMAR SLOT
export async function confirmSlot(id: string): Promise<TimeSlot> {
    // Buscar slot
    const { data: currentSlot, error: fetchError } = await supabase
        .from('time_slots')
        .select('id, start_time, end_time, event_type, price_category, price, status, personal_activity, patient_id, contract_id, is_paid, is_inaugural, reminder_one_hour, reminder_twenty_four_hours, sibling_order, flow_status')
        .eq('id', id)
        .single();

    if (fetchError) throw fetchError;
    if (!currentSlot) throw new Error('Slot not found');

    // Atualizar para CONFIRMADO
    const { data, error } = await supabase
        .from('time_slots')
        .update({ status: 'CONFIRMADO' })
        .eq('id', id)
        .select('id, start_time, end_time, event_type, price_category, price, status, personal_activity, patient_id, contract_id, is_paid, is_inaugural, reminder_one_hour, reminder_twenty_four_hours, sibling_order, flow_status')
        .single();

    if (error) throw error;

    // Extrair date e time de start_time para aplicar exclusividade
    if (!currentSlot.start_time) {
        throw new Error('Slot não possui start_time');
    }
    const slotDate = extractDateFromTimestamp(currentSlot.start_time);
    const slotTime = extractTimeFromTimestamp(currentSlot.start_time);
    
    // Aplicar exclusividade (deletar siblings)
    await applyExclusivityRules(id, slotDate, slotTime, 'CONFIRMADO', currentSlot.event_type);

    return data;
}

// ENVIAR FLOW
export async function sendFlow(id: string, input: SendFlowInput): Promise<TimeSlot> {
    const { patientName, patientPhone } = input;
    const webhookUrl = process.env.N8N_WEBHOOK_URL;

    if (webhookUrl) {
        // Chamar webhook N8N
        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patientName,
                    patientPhone,
                    slotId: id,
                }),
            });
        } catch (err) {
            console.error('Erro ao enviar para webhook:', err);
            // Continua mesmo se falhar
        }
    }

    // Atualizar flow_status
    const { data, error } = await supabase
        .from('time_slots')
        .update({ flow_status: 'Enviado' })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// Verificar se paciente tem contratos anteriores
async function hasPreviousContracts(patientId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('time_slots')
        .select('id')
        .eq('patient_id', patientId)
        .not('contract_id', 'is', null)
        .limit(1);

    if (error) {
        console.error('Erro ao verificar contratos anteriores:', error);
        return false; // Em caso de erro, assumir que não tem (mais seguro)
    }

    return (data && data.length > 0);
}

// Verificar se paciente tem contratos anteriores por telefone ou email
export async function hasPreviousContractsByContact(phone?: string, email?: string): Promise<boolean> {
    if (!phone && !email) {
        return false; // Sem contato, assumir que não tem contratos
    }

    // Buscar paciente por telefone ou email
    let patientId: string | null = null;

    if (phone) {
        const { data: patientByPhone } = await supabase
            .from('patients')
            .select('id')
            .eq('phone', phone)
            .single();
        
        if (patientByPhone) {
            patientId = patientByPhone.id;
        }
    }

    if (!patientId && email) {
        const { data: patientByEmail } = await supabase
            .from('patients')
            .select('id')
            .eq('email', email)
            .single();
        
        if (patientByEmail) {
            patientId = patientByEmail.id;
        }
    }

    if (!patientId) {
        return false; // Paciente não encontrado, assumir que não tem contratos
    }

    return hasPreviousContracts(patientId);
}

// CRIAR SLOTS RECORRENTES
export async function createRecurringSlots(input: CreateRecurringSlotsInput) {
    const { originalSlotId, frequency, occurrenceCount, payments, inaugurals } = input;
    const count = occurrenceCount || 1;

    // Gerar ID curto (5 caracteres numéricos) para o contrato
    const contractShortId = generateShortId();

    // 1. Buscar slot original
    const { data: originalSlot, error: fetchError } = await supabase
        .from('time_slots')
        .select('id, start_time, end_time, event_type, price_category, price, status, personal_activity, patient_id, contract_id, is_paid, is_inaugural, reminder_one_hour, reminder_twenty_four_hours, sibling_order')
        .eq('id', originalSlotId)
        .single();

    if (fetchError) throw fetchError;
    if (!originalSlot) throw new Error('Slot original não encontrado');

    const duration = getSlotDuration(originalSlot);

    // 2. Obter e atualizar paciente
    // O slot original JÁ possui patient_id, então usamos ele diretamente
    if (!originalSlot.patient_id) {
        throw new Error('Slot original não possui paciente vinculado');
    }

    const patientId = originalSlot.patient_id;

    // Se dados do paciente foram fornecidos, atualizar na tabela patients
    if (input.patientName || input.patientPhone || input.patientEmail) {
        await patientsService.updatePatient(patientId, {
            name: input.patientName,
            phone: input.patientPhone || undefined,
            email: input.patientEmail && input.patientEmail.trim() !== '' ? input.patientEmail : undefined
        });
    }

    // Buscar paciente atualizado para usar no contrato
    const patient = await patientsService.getPatient(patientId);
    if (!patient) throw new Error('Paciente não encontrado');

    // 3. Criar contrato
    const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .insert([{
            short_id: contractShortId,
            frequency: frequency
        }])
        .select()
        .single();

    if (contractError) throw contractError;

    // Extrair date e time de start_time do slot original
    if (!originalSlot.start_time) {
        throw new Error('Slot original não possui start_time');
    }
    const originalDate = extractDateFromTimestamp(originalSlot.start_time);
    const originalTime = extractTimeFromTimestamp(originalSlot.start_time);
    const startDate = parseISO(originalDate);
    let targetDates: Date[] = [startDate]; // Include start date

    // 4. Calcular datas alvo baseado no contador
    if (count > 1) {
        let currentDate = startDate;
        for (let i = 1; i < count; i++) {
            if (frequency === 'weekly') {
                currentDate = addWeeks(currentDate, 1);
            } else if (frequency === 'biweekly') {
                currentDate = addWeeks(currentDate, 2);
            } else if (frequency === 'monthly') {
                currentDate = addMonths(currentDate, 1);
            } else {
                currentDate = addWeeks(currentDate, 1);
            }
            targetDates.push(currentDate);
        }
    }

    const createdSlots: TimeSlot[] = [];
    const conflicts: { date: string, time: string, reason: string }[] = [];

    // 5. Processar cada slot (novo formato) ou data (formato antigo)
    let slotsToProcess: Array<{ date: string; time: string }> = [];

    console.log('[createRecurringSlots] input.slots:', input.slots);
    console.log('[createRecurringSlots] input.dates:', input.dates);

    if (input.slots && input.slots.length > 0) {
        // Novo formato: slots com data e hora
        console.log('[createRecurringSlots] Usando NOVO formato (slots)');
        slotsToProcess = input.slots;
    } else if (input.dates && input.dates.length > 0) {
        // Formato antigo: apenas datas, usa horário do slot original
        console.log('[createRecurringSlots] Usando formato ANTIGO (dates)');
        slotsToProcess = input.dates.map(d => ({
            date: d,
            time: originalTime
        }));
    } else {
        // Fallback: usar targetDates calculadas
        console.log('[createRecurringSlots] Usando FALLBACK (targetDates)');
        slotsToProcess = targetDates.map(dateObj => ({
            date: format(dateObj, 'yyyy-MM-dd'),
            time: originalTime
        }));
    }

    for (const slotData of slotsToProcess) {
        const dateStr = slotData.date;
        // Normalizar formato de hora: HH:MM → HH:MM:SS
        const timeStr = slotData.time.includes(':') && slotData.time.split(':').length === 2
            ? `${slotData.time}:00`
            : slotData.time;
        const isPaid = payments ? (payments[dateStr] || false) : false;
        const isInaugural = inaugurals ? (inaugurals[dateStr] || false) : false;

        console.log(`[createRecurringSlots] Processando slot - Date: ${dateStr}, Time: ${timeStr}`);

        // Verificar se existe slot usando start_time
        const startTimestamp = createTimestamp(dateStr, timeStr);
        const { data: existingSlots, error: checkError } = await supabase
            .from('time_slots')
            .select('id, status, event_type, start_time, end_time, patient_id, contract_id, price_category, price, personal_activity, is_paid, is_inaugural, reminder_one_hour, reminder_twenty_four_hours, sibling_order')
            .eq('start_time', startTimestamp);

        console.log(`[createRecurringSlots] Slots existentes encontrados:`, existingSlots?.length || 0);

        if (checkError) throw checkError;

        const existingSlot = existingSlots && existingSlots.length > 0 ? existingSlots[0] : null;

        if (existingSlot) {
            // Se existe: verificar status OU se é o PRÓPRIO slot original
            if (existingSlot.id === originalSlotId || existingSlot.status === 'Vago' || existingSlot.status === 'VAGO') {
                // Atualizar para CONTRATADO
                const { data: updated, error: updateError } = await supabase
                    .from('time_slots')
                    .update({
                        status: 'CONTRATADO',
                        patient_id: patient.id,
                        price_category: originalSlot.price_category,
                        price: originalSlot.price,
                        event_type: originalSlot.event_type,
                        is_paid: isPaid,
                        is_inaugural: isInaugural,
                        contract_id: contract.id,
                        reminder_one_hour: input.reminders?.oneHour || false,
                        reminder_twenty_four_hours: input.reminders?.twentyFourHours || false,
                        start_time: createTimestamp(dateStr, timeStr),
                        end_time: new Date(new Date(createTimestamp(dateStr, timeStr)).getTime() + duration * 60000).toISOString()
                    })
                    .eq('id', existingSlot.id)
                    .select(`
                        id, start_time, end_time, event_type, price_category, price, status, personal_activity, patient_id, contract_id, is_paid, is_inaugural, reminder_one_hour, reminder_twenty_four_hours, sibling_order, flow_status,
                        patient:patients(
                            name,
                            phone,
                            email,
                            privacy_terms_accepted
                        )
                    `)
                    .single();

                if (updateError) {
                    conflicts.push({ date: dateStr, time: timeStr, reason: 'Erro ao atualizar: ' + updateError.message });
                } else {
                    createdSlots.push(normalizePatientRelation(updated as any) as any);
                }
            } else {
                // Ocupado
                conflicts.push({
                    date: dateStr,
                    time: timeStr,
                    reason: `Horário ocupado (${existingSlot.status})`
                });
            }
        } else {
            // Não existe: Criar novo
            const siblingOrder = await calculateSiblingOrder(dateStr, timeStr);
            const startTimestamp = createTimestamp(dateStr, timeStr);
            const endTimestamp = new Date(new Date(startTimestamp).getTime() + duration * 60000).toISOString();

            const newSlotData = {
                event_type: originalSlot.event_type,
                price_category: originalSlot.price_category,
                price: originalSlot.price,
                status: 'CONTRATADO',
                patient_id: patient.id,
                sibling_order: siblingOrder,
                is_paid: isPaid,
                is_inaugural: isInaugural,
                contract_id: contract.id,
                reminder_one_hour: input.reminders?.oneHour || false,
                reminder_twenty_four_hours: input.reminders?.twentyFourHours || false,
                start_time: startTimestamp,
                end_time: endTimestamp
            };

            const { data: created, error: createError } = await supabase
                .from('time_slots')
                .insert([newSlotData])
                .select(`
                    id, start_time, end_time, event_type, price_category, price, status, personal_activity, patient_id, contract_id, is_paid, is_inaugural, reminder_one_hour, reminder_twenty_four_hours, sibling_order, flow_status,
                    patient:patients(
                        name,
                        phone,
                        email,
                        privacy_terms_accepted
                    )
                `)
                .single();

            if (createError) {
                conflicts.push({ date: dateStr, time: timeStr, reason: 'Erro ao criar: ' + createError.message });
            } else {
                createdSlots.push(normalizePatientRelation(created as any) as any);
            }
        }
    }

    return {
        createdCount: createdSlots.length,
        conflicts,
        contractId: contract.id,
        contractShortId: contract.short_id
    };
}

// PREVIEW RECURENCIA
export async function previewRecurringSlots(input: PreviewRecurringSlotsInput) {
    const { originalSlotId, frequency, occurrenceCount, skipDates = [] } = input;
    const count = occurrenceCount || 1;

    // 1. Buscar slot original
    const { data: originalSlot, error: fetchError } = await supabase
        .from('time_slots')
        .select('id, start_time, end_time, event_type, price_category, price, status, personal_activity, patient_id, contract_id, is_paid, is_inaugural, reminder_one_hour, reminder_twenty_four_hours, sibling_order')
        .eq('id', originalSlotId)
        .single();
    if (fetchError) throw fetchError;
    if (!originalSlot) throw new Error('Slot original não encontrado');

    // Verificar se paciente tem contratos anteriores (para determinar se pode usar Inaugural)
    let patientHasPreviousContracts = false;
    if (originalSlot.patient_id) {
        patientHasPreviousContracts = await hasPreviousContracts(originalSlot.patient_id);
    }

    // Extrair date e time de start_time do slot original
    if (!originalSlot.start_time) {
        throw new Error('Slot original não possui start_time');
    }
    const originalDate = extractDateFromTimestamp(originalSlot.start_time);
    const originalTime = extractTimeFromTimestamp(originalSlot.start_time);
    const startDate = parseISO(originalDate);
    let targetDates: Date[] = [];
    let currentDate = startDate;
    let generated = 0;

    // Gerar datas pulando as datas especificadas
    while (generated < count) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');

        // Se não estiver na lista de datas puladas, adicionar
        if (!skipDates.includes(dateStr)) {
            targetDates.push(currentDate);
            generated++;
        }

        // Avançar para próxima data baseado na frequência
        if (frequency === 'weekly') {
            currentDate = addWeeks(currentDate, 1);
        } else if (frequency === 'biweekly') {
            currentDate = addWeeks(currentDate, 2);
        } else if (frequency === 'monthly') {
            currentDate = addMonths(currentDate, 1);
        } else {
            currentDate = addWeeks(currentDate, 1);
        }
    }

    // Calcular duração do slot original
    const originalDuration = getSlotDuration(originalSlot);
    
    // Processar preview
    const previewResults: { date: string, status: 'available' | 'occupied' | 'conflict', details?: string }[] = [];

    for (const dateObj of targetDates) {
        const dateStr = format(dateObj, 'yyyy-MM-dd');
        // Usar time extraído de start_time
        const timeStr = originalTime;

        console.log(`[Preview] Verificando conflito para ${dateStr} às ${timeStr} (duração: ${originalDuration}m)`);

        // Verificar se o dia está bloqueado
        const { isDayBlocked } = await import('./blockedDaysService.js');
        const dayIsBlocked = await isDayBlocked(dateStr);
        
        if (dayIsBlocked) {
            console.log(`[Preview] Dia bloqueado - marcando como ocupado`);
            previewResults.push({ date: dateStr, status: 'occupied', details: 'Dia bloqueado' });
            continue;
        }

        // Verificar sobreposição com slots existentes usando a função auxiliar
        const overlapCheck = await checkSlotOverlap(
            dateStr,
            timeStr,
            originalDuration,
            dateStr === originalDate ? originalSlotId : undefined // Só excluir slot original se for na mesma data
        );

        if (overlapCheck.hasConflict) {
            console.log(`[Preview] CONFLITO DETECTADO - ${overlapCheck.conflictReason}`);
            previewResults.push({ 
                date: dateStr, 
                status: 'occupied', 
                details: overlapCheck.conflictReason || 'Horário ocupado' 
            });
        } else {
            console.log(`[Preview] Sem conflitos - marcando como disponível`);
            previewResults.push({ date: dateStr, status: 'available' });
        }
    }

    return {
        preview: previewResults,
        hasPreviousContracts: patientHasPreviousContracts
    };
}

// BUSCAR SLOTS DE UM CONTRATO
export async function getContractSlots(contractId: string): Promise<TimeSlot[]> {
    const { data, error } = await supabase
        .from('time_slots')
        .select(`
            *,
            patient:patients(
                name,
                phone,
                email,
                privacy_terms_accepted
            )
        `)
        .eq('contract_id', contractId)
        .order('start_time', { ascending: true });

    if (error) throw error;

    // Ordenar por start_time (todos devem ter start_time agora)
    const sorted = (data || []).sort((a, b) => {
        if (a.start_time && b.start_time) {
            return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
        }
        if (a.start_time && !b.start_time) return -1;
        if (!a.start_time && b.start_time) return 1;
        return 0;
    });

    return sorted;
}

// Buscar a sessão original (primeira sessão do primeiro contrato) de um paciente
export async function getOriginalSessionSlot(patientId: string): Promise<{ contractId: string; slotId: string; startTime: string } | null> {
    if (!patientId) return null;

    // Buscar todos os slots do paciente que fazem parte de contratos
    const { data: allContractSlots, error } = await supabase
        .from('time_slots')
        .select('id, contract_id, start_time')
        .eq('patient_id', patientId)
        .not('contract_id', 'is', null)
        .not('start_time', 'is', null);

    if (error) {
        console.error('Erro ao buscar slots do paciente:', error);
        return null;
    }

    if (!allContractSlots || allContractSlots.length === 0) {
        return null;
    }

    // Encontrar o slot com o menor start_time (sessão original)
    let originalSlot = allContractSlots[0];
    for (const slot of allContractSlots) {
        if (slot.start_time && originalSlot.start_time) {
            const slotTime = new Date(slot.start_time).getTime();
            const originalTime = new Date(originalSlot.start_time).getTime();
            if (slotTime < originalTime) {
                originalSlot = slot;
            }
        }
    }

    return {
        contractId: originalSlot.contract_id!,
        slotId: originalSlot.id!,
        startTime: originalSlot.start_time!
    };
}

// Buscar contratos pendentes do paciente por telefone ou email
export async function getPendingContractsByContact(phone?: string, email?: string): Promise<Array<{ contractId: string; totalDebt: number; unpaidCount: number }>> {
    if (!phone && !email) {
        return [];
    }

    // Buscar paciente por telefone ou email
    let patientId: string | null = null;

    if (phone) {
        const { data: patientByPhone } = await supabase
            .from('patients')
            .select('id')
            .eq('phone', phone)
            .single();
        
        if (patientByPhone) {
            patientId = patientByPhone.id;
        }
    }

    if (!patientId && email) {
        const { data: patientByEmail } = await supabase
            .from('patients')
            .select('id')
            .eq('email', email)
            .single();
        
        if (patientByEmail) {
            patientId = patientByEmail.id;
        }
    }

    if (!patientId) {
        return [];
    }

    // Buscar todos os slots do paciente que têm contract_id (são parte de contratos)
    const { data: allSlots, error } = await supabase
        .from('time_slots')
        .select('contract_id, is_paid, is_inaugural, price, start_time')
        .eq('patient_id', patientId)
        .not('contract_id', 'is', null);

    if (error) {
        console.error('Erro ao buscar slots do paciente:', error);
        return [];
    }

    if (!allSlots || allSlots.length === 0) {
        return [];
    }

    // Agrupar por contract_id e calcular dívidas e primeiro start_time
    const contractsMap = new Map<string, { totalDebt: number; unpaidCount: number; firstStartTime: string | null }>();

    allSlots.forEach(slot => {
        if (!slot.contract_id || slot.is_inaugural) {
            return; // Ignorar slots sem contrato ou inaugurais
        }

        const contractId = slot.contract_id;
        const current = contractsMap.get(contractId) || { totalDebt: 0, unpaidCount: 0, firstStartTime: null };
        
        // Atualizar primeiro start_time (menor start_time do contrato)
        if (slot.start_time) {
            if (!current.firstStartTime) {
                current.firstStartTime = slot.start_time;
            } else {
                const slotTime = new Date(slot.start_time).getTime();
                const currentTime = new Date(current.firstStartTime).getTime();
                if (slotTime < currentTime) {
                    current.firstStartTime = slot.start_time;
                }
            }
        }
        
        if (!slot.is_paid && slot.price) {
            current.totalDebt += slot.price;
            current.unpaidCount += 1;
        }
        
        contractsMap.set(contractId, current);
    });

    // Converter para array e retornar apenas contratos com dívida
    const pendingContracts: Array<{ contractId: string; totalDebt: number; unpaidCount: number; firstStartTime: string | null }> = [];
    contractsMap.forEach((value, contractId) => {
        if (value.totalDebt > 0) {
            pendingContracts.push({
                contractId,
                totalDebt: value.totalDebt,
                unpaidCount: value.unpaidCount,
                firstStartTime: value.firstStartTime
            });
        }
    });

    return pendingContracts;
}

// MUDAR HORÁRIO DE UM SLOT
export async function changeSlotTime(slotId: string, newDate: string, newTime: string): Promise<TimeSlot> {
    // 1. Buscar slot original
    const { data: originalSlots, error: fetchError } = await supabase
        .from('time_slots')
        .select('id, start_time, end_time, event_type, price_category, price, status, personal_activity, patient_id, contract_id, is_paid, is_inaugural, reminder_one_hour, reminder_twenty_four_hours, sibling_order, flow_status')
        .eq('id', slotId);

    if (fetchError) throw fetchError;

    // Manual handling of single result to avoid PGRST116
    const originalSlot = originalSlots && originalSlots.length > 0 ? originalSlots[0] : null;

    if (!originalSlot) throw new Error('Slot não encontrado');

    const duration = getSlotDuration(originalSlot);

    // 2. Verificar se o novo horário está disponível usando start_time
    const newStartTimestamp = createTimestamp(newDate, newTime);
    const { data: existingSlots, error: checkError } = await supabase
        .from('time_slots')
        .select('id, status, contract_id, start_time, end_time')
        .eq('start_time', newStartTimestamp);

    if (checkError) throw checkError;

    // Verificar se há conflito (slot ocupado que não seja do mesmo contrato)
    const hasConflict = existingSlots && existingSlots.some(slot => {
        const isSameContract = originalSlot.contract_id && slot.contract_id === originalSlot.contract_id;
        const isOccupied = slot.status && slot.status.toUpperCase() !== 'VAGO';
        return isOccupied && !isSameContract && slot.id !== slotId;
    });

    if (hasConflict) {
        throw new Error('Horário já está ocupado');
    }

    // 3. Deletar slot antigo
    const { error: deleteError } = await supabase
        .from('time_slots')
        .delete()
        .eq('id', slotId);

    if (deleteError) throw deleteError;

    // 4. Criar novo slot no novo horário
    const newEndTimestamp = new Date(new Date(newStartTimestamp).getTime() + duration * 60000).toISOString();
    
    const newSlotData = {
        event_type: originalSlot.event_type,
        price_category: originalSlot.price_category,
        price: originalSlot.price,
        status: originalSlot.status,
        personal_activity: originalSlot.personal_activity,
        patient_id: originalSlot.patient_id,
        sibling_order: 0, // Resetar para 0 no novo horário
        flow_status: originalSlot.flow_status,
        is_paid: originalSlot.is_paid,
        contract_id: originalSlot.contract_id,
        start_time: newStartTimestamp,
        end_time: newEndTimestamp
    };

    const { data: newSlot, error: createError } = await supabase
        .from('time_slots')
        .insert([newSlotData])
        .select(`
            *,
            patient:patients(
                name,
                phone,
                email,
                privacy_terms_accepted
            )
        `);

    if (createError) throw createError;
    if (!newSlot || newSlot.length === 0) throw new Error('Erro ao criar novo slot');

    return newSlot[0];
}

// ATUALIZAR GRUPO DE RECORRÊNCIA
export async function updateRecurrenceGroup(
    recurrenceGroupId: string,
    input: {
        patientName?: string;
        patientPhone?: string;
        patientEmail?: string;
        payments?: Record<string, boolean>;
        reminders?: { oneHour: boolean; twentyFourHours: boolean };
        remindersPerDate?: Record<string, { oneHour: boolean; twentyFourHours: boolean }>;
    }
): Promise<void> {
    const { data: groupSlots, error: fetchError } = await supabase
        .from('time_slots')
        .select('id, start_time, end_time, event_type, price_category, price, status, personal_activity, patient_id, contract_id, is_paid, is_inaugural, reminder_one_hour, reminder_twenty_four_hours, sibling_order')
        .eq('contract_id', recurrenceGroupId);

    if (fetchError) throw fetchError;
    if (!groupSlots || groupSlots.length === 0) {
        throw new Error('Contrato não encontrado');
    }

    // 2. Preparar dados de atualização base (aplicados a todos os slots)
    // Nota: patient_email não é atualizado aqui pois pode não existir na tabela time_slots
    // Os dados do paciente devem ser atualizados apenas na tabela patients
    const baseUpdateData: any = {};
    if (input.patientName !== undefined) baseUpdateData.patient_name = input.patientName;
    if (input.patientPhone !== undefined) baseUpdateData.patient_phone = input.patientPhone;
    // Removido: patient_email - se necessário, atualizar apenas na tabela patients

    // 3. Atualizar cada slot individualmente (para lidar com pagamentos e lembretes específicos)
    for (const slot of groupSlots) {
        const updateData = { ...baseUpdateData };

        // Extrair date de start_time
        const slotDate = slot.start_time ? extractDateFromTimestamp(slot.start_time) : '';

        // Adicionar status de pagamento específico para esta data, se fornecido
        if (input.payments && slotDate && input.payments[slotDate] !== undefined) {
            updateData.is_paid = input.payments[slotDate];
        }

        // Adicionar lembretes específicos para esta data, se fornecido
        if (input.remindersPerDate && slotDate && input.remindersPerDate[slotDate] !== undefined) {
            updateData.reminder_one_hour = input.remindersPerDate[slotDate].oneHour;
            updateData.reminder_twenty_four_hours = input.remindersPerDate[slotDate].twentyFourHours;
        }

        // Atualizar o slot
        const { error: updateError } = await supabase
            .from('time_slots')
            .update(updateData)
            .eq('id', slot.id);

        if (updateError) {
            console.error(`Erro ao atualizar slot ${slot.id}:`, updateError);
            throw updateError;
        }
    }
}

// ATUALIZAR CONTRATO
export async function updateContract(
    contractId: string,
    input: {
        patientName?: string;
        patientPhone?: string;
        patientEmail?: string;
        payments?: Record<string, boolean>;
        inaugurals?: Record<string, boolean>;
        reminders?: { oneHour: boolean; twentyFourHours: boolean };
        remindersPerDate?: Record<string, { oneHour: boolean; twentyFourHours: boolean }>;
    }
): Promise<void> {
    const { data: contractSlots, error: fetchError } = await supabase
        .from('time_slots')
        .select('id, start_time, end_time, event_type, price_category, price, status, personal_activity, patient_id, contract_id, is_paid, is_inaugural, reminder_one_hour, reminder_twenty_four_hours, sibling_order')
        .eq('contract_id', contractId);

    if (fetchError) throw fetchError;
    if (!contractSlots || contractSlots.length === 0) {
        throw new Error('Contrato não encontrado');
    }

    // Se houver alteração de dados do paciente, atualizar na tabela patients
    if (input.patientName || input.patientPhone || input.patientEmail) {
        const patientId = contractSlots[0].patient_id;
        if (patientId) {
            await patientsService.updatePatient(patientId, {
                name: input.patientName,
                phone: input.patientPhone,
                email: input.patientEmail
            });
        }
    }

    // Validar regra de inaugural: apenas primeira sessão do primeiro contrato pode ser inaugural
    if (input.inaugurals) {
        const patientId = contractSlots[0].patient_id;
        
        if (!patientId) {
            throw new Error('Não é possível validar sessão inaugural: paciente não identificado.');
        }

        // Buscar a sessão original do paciente (primeira sessão do primeiro contrato)
        const originalSession = await getOriginalSessionSlot(patientId);
        
        if (!originalSession) {
            // Se não encontrou sessão original, pode ser que não haja contratos ainda
            // Nesse caso, permitir que a primeira sessão deste contrato seja inaugural
            const sortedSlots = [...contractSlots].sort((a, b) => {
                if (a.start_time && b.start_time) {
                    return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
                }
                return 0;
            });
            const firstSlot = sortedSlots.length > 0 ? sortedSlots[0] : null;
            
            // Verificar se está tentando marcar como inaugural apenas a primeira sessão
            for (const slot of contractSlots) {
                const slotDate = slot.start_time ? extractDateFromTimestamp(slot.start_time) : '';
                const isInaugural = input.inaugurals && slotDate && input.inaugurals[slotDate] !== undefined 
                    ? input.inaugurals[slotDate] 
                    : slot.is_inaugural;
                
                if (isInaugural && (!firstSlot || slot.id !== firstSlot.id)) {
                    throw new Error('Apenas a primeira sessão do contrato pode ser inaugural.');
                }
            }
        } else {
            // Verificar se está tentando marcar como inaugural apenas a sessão original
            for (const slot of contractSlots) {
                const slotDate = slot.start_time ? extractDateFromTimestamp(slot.start_time) : '';
                const isInaugural = input.inaugurals && slotDate && input.inaugurals[slotDate] !== undefined 
                    ? input.inaugurals[slotDate] 
                    : slot.is_inaugural;
                
                if (isInaugural) {
                    // Verificar se este slot É a sessão original
                    const isOriginalSlot = slot.id === originalSession.slotId ||
                        (slot.start_time && slot.contract_id === originalSession.contractId &&
                         new Date(slot.start_time).getTime() === new Date(originalSession.startTime).getTime());
                    
                    if (!isOriginalSlot) {
                        throw new Error('Apenas a primeira sessão do primeiro contrato pode ser inaugural.');
                    }
                }
            }
        }
    }

    // Atualizar cada slot individualmente (para lidar com pagamentos e lembretes específicos)
    for (const slot of contractSlots) {
        const updateData: any = {};

        // Extrair date de start_time
        const slotDate = slot.start_time ? extractDateFromTimestamp(slot.start_time) : '';

        // Adicionar status de pagamento específico para esta data, se fornecido
        if (input.payments && slotDate && input.payments[slotDate] !== undefined) {
            updateData.is_paid = input.payments[slotDate];
        }

        // Adicionar status inaugural específico para esta data, se fornecido
        if (input.inaugurals && slotDate && input.inaugurals[slotDate] !== undefined) {
            updateData.is_inaugural = input.inaugurals[slotDate];
        }

        // Adicionar lembretes específicos para esta data, se fornecido
        if (input.remindersPerDate && slotDate && input.remindersPerDate[slotDate] !== undefined) {
            updateData.reminder_one_hour = input.remindersPerDate[slotDate].oneHour;
            updateData.reminder_twenty_four_hours = input.remindersPerDate[slotDate].twentyFourHours;
        }

        // Atualizar o slot se houver mudanças
        if (Object.keys(updateData).length > 0) {
            const { error: updateError } = await supabase
                .from('time_slots')
                .update(updateData)
                .eq('id', slot.id);

            if (updateError) {
                console.error(`Erro ao atualizar slot ${slot.id}:`, updateError);
                throw updateError;
            }
        }
    }
}

// ATUALIZAR AUTO_RENEWAL_ENABLED DO CONTRATO
export async function updateContractAutoRenewal(contractId: string, autoRenewalEnabled: boolean): Promise<{ success: boolean; autoRenewalEnabled: boolean }> {
    const { data, error } = await supabase
        .from('contracts')
        .update({ auto_renewal_enabled: autoRenewalEnabled })
        .eq('id', contractId)
        .select('id, auto_renewal_enabled')
        .single();

    if (error) throw error;
    
    return {
        success: true,
        autoRenewalEnabled: data.auto_renewal_enabled
    };
}
