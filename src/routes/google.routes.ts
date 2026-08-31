import { Router } from 'express';
import { registerWithGoogleController, loginWithGoogleController } from '../controllers/google.controller.js';

const router = Router();

router.post('/google/register', registerWithGoogleController);
router.post('/google/login', loginWithGoogleController);

export default router;