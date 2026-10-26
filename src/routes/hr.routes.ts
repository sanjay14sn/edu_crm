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
} from '../controllers/hr.controller';
import {
  listEmployees,
  createEmployee,
  updateEmployee,
  exitEmployee,
  getDashboard,
  listHolidays,
  createHoliday,
  deleteHoliday,
  getLeavePolicy,
  updateLeavePolicy,
  listLeaveBalances,
  updateLeaveBalance,
  listLeaveRequests,
  createLeaveRequest,
  reviewLeaveRequest,
  listSalaryStructures,
  upsertSalaryStructure,
  listDocuments,
  createDocument,
  updateDocumentSharing,
  deleteDocument,
  listClaims,
  getMyHR,
  getReportsBundle,
  setEmployeePortalAccess,
} from '../controllers/hrSuite.controller';

const router = Router();

router.use(verifyToken);
router.use(requireCenterFeature('enableHrModule'));

// Self-service + shared staff actions
router.get('/me', requireRole(['owner', 'super_admin', 'trainer', 'bde']), getMyHR);
router.get('/employees', requireRole(['owner', 'super_admin', 'trainer', 'bde']), listEmployees);
router.post('/leave/requests', requireRole(['owner', 'super_admin', 'trainer', 'bde']), createLeaveRequest);
router.get('/leave/requests', requireRole(['owner', 'super_admin', 'trainer', 'bde']), listLeaveRequests);
router.post('/claims', requireRole(['owner', 'super_admin', 'trainer', 'bde']), createClaim);
router.get('/claims', requireRole(['owner', 'super_admin', 'trainer', 'bde']), listClaims);
router.get('/documents', requireRole(['owner', 'super_admin', 'trainer', 'bde']), listDocuments);
router.get('/holidays', requireRole(['owner', 'super_admin', 'trainer', 'bde']), listHolidays);
router.get('/leave/balances', requireRole(['owner', 'super_admin', 'trainer', 'bde']), listLeaveBalances);
router.get('/leave/policy', requireRole(['owner', 'super_admin', 'trainer', 'bde']), getLeavePolicy);

// Admin-only
router.use(requireRole(['owner', 'super_admin']));

router.get('/dashboard', getDashboard);
router.get('/overview', getHROverview);
router.post('/employees', createEmployee);
router.put('/employees/:id', updateEmployee);
router.put('/employees/:id/exit', exitEmployee);
router.put('/employees/:id/portal-access', setEmployeePortalAccess);

router.post('/documents', createDocument);
router.patch('/documents/:id', updateDocumentSharing);
router.delete('/documents/:id', deleteDocument);

router.post('/holidays', createHoliday);
router.delete('/holidays/:id', deleteHoliday);

router.put('/leave/policy', updateLeavePolicy);
router.put('/leave/balances/:id', updateLeaveBalance);
router.put('/leave/requests/:id/review', reviewLeaveRequest);

router.get('/salary-structures', listSalaryStructures);
router.put('/salary-structures', upsertSalaryStructure);

router.post('/payroll', submitPayroll);
router.put('/payroll/:id/status', updatePayrollStatus);
router.put('/commission-rules', upsertCommissionRule);
router.put('/claims/:id/status', updateClaimStatus);
router.post('/substitutes', assignSubstitute);

router.get('/reports', getReportsBundle);

export default router;
