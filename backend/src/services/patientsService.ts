import { supabase } from '../db/supabase.js';
import type { Patient, CreatePatientInput, UpdatePatientInput } from '../models/patient.js';

/**
 * Buscar ou criar paciente por telefone/email
 * Retorna paciente existente se encontrar, senão cria um novo
 */
export async function findOrCreatePatient(input: CreatePatientInput): Promise<Patient> {
    // 1. Tentar buscar por telefone primeiro (mais confiável)
    if (input.phone) {
        const { data: existing } = await supabase
            .from('patients')
            .select('*')
            .eq('phone', input.phone)
            .single();

        if (existing) return existing;
    }

    // 2. Se não encontrou por telefone, tentar por email
    if (input.email) {
        const { data: existing } = await supabase
            .from('patients')
            .select('*')
            .eq('email', input.email)
            .single();

        if (existing) return existing;
    }

    // 3. Criar novo paciente
    const { data, error } = await supabase
        .from('patients')
        .insert([{
            name: input.name,
            phone: input.phone || null,
            email: input.email || null,
            privacy_terms_accepted: input.privacyTermsAccepted || false
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Criar paciente (sem verificar se já existe)
 */
export async function createPatient(input: CreatePatientInput): Promise<Patient> {
    const { data, error } = await supabase
        .from('patients')
        .insert([{
            name: input.name,
            phone: input.phone || null,
            email: input.email || null,
            privacy_terms_accepted: input.privacyTermsAccepted || false
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Buscar paciente por ID
 */
export async function getPatient(id: string): Promise<Patient | null> {
    const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
    }

    return data;
}

/**
 * Atualizar dados de um paciente
 */
export async function updatePatient(id: string, input: UpdatePatientInput): Promise<Patient> {
    const updateData: any = {};

    if (input.name !== undefined) updateData.name = input.name;
    if (input.phone !== undefined) updateData.phone = input.phone || null;
    if (input.email !== undefined) updateData.email = input.email && input.email.trim() !== '' ? input.email : null;
    if (input.privacyTermsAccepted !== undefined) {
        updateData.privacy_terms_accepted = input.privacyTermsAccepted;
    }

    const { data, error } = await supabase
        .from('patients')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Listar todos os pacientes (com paginação)
 */
export async function listPatients(limit: number = 50, offset: number = 0): Promise<Patient[]> {
    const { data, error } = await supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;
    return data || [];
}

/**
 * Deletar paciente
 */
export async function deletePatient(id: string): Promise<void> {
    const { error } = await supabase
        .from('patients')
        .delete()
        .eq('id', id);

    if (error) throw error;
}
