import express from 'express';
import * as blockedDaysController from '../controllers/blockedDaysController.js';

const router = express.Router();

// GET /api/blocked-days - Listar todos os dias bloqueados
router.get('/', blockedDaysController.getAllBlockedDays);

// GET /api/blocked-days/range?startDate=...&endDate=... - Listar dias bloqueados em um range
router.get('/range', blockedDaysController.getBlockedDaysInRange);

// GET /api/blocked-days/check?date=... - Verificar se um dia está bloqueado
router.get('/check', blockedDaysController.checkDayBlocked);

// GET /api/blocked-days/:id - Buscar dia bloqueado por ID
router.get('/:id', blockedDaysController.getBlockedDayById);

// POST /api/blocked-days - Criar dia bloqueado
router.post('/', blockedDaysController.createBlockedDay);

// PUT /api/blocked-days/:id - Atualizar dia bloqueado
router.put('/:id', blockedDaysController.updateBlockedDay);

// DELETE /api/blocked-days/unblock?date=... - Desbloquear dia por data (DEVE vir ANTES de /:id)
router.delete('/unblock', blockedDaysController.unblockDay);

// DELETE /api/blocked-days/:id - Deletar dia bloqueado (DEVE vir DEPOIS de /unblock)
router.delete('/:id', blockedDaysController.deleteBlockedDay);

export default router;
