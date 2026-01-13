import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ validated: false, message: 'Senha é obrigatória' });
        }

        const correctPassword = process.env.CALENDAR_PASSWORD;
        const jwtSecret = process.env.JWT_SECRET;

        if (!jwtSecret) {
            console.error("JWT_SECRET is not defined in environment variables");
            return res.status(500).json({ validated: false, message: 'Server configuration error' });
        }

        if (password === correctPassword) {
            // Generate Token
            const token = jwt.sign({ role: 'admin' }, jwtSecret, { expiresIn: '7d' });

            // Set Cookie
            const isProduction = process.env.NODE_ENV === 'production';
            res.cookie('auth_token', token, {
                httpOnly: true,
                secure: isProduction, // true in production
                sameSite: isProduction ? 'none' : 'lax', // 'none' is required for cross-site (Vercel Frontend -> Vercel Backend)
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });

            return res.json({ validated: true });
        } else {
            return res.status(401).json({ validated: false, message: 'Senha incorreta' });
        }
    } catch (error) {
        next(error);
    }
};
