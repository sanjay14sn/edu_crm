import { Router } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import {
  listNotifications,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications,
} from '../controllers/notification.controller';

const router = Router();

router.use(verifyToken);

router.get('/', listNotifications);
router.post('/', createNotification);
router.patch('/read-all', markAllNotificationsRead);
router.delete('/clear', clearNotifications);
router.patch('/:id/read', markNotificationRead);

export default router;
