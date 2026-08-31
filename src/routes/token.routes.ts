import { Router } from 'express';
import { refresh, logout } from '../controllers/token.controller.js';

const router = Router();

router.post('/refresh', refresh);
router.post('/logout', logout);

export default router;