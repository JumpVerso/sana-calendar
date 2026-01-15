// API client para o backend
import { fetchClient } from './fetchClient';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface TimeSlot {
    id?: string;
    date: string;
    time: string;
    type: 'online' | 'presential' | 'personal' | null;
    valor: string;
    preco: string;
    status: string;
    patientName?: string;  // Dados vêm do patient object
    patientPhone?: string;
    patientEmail?: string;
    patientId?: string;  // ID do paciente
    privacyTermsAccepted?: boolean;
    flow_status?: 'Enviado' | null;
    isPaid?: boolean;
    isInaugural?: boolean; // Marca se o slot é inaugural (gratuito)
    groupId?: string;  // Nome usado no frontend
    startTime?: string; // ISO string para ordenação precisa
    endTime?: string;   // ISO string para cálculo de conflitos
    reminders?: { oneHour: boolean; twentyFourHours: boolean };
    price?: number | null; // Preço em centavos (usado em ContractViewDialog)
    duration?: string;
    isLastSlotOfContract?: boolean; // Indica se é o último slot do contrato
    needsRenewal?: boolean; // Indica se o contrato precisa de renovação
}

class SlotsAPI {
    // GET /api/slots
    async getSlots(startDate: string, endDate: string): Promise<TimeSlot[]> {
        const response = await fetchClient(
            `${API_BASE_URL}/slots?startDate=${startDate}&endDate=${endDate}`,
            { credentials: 'include' }
        );
        if (!response.ok) throw new Error('Failed to fetch slots');
        const data = await response.json();

        // Transformar para formato do frontend
        return data.map((slot: any) => {
            let valor = '';
            let duration = undefined;

            if (slot.event_type === 'personal') {
                // personal_activity agora contém apenas o nome (sem sufixo de duração)
                valor = slot.personal_activity || 'Atividade Pessoal';

                // Calcular duração de start_time e end_time
                if (slot.start_time && slot.end_time) {
                    const start = new Date(slot.start_time);
                    const end = new Date(slot.end_time);
                    const durationMs = end.getTime() - start.getTime();
                    const durationMinutes = Math.round(durationMs / 60000);
                    
                    if (durationMinutes >= 120) duration = '2h';
                    else if (durationMinutes >= 90) duration = '1h30';
                    else if (durationMinutes >= 60) duration = '1h';
                    else duration = '30m';
                } else {
                    // Fallback para dados legados (antes da migração)
                    const rawActivity = slot.personal_activity || '';
                    const parts = rawActivity.split('#');
                    if (parts.length > 1) {
                        const suffix = parts[1];
                        if (suffix === '1h' || suffix === '60m') duration = '1h';
                        else if (suffix === '1h30' || suffix === '90m') duration = '1h30';
                        else if (suffix === '2h' || suffix === '120m') duration = '2h';
                        else duration = '30m';
                    } else {
                        duration = '30m';
                    }
                }

                // Status é independente no DB
                // Fallback para dados legados onde status pode conter o nome da atividade
                if (slot.status && (slot.status === slot.personal_activity || slot.status.includes('#'))) {
                    status = 'PENDENTE';
                } else {
                    status = slot.status || 'PENDENTE';
                }

            } else {
                valor = slot.price_category || '';
                status = slot.status || (valor || ''); // Clean status
            }

            // Extrair date e time de start_time se disponível, senão usar date/time do backend (compatibilidade)
            let date = slot.date;
            let time = slot.time;
            
            if (slot.start_time) {
                const startDate = new Date(slot.start_time);
                date = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
                const hours = String(startDate.getHours()).padStart(2, '0');
                const minutes = String(startDate.getMinutes()).padStart(2, '0');
                time = `${hours}:${minutes}`;
            } else if (slot.time) {
                time = slot.time.substring(0, 5); // HH:MM:SS -> HH:MM
            }

            return {
                id: slot.id,
                date: date,
                time: time,
                type: slot.event_type,
                valor: valor,
                duration: duration,
                preco: slot.price ? String(slot.price) : '',
                status: status, // Clean status
                // Dados do paciente vêm do JOIN
                patientId: slot.patient_id,
                patientName: slot.patient?.name,
                patientPhone: slot.patient?.phone,
                patientEmail: slot.patient?.email,
                privacyTermsAccepted: slot.patient?.privacy_terms_accepted,
                flow_status: slot.flow_status,
                isPaid: slot.is_paid,
                isInaugural: slot.is_inaugural,
                groupId: slot.contract_id,  // Backend usa contract_id, frontend usa groupId
                startTime: slot.start_time, // ISO string para cálculo de conflitos
                endTime: slot.end_time,     // ISO string para cálculo de conflitos
                reminders: {
                    oneHour: slot.reminder_one_hour || false,
                    twentyFourHours: slot.reminder_twenty_four_hours || false
                },
                isLastSlotOfContract: slot.isLastSlotOfContract || false,
                needsRenewal: slot.needsRenewal || false
            };
        });
    }

