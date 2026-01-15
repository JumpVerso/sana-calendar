import { supabase } from '../db/supabase.js';
import { addWeeks, addMonths, addDays, format, parseISO, differenceInDays } from 'date-fns';
import { isDayBlocked } from './blockedDaysService.js';

// Tipos
export interface ContractForRenewal {
    id: string;
    short_id: string;
    frequency: 'weekly' | 'biweekly' | 'monthly';
    end_date: string;
    auto_renewal_enabled: boolean;
}

export interface SlotTemplate {
    id: string;
    start_time: string; // OBRIGATÓRIO - usado para extrair date/time
    end_time: string;   // OBRIGATÓRIO
    event_type: string;
    price: number | null;
    price_category: string | null;
    patient_id: string | null;
    is_inaugural: boolean;
    reminder_one_hour: boolean | null;
    reminder_twenty_four_hours: boolean | null;
}

// Helpers
function generateShortId(): string {
    return Math.floor(10000 + Math.random() * 90000).toString();
}

function parseTime(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

function formatTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDbTime(time: string): string {
    if (time.length === 8) return time;
    if (time.length === 5) return `${time}:00`;
    return time;
}

// Extrai horário local (HH:mm) de um timestamp ISO/UTC
// O start_time está em UTC (+00), convertemos para UTC-3 (Brasil)
function getTimeFromTimestamp(timestamp: string | null, fallbackTime?: string): string {
    if (!timestamp) {
        return fallbackTime ? fallbackTime.substring(0, 5) : '08:00';
    }
    
    // Parse o timestamp UTC
    const date = new Date(timestamp);
    
    // Converter para horário brasileiro (UTC-3)
    // Subtrair 3 horas do UTC
    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();
    
    // Aplicar offset UTC-3
    let localHours = utcHours - 3;
    if (localHours < 0) localHours += 24;
    
    return `${String(localHours).padStart(2, '0')}:${String(utcMinutes).padStart(2, '0')}`;
}

// Extrai data (YYYY-MM-DD) de um timestamp ISO/UTC
// O start_time está em UTC (+00), convertemos para UTC-3 (Brasil)
function getDateFromTimestamp(timestamp: string | null, fallbackDate?: string): string {
    if (!timestamp) {
        return fallbackDate || format(new Date(), 'yyyy-MM-dd');
    }
    
    // Parse o timestamp UTC
    const date = new Date(timestamp);
    
    // Converter para data local (UTC-3)
    // O Date do JS já faz a conversão automaticamente para o timezone local
    // Mas como estamos trabalhando com UTC-3, vamos usar UTC e ajustar
    const utcYear = date.getUTCFullYear();
    const utcMonth = date.getUTCMonth();
    const utcDay = date.getUTCDate();
    const utcHours = date.getUTCHours();
    
    // Se as horas UTC são < 3, a data local ainda é do dia anterior
    let localYear = utcYear;
    let localMonth = utcMonth;
    let localDay = utcDay;
    
    if (utcHours < 3) {
        // Data local é do dia anterior
        const prevDate = new Date(Date.UTC(utcYear, utcMonth, utcDay - 1));
        localYear = prevDate.getUTCFullYear();
        localMonth = prevDate.getUTCMonth();
        localDay = prevDate.getUTCDate();
    }
    
    return format(new Date(localYear, localMonth, localDay), 'yyyy-MM-dd');
}

// Gera array de horários de 30 em 30 minutos
function generateTimeSlots(startTime: string, endTime: string, intervalMinutes: number = 30): string[] {
    const slots: string[] = [];
    let current = parseTime(startTime);
    const end = parseTime(endTime);

    while (current <= end) {
        slots.push(formatTime(current));
        current += intervalMinutes;
    }

    return slots;
}

// Calcula duração do slot em minutos usando start_time e end_time
function getSlotDuration(slot: { start_time?: string | null; end_time?: string | null; event_type?: string | null }): number {
    // Se tem start_time e end_time, calcular duração real
    if (slot.start_time && slot.end_time) {
        const start = new Date(slot.start_time).getTime();
        const end = new Date(slot.end_time).getTime();
        const durationMs = end - start;
        const durationMinutes = Math.round(durationMs / 60000);
        
        // Garantir duração mínima de 30 min e máxima de 120 min
        if (durationMinutes >= 30 && durationMinutes <= 120) {
            return durationMinutes;
        }
    }
    
    // Fallback: comercial = 60 min
    return 60;
}

// Verifica sobreposição com slots existentes
async function checkSlotOverlap(
    date: string,
    proposedTime: string,
    durationMinutes: number
): Promise<{ hasConflict: boolean; conflictReason?: string }> {
    const proposedStartMinutes = parseTime(proposedTime);
    const proposedEndMinutes = proposedStartMinutes + durationMinutes;

    // Converter date para timestamp para buscar por start_time (horário de Brasília)
    const startTimestamp = new Date(`${date}T00:00:00-03:00`).toISOString();
    const endTimestamp = new Date(`${date}T23:59:59-03:00`).toISOString();
    
    const { data: allSlots, error } = await supabase
        .from('time_slots')
        .select('id, event_type, status, personal_activity, start_time, end_time')
        .gte('start_time', startTimestamp)
        .lte('start_time', endTimestamp);

    if (error) {
        console.error(`[checkSlotOverlap] Erro ao buscar slots:`, error);
        return { hasConflict: false };
    }

    if (!allSlots || allSlots.length === 0) {
        return { hasConflict: false };
    }

    for (const existingSlot of allSlots) {
        const statusUpper = existingSlot.status ? existingSlot.status.toUpperCase() : '';
        const isOccupied = existingSlot.event_type ||
            (statusUpper && statusUpper !== 'VAGO' &&
                ['CONFIRMADO', 'RESERVADO', 'CONTRATADO', 'INDISPONIVEL', 'AGUARDANDO'].includes(statusUpper));

        if (!isOccupied) continue;

        // Extrair time de start_time
        if (!existingSlot.start_time) continue;
        const startDate = new Date(existingSlot.start_time);
        const hours = String(startDate.getHours()).padStart(2, '0');
        const minutes = String(startDate.getMinutes()).padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;
        const existingStartMinutes = parseTime(timeStr);
        const existingDuration = getSlotDuration(existingSlot);
        const existingEndMinutes = existingStartMinutes + existingDuration;

        const overlaps = proposedStartMinutes < existingEndMinutes && proposedEndMinutes > existingStartMinutes;

        if (overlaps) {
            let conflictReason = 'Ocupado';
            if (statusUpper === 'INDISPONIVEL') conflictReason = 'Horário indisponível';
            else if (statusUpper === 'CONFIRMADO') conflictReason = 'Horário confirmado';
            else if (statusUpper === 'RESERVADO') conflictReason = 'Horário reservado';
            else if (statusUpper === 'CONTRATADO') conflictReason = 'Horário contratado';
            else if (existingSlot.event_type === 'personal') conflictReason = 'Atividade Pessoal';

            return { hasConflict: true, conflictReason };
        }
    }

    return { hasConflict: false };
}

// ============================================================
// FUNÇÕES PRINCIPAIS (SIMPLIFICADAS)
// ============================================================

/**
 * Busca contratos que vencem HOJE e precisam de renovação automática
 * Usa o end_time máximo dos slots (não a coluna end_date do contrato)
 */
export async function findContractsExpiringToday(): Promise<ContractForRenewal[]> {
    const today = format(new Date(), 'yyyy-MM-dd');

    // Buscar todos os contratos com auto_renewal_enabled = true
    const { data: allContracts, error: contractsError } = await supabase
        .from('contracts')
        .select('id, short_id, frequency, end_date, auto_renewal_enabled')
        .eq('auto_renewal_enabled', true);

    if (contractsError) throw contractsError;
    if (!allContracts || allContracts.length === 0) return [];

    const expiringContracts: ContractForRenewal[] = [];

    // Para cada contrato, verificar se o end_time máximo dos slots é hoje
    for (const contract of allContracts) {
        // Buscar o end_time máximo dos slots deste contrato
        const { data: maxEndTimeData, error: slotsError } = await supabase
            .from('time_slots')
            .select('end_time')
            .eq('contract_id', contract.id)
            .not('end_time', 'is', null)
            .order('end_time', { ascending: false })
            .limit(1)
            .single();

        if (slotsError) {
            // Se não encontrar slots, pular este contrato
            continue;
        }

        if (maxEndTimeData && maxEndTimeData.end_time) {
            // Converter end_time para data e comparar com hoje
            const maxEndTimeDate = format(parseISO(maxEndTimeData.end_time), 'yyyy-MM-dd');
            
            if (maxEndTimeDate === today) {
                expiringContracts.push({
                    id: contract.id,
                    short_id: contract.short_id,
                    frequency: contract.frequency as 'weekly' | 'biweekly' | 'monthly',
                    end_date: maxEndTimeDate, // Usar a data do end_time
                    auto_renewal_enabled: contract.auto_renewal_enabled
                });
            }
        }
    }

    return expiringContracts;
}

/**
 * Verifica se um contrato já foi renovado (há outro contrato do mesmo paciente com end_time maior)
 * Usa end_time dos slots (não end_date do contrato)
 */
export async function isContractAlreadyRenewed(contractId: string, endDate: string): Promise<boolean> {
    // Buscar o patient_id do contrato atual
    const { data: contractSlots, error: slotsError } = await supabase
        .from('time_slots')
        .select('patient_id, end_time')
        .eq('contract_id', contractId)
        .not('end_time', 'is', null)
        .limit(1)
        .single();

    if (slotsError || !contractSlots || !contractSlots.patient_id) {
        // Se não encontrar slots, considerar que não foi renovado
        return false;
    }

    const patientId = contractSlots.patient_id;

    // Buscar o end_time máximo dos slots deste contrato
    const { data: maxEndTimeData, error: maxError } = await supabase
        .from('time_slots')
        .select('end_time')
        .eq('contract_id', contractId)
        .not('end_time', 'is', null)
        .order('end_time', { ascending: false })
        .limit(1)
        .single();

    if (maxError || !maxEndTimeData || !maxEndTimeData.end_time) {
        return false;
    }

    const maxEndTime = maxEndTimeData.end_time;

    // Verificar se há slots do mesmo paciente em outros contratos com end_time maior
    // (indicando que já foi criado um novo contrato - renovação)
    const { data: futureSlots, error: futureError } = await supabase
        .from('time_slots')
        .select('id')
        .eq('patient_id', patientId)
        .neq('contract_id', contractId)
        .not('end_time', 'is', null)
        .gt('end_time', maxEndTime)
        .limit(1);

    if (futureError) {
        console.error(`[isContractAlreadyRenewed] Erro:`, futureError);
        return false;
    }

    return futureSlots !== null && futureSlots.length > 0;
}

/**
 * Busca slots do contrato atual (excluindo inaugurais)
 * Retorna os slots ordenados por data
 */
export async function getContractSlotsForRenewal(contractId: string): Promise<SlotTemplate[]> {
    const { data: slots, error } = await supabase
        .from('time_slots')
        .select('id, start_time, end_time, event_type, price, price_category, patient_id, is_inaugural, reminder_one_hour, reminder_twenty_four_hours')
        .eq('contract_id', contractId)
        .order('start_time', { ascending: true });

    if (error) throw error;
    
    // Filtrar slots inaugurais - só conta os NÃO inaugurais
    const filtered = (slots || []).filter(slot => !slot.is_inaugural);
    
    console.log(`[getContractSlotsForRenewal] Contrato ${contractId}: ${filtered.length} slot(s) encontrado(s):`);
    filtered.forEach(slot => {
        const slotDate = slot.start_time ? format(parseISO(slot.start_time), 'yyyy-MM-dd') : 'N/A';
        const slotTime = slot.start_time ? format(parseISO(slot.start_time), 'HH:mm') : 'N/A';
        console.log(`  - Slot ${slot.id}: date=${slotDate}, start_time=${slot.start_time}, time=${slotTime}`);
    });
    
    return filtered;
}

/**
 * Calcula próxima data baseado na frequência
 */
export function calculateNextDate(currentDate: string, frequency: string): string {
    const date = parseISO(currentDate);
    let nextDate: Date;

    switch (frequency) {
        case 'weekly':
            nextDate = addWeeks(date, 1);
            break;
        case 'biweekly':
            nextDate = addWeeks(date, 2);
            break;
        case 'monthly':
            nextDate = addMonths(date, 1);
            break;
        default:
            nextDate = addWeeks(date, 1);
    }

    const result = format(nextDate, 'yyyy-MM-dd');
    console.log(`[calculateNextDate] ${currentDate} + ${frequency} = ${result}`);
    return result;
}


/**
 * Busca próximo horário disponível no dia
 */
export async function findNextAvailableTime(
    date: string,
    originalTime: string,
    duration: number
): Promise<{ time: string; changed: boolean } | null> {
    // Verificar se o dia está bloqueado
    const dayBlocked = await isDayBlocked(date);
    if (dayBlocked) return null;

    // Normalizar formato do horário
    const normalizedOriginalTime = originalTime.substring(0, 5);

    // Verificar horário original primeiro
    const originalCheck = await checkSlotOverlap(date, normalizedOriginalTime, duration);
    if (!originalCheck.hasConflict) {
        return { time: normalizedOriginalTime, changed: false };
    }

    // Buscar horários de 30 em 30 min
    const timeSlots = generateTimeSlots('08:00', '20:00', 30);
    const startIdx = timeSlots.indexOf(normalizedOriginalTime);

    // Buscar após o horário original
    for (let i = startIdx + 1; i < timeSlots.length; i++) {
        const check = await checkSlotOverlap(date, timeSlots[i], duration);
        if (!check.hasConflict) {
            return { time: timeSlots[i], changed: true };
        }
    }

    // Se não encontrou depois, buscar antes
    for (let i = startIdx - 1; i >= 0; i--) {
        const check = await checkSlotOverlap(date, timeSlots[i], duration);
        if (!check.hasConflict) {
            return { time: timeSlots[i], changed: true };
        }
    }

    return null; // Nenhum horário disponível
}

/**
 * Cria um slot de renovação
 */
async function createRenewalSlot(input: {
    contractId: string;
    templateSlot: SlotTemplate;
    date: string;
    time: string;
}): Promise<string> {
    const { contractId, templateSlot, date, time } = input;
    const duration = getSlotDuration(templateSlot);

    // Criar timestamp assumindo horário de Brasília (UTC-3)
    const startDateTime = new Date(`${date}T${formatDbTime(time)}-03:00`);
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

    const { data: newSlot, error } = await supabase
        .from('time_slots')
        .insert([{
            event_type: templateSlot.event_type,
            price_category: templateSlot.price_category,
            price: templateSlot.price,
            status: 'CONTRATADO',
            patient_id: templateSlot.patient_id,
            contract_id: contractId,
            sibling_order: 0,
            is_paid: false,
            is_inaugural: false,
            reminder_one_hour: templateSlot.reminder_one_hour || false,
            reminder_twenty_four_hours: templateSlot.reminder_twenty_four_hours || false,
            start_time: startDateTime.toISOString(),
            end_time: endDateTime.toISOString()
        }])
        .select('id')
        .single();

    if (error) throw error;
    return newSlot.id;
}

/**
 * Cria um novo contrato para a renovação
 */
async function createNewContract(frequency: string): Promise<{ id: string; short_id: string }> {
    const contractShortId = generateShortId();
    
    const { data: contract, error } = await supabase
        .from('contracts')
        .insert([{
            short_id: contractShortId,
            frequency: frequency
        }])
        .select('id, short_id')
        .single();

    if (error) throw error;
    return { id: contract.id, short_id: contract.short_id };
}

/**
 * Atualiza o end_date do contrato para a última data dos novos slots
 */
async function updateContractEndDate(contractId: string, newEndDate: string): Promise<void> {
    const { error } = await supabase
        .from('contracts')
        .update({ end_date: newEndDate })
        .eq('id', contractId);

    if (error) throw error;
}

/**
 * RENOVAÇÃO AUTOMÁTICA - Cria um novo contrato replicando o atual
 * 
 * Lógica:
 * 1. Criar novo contrato
 * 2. Buscar slots do contrato atual (não inaugurais)
 * 3. Para cada slot, calcula a próxima data baseado na frequência
 * 4. Busca horário disponível (desloca se houver conflito)
 * 5. Cria os novos slots no novo contrato
 * 6. Atualiza end_date do novo contrato
 */
export async function renewContractAutomatically(contract: ContractForRenewal): Promise<{
    success: boolean;
    createdCount: number;
    skippedCount: number;
    sessions: Array<{ date: string; time: string; originalTime: string; timeWasChanged: boolean; start_time: string; end_time: string }>;
    newEndDate: string | null;
    newContractId: string;
    newContractShortId: string;
}> {
    console.log(`[AutoRenewal] Iniciando renovação do contrato ${contract.short_id}...`);

    // 1. Criar novo contrato
    const newContract = await createNewContract(contract.frequency);
    console.log(`[AutoRenewal] Novo contrato criado: ${newContract.short_id} (${newContract.id})`);

    // 2. Buscar slots do contrato atual (não inaugurais)
    const currentSlots = await getContractSlotsForRenewal(contract.id);
    
    if (currentSlots.length === 0) {
        throw new Error('Nenhum slot encontrado para renovar (todos são inaugurais ou contrato vazio)');
    }

    console.log(`[AutoRenewal] Contrato ${contract.short_id}: ${currentSlots.length} slot(s) para replicar`);

    // Encontrar o último slot (end_time máximo)
    let lastSlotEndTime: Date | null = null;
    for (const slot of currentSlots) {
        if (slot.end_time) {
            const slotEndTime = parseISO(slot.end_time);
            if (!lastSlotEndTime || slotEndTime > lastSlotEndTime) {
                lastSlotEndTime = slotEndTime;
            }
        }
    }

    if (!lastSlotEndTime) {
        throw new Error('Nenhum slot com end_time encontrado');
    }

    const lastSlotDate = format(lastSlotEndTime, 'yyyy-MM-dd');
    console.log(`[AutoRenewal] Último slot do contrato: ${lastSlotDate}`);

    const createdSlotIds: string[] = [];
    const skippedSlots: string[] = [];
    const sessions: Array<{ date: string; time: string; originalTime: string; timeWasChanged: boolean; start_time: string; end_time: string }> = [];
    let lastCreatedDate: string | null = null;

    // Variável para rastrear a próxima data sequencialmente
    let currentDate = lastSlotEndTime;

    // 3. Para cada slot, criar o próximo somando a frequência sequencialmente
    for (let i = 0; i < currentSlots.length; i++) {
        const slot = currentSlots[i];
        // Extrair time de start_time
        if (!slot.start_time) {
            console.error(`[AutoRenewal] Slot ${slot.id} não possui start_time, pulando...`);
            continue;
        }
        const slotStartDate = new Date(slot.start_time);
        const hours = String(slotStartDate.getHours()).padStart(2, '0');
        const minutes = String(slotStartDate.getMinutes()).padStart(2, '0');
        const originalTime = `${hours}:${minutes}`;
        
        // Somar a frequência à data atual
        switch (contract.frequency) {
            case 'weekly':
                currentDate = addWeeks(currentDate, 1);
                break;
            case 'biweekly':
                currentDate = addWeeks(currentDate, 2);
                break;
            case 'monthly':
                currentDate = addMonths(currentDate, 1);
                break;
            default:
                currentDate = addWeeks(currentDate, 1);
        }
        
        const nextDate = format(currentDate, 'yyyy-MM-dd');
        const duration = getSlotDuration(slot);
        
        console.log(`[AutoRenewal] Slot ${i + 1}: ${nextDate} às ${originalTime}`);

        // 3. Buscar horário disponível
        const available = await findNextAvailableTime(nextDate, originalTime, duration);

        if (!available) {
            console.log(`[AutoRenewal] ⚠️ Sem disponibilidade para ${nextDate} às ${originalTime}, pulando...`);
            skippedSlots.push(`${nextDate} ${originalTime}`);
            continue;
        }

        // 4. Criar o slot no novo contrato
        try {
            const slotId = await createRenewalSlot({
                contractId: newContract.id,
                templateSlot: slot,
                date: nextDate,
                time: available.time
            });

            createdSlotIds.push(slotId);
            const timestamps = calculateTimestamps(nextDate, available.time, duration);
            
            // Extrair date e time de start_time para garantir consistência
            const { date: extractedDate, time: extractedTime } = extractDateAndTimeFromTimestamp(timestamps.start_time);
            
            sessions.push({
                date: extractedDate,
                time: extractedTime,
                originalTime: originalTime,
                timeWasChanged: available.changed,
                start_time: timestamps.start_time,
                end_time: timestamps.end_time
            });

            // Atualizar última data criada
            if (!lastCreatedDate || nextDate > lastCreatedDate) {
                lastCreatedDate = nextDate;
            }

            const timeInfo = available.changed ? ` (deslizado de ${originalTime})` : '';
            console.log(`[AutoRenewal] ✅ Criado: ${nextDate} às ${available.time}${timeInfo}`);

        } catch (err: any) {
            console.error(`[AutoRenewal] ❌ Erro ao criar slot ${nextDate} ${available.time}:`, err.message);
            skippedSlots.push(`${nextDate} ${available.time}`);
        }
    }

    // 5. Atualizar end_date do novo contrato se criou algum slot
    if (lastCreatedDate) {
        await updateContractEndDate(newContract.id, lastCreatedDate);
        console.log(`[AutoRenewal] 📅 Novo contrato ${newContract.short_id} end_date definido para ${lastCreatedDate}`);
    }

    return {
        success: createdSlotIds.length > 0,
        createdCount: createdSlotIds.length,
        skippedCount: skippedSlots.length,
        sessions,
        newEndDate: lastCreatedDate,
        newContractId: newContract.id,
        newContractShortId: newContract.short_id
    };
}

/**
 * Helper para calcular start_time e end_time a partir de date, time e duration
 */
function calculateTimestamps(date: string, time: string, durationMinutes: number): { start_time: string; end_time: string } {
    const startDateTime = new Date(`${date}T${formatDbTime(time)}-03:00`);
    const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60000);
    return {
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString()
    };
}

