
import { Router } from 'express';
import { postDeposit } from '../controllers/deposit.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js'; 

const router = Router();


router.post('/deposit', requireAuth, postDeposit);

export default router;
