
import { Router } from 'express';
import { getHistory } from '../controllers/history.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();


router.get('/', requireAuth, getHistory);

export default router;
