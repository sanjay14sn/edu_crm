import { Router } from 'express';
import { verifyToken, requireRole } from '../middleware/auth.middleware';
import {
  getSupportQueueCount,
  getSupportTickets,
  createSupportTicket,
  updateSupportTicket,
  getAnnouncements,
} from '../controllers/support.controller';

const router = Router();

router.use(verifyToken);
router.use(requireRole(['super_admin', 'owner', 'bde', 'trainer', 'student']));

router.get('/tickets/queue-count', requireRole(['super_admin']), getSupportQueueCount);
router.get('/tickets', getSupportTickets);
router.post('/tickets', createSupportTicket);
router.put('/tickets/:id', requireRole(['super_admin']), updateSupportTicket);
router.get('/announcements', getAnnouncements);

export default router;
