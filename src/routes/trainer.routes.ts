import { Router } from 'express';
import {
  getTrainers,
  getTrainerById,
  createTrainer,
  updateTrainer,
  deleteTrainer,
  getTrainerProfileMe,
  getTrainerStudentsMine,
} from '../controllers/trainer.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);

router.get('/profile/me', requireRole(['trainer']), getTrainerProfileMe);
router.get('/students/mine', requireRole(['trainer']), getTrainerStudentsMine);

router.use(requireRole(['owner', 'super_admin']));

router.get('/', getTrainers);
router.get('/:id', getTrainerById);
router.post('/', createTrainer);
router.put('/:id', updateTrainer);
router.delete('/:id', deleteTrainer);

export default router;
