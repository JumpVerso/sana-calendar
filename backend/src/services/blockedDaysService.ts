import { supabase } from '../db/supabase.js';
import type {
    BlockedDay,
    CreateBlockedDayInput,
    UpdateBlockedDayInput,
} from '../models/blockedDay.js';

// LISTAR TODOS OS DIAS BLOQUEADOS
export async function getAllBlockedDays(): Promise<BlockedDay[]> {
    const { data, error } = await supabase
        .from('blocked_days')
        .select('*')
        .order('date', { ascending: true });

    if (error) throw error;
    return data || [];
}

// LISTAR DIAS BLOQUEADOS EM UM RANGE
export async function getBlockedDaysInRange(startDate: string, endDate: string): Promise<BlockedDay[]> {
    const { data, error } = await supabase
        .from('blocked_days')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

    if (error) throw error;
    return data || [];
}

// VERIFICAR SE UM DIA ESTÁ BLOQUEADO
export async function isDayBlocked(date: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('blocked_days')
        .select('id')
        .eq('date', date)
        .limit(1);

    if (error) throw error;
    return data !== null && data.length > 0;
}

// BUSCAR UM DIA BLOQUEADO POR DATA
export async function getBlockedDayByDate(date: string): Promise<BlockedDay | null> {
    const { data, error } = await supabase
        .from('blocked_days')
        .select('*')
        .eq('date', date)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            // Nenhum resultado encontrado
            return null;
        }
        throw error;
    }
    return data;
}

// BUSCAR UM DIA BLOQUEADO POR ID
export async function getBlockedDayById(id: string): Promise<BlockedDay | null> {
    const { data, error } = await supabase
        .from('blocked_days')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            return null;
        }
        throw error;
    }
    return data;
}

// CRIAR DIA BLOQUEADO
export async function createBlockedDay(input: CreateBlockedDayInput): Promise<BlockedDay> {
    // Verificar se já existe bloqueio para essa data
    const existing = await getBlockedDayByDate(input.date);
    if (existing) {
        throw new Error('Este dia já está bloqueado');
    }

    const { data, error } = await supabase
        .from('blocked_days')
        .insert([{
            date: input.date,
            reason: input.reason || null,
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ATUALIZAR DIA BLOQUEADO
export async function updateBlockedDay(id: string, input: UpdateBlockedDayInput): Promise<BlockedDay> {
    const updateData: any = {};
    if (input.reason !== undefined) {
        updateData.reason = input.reason;
    }

    const { data, error } = await supabase
        .from('blocked_days')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// DELETAR DIA BLOQUEADO
export async function deleteBlockedDay(id: string): Promise<void> {
    const { error } = await supabase
        .from('blocked_days')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// DESBLOQUEAR DIA POR DATA
export async function unblockDay(date: string): Promise<void> {
    const { error } = await supabase
        .from('blocked_days')
        .delete()
        .eq('date', date);

    if (error) throw error;
}
