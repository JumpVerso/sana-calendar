// API para gerenciar pacientes
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface Patient {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    privacy_terms_accepted: boolean;
    created_at: string;
    updated_at: string;
}

class PatientsAPI {
    // GET /api/patients
    async listPatients(limit: number = 100, offset: number = 0): Promise<Patient[]> {
        const response = await fetch(
            `${API_BASE_URL}/patients?limit=${limit}&offset=${offset}`,
            { credentials: 'include' }
        );
        if (!response.ok) throw new Error('Failed to fetch patients');
        return response.json();
    }

    // GET /api/patients/:id
    async getPatient(id: string): Promise<Patient> {
        const response = await fetch(`${API_BASE_URL}/patients/${id}`, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch patient');
        return response.json();
    }

    // POST /api/patients
    async createPatient(data: {
        name: string;
        phone?: string;
        email?: string;
        privacyTermsAccepted?: boolean;
    }): Promise<Patient> {
        const response = await fetch(`${API_BASE_URL}/patients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include',
        });
        if (!response.ok) {
            const errorData = await response.json();
            const error: any = new Error(errorData.error || 'Failed to create patient');
            error.code = errorData.code;
            throw error;
        }
        return response.json();
    }

    // PUT /api/patients/:id
    async updatePatient(id: string, data: {
        name?: string;
        phone?: string;
        email?: string;
        privacyTermsAccepted?: boolean;
    }): Promise<Patient> {
        const response = await fetch(`${API_BASE_URL}/patients/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update patient');
        }
        return response.json();
    }

    // DELETE /api/patients/:id
    async deletePatient(id: string): Promise<void> {
        const response = await fetch(`${API_BASE_URL}/patients/${id}`, {
            method: 'DELETE',
            credentials: 'include',
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete patient');
        }
    }
}

export const patientsAPI = new PatientsAPI();
