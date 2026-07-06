import { Router } from 'express';
import { verifyToken, requireRole } from '../middleware/auth.middleware';
import { getCallSummary } from '../controllers/reports.controller';

const router = Router();

router.use(verifyToken);
router.use(requireRole(['super_admin', 'owner', 'bde']));

router.get('/call-summary', getCallSummary);

export default router;
