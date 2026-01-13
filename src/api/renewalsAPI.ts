import { fetchClient } from './fetchClient';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface RenewalPreview {
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
    }>;
}

export interface ConfirmRenewalResult {
    success: boolean;
    message: string;
    slotIds: string[];
    sessions: Array<{ date: string; time: string; timeWasChanged: boolean }>;
    totalCreated: number;
}

export interface ProcessRenewalsResult {
    success: boolean;
    message: string;
    processedCount: number;
    renewedCount: number;
    skippedAlreadyRenewed: number;
    skippedNoSlots: number;
    totalSlotsCreated: number;
    errors: string[];
}

class RenewalsAPI {
    // Preview de renovação para um contrato
    async getRenewalPreview(contractId: string): Promise<RenewalPreview> {
        const response = await fetchClient(`${API_BASE_URL}/renewals/preview/${contractId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Falha ao buscar preview da renovação');
        }
        return response.json();
    }

    // Renovação manual direta
    async confirmRenewalDirect(contractId: string, adjustments?: { date?: string; time?: string }): Promise<ConfirmRenewalResult> {
        const response = await fetchClient(`${API_BASE_URL}/renewals/direct/${contractId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(adjustments || {}),
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Falha ao confirmar renovação');
        }
        return response.json();
    }

    // Processar renovações manualmente (executar job)
    async processRenewals(): Promise<ProcessRenewalsResult> {
        const response = await fetchClient(`${API_BASE_URL}/renewals/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Falha ao processar renovações');
        }
        return response.json();
    }
}

export const renewalsAPI = new RenewalsAPI();
