import { Router } from 'express';
import { getStudents, getTrainerStudents, createStudent, updateStudentStatus, updateStudentFees, getStudentProfile } from '../controllers/student.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);
router.get('/profile/me', getStudentProfile);
router.get('/mine', requireRole(['trainer']), getTrainerStudents);
router.get('/', requireRole(['owner', 'super_admin', 'bde']), getStudents);
router.post('/', requireRole(['owner', 'super_admin']), createStudent);
router.put('/:id/status', requireRole(['owner', 'super_admin']), updateStudentStatus);
router.put('/:id/fees', requireRole(['owner', 'super_admin']), updateStudentFees);

export default router;
