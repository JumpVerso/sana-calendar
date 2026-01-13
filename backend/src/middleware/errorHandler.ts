import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // Safely log error
    try {
        console.error('❌ Error:', err.message || err);
    } catch {
        console.error('❌ Error occurred (could not serialize error object)');
    }

    // Erro de validação Zod
    if (err.name === 'ZodError') {
        return res.status(400).json({
            error: 'Validation error',
            details: err.errors,
        });
    }

    // Erro do Supabase
    if (err.code) {
        return res.status(400).json({
            error: err.message,
            code: err.code,
        });
    }

    // Erro genérico
    res.status(500).json({
        error: err.message || 'Internal server error',
    });
};
