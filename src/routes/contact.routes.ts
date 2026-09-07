import { Router } from 'express';
import { getContacts } from '../controllers/contact.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();


router.get('/', requireAuth, getContacts);

export default router;
