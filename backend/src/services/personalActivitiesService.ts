
import { supabase } from '../db/supabase.js';

export interface PersonalActivity {
    id: string;
    label: string;
    active: boolean;
    sort_order: number;
}

export interface CreatePersonalActivityInput {
    label: string;
}

export interface UpdatePersonalActivityInput {
    label?: string;
    active?: boolean;
    sort_order?: number;
}

// LISTAR ATIVIDADES
export async function getPersonalActivities(): Promise<PersonalActivity[]> {
    const { data, error } = await supabase
        .from('personal_activities')
        .select('*')
        .order('sort_order', { ascending: true });

    if (error) throw error;
    return data || [];
}

// CRIAR ATIVIDADE
export async function createPersonalActivity(input: CreatePersonalActivityInput): Promise<PersonalActivity> {
    const { count, error: countError } = await supabase
        .from('personal_activities')
        .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    const sortOrder = count || 0;

    const { data, error } = await supabase
        .from('personal_activities')
        .insert([{
            label: input.label,
            active: true,
            sort_order: sortOrder
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ATUALIZAR ATIVIDADE
export async function updatePersonalActivity(id: string, input: UpdatePersonalActivityInput): Promise<PersonalActivity> {
    const { data, error } = await supabase
        .from('personal_activities')
        .update(input)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// DELETAR ATIVIDADE (SOFT DELETE via active=false ou HARD DELETE?)
// User request implied management, usually hard delete is risky if referenced.
// But database constraints might block it. For now let's allow hard delete but frontend might use active flag.
export async function deletePersonalActivity(id: string): Promise<void> {
    const { error } = await supabase
        .from('personal_activities')
        .delete()
        .eq('id', id);

    if (error) throw error;
}