/**
 * Helper para extrair date e time de start_time (garantindo consistência)
 */
function extractDateAndTimeFromTimestamp(startTime: string): { date: string; time: string } {
    // startTime está em UTC (ISO string), precisamos converter para UTC-3 (Brasil)
    const date = new Date(startTime);
    
    // Converter UTC para UTC-3
    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();
    const utcDate = date.getUTCDate();
    const utcMonth = date.getUTCMonth();
    const utcYear = date.getUTCFullYear();
    
    // Aplicar offset UTC-3
    let localHours = utcHours - 3;
    let localDay = utcDate;
    let localMonth = utcMonth;
    let localYear = utcYear;
    
    // Se localHours ficou negativo, ajustar para o dia anterior
    if (localHours < 0) {
        localHours += 24;
        localDay -= 1;
        // Se o dia ficou negativo, ajustar mês
        if (localDay < 1) {
            localMonth -= 1;
            if (localMonth < 0) {
                localMonth = 11;
                localYear -= 1;
            }
            // Pegar último dia do mês anterior
            const lastDayOfMonth = new Date(localYear, localMonth + 1, 0).getDate();
            localDay = lastDayOfMonth;
        }
    }
    
    const dateStr = format(new Date(localYear, localMonth, localDay), 'yyyy-MM-dd');
    const timeStr = `${String(localHours).padStart(2, '0')}:${String(utcMinutes).padStart(2, '0')}`;
    
    return { date: dateStr, time: timeStr };
}

