import express from 'express';
import { getInstituteProfile, getPlatformUsage } from '../controllers/platform.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = express.Router();

router.use(verifyToken);

router.get('/usage', requireRole(['super_admin']), getPlatformUsage);
router.get('/institute-profile', requireRole(['owner']), getInstituteProfile);

export default router;
