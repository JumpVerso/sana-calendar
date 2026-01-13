import { Request, Response, NextFunction } from 'express';
import * as blockedDaysService from '../services/blockedDaysService.js';
import {
    createBlockedDaySchema,
    updateBlockedDaySchema,
    getBlockedDaysQuerySchema,
} from '../utils/validation.js';

// GET /api/blocked-days - Listar todos os dias bloqueados
export const getAllBlockedDays = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const blockedDays = await blockedDaysService.getAllBlockedDays();
        res.json(blockedDays);
    } catch (error) {
        next(error);
    }
};

// GET /api/blocked-days/range?startDate=...&endDate=... - Listar dias bloqueados em um range
export const getBlockedDaysInRange = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { startDate, endDate } = getBlockedDaysQuerySchema.parse(req.query);
        const blockedDays = await blockedDaysService.getBlockedDaysInRange(startDate, endDate);
        res.json(blockedDays);
    } catch (error) {
        next(error);
    }
};

// GET /api/blocked-days/check?date=... - Verificar se um dia está bloqueado
export const checkDayBlocked = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { date } = req.query;
        if (!date || typeof date !== 'string') {
            return res.status(400).json({ error: 'Parâmetro date é obrigatório' });
        }
        const isBlocked = await blockedDaysService.isDayBlocked(date);
        res.json({ date, isBlocked });
    } catch (error) {
        next(error);
    }
};

// GET /api/blocked-days/:id - Buscar dia bloqueado por ID
export const getBlockedDayById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const blockedDay = await blockedDaysService.getBlockedDayById(id);
        if (!blockedDay) {
            return res.status(404).json({ error: 'Dia bloqueado não encontrado' });
        }
        res.json(blockedDay);
    } catch (error) {
        next(error);
    }
};

// POST /api/blocked-days - Criar dia bloqueado
export const createBlockedDay = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const input = createBlockedDaySchema.parse(req.body);
        const blockedDay = await blockedDaysService.createBlockedDay(input);
        res.status(201).json(blockedDay);
    } catch (error) {
        next(error);
    }
};

// PUT /api/blocked-days/:id - Atualizar dia bloqueado
export const updateBlockedDay = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const input = updateBlockedDaySchema.parse(req.body);
        const blockedDay = await blockedDaysService.updateBlockedDay(id, input);
        res.json(blockedDay);
    } catch (error) {
        next(error);
    }
};

// DELETE /api/blocked-days/:id - Deletar dia bloqueado
export const deleteBlockedDay = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        await blockedDaysService.deleteBlockedDay(id);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

// DELETE /api/blocked-days/unblock?date=... - Desbloquear dia por data
export const unblockDay = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { date } = req.query;
        if (!date || typeof date !== 'string') {
            return res.status(400).json({ error: 'Parâmetro date é obrigatório' });
        }
        await blockedDaysService.unblockDay(date);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
};
