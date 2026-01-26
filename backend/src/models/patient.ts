// Tipos para pacientes
export interface Patient {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    privacy_terms_accepted: boolean;
    huggy_contact_id: string | null;
    deleted_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface CreatePatientInput {
    name: string;
    phone?: string | null;
    email?: string | null;
    privacyTermsAccepted?: boolean;
    huggyContactId?: string | null;
}

export interface UpdatePatientInput {
    name?: string;
    phone?: string | null;
    email?: string | null;
    privacyTermsAccepted?: boolean;
    huggyContactId?: string | null;
}
