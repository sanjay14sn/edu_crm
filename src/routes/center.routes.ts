import { Router } from 'express';
import {
  getCenters,
  getCenterById,
  getCenterPolicy,
  getPublicCenterPortal,
  createCenter,
  updateCenter,
  deleteCenter,
} from '../controllers/center.controller';
import { optionalVerifyToken, verifyToken } from '../middleware/auth.middleware';

const router = Router();

router.get('/public/:tenant', getPublicCenterPortal);
router.get('/policy/me', verifyToken, getCenterPolicy);
router.get('/', optionalVerifyToken, getCenters);
router.get('/:id', getCenterById);

// Protected routes (we'll just expose them directly for now but in a real app these would use authMiddleware)
router.post('/', createCenter);
router.put('/:id', updateCenter);
router.delete('/:id', deleteCenter);

export default router;
