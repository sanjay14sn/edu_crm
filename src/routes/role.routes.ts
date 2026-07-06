import express from 'express';
import {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  duplicateRole,
  getRoleFeatures,
} from '../controllers/role.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = express.Router();

router.use(verifyToken);
router.use(requireRole(['super_admin']));

router.get('/features', getRoleFeatures);
router.get('/', getRoles);
router.get('/:id', getRoleById);
router.post('/', createRole);
router.post('/:id/duplicate', duplicateRole);
router.put('/:id', updateRole);
router.delete('/:id', deleteRole);

export default router;
