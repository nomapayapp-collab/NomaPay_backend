// routes/transfer.routes.ts
import { Router } from 'express';
import { postTransfer } from '../controllers/transfer.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validateTransfer } from '../middlewares/transfer.validator.js';

const router = Router();


router.post('/', requireAuth, validateTransfer, postTransfer);

export default router;
