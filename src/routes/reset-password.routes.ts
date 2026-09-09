import { Router } from 'express';
import { forgotPasswordHandler, resetPasswordHandler } from '../controllers/reset-password.controller.js';

const router = Router();

router.post('/forgot-password', forgotPasswordHandler);
router.post('/reset-password', resetPasswordHandler);

export default router;
