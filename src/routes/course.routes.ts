import { Router } from 'express';
import { getCourses, createCourse, updateCourse, deleteCourse } from '../controllers/course.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);

router.get('/', getCourses);
router.post('/', createCourse);
router.put('/:id', updateCourse);
router.delete('/:id', deleteCourse);

export default router;
