"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearNotifications = exports.markAllNotificationsRead = exports.markNotificationRead = exports.createNotification = exports.listNotifications = void 0;
const Notification_1 = __importDefault(require("../models/Notification"));
const notificationService_1 = require("../utils/notificationService");
const listNotifications = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const notifications = await (0, notificationService_1.getNotificationsForUser)(req.user);
        res.status(200).json(notifications);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching notifications', error });
    }
};
exports.listNotifications = listNotifications;
const createNotification = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const { title, description, type, targetRoles, targetUserId, link } = req.body;
        if (!title?.trim() || !description?.trim()) {
            return res.status(400).json({ message: 'Title and description are required' });
        }
        const notification = await (0, notificationService_1.createUserNotification)(req.user, {
            title: title.trim(),
            description: description.trim(),
            type,
            targetRoles,
            targetUserId,
            link,
        });
        res.status(201).json(notification);
    }
    catch (error) {
        res.status(500).json({ message: 'Error creating notification', error });
    }
};
exports.createNotification = createNotification;
const markNotificationRead = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const notification = await Notification_1.default.findById(req.params.id);
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        if (!notification.readBy.includes(req.user.id)) {
            notification.readBy.push(req.user.id);
            await notification.save();
        }
        res.status(200).json({ success: true });
    }
    catch (error) {
        res.status(500).json({ message: 'Error marking notification as read', error });
    }
};
exports.markNotificationRead = markNotificationRead;
const markAllNotificationsRead = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const notifications = await (0, notificationService_1.getNotificationsForUser)(req.user);
        const ids = notifications.map((n) => n.id);
        if (ids.length > 0) {
            await Notification_1.default.updateMany({ _id: { $in: ids }, readBy: { $ne: req.user.id } }, { $addToSet: { readBy: req.user.id } });
        }
        res.status(200).json({ success: true });
    }
    catch (error) {
        res.status(500).json({ message: 'Error marking all notifications as read', error });
    }
};
exports.markAllNotificationsRead = markAllNotificationsRead;
const clearNotifications = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        await Notification_1.default.deleteMany({
            source: 'user',
            targetUserId: req.user.id,
            createdBy: req.user.id,
        });
        const visible = await (0, notificationService_1.getNotificationsForUser)(req.user);
        const systemIds = visible.filter((n) => n.source === 'system').map((n) => n.id);
        if (systemIds.length > 0) {
            await Notification_1.default.updateMany({ _id: { $in: systemIds } }, { $addToSet: { readBy: req.user.id } });
        }
        res.status(200).json({ success: true });
    }
    catch (error) {
        res.status(500).json({ message: 'Error clearing notifications', error });
    }
};
exports.clearNotifications = clearNotifications;