/**
 * Preview de renovação para um contrato (usado na UI)
 */
export async function getRenewalPreview(contractId: string): Promise<{
    suggestedDate: string;
    suggestedTime: string;
    originalTime: string;
    timeWasChanged: boolean;
    noAvailability: boolean;
    patientName?: string;
    patientPhone?: string;
    patientEmail?: string;
    frequency?: string;
    sessionsCount: number;
    sessions: Array<{
        date: string;
        time: string;
        originalTime: string;
        timeWasChanged: boolean;
        noAvailability: boolean;
        start_time: string;
        end_time: string;
    }>;
}> {
    // Buscar contrato
    const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .select('id, frequency, end_date')
        .eq('id', contractId)
        .single();

    if (contractError) throw contractError;
    if (!contract) throw new Error('Contrato não encontrado');

    // Buscar slots do contrato (não inaugurais)
    const currentSlots = await getContractSlotsForRenewal(contractId);
    
    if (currentSlots.length === 0) {
        throw new Error('Nenhum slot encontrado para este contrato');
    }

    console.log(`[getRenewalPreview] Contrato ${contractId}, frequência: ${contract.frequency}, slots encontrados: ${currentSlots.length}`);
    
    // Buscar dados do paciente do primeiro slot
    const { data: patientData } = await supabase
        .from('time_slots')
        .select('patient:patients(name, phone, email)')
        .eq('contract_id', contractId)
        .limit(1)
        .single();

    // Encontrar o último slot (end_time máximo)
    let lastSlotEndTime: Date | null = null;
    for (const slot of currentSlots) {
        if (slot.end_time) {
            const slotEndTime = parseISO(slot.end_time);
            if (!lastSlotEndTime || slotEndTime > lastSlotEndTime) {
                lastSlotEndTime = slotEndTime;
            }
        }
    }

    if (!lastSlotEndTime) {
        throw new Error('Nenhum slot com end_time encontrado');
    }

    const lastSlotDateStr = format(lastSlotEndTime, 'yyyy-MM-dd');
    console.log(`[getRenewalPreview] ⭐ Último slot (end_time máximo): ${lastSlotDateStr}`);

    const sessions: Array<{
        date: string;
        time: string;
        originalTime: string;
        timeWasChanged: boolean;
        noAvailability: boolean;
        start_time: string;
        end_time: string;
    }> = [];

    // Variável para rastrear a próxima data sequencialmente
    let currentDate = lastSlotEndTime;

    // Calcular preview para cada slot, somando a frequência sequencialmente
    for (let i = 0; i < currentSlots.length; i++) {
        const slot = currentSlots[i];
        
        if (!slot.start_time) {
            console.error(`[getRenewalPreview] Slot ${slot.id} não possui start_time, pulando...`);
            continue;
        }
        
        // Extrair date e time de start_time
        const slotStartDate = new Date(slot.start_time);
        const slotDateStr = format(slotStartDate, 'yyyy-MM-dd');
        const hours = String(slotStartDate.getHours()).padStart(2, '0');
        const minutes = String(slotStartDate.getMinutes()).padStart(2, '0');
        const slotTimeStr = `${hours}:${minutes}`;
        
        console.log(`\n[getRenewalPreview] 🔍 Slot ${i + 1}/${currentSlots.length}:`);
        console.log(`  - date extraído: ${slotDateStr}`);
        console.log(`  - time extraído: ${slotTimeStr}`);
        console.log(`  - start_time no DB: ${slot.start_time}`);
        console.log(`  - end_time no DB: ${slot.end_time}`);
        
        // Somar a frequência à data atual (que começa com lastSlotEndTime)
        // Para cada slot, adiciona a frequência sequencialmente
        switch (contract.frequency) {
            case 'weekly':
                currentDate = addWeeks(currentDate, 1);
                break;
            case 'biweekly':
                currentDate = addWeeks(currentDate, 2);
                break;
            case 'monthly':
                currentDate = addMonths(currentDate, 1);
                break;
            default:
                currentDate = addWeeks(currentDate, 1);
        }
        
        const nextDate = format(currentDate, 'yyyy-MM-dd');
        const originalTime = slotTimeStr;
        const duration = getSlotDuration(slot);

        console.log(`  ➡️ nextDate calculado: ${nextDate}`);
        console.log(`  ➡️ originalTime usado: ${originalTime} (extraído de start_time: ${slot.start_time})`);
        console.log(`  ➡️ duration: ${duration}min`);

        const available = await findNextAvailableTime(nextDate, originalTime, duration);

        console.log(`  ➡️ available resultado:`, available);
        console.log(`  ➡️ time final: ${available?.time || originalTime}, changed: ${available?.changed || false}\n`);

        const finalTime = available?.time || originalTime;
        const timestamps = calculateTimestamps(nextDate, finalTime, duration);
        
        // Extrair date e time de start_time para garantir consistência
        const { date: extractedDate, time: extractedTime } = extractDateAndTimeFromTimestamp(timestamps.start_time);

        sessions.push({
            date: extractedDate,
            time: extractedTime,
            originalTime: originalTime,
            timeWasChanged: available?.changed || false,
            noAvailability: available === null,
            start_time: timestamps.start_time,
            end_time: timestamps.end_time
        });
    }

    // Ordenar sessions por data (crescente - mais antiga para mais nova)
    sessions.sort((a, b) => a.date.localeCompare(b.date));

    const firstSession = sessions[0];
    const anyNoAvailability = sessions.some(s => s.noAvailability);
    const anyTimeChanged = sessions.some(s => s.timeWasChanged);

    return {
        suggestedDate: firstSession.date,
        suggestedTime: firstSession.time,
        originalTime: firstSession.originalTime,
        timeWasChanged: anyTimeChanged,
        noAvailability: anyNoAvailability,
        patientName: (patientData?.patient as any)?.name,
        patientPhone: (patientData?.patient as any)?.phone,
        patientEmail: (patientData?.patient as any)?.email,
        frequency: contract.frequency,
        sessionsCount: sessions.length,
        sessions
    };
}

