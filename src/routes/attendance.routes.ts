import { Router } from 'express';
import {
  getAttendance,
  saveAttendance,
  finalizeAttendanceMonth,
} from '../controllers/attendance.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);
router.get('/', requireRole(['super_admin', 'owner', 'trainer', 'student', 'bde']), getAttendance);
router.post('/', requireRole(['super_admin', 'owner', 'trainer']), saveAttendance);
router.post(
  '/finalize-month',
  requireRole(['super_admin', 'owner', 'trainer']),
  finalizeAttendanceMonth
);

export default router;
