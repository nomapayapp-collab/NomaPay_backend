import { Router } from 'express';
import { postExchange, getExchangeRates } from '../controllers/wallet-operations.controller.js';
import { getMyWallet, patchPreferredCurrency } from '../controllers/wallet.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';


const router = Router();

router.get('/me', requireAuth, getMyWallet);
router.patch('/me/preferred-currency', requireAuth, patchPreferredCurrency);
router.post('/me/exchange', requireAuth, postExchange);
router.get('/me/exchange-rates', requireAuth, getExchangeRates);

export default router;