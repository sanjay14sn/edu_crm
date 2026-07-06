import { Router } from 'express';
import { login, register, me } from '../controllers/auth.controller';

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.get('/me', me);

export default router;