    // POST /api/slots
    async createSlot(data: {
        date: string;
        time: string;
        eventType: 'online' | 'presential' | 'personal';
        priceCategory?: string;
        price?: number | null;
        status?: string; // Para atividades pessoais
        duration?: string; // Para atividades pessoais (1h ou 30m)
        patientId?: string;
        patientName?: string;
        patientPhone?: string;
        patientEmail?: string;
    }): Promise<TimeSlot> {
        // Map duration to priceCategory if present (for personal slots)
        if (data.eventType === 'personal' && data.duration) {
            data.priceCategory = data.duration;
        }

        const response = await fetchClient(`${API_BASE_URL}/slots`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create slot');
        }
        return response.json();
    }

    // POST /api/slots/bulk-personal
    async createBulkPersonalSlots(slots: Array<{
        date: string;
        time: string;
        activity: string;
        duration: string;
    }>): Promise<{ created: TimeSlot[]; failed: Array<{ slot: any; error: string }> }> {
        const response = await fetchClient(`${API_BASE_URL}/slots/bulk-personal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slots }),
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create bulk personal slots');
        }
        return response.json();
    }

    // POST /api/slots/double
    async createDoubleSlot(data: {
        date: string;
        time: string;
        slot1Type: 'online' | 'presential' | 'personal';
        slot2Type: 'online' | 'presential' | 'personal';
        priceCategory?: string;
        status?: string;
    }): Promise<TimeSlot[]> {
        const response = await fetchClient(`${API_BASE_URL}/slots/double`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create double slot');
        }
        return response.json();
    }

    // PUT /api/slots/:id
    async updateSlot(id: string, data: Partial<TimeSlot>): Promise<TimeSlot> {
        // Transformar para formato backend
        const backendData: any = {};
        if (data.type !== undefined) backendData.eventType = data.type;

        // Mapeamento inteligente de valor para priceCategory, personalActivity ou STATUS
        if (data.valor !== undefined) {
            const lowerVal = data.valor.toLowerCase();
            if (lowerVal === 'concluido' || lowerVal === 'nao_realizado' || lowerVal === 'pendente') {
                // É um STATUS
                backendData.status = lowerVal === 'concluido' ? 'CONCLUIDO' : (lowerVal === 'nao_realizado' ? 'NAO_REALIZADO' : 'PENDENTE');
            } else if (['padrao', 'emergencial', 'promocional'].includes(lowerVal)) {
                // É Commercial Price Category
                backendData.priceCategory = data.valor;
            } else if (data.valor === '') {
                // Se vazio, limpa
                backendData.priceCategory = null;
                backendData.personalActivity = null;
            } else {
                // Assume que é o NOME da atividade (Activity Label)
                backendData.personalActivity = data.valor;
            }
        }

        // Map duration to priceCategory for personal slots
        if (data.duration) {
            backendData.priceCategory = data.duration;
        }

        // `preco` no frontend é armazenado como centavos (string de dígitos),
        // mas alguns inputs podem enviar valor formatado ("150,00").
        // O backend espera `price` em centavos (number).
        if (data.preco !== undefined) {
            const raw = String(data.preco ?? '');
            const centsStr = raw.replace(/\D/g, '');
            backendData.price = centsStr ? Number(centsStr) : null;
        }

        // Se status foi passado explicitamente (override no logic above if both present, but usually one is passed)
        if (data.status !== undefined) backendData.status = data.status;

        // Enviar patientId se disponível
        if (data.patientId !== undefined) {
            backendData.patientId = data.patientId;
        }

        if (data.privacyTermsAccepted !== undefined) backendData.privacyTermsAccepted = data.privacyTermsAccepted;
        if (data.flow_status !== undefined) backendData.flowStatus = data.flow_status;
        if (data.isPaid !== undefined) backendData.isPaid = data.isPaid;  // Enviar status de pagamento
        if (data.isInaugural !== undefined) backendData.isInaugural = data.isInaugural;  // Enviar status inaugural
        if (data.groupId !== undefined) backendData.contractId = data.groupId;  // Frontend usa groupId, backend usa contractId
        if (data.reminders !== undefined) {
            backendData.reminderOneHour = data.reminders.oneHour;
            backendData.reminderTwentyFourHours = data.reminders.twentyFourHours;
        }

        const response = await fetchClient(`${API_BASE_URL}/slots/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(backendData),
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update slot');
        }
        return response.json();
    }

