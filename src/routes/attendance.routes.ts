import { Router } from 'express';
import { getAttendance, saveAttendance } from '../controllers/attendance.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);
router.get('/', requireRole(['super_admin', 'owner', 'trainer', 'student', 'bde']), getAttendance);
router.post('/', requireRole(['super_admin', 'owner', 'trainer']), saveAttendance);

export default router;
