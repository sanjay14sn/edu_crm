import { Response } from 'express';
import Notification from '../models/Notification';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  createUserNotification,
  getNotificationsForUser,
} from '../utils/notificationService';
import { NotificationType } from '../models/Notification';
import { UserRole } from '../models/User';

export const listNotifications = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const notifications = await getNotificationsForUser(req.user);
    res.status(200).json(notifications);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching notifications', error });
  }
};

export const createNotification = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { title, description, type, targetRoles, targetUserId, link } = req.body as {
      title?: string;
      description?: string;
      type?: NotificationType;
      targetRoles?: UserRole[];
      targetUserId?: string;
      link?: string;
    };

    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const notification = await createUserNotification(req.user, {
      title: title.trim(),
      description: description.trim(),
      type,
      targetRoles,
      targetUserId,
      link,
    });

    res.status(201).json(notification);
  } catch (error) {
    res.status(500).json({ message: 'Error creating notification', error });
  }
};

export const markNotificationRead = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    if (!notification.readBy.includes(req.user.id)) {
      notification.readBy.push(req.user.id);
      await notification.save();
    }

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Error marking notification as read', error });
  }
};

export const markAllNotificationsRead = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const notifications = await getNotificationsForUser(req.user);
    const ids = notifications.map((n) => n.id);

    if (ids.length > 0) {
      await Notification.updateMany(
        { _id: { $in: ids }, readBy: { $ne: req.user.id } },
        { $addToSet: { readBy: req.user.id } }
      );
    }

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Error marking all notifications as read', error });
  }
};

export const clearNotifications = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    await Notification.deleteMany({
      source: 'user',
      targetUserId: req.user.id,
      createdBy: req.user.id,
    });

    const visible = await getNotificationsForUser(req.user);
    const systemIds = visible.filter((n) => n.source === 'system').map((n) => n.id);

    if (systemIds.length > 0) {
      await Notification.updateMany(
        { _id: { $in: systemIds } },
        { $addToSet: { readBy: req.user.id } }
      );
    }

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Error clearing notifications', error });
  }
};
