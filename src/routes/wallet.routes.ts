import { Router } from 'express';
import { getMyWallet, patchPreferredCurrency } from '../controllers/wallet.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/me', requireAuth, getMyWallet);
router.patch('/me/preferred-currency', requireAuth, patchPreferredCurrency);

export default router;