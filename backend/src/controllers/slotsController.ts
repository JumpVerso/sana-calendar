import { Request, Response, NextFunction } from 'express';
import * as slotsService from '../services/slotsService.js';
import {
    createSlotSchema,
    updateSlotSchema,
    createDoubleSlotSchema,
    reserveSlotSchema,
    sendFlowSchema,
    getSlotsQuerySchema,
    createRecurringSlotsSchema,
    previewRecurringSlotsSchema,
    blockDaySchema,
} from '../utils/validation.js';

export const createRecurringSlots = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const input = createRecurringSlotsSchema.parse(req.body);
        const result = await slotsService.createRecurringSlots(input);
        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
};

export const previewRecurringSlots = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const input = previewRecurringSlotsSchema.parse(req.body);
        const result = await slotsService.previewRecurringSlots(input);
        res.json(result);
    } catch (error) {
        next(error);
    }
};

export const getSlots = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { startDate, endDate } = getSlotsQuerySchema.parse(req.query);
        const slots = await slotsService.getSlots(startDate, endDate);
        res.json(slots);
    } catch (error) {
        next(error);
    }
};

export const createSlot = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const input = createSlotSchema.parse(req.body);
        const slot = await slotsService.createSlot(input);
        res.status(201).json(slot);
    } catch (error) {
        next(error);
    }
};

export const createDoubleSlot = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const input = createDoubleSlotSchema.parse(req.body);
        const slots = await slotsService.createDoubleSlot(input);
        res.status(201).json(slots);
    } catch (error) {
        next(error);
    }
};

export const updateSlot = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        console.log(`[Controller.updateSlot] Received update for ID: ${id}. Body:`, JSON.stringify(req.body));
        const input = updateSlotSchema.parse(req.body);

        // Mapear groupId para contractId (frontend usa groupId, backend usa contractId)
        const serviceInput: any = { ...input };
        if ('groupId' in input) {
            serviceInput.contractId = input.groupId;
            delete serviceInput.groupId;
        }

        const slot = await slotsService.updateSlot(id, serviceInput);
        res.json(slot);
    } catch (error) {
        next(error);
    }
};

export const deleteSlot = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        await slotsService.deleteSlot(id);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

export const reserveSlot = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const input = reserveSlotSchema.parse(req.body);
        const slot = await slotsService.reserveSlot(id, input);
        res.json(slot);
    } catch (error) {
        next(error);
    }
};

export const confirmSlot = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const slot = await slotsService.confirmSlot(id);
        res.json(slot);
    } catch (error) {
        next(error);
    }
};

export const sendFlow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const input = sendFlowSchema.parse(req.body);
        const slot = await slotsService.sendFlow(id, input);
        res.json(slot);
    } catch (error) {
        next(error);
    }
};

export const getContractSlots = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { contractId } = req.params;
        const slots = await slotsService.getContractSlots(contractId);
        res.json(slots);
    } catch (error) {
        next(error);
    }
};

export const changeSlotTime = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { newDate, newTime } = req.body;

        if (!newDate || !newTime) {
            return res.status(400).json({ error: 'newDate e newTime são obrigatórios' });
        }

        const slot = await slotsService.changeSlotTime(id, newDate, newTime);
        res.json(slot);
    } catch (error) {
        next(error);
    }
};

export const updateContract = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { contractId } = req.params;
        const { patientName, patientPhone, patientEmail, payments, inaugurals, reminders, remindersPerDate } = req.body;

        await slotsService.updateContract(contractId, {
            patientName,
            patientPhone,
            patientEmail,
            payments,
            inaugurals,
            reminders,
            remindersPerDate
        });

        res.json({ success: true, message: 'Contrato atualizado com sucesso' });
    } catch (error) {
        next(error);
    }
};

export const checkPreviousContracts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { phone, email } = req.query;
        const hasPrevious = await slotsService.hasPreviousContractsByContact(
            phone as string | undefined,
            email as string | undefined
        );
        res.json({ hasPreviousContracts: hasPrevious });
    } catch (error) {
        next(error);
    }
};

export const getPendingContracts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { phone, email } = req.query;
        const pendingContracts = await slotsService.getPendingContractsByContact(
            phone as string | undefined,
            email as string | undefined
        );
        res.json({ pendingContracts });
    } catch (error) {
        next(error);
    }
};

export const getOriginalSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { patientId } = req.query;
        if (!patientId) {
            return res.status(400).json({ error: 'patientId é obrigatório' });
        }
        const originalSession = await slotsService.getOriginalSessionSlot(patientId as string);
        res.json(originalSession);
    } catch (error) {
        next(error);
    }
};

export const blockDay = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const input = blockDaySchema.parse(req.body);
        const result = await slotsService.blockDay(input.date);
        res.json(result);
    } catch (error) {
        next(error);
    }
};

export const updateAutoRenewal = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { contractId } = req.params;
        const { autoRenewalEnabled } = req.body;
        
        if (typeof autoRenewalEnabled !== 'boolean') {
            return res.status(400).json({ error: 'autoRenewalEnabled deve ser um boolean' });
        }
        
        const result = await slotsService.updateContractAutoRenewal(contractId, autoRenewalEnabled);
        res.json(result);
    } catch (error) {
        next(error);
    }
};

export const createBulkPersonalSlots = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { slots } = req.body;
        if (!Array.isArray(slots) || slots.length === 0) {
            return res.status(400).json({ error: 'slots deve ser um array não vazio' });
        }

        // Validar estrutura básica
        for (const slot of slots) {
            if (!slot.date || !slot.time || !slot.activity || !slot.duration) {
                return res.status(400).json({ error: 'Cada slot deve ter date, time, activity e duration' });
            }
        }

        const result = await slotsService.createBulkPersonalSlots(slots);
        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
};
