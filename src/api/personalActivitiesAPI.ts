import { PersonalActivity } from "@/hooks/useSettings";

// Same as slotsAPI
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const personalActivitiesAPI = {
    getAll: async (): Promise<PersonalActivity[]> => {
        const response = await fetch(`${API_BASE_URL}/personal-activities`, { credentials: 'include' });
        if (!response.ok) {
            throw new Error('Failed to fetch personal activities');
        }
        return response.json();
    },

    create: async (label: string): Promise<PersonalActivity> => {
        const response = await fetch(`${API_BASE_URL}/personal-activities`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ label }),
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error('Failed to create personal activity');
        }
        return response.json();
    },

    toggleActive: async (id: string, active: boolean): Promise<void> => {
        const response = await fetch(`${API_BASE_URL}/personal-activities/${id}/toggle`, {
            method: 'PATCH', // Changed to PATCH to check new route
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ active }),
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error('Failed to toggle activity');
        }
    },

    update: async (id: string, data: Partial<PersonalActivity>): Promise<PersonalActivity> => {
        const response = await fetch(`${API_BASE_URL}/personal-activities/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error('Failed to update activity');
        }
        return response.json();
    },

    delete: async (id: string): Promise<void> => {
        const response = await fetch(`${API_BASE_URL}/personal-activities/${id}`, {
            method: 'DELETE',
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error('Failed to delete activity');
        }
    }
};
