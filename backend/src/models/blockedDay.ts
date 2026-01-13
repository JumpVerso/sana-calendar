// Tipos para dias bloqueados
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
