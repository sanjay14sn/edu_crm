import { Router } from 'express';
import { getJobs, createJob, generateJobContent, applyForJob, getApplications, updateApplicationStatus, deleteJob } from '../controllers/jobs.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';
import { requireCenterFeature } from '../middleware/centerPolicy.middleware';

const router = Router();

router.use(verifyToken);
router.use(requireCenterFeature('enableJobPortal'));

router.get('/', getJobs);
router.post('/generate', requireRole(['super_admin', 'owner', 'trainer']), generateJobContent);
router.post('/', requireRole(['super_admin', 'owner', 'trainer']), createJob);
router.delete('/:id', requireRole(['super_admin', 'owner', 'trainer']), deleteJob);
router.post('/:id/apply', requireRole(['student']), applyForJob);

router.get('/applications', getApplications);
router.put('/applications/:id/status', requireRole(['super_admin', 'owner', 'trainer']), updateApplicationStatus);

export default router;