    // DELETE /api/slots/:id
    async deleteSlot(id: string): Promise<void> {
        const response = await fetchClient(`${API_BASE_URL}/slots/${id}`, {
            method: 'DELETE',
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete slot');
        }
    }

    // POST /api/slots/:id/reserve
    async reserveSlot(
        id: string,
        data: { patientName: string; patientPhone: string }
    ): Promise<TimeSlot> {
        const response = await fetchClient(`${API_BASE_URL}/slots/${id}/reserve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to reserve slot');
        }
        return response.json();
    }

    // POST /api/slots/:id/confirm
    async confirmSlot(id: string): Promise<TimeSlot> {
        const response = await fetchClient(`${API_BASE_URL}/slots/${id}/confirm`, {
            method: 'POST',
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to confirm slot');
        }
        return response.json();
    }

    // POST /api/slots/:id/send-flow
    async sendFlow(
        id: string,
        data: { patientName: string; patientPhone: string }
    ): Promise<TimeSlot> {
        const response = await fetchClient(`${API_BASE_URL}/slots/${id}/send-flow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to send flow');
        }
        const backendData = await response.json();

        // Transformar para formato do frontend
        return {
            id: backendData.id,
            date: backendData.date,
            time: backendData.time?.substring(0, 5) || '', // HH:MM:SS -> HH:MM
            type: backendData.event_type,
            valor: backendData.event_type === 'personal' ? (backendData.personal_activity || '') : (backendData.price_category || ''),
            preco: backendData.price ? String(backendData.price) : '',
            status: backendData.status || backendData.personal_activity || '',
            patientName: backendData.patient?.name,
            patientPhone: backendData.patient?.phone,
            patientEmail: backendData.patient?.email,
            privacyTermsAccepted: backendData.patient?.privacy_terms_accepted,
            flow_status: backendData.flow_status,
            isPaid: backendData.is_paid,
            groupId: backendData.contract_id,
        };
    }

    // POST /api/slots/recurring
    async createRecurringSlots(data: {
        originalSlotId: string;
        frequency: 'weekly' | 'biweekly' | 'monthly' | string;
        range: 'current_and_next_month' | string;
        slots?: Array<{ date: string; time: string }>; // Novo formato: slots com data e hora
        dates?: string[]; // Formato antigo: apenas datas
        patientName?: string;
        patientPhone?: string;
        patientEmail?: string;
        occurrenceCount?: number;
        payments?: Record<string, boolean>;
        inaugurals?: Record<string, boolean>; // Marca se cada data é inaugural (gratuito)
        reminders?: { oneHour: boolean; twentyFourHours: boolean };
    }): Promise<{ createdCount: number; conflicts: any[]; contractId: string; contractShortId: string }> {
        const response = await fetchClient(`${API_BASE_URL}/slots/recurring`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create recurring slots');
        }
        return response.json();
    }

    // POST /api/slots/recurring/preview
    async previewRecurringSlots(data: {
        originalSlotId: string;
        frequency: 'weekly' | 'biweekly' | 'monthly' | string;
        range: 'current_and_next_month' | string;
        occurrenceCount?: number;
    }): Promise<{ preview: any[]; hasPreviousContracts: boolean }> {
        const response = await fetchClient(`${API_BASE_URL}/slots/recurring/preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to preview recurring slots');
        }
        const result = await response.json();
        // Compatibilidade: se a resposta for um array (formato antigo), converter para novo formato
        if (Array.isArray(result)) {
            return { preview: result, hasPreviousContracts: false };
        }
        return result;
    }

    //  GET /api/slots/contracts/:contractId
    async getContractSlots(contractId: string): Promise<TimeSlot[]> {
        const response = await fetchClient(`${API_BASE_URL}/slots/contracts/${contractId}`, {
            credentials: 'include'
        });
        if (!response.ok) {
            throw new Error('Failed to fetch contract slots');
        }
        const data = await response.json();

        // Transformar para formato do frontend
        return data.map((slot: any) => {
            // Extrair date e time de start_time se disponível
            let date = slot.date;
            let time = slot.time;
            
            if (slot.start_time) {
                const startDate = new Date(slot.start_time);
                date = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
                const hours = String(startDate.getHours()).padStart(2, '0');
                const minutes = String(startDate.getMinutes()).padStart(2, '0');
                time = `${hours}:${minutes}`;
            } else if (slot.time) {
                time = slot.time.substring(0, 5); // HH:MM:SS -> HH:MM
            }
            
            return {
                id: slot.id,
                date: date,
                time: time,
                type: slot.event_type,
                valor: slot.price_category || '',
                preco: slot.price !== null ? String(slot.price) : '0.00',
                status: slot.status,
                patientId: slot.patient_id,
                patientName: slot.patient?.name,
                patientPhone: slot.patient?.phone,
                patientEmail: slot.patient?.email,
                privacyTermsAccepted: slot.patient?.privacy_terms_accepted,
                flow_status: slot.flow_status,
                isPaid: slot.is_paid,
                isInaugural: slot.is_inaugural,
                groupId: slot.contract_id,
                startTime: slot.start_time, // Adicionar start_time para ordenação precisa
                reminders: {
                    oneHour: slot.reminder_one_hour || false,
                    twentyFourHours: slot.reminder_twenty_four_hours || false
                },
                price: slot.price // Preço em centavos (number) para ContractViewDialog
            };
        });
    }

    // PUT /api/slots/:id/change-time
    async changeSlotTime(slotId: string, newDate: string, newTime: string): Promise<TimeSlot> {
        const response = await fetchClient(`${API_BASE_URL}/slots/${slotId}/change-time`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newDate, newTime }),
            credentials: 'include',
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Falha ao mudar horário do slot');
        }

        const data = await response.json();

        // Extrair date e time de start_time se disponível
        let date = data.date;
        let time = data.time;
        
        if (data.start_time) {
            const startDate = new Date(data.start_time);
            date = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
            const hours = String(startDate.getHours()).padStart(2, '0');
            const minutes = String(startDate.getMinutes()).padStart(2, '0');
            time = `${hours}:${minutes}`;
        } else if (data.time) {
            time = data.time.substring(0, 5); // HH:MM:SS -> HH:MM
        }

        // Transformar para formato do frontend
        return {
            id: data.id,
            date: date,
            time: time,
            type: data.event_type,
            valor: data.event_type === 'personal' ? (data.personal_activity || '') : (data.price_category || ''),
            preco: data.price ? String(data.price) : '',
            status: data.status,
            patientName: data.patient?.name,
            patientPhone: data.patient?.phone,
            patientEmail: data.patient?.email,
            privacyTermsAccepted: data.patient?.privacy_terms_accepted,
            flow_status: data.flow_status,
            isPaid: data.is_paid,
            groupId: data.contract_id,
        };
    }

    // PUT /api/slots/contracts/:contractId
    async updateContract(contractId: string, data: {
        patientName?: string;
        patientPhone?: string;
        patientEmail?: string;
        payments?: Record<string, boolean>;
        inaugurals?: Record<string, boolean>;
        reminders?: { oneHour: boolean; twentyFourHours: boolean };
        remindersPerDate?: Record<string, { oneHour: boolean; twentyFourHours: boolean }>;
    }): Promise<void> {
        const response = await fetchClient(`${API_BASE_URL}/slots/contracts/${contractId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include',
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Falha ao atualizar contrato');
        }
    }

    // GET /api/slots/check-previous-contracts?phone=...&email=...
    async checkPreviousContracts(phone?: string, email?: string): Promise<boolean> {
        const params = new URLSearchParams();
        if (phone) params.append('phone', phone);
        if (email) params.append('email', email);
        
        const response = await fetchClient(`${API_BASE_URL}/slots/check-previous-contracts?${params.toString()}`, {
            credentials: 'include',
        });
        
        if (!response.ok) {
            return false; // Em caso de erro, assumir que não tem contratos anteriores
        }
        
        const data = await response.json();
        return data.hasPreviousContracts || false;
    }

    // GET /api/slots/original-session?patientId=...
    async getOriginalSession(patientId: string): Promise<{ contractId: string; slotId: string; startTime: string } | null> {
        const response = await fetchClient(`${API_BASE_URL}/slots/original-session?patientId=${encodeURIComponent(patientId)}`, {
            credentials: 'include',
        });
        
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        return data;
    }

    // GET /api/slots/pending-contracts?phone=...&email=...
    async getPendingContracts(phone?: string, email?: string): Promise<Array<{ contractId: string; totalDebt: number; unpaidCount: number; firstStartTime?: string | null }>> {
        const params = new URLSearchParams();
        if (phone) params.append('phone', phone);
        if (email) params.append('email', email);
        
        const response = await fetchClient(`${API_BASE_URL}/slots/pending-contracts?${params.toString()}`, {
            credentials: 'include',
        });
        
        if (!response.ok) {
            return []; // Em caso de erro, retornar array vazio
        }
        
        const data = await response.json();
        return data.pendingContracts || [];
    }

    // POST /api/auth/login
    async verifyPassword(password: string): Promise<boolean> {
        // Adjust endpoint to match backend route structure.
        // Backend index.ts: app.use('/api/auth', authRoutes);
        // authRoutes: router.post('/login', ...);
        // So validation URL is /api/auth/login.
        // API_BASE_URL is .../api
        // So we need `${API_BASE_URL}/auth/login`

        try {
            const response = await fetchClient(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
                credentials: 'include',
            });
            // If it has tag #1h, duration is 1h. Else 30m.
            // The following code snippet appears to be misplaced and syntactically incorrect
            // within the fetch options object. It has been moved outside to avoid syntax errors,
            // but its original intent and context are unclear for this method.
            // If this logic is intended for parsing durations, it should be placed in a relevant
            // function that handles time slot parsing, not password verification.
            // For now, it's commented out to maintain syntactical correctness.
            /*
            if (parts.length > 1 && parts[1] === '1h') {
                duration = '1h';
            } else if (parts.length > 1 && parts[1] === '30m') {
                duration = '30m';
            } else {
                duration = '30m';
            }
            */

            if (response.ok) {
                const data = await response.json();
                return data.validated;
            }
            return false;
        } catch (error) {
            console.error("Login check failed", error);
            return false;
        }
    }

    // POST /api/slots/block-day
    async blockDay(date: string): Promise<{ deletedCount: number; keptCount: number }> {
        const response = await fetchClient(`${API_BASE_URL}/slots/block-day`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date }),
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Falha ao bloquear dia');
        }
        return response.json();
    }

    // Método auxiliar para verificar se um dia está bloqueado
    async isDayBlocked(date: string): Promise<boolean> {
        try {
            const { blockedDaysAPI } = await import('./blockedDaysAPI');
            const result = await blockedDaysAPI.checkDayBlocked(date);
            return result.isBlocked;
        } catch (error) {
            console.error('Erro ao verificar se dia está bloqueado:', error);
            return false;
        }
    }
}

export const slotsAPI = new SlotsAPI();