/**
 * Renovação manual direta - permite o usuário renovar um contrato
 * Cria um novo contrato replicando o atual
 */
export async function confirmRenewalDirect(contractId: string, adjustments?: { date?: string; time?: string }): Promise<{
    success: boolean;
    slotIds: string[];
    sessions: Array<{ date: string; time: string; timeWasChanged: boolean; start_time: string; end_time: string }>;
    totalCreated: number;
    newContractId: string;
    newContractShortId: string;
}> {
    // Buscar dados do contrato
    const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .select('id, short_id, frequency, end_date')
        .eq('id', contractId)
        .single();

    if (contractError) throw new Error(`Contrato não encontrado: ${contractError.message}`);

    // Criar novo contrato
    const newContract = await createNewContract(contract.frequency);
    console.log(`[ManualRenewal] Novo contrato criado: ${newContract.short_id} (${newContract.id})`);

    // Buscar slots do contrato (não inaugurais)
    const currentSlots = await getContractSlotsForRenewal(contractId);
    
    if (currentSlots.length === 0) {
        throw new Error('Nenhum slot encontrado para renovar');
    }

    console.log(`[ManualRenewal] Contrato ${contract.short_id}: ${currentSlots.length} slot(s) para replicar`);

    // Encontrar o último slot (end_time máximo)
    let lastSlotEndTime: Date | null = null;
    for (const slot of currentSlots) {
        if (slot.end_time) {
            const slotEndTime = parseISO(slot.end_time);
            if (!lastSlotEndTime || slotEndTime > lastSlotEndTime) {
                lastSlotEndTime = slotEndTime;
            }
        }
    }

    if (!lastSlotEndTime) {
        throw new Error('Nenhum slot com end_time encontrado');
    }

    const slotIds: string[] = [];
    const sessions: Array<{ date: string; time: string; timeWasChanged: boolean; start_time: string; end_time: string }> = [];
    let lastCreatedDate: string | null = null;

    // Variável para rastrear a próxima data sequencialmente
    let currentDate = lastSlotEndTime;

    // Para cada slot, criar o próximo somando a frequência sequencialmente
    for (let i = 0; i < currentSlots.length; i++) {
        const slot = currentSlots[i];
        
        if (!slot.start_time) {
            console.error(`[executeRenewal] Slot ${slot.id} não possui start_time, pulando...`);
            continue;
        }
        
        // Extrair time de start_time
        const slotStartDate = new Date(slot.start_time);
        const hours = String(slotStartDate.getHours()).padStart(2, '0');
        const minutes = String(slotStartDate.getMinutes()).padStart(2, '0');
        const originalTime = `${hours}:${minutes}`;
        
        // Somar a frequência à data atual (que começa com lastSlotEndTime)
        // Para cada slot, adiciona a frequência sequencialmente
        switch (contract.frequency) {
            case 'weekly':
                currentDate = addWeeks(currentDate, 1);
                break;
            case 'biweekly':
                currentDate = addWeeks(currentDate, 2);
                break;
            case 'monthly':
                currentDate = addMonths(currentDate, 1);
                break;
            default:
                currentDate = addWeeks(currentDate, 1);
        }
        
        let nextDate = format(currentDate, 'yyyy-MM-dd');
        let targetTime = originalTime;

        // Se for o primeiro slot e houver ajustes, usar os ajustes
        if (i === 0 && adjustments) {
            if (adjustments.date) {
                // Se ajustou a data do primeiro slot, usar essa data
                nextDate = adjustments.date;
                // E recalcular currentDate para os próximos slots
                currentDate = parseISO(adjustments.date);
            }
            if (adjustments.time) {
                targetTime = adjustments.time;
            }
        }

        const duration = getSlotDuration(slot);

        // Buscar horário disponível (pula se já tiver ajuste manual)
        let finalTime = targetTime;
        let timeWasChanged = false;

        if (!(i === 0 && adjustments?.time)) {
            const available = await findNextAvailableTime(nextDate, targetTime, duration);
            if (available) {
                finalTime = available.time;
                timeWasChanged = available.changed;
            } else {
                console.log(`[ManualRenewal] Sem disponibilidade para ${nextDate} às ${targetTime}, pulando...`);
                continue;
            }
        }

        // Criar o slot no novo contrato
        const slotId = await createRenewalSlot({
            contractId: newContract.id,
            templateSlot: slot,
            date: nextDate,
            time: finalTime
        });

        slotIds.push(slotId);
        const timestamps = calculateTimestamps(nextDate, finalTime, duration);
        
        // Extrair date e time de start_time para garantir consistência
        const { date: extractedDate, time: extractedTime } = extractDateAndTimeFromTimestamp(timestamps.start_time);
        
        sessions.push({ 
            date: extractedDate, 
            time: extractedTime, 
            timeWasChanged,
            start_time: timestamps.start_time,
            end_time: timestamps.end_time
        });

        if (!lastCreatedDate || nextDate > lastCreatedDate) {
            lastCreatedDate = nextDate;
        }

        console.log(`[ManualRenewal] Criado: ${nextDate} às ${finalTime}${timeWasChanged ? ' (deslizado)' : ''}`);
    }

    // Atualizar end_date do novo contrato
    if (lastCreatedDate) {
        await updateContractEndDate(newContract.id, lastCreatedDate);
        console.log(`[ManualRenewal] Novo contrato ${newContract.short_id} end_date definido para ${lastCreatedDate}`);
    }

    if (slotIds.length === 0) {
        throw new Error('Não foi possível criar nenhuma sessão - todos os horários estão ocupados');
    }

    return {
        success: true,
        slotIds,
        sessions,
        totalCreated: slotIds.length,
        newContractId: newContract.id,
        newContractShortId: newContract.short_id
    };
}
