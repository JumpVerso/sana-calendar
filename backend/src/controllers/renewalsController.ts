import { Request, Response, NextFunction } from 'express';
import * as renewalService from '../services/renewalService.js';

// GET /api/renewals/preview/:contractId - Preview de renovação para um contrato
export const getRenewalPreview = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { contractId } = req.params;
        const preview = await renewalService.getRenewalPreview(contractId);
        res.json(preview);
    } catch (error) {
        next(error);
    }
};

// POST /api/renewals/direct/:contractId - Renovação manual direta
export const confirmRenewalDirect = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { contractId } = req.params;
        const { date, time } = req.body;

        const result = await renewalService.confirmRenewalDirect(contractId, {
            date,
            time
        });

        res.status(201).json({
            message: 'Renovação confirmada com sucesso',
            ...result
        });
    } catch (error: any) {
        if (error.message.includes('Conflito') || error.message.includes('ocupados')) {
            return res.status(409).json({ error: error.message });
        }
        next(error);
    }
};

// POST /api/renewals/process - Processar renovações (executar job manualmente)
export const processRenewals = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { runDailyRenewalJob } = await import('../jobs/dailyRenewalJob.js');
        const result = await runDailyRenewalJob();
        res.json({
            success: true,
            message: 'Processamento de renovações executado',
            ...result
        });
    } catch (error) {
        next(error);
    }
};
