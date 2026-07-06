import { Router } from 'express';
import { verifyToken, requireRole } from '../middleware/auth.middleware';
import { getAnalyticsOverview } from '../controllers/analytics.controller';

const router = Router();

router.use(verifyToken);
router.use(requireRole(['owner', 'super_admin']));

router.get('/overview', getAnalyticsOverview);

export default router;
