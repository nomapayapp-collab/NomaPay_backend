import { Router } from 'express';
import { getContacts, lookupContact } from '../controllers/contact.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();


router.get('/', requireAuth, getContacts);
router.get('/lookup', requireAuth, lookupContact);
export default router;
