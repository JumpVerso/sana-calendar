import express from 'express';
import * as slotsController from '../controllers/slotsController.js';

const router = express.Router();

// GET /api/slots?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/', slotsController.getSlots);

// POST /api/slots
router.post('/', slotsController.createSlot);

// POST /api/slots/double
router.post('/double', slotsController.createDoubleSlot);

// POST /api/slots/bulk-personal
router.post('/bulk-personal', slotsController.createBulkPersonalSlots);

// POST /api/slots/recurring
router.post('/recurring', slotsController.createRecurringSlots);

// POST /api/slots/recurring/preview
router.post('/recurring/preview', slotsController.previewRecurringSlots);

// GET /api/slots/contracts/:contractId
router.get('/contracts/:contractId', slotsController.getContractSlots);

// PUT /api/slots/contracts/:contractId
router.put('/contracts/:contractId', slotsController.updateContract);

// PATCH /api/slots/contracts/:contractId/auto-renewal
router.patch('/contracts/:contractId/auto-renewal', slotsController.updateAutoRenewal);

// PUT /api/slots/:id/change-time
router.put('/:id/change-time', slotsController.changeSlotTime);

// PUT /api/slots/:id
router.put('/:id', slotsController.updateSlot);

// DELETE /api/slots/:id
router.delete('/:id', slotsController.deleteSlot);

// POST /api/slots/:id/reserve
router.post('/:id/reserve', slotsController.reserveSlot);

// POST /api/slots/:id/confirm
router.post('/:id/confirm', slotsController.confirmSlot);

// POST /api/slots/:id/send-flow
router.post('/:id/send-flow', slotsController.sendFlow);

// GET /api/slots/check-previous-contracts?phone=...&email=...
router.get('/check-previous-contracts', slotsController.checkPreviousContracts);

// GET /api/slots/pending-contracts?phone=...&email=...
router.get('/pending-contracts', slotsController.getPendingContracts);

// GET /api/slots/original-session?patientId=...
router.get('/original-session', slotsController.getOriginalSession);

// POST /api/slots/block-day
router.post('/block-day', slotsController.blockDay);

export default router;
