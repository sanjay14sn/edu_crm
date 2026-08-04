"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnnouncements = exports.updateSupportTicket = exports.createSupportTicket = exports.getSupportTickets = exports.getSupportQueueCount = void 0;
exports.seedAnnouncementsIfEmpty = seedAnnouncementsIfEmpty;
const SupportTicket_1 = __importDefault(require("../models/SupportTicket"));
const Announcement_1 = __importDefault(require("../models/Announcement"));
const User_1 = __importDefault(require("../models/User"));
const bdeStats_1 = require("../utils/bdeStats");
function mapTicket(doc) {
    const obj = doc.toObject();
    const createdAt = obj.createdAt;
    return {
        ...obj,
        id: obj._id,
        createdAt: createdAt instanceof Date
            ? createdAt.toISOString().split('T')[0]
            : typeof createdAt === 'string'
                ? createdAt.split('T')[0]
                : new Date().toISOString().split('T')[0],
    };
}
function mapAnnouncement(doc) {
    const obj = doc.toObject();
    const createdAt = obj.createdAt;
    return {
        ...obj,
        id: obj._id,
        date: createdAt instanceof Date
            ? createdAt.toISOString().split('T')[0]
            : typeof createdAt === 'string'
                ? createdAt.split('T')[0]
                : new Date().toISOString().split('T')[0],
    };
}
async function seedAnnouncementsIfEmpty() {
    const count = await Announcement_1.default.countDocuments();
    if (count > 0)
        return;
    await Announcement_1.default.insertMany([
        {
            title: 'Platform Maintenance — Scheduled Updates',
            body: 'EduPlatform may undergo brief scheduled maintenance during off-peak hours. The portal will notify you before any downtime window.',
            type: 'warning',
            active: true,
        },
        {
            title: 'New Feature: Dynamic Reports & Call Logs',
            body: 'BDE staff can now audit call summary reports with monthly filters and export CSV sheets directly from the Reports module.',
            type: 'info',
            active: true,
        },
        {
            title: 'Billing Cycle Reminder',
            body: 'Enterprise plan invoices are generated on the 1st of each month. Contact support if you need billing adjustments.',
            type: 'info',
            active: true,
        },
    ]);
}
const getSupportQueueCount = async (req, res) => {
    try {
        if (req.user?.role !== 'super_admin') {
            return res.status(403).json({ message: 'Only super admins can view the support queue count.' });
        }
        const [open, inProgress] = await Promise.all([
            SupportTicket_1.default.countDocuments({ status: 'open' }),
            SupportTicket_1.default.countDocuments({ status: 'in-progress' }),
        ]);
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.status(200).json({ open, inProgress, pending: open + inProgress });
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching support queue count', error });
    }
};
exports.getSupportQueueCount = getSupportQueueCount;
const getSupportTickets = async (req, res) => {
    try {
        const filter = {};
        if (req.user?.role === 'super_admin') {
            // Super admin sees all tickets
        }
        else {
            filter.userId = String(req.user?.id);
        }
        const tickets = await SupportTicket_1.default.find(filter).sort({ createdAt: -1 });
        res.status(200).json(tickets.map(mapTicket));
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching support tickets', error });
    }
};
exports.getSupportTickets = getSupportTickets;
const createSupportTicket = async (req, res) => {
    try {
        const { subject, category, priority, message } = req.body;
        if (!subject?.trim() || !message?.trim()) {
            return res.status(400).json({ message: 'subject and message are required' });
        }
        const dbUser = await User_1.default.findById(req.user?.id);
        const ticket = await SupportTicket_1.default.create({
            tenantId: req.user?.tenantId,
            userId: String(req.user?.id),
            userName: dbUser?.name || 'User',
            userRole: req.user?.role || 'owner',
            subject: subject.trim(),
            category: category || 'Other',
            priority: priority || 'medium',
            status: 'open',
            message: message.trim(),
        });
        res.status(201).json(mapTicket(ticket));
    }
    catch (error) {
        res.status(400).json({ message: 'Error creating support ticket', error });
    }
};
exports.createSupportTicket = createSupportTicket;
const updateSupportTicket = async (req, res) => {
    try {
        if (req.user?.role !== 'super_admin') {
            return res.status(403).json({ message: 'Only super admins can update ticket status and responses' });
        }
        const { status, response } = req.body;
        const ticket = await SupportTicket_1.default.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        if (status)
            ticket.status = status;
        if (response !== undefined) {
            ticket.response = response;
            ticket.respondedBy = String(req.user.id);
            ticket.respondedAt = new Date();
            if (ticket.status === 'open')
                ticket.status = 'in-progress';
        }
        await ticket.save();
        res.status(200).json(mapTicket(ticket));
    }
    catch (error) {
        res.status(400).json({ message: 'Error updating support ticket', error });
    }
};
exports.updateSupportTicket = updateSupportTicket;
const getAnnouncements = async (req, res) => {
    try {
        await seedAnnouncementsIfEmpty();
        const filter = { active: true };
        if (req.user?.role !== 'super_admin' && req.user?.tenantId) {
            filter.$or = [{ tenantId: { $exists: false } }, { tenantId: null }, { tenantId: (0, bdeStats_1.tenantFilter)(req.user.tenantId) }];
        }
        const announcements = await Announcement_1.default.find(filter).sort({ createdAt: -1 }).limit(20);
        res.status(200).json(announcements.map(mapAnnouncement));
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching announcements', error });
    }
};
exports.getAnnouncements = getAnnouncements;
