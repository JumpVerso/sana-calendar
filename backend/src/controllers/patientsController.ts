import { Request, Response, NextFunction } from 'express';
import * as patientsService from '../services/patientsService.js';
import { z } from 'zod';

// findOrCreatePatient removido - obsoleto

export const listPatients = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
        const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

        const patients = await patientsService.listPatients(limit, offset);
        res.json(patients);
    } catch (error) {
        next(error);
    }
};

export const getPatient = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const patient = await patientsService.getPatient(id);

        if (!patient) {
            return res.status(404).json({ error: 'Paciente não encontrado' });
        }

        res.json(patient);
    } catch (error) {
        next(error);
    }
};

export const createPatient = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, phone, email, privacyTermsAccepted } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }

        const patient = await patientsService.createPatient({
            name,
            phone,
            email,
            privacyTermsAccepted
        });

        res.status(201).json(patient);
    } catch (error) {
        next(error);
    }
};

export const updatePatient = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { name, phone, email, privacyTermsAccepted } = req.body;

        const patient = await patientsService.updatePatient(id, {
            name,
            phone,
            email,
            privacyTermsAccepted
        });

        res.json(patient);
    } catch (error) {
        next(error);
    }
};

export const deletePatient = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        await patientsService.deletePatient(id);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
};
