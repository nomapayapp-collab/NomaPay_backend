import { Router } from 'express';
import { register } from '../controllers/auth.controller.js';
import { validateRegister } from '../middlewares/validate-register.middleware.js';

const router = Router();

router.post('/register', validateRegister, register);

export default router;