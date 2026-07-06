import { Router } from 'express';
import { verifyToken, requireRole } from '../middleware/auth.middleware';
import {
  getPendingSessionFeedback,
  submitSessionFeedback,
  getTrainerSessionFeedback,
  getMyTrainerSessionFeedback,
} from '../controllers/sessionFeedback.controller';

const router = Router();

router.use(verifyToken);

router.get('/pending', requireRole(['student']), getPendingSessionFeedback);
router.post('/', requireRole(['student']), submitSessionFeedback);
router.get('/me', requireRole(['trainer']), getMyTrainerSessionFeedback);
router.get('/trainer/:trainerId', requireRole(['owner', 'super_admin', 'trainer']), getTrainerSessionFeedback);

export default router;
