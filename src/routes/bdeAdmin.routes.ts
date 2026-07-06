import { Router } from 'express';
import { getBDEs, createBDE, updateBDE, deleteBDE } from '../controllers/bdeAdmin.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);
router.use(requireRole(['super_admin', 'owner']));

router.get('/', getBDEs);
router.post('/', createBDE);
router.put('/:id', updateBDE);
router.delete('/:id', deleteBDE);

export default router;
