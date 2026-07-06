import { Router } from 'express';
import { getLeads, createLead, importLeads, updateLeadStage, updateLead, deleteLead, getTasks, updateTaskStatus, punchAttendance, resetShiftAttendance, getFollowUps, createFollowUp, updateFollowUp, createCallLog, getBdePerformance } from '../controllers/bde.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);
router.use(requireRole(['super_admin', 'owner', 'bde']));

router.get('/leads', getLeads);
router.post('/leads', createLead);
router.post('/leads/import', importLeads);
router.put('/leads/:id/stage', updateLeadStage);
router.put('/leads/:id', updateLead);
router.delete('/leads/:id', deleteLead);

router.get('/followups', getFollowUps);
router.post('/followups', createFollowUp);
router.put('/followups/:id', updateFollowUp);

router.post('/call-logs', createCallLog);

router.get('/performance', getBdePerformance);

router.get('/tasks', getTasks);
router.put('/tasks/:id/status', updateTaskStatus);
router.post('/attendance/punch', punchAttendance);
router.post('/attendance/reset', resetShiftAttendance);

export default router;
