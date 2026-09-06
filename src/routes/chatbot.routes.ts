import { Router } from 'express';
import { postChatMessage } from '../controllers/chatbot.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/message', requireAuth, postChatMessage);

export default router;