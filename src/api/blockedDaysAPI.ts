import { fetchClient } from './fetchClient';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface BlockedDay {
    id: string;
    date: string; // YYYY-MM-DD
    reason: string | null;
    created_at: string;
    updated_at: string;
}

export interface CreateBlockedDayInput {
    date: string; // YYYY-MM-DD
    reason?: string | null;
}

export interface UpdateBlockedDayInput {
    reason?: string | null;
}

class BlockedDaysAPI {
    // Listar todos os dias bloqueados
    async getAllBlockedDays(): Promise<BlockedDay[]> {
        const response = await fetchClient(`${API_BASE_URL}/blocked-days`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Falha ao buscar dias bloqueados');
        }
        return response.json();
    }

    // Listar dias bloqueados em um range
    async getBlockedDaysInRange(startDate: string, endDate: string): Promise<BlockedDay[]> {
        const response = await fetchClient(
            `${API_BASE_URL}/blocked-days/range?startDate=${startDate}&endDate=${endDate}`,
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            }
        );
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Falha ao buscar dias bloqueados no range');
        }
        return response.json();
    }

    // Verificar se um dia está bloqueado
    async checkDayBlocked(date: string): Promise<{ date: string; isBlocked: boolean }> {
        const response = await fetchClient(
            `${API_BASE_URL}/blocked-days/check?date=${date}`,
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            }
        );
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Falha ao verificar dia bloqueado');
        }
        return response.json();
    }

    // Buscar dia bloqueado por ID
    async getBlockedDayById(id: string): Promise<BlockedDay> {
        const response = await fetchClient(`${API_BASE_URL}/blocked-days/${id}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Falha ao buscar dia bloqueado');
        }
        return response.json();
    }

    // Criar dia bloqueado
    async createBlockedDay(input: CreateBlockedDayInput): Promise<BlockedDay> {
        const response = await fetchClient(`${API_BASE_URL}/blocked-days`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Falha ao criar dia bloqueado');
        }
        return response.json();
    }

    // Atualizar dia bloqueado
    async updateBlockedDay(id: string, input: UpdateBlockedDayInput): Promise<BlockedDay> {
        const response = await fetchClient(`${API_BASE_URL}/blocked-days/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Falha ao atualizar dia bloqueado');
        }
        return response.json();
    }

    // Deletar dia bloqueado
    async deleteBlockedDay(id: string): Promise<void> {
        const response = await fetchClient(`${API_BASE_URL}/blocked-days/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Falha ao deletar dia bloqueado');
        }
    }

    // Desbloquear dia por data
    async unblockDay(date: string): Promise<void> {
        try {
            const response = await fetchClient(
                `${API_BASE_URL}/blocked-days/unblock?date=${encodeURIComponent(date)}`,
                {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                }
            );
            
            // Status 204 (No Content) é sucesso para DELETE
            if (response.status === 204) {
                return;
            }
            
            if (!response.ok) {
                try {
                    const error = await response.json();
                    throw new Error(error.error || 'Falha ao desbloquear dia');
                } catch (e) {
                    if (e instanceof Error && e.message !== 'Falha ao desbloquear dia') {
                        throw e;
                    }
                    throw new Error(`Falha ao desbloquear dia: ${response.status} ${response.statusText}`);
                }
            }
        } catch (error: any) {
            if (error.message && error.message.includes('fetch')) {
                throw new Error('Erro de conexão. Verifique se o servidor está rodando.');
            }
            throw error;
        }
    }
}

export const blockedDaysAPI = new BlockedDaysAPI();
