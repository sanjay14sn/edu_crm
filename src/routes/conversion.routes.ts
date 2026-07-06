import { Router } from 'express';
import {
  getConversionRequests,
  createConversionRequest,
  approveConversionRequest,
  rejectConversionRequest,
} from '../controllers/conversion.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);

router.get('/requests', requireRole(['owner', 'super_admin', 'bde']), getConversionRequests);
router.post('/requests', requireRole(['bde']), createConversionRequest);
router.put('/requests/:id/approve', requireRole(['owner', 'super_admin']), approveConversionRequest);
router.put('/requests/:id/reject', requireRole(['owner', 'super_admin']), rejectConversionRequest);

export default router;
