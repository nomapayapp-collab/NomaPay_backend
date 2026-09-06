
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { getChatbotReply } from '../services/chatbot.service.js';
import { AppError } from '../errors/app-error.js';

export async function postChatMessage(req: AuthenticatedRequest, res: Response) {
    try {
        const { message, history } = req.body;

        if (typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ error: 'Falta el mensaje.' });
        }

        const reply = await getChatbotReply(message, history);
        return res.status(200).json({ reply });
    } catch (err) {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        console.error(err);
        return res.status(500).json({ error: 'Error al procesar el mensaje del chatbot.' });
    }
}