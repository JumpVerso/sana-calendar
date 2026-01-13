import { Request, Response } from 'express';
import * as personalActivitiesService from '../services/personalActivitiesService.js';

export async function getActivities(req: Request, res: Response) {
    try {
        const activities = await personalActivitiesService.getPersonalActivities();
        res.json(activities);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}

export async function createActivity(req: Request, res: Response) {
    try {
        const { label } = req.body;
        if (!label) {
            return res.status(400).json({ error: 'Label is required' });
        }
        const activity = await personalActivitiesService.createPersonalActivity({ label });
        res.json(activity);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}

export async function updateActivity(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const input = req.body;
        const activity = await personalActivitiesService.updatePersonalActivity(id, input);
        res.json(activity);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}

// Optional: toggle active specifically if needed, or just use updateActivity
export async function toggleActive(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const { active } = req.body;
        if (active === undefined) {
            return res.status(400).json({ error: 'Active status required' });
        }
        const activity = await personalActivitiesService.updatePersonalActivity(id, { active });
        res.json(activity);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}

export async function deleteActivity(req: Request, res: Response) {
    try {
        const { id } = req.params;
        await personalActivitiesService.deletePersonalActivity(id);
        res.status(204).send();
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}
