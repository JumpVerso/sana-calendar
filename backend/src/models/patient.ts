// Tipos para pacientes
export interface Patient {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    privacy_terms_accepted: boolean;
    created_at: string;
    updated_at: string;
}

export interface CreatePatientInput {
    name: string;
    phone?: string | null;
    email?: string | null;
    privacyTermsAccepted?: boolean;
}

export interface UpdatePatientInput {
    name?: string;
    phone?: string | null;
    email?: string | null;
    privacyTermsAccepted?: boolean;
}
