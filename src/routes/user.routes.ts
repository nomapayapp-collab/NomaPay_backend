import { Router } from 'express';
import { getMe, patchMe } from '../controllers/user.controller.js';
import { patchPassword } from '../controllers/password.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/me', requireAuth, getMe);
router.patch('/me', requireAuth, patchMe);
router.patch('/me/password', requireAuth, patchPassword);

export default router;