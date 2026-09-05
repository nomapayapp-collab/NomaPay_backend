// routes/deposit.routes.ts
import { Router } from 'express';
import { postDeposit } from '../controllers/deposit.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js'; // Ajusta la ruta si es necesario

const router = Router();

// Protegemos la ruta para que solo usuarios logueados puedan depositar
router.post('/deposit', requireAuth, postDeposit);

export default router;
