import { Router } from 'express';
import { getMe, patchMe, patchTheme, deleteMe } from '../controllers/user.controller.js';
import { patchPassword } from '../controllers/password.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/me', requireAuth, getMe);
router.patch('/me', requireAuth, patchMe);
router.patch('/me/password', requireAuth, patchPassword);
router.patch('/me/theme', requireAuth, patchTheme);
router.delete('/me', requireAuth, deleteMe);


export default router;