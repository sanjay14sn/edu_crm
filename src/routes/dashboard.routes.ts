import { Router } from 'express';
import { getDashboardMetrics } from '../controllers/dashboard.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);
router.get('/metrics', getDashboardMetrics);

export default router;
