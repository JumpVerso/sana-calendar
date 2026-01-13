import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import slotsRoutes from './routes/slots.js';
import authRoutes from './routes/auth.js';
import patientsRoutes from './routes/patients.js';
import personalActivitiesRoutes from './routes/personalActivities.js';
import blockedDaysRoutes from './routes/blockedDays.js';
import renewalsRoutes from './routes/renewals.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';
import cookieParser from 'cookie-parser';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Trust Proxy (Required for Vercel/Heroku cookies to work)
app.set('trust proxy', 1);

// Middleware - CORS com suporte a múltiplas origens (dev local + produção)
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:8080',
    'http://127.0.0.1:8080',
].filter(Boolean) as string[];

// Em dev, aceita qualquer origem na rede local (192.168.x.x)
app.use(cors({
    origin: (origin, callback) => {
        // Permite requisições sem origin (Postman, curl, etc)
        if (!origin) return callback(null, true);
        
        // Permite origens na lista
        if (allowedOrigins.includes(origin)) return callback(null, true);
        
        // Em dev, permite IPs da rede local
        if (process.env.NODE_ENV !== 'production' && origin.match(/^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):\d+$/)) {
            return callback(null, true);
        }
        
        callback(new Error('CORS não permitido'));
    },
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend rodando!' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/slots', authMiddleware, slotsRoutes);
app.use('/api/patients', authMiddleware, patientsRoutes);
app.use('/api/personal-activities', authMiddleware, personalActivitiesRoutes);
app.use('/api/blocked-days', authMiddleware, blockedDaysRoutes);
app.use('/api/renewals', authMiddleware, renewalsRoutes);

// Error handler (deve ser o último middleware)
app.use(errorHandler);

// Only listen if the file is run directly (not imported as a module in Vercel)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    app.listen(PORT, () => {
        console.log(`🚀 Backend rodando na porta ${PORT}`);
        console.log(`📡 CORS configurado para: ${process.env.FRONTEND_URL || 'http://localhost:8080'}`);
    });
}

export default app;
