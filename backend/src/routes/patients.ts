import express from 'express';
import * as patientsController from '../controllers/patientsController.js';

const router = express.Router();

// GET /api/patients
router.get('/', patientsController.listPatients);

// GET /api/patients/:id
router.get('/:id', patientsController.getPatient);

// POST /api/patients
router.post('/', patientsController.createPatient);

// PUT /api/patients/:id
router.put('/:id', patientsController.updatePatient);

// DELETE /api/patients/:id
router.delete('/:id', patientsController.deletePatient);

export default router;
