import { Router } from 'express';
import { verifyToken, requireRole } from '../middleware/auth.middleware';
import { requireCenterFeature } from '../middleware/centerPolicy.middleware';
import {
  getHROverview,
  submitPayroll,
  updatePayrollStatus,
  upsertCommissionRule,
  createClaim,
  updateClaimStatus,
  assignSubstitute,
  createDocument,
} from '../controllers/hr.controller';

const router = Router();

router.use(verifyToken);
router.use(requireRole(['owner', 'super_admin']));
router.use(requireCenterFeature('enableHrModule'));

router.get('/overview', getHROverview);
router.post('/payroll', submitPayroll);
router.put('/payroll/:id/status', updatePayrollStatus);
router.put('/commission-rules', upsertCommissionRule);
router.post('/claims', createClaim);
router.put('/claims/:id/status', updateClaimStatus);
router.post('/substitutes', assignSubstitute);
router.post('/documents', createDocument);

export default router;
