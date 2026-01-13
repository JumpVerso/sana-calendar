import express from 'express';
import * as renewalsController from '../controllers/renewalsController.js';

const router = express.Router();

// GET /api/renewals/preview/:contractId - Preview de renovação para um contrato
router.get('/preview/:contractId', renewalsController.getRenewalPreview);

// POST /api/renewals/process - Processar renovações (executar job manualmente)
router.post('/process', renewalsController.processRenewals);

// POST /api/renewals/direct/:contractId - Renovação manual direta
router.post('/direct/:contractId', renewalsController.confirmRenewalDirect);

export default router;
