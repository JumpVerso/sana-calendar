import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface UserPayload {
    id: string; // or whatever your token payload structure is
    // add other fields if necessary
}

// Extend Request interface to include user
declare global {
    namespace Express {
        interface Request {
            user?: UserPayload;
        }
    }
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // Check for token in cookies
    const token = req.cookies?.auth_token;

    if (!token) {
        return res.status(401).json({ error: 'Acesso não autorizado. Faça login.' });
    }

    try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.error("JWT_SECRET não definido!");
            return res.status(500).json({ error: 'Erro de configuração do servidor.' });
        }

        const decoded = jwt.verify(token, secret) as UserPayload;
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Token inválido ou expirado.' });
    }
};
