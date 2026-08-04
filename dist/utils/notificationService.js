"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncSystemNotifications = syncSystemNotifications;
exports.getNotificationsForUser = getNotificationsForUser;
exports.notifyTargetRoles = notifyTargetRoles;
exports.createUserNotification = createUserNotification;
const ConversionRequest_1 = __importDefault(require("../models/ConversionRequest"));
const Student_1 = __importDefault(require("../models/Student"));
const Lead_1 = __importDefault(require("../models/Lead"));
const FollowUp_1 = __importDefault(require("../models/FollowUp"));
const BDETask_1 = __importDefault(require("../models/BDETask"));
const Center_1 = __importDefault(require("../models/Center"));
const SupportTicket_1 = __importDefault(require("../models/SupportTicket"));
const Trainer_1 = __importDefault(require("../models/Trainer"));
const SessionFeedback_1 = __importDefault(require("../models/SessionFeedback"));
const User_1 = __importDefault(require("../models/User"));
const Notification_1 = __importDefault(require("../models/Notification"));
function tenantRegex(tenantId) {
    const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
}
function todayISO() {
    return new Date().toISOString().slice(0, 10);
}
async function upsertSystemAlerts(alerts) {
    await Promise.all(alerts.map((alert) => Notification_1.default.findOneAndUpdate({ key: alert.key }, {
        $set: {
            title: alert.title,
            description: alert.description,
            type: alert.type,
            targetRoles: alert.targetRoles,
            targetUserId: alert.targetUserId,
            link: alert.link,
            source: 'system',
            tenantId: alert.tenantId,
        },
        $setOnInsert: { readBy: [] },
    }, { upsert: true, returnDocument: 'after' })));
}
async function removeStaleSystemAlerts(keyPrefix, activeKeys) {
    await Notification_1.default.deleteMany({
        source: 'system',
        key: { $regex: new RegExp(`^${keyPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), $nin: activeKeys },
    });
}
async function buildOwnerAlerts(user) {
    if (!user.tenantId)
        return [];
    const tenantFilter = tenantRegex(user.tenantId);
    const alerts = [];
    const prefix = `sys:owner:${user.tenantId}`;
    const pendingConversions = await ConversionRequest_1.default.countDocuments({
        tenantId: tenantFilter,
        status: 'pending',
    });
    if (pendingConversions > 0) {
        alerts.push({
            key: `${prefix}:pending-conversions`,
            tenantId: user.tenantId,
            targetRoles: ['owner'],
            title: 'Conversion Requests Pending',
            description: `${pendingConversions} lead conversion request${pendingConversions > 1 ? 's' : ''} awaiting your approval.`,
            type: 'admissions',
            link: '/admissions',
        });
    }
    const today = todayISO();
    const overdueFees = await Student_1.default.countDocuments({
        tenantId: tenantFilter,
        status: 'active',
        $expr: { $lt: ['$feesPaid', '$feesTotal'] },
        nextDueDate: { $exists: true, $ne: '', $lt: today },
    });
    if (overdueFees > 0) {
        alerts.push({
            key: `${prefix}:overdue-fees`,
            tenantId: user.tenantId,
            targetRoles: ['owner'],
            title: 'Overdue Fee Payments',
            description: `${overdueFees} active student${overdueFees > 1 ? 's have' : ' has'} overdue fee installments.`,
            type: 'fees',
            link: '/fees',
        });
    }
    const lowAttendance = await Student_1.default.countDocuments({
        tenantId: tenantFilter,
        status: 'active',
        attendanceRate: { $gt: 0, $lt: 75 },
    });
    if (lowAttendance > 0) {
        alerts.push({
            key: `${prefix}:low-attendance`,
            tenantId: user.tenantId,
            targetRoles: ['owner'],
            title: 'Low Attendance Alert',
            description: `${lowAttendance} student${lowAttendance > 1 ? 's are' : ' is'} below 75% attendance.`,
            type: 'attendance',
            link: '/attendance',
        });
    }
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newLeads = await Lead_1.default.countDocuments({
        tenantId: tenantFilter,
        stage: 'new',
        createdAt: { $gte: weekAgo },
    });
    if (newLeads > 0) {
        alerts.push({
            key: `${prefix}:new-leads`,
            tenantId: user.tenantId,
            targetRoles: ['owner'],
            title: 'New Leads This Week',
            description: `${newLeads} new lead${newLeads > 1 ? 's' : ''} added in the last 7 days.`,
            type: 'leads',
            link: '/crm',
        });
    }
    return alerts;
}
async function buildBdeAlerts(user) {
    const today = todayISO();
    const prefix = `sys:bde:${user.id}`;
    const alerts = [];
    const dueFollowUps = await FollowUp_1.default.countDocuments({
        bdeId: user.id,
        status: { $in: ['pending', 'scheduled'] },
        nextFollowupDate: { $exists: true, $ne: '', $lte: today },
    });
    if (dueFollowUps > 0) {
        alerts.push({
            key: `${prefix}:followups-due`,
            targetUserId: user.id,
            targetRoles: ['bde'],
            tenantId: user.tenantId,
            title: 'Follow-ups Due',
            description: `You have ${dueFollowUps} follow-up${dueFollowUps > 1 ? 's' : ''} due today or overdue.`,
            type: 'leads',
            link: '/followups',
        });
    }
    const pendingTasks = await BDETask_1.default.countDocuments({
        bdeId: user.id,
        status: { $in: ['pending', 'in_progress', 'delayed'] },
        dueDate: { $exists: true, $ne: '', $lte: today },
    });
    if (pendingTasks > 0) {
        alerts.push({
            key: `${prefix}:tasks-due`,
            targetUserId: user.id,
            targetRoles: ['bde'],
            tenantId: user.tenantId,
            title: 'Tasks Need Attention',
            description: `${pendingTasks} assigned task${pendingTasks > 1 ? 's are' : ' is'} due or overdue.`,
            type: 'tasks',
            link: '/tasks',
        });
    }
    if (user.tenantId) {
        const assignedLeads = await Lead_1.default.countDocuments({
            tenantId: tenantRegex(user.tenantId),
            assignedBdeId: user.id,
            stage: { $nin: ['converted', 'lost'] },
        });
        if (assignedLeads > 0) {
            alerts.push({
                key: `${prefix}:active-leads`,
                targetUserId: user.id,
                targetRoles: ['bde'],
                tenantId: user.tenantId,
                title: 'Active Pipeline',
                description: `You have ${assignedLeads} active lead${assignedLeads > 1 ? 's' : ''} in your pipeline.`,
                type: 'leads',
                link: '/crm',
            });
        }
    }
    return alerts;
}
async function buildStudentAlerts(user) {
    const authUser = await User_1.default.findById(user.id);
    if (!authUser)
        return [];
    const student = await Student_1.default.findOne({ email: authUser.email });
    if (!student)
        return [];
    const alerts = [];
    const prefix = `sys:student:${user.id}`;
    const today = todayISO();
    if (student.feesPaid < student.feesTotal && student.nextDueDate && student.nextDueDate < today) {
        alerts.push({
            key: `${prefix}:fee-overdue`,
            targetUserId: user.id,
            targetRoles: ['student'],
            tenantId: student.tenantId,
            title: 'Fee Payment Overdue',
            description: `Your installment due on ${student.nextDueDate} is pending. Please contact accounts.`,
            type: 'fees',
            link: '/fees',
        });
    }
    if (student.attendanceRate > 0 && student.attendanceRate < 75) {
        alerts.push({
            key: `${prefix}:low-attendance`,
            targetUserId: user.id,
            targetRoles: ['student'],
            tenantId: student.tenantId,
            title: 'Attendance Below Target',
            description: `Your attendance is at ${student.attendanceRate}%. Aim for at least 75%.`,
            type: 'attendance',
            link: '/attendance',
        });
    }
    return alerts;
}
async function buildTrainerAlerts(user) {
    const authUser = await User_1.default.findById(user.id);
    if (!authUser)
        return [];
    const trainer = await Trainer_1.default.findOne({ email: authUser.email });
    if (!trainer)
        return [];
    const alerts = [];
    const prefix = `sys:trainer:${user.id}`;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentFeedback = await SessionFeedback_1.default.countDocuments({
        trainerName: trainer.name,
        skipped: false,
        rating: { $gte: 1 },
        createdAt: { $gte: weekAgo },
    });
    if (recentFeedback > 0) {
        alerts.push({
            key: `${prefix}:recent-feedback`,
            targetUserId: user.id,
            targetRoles: ['trainer'],
            tenantId: trainer.tenantId,
            title: 'New Session Feedback',
            description: `${recentFeedback} student rating${recentFeedback > 1 ? 's' : ''} received in the last 7 days.`,
            type: 'assignments',
            link: '/trainers',
        });
    }
    return alerts;
}
async function buildSuperAdminAlerts() {
    const alerts = [];
    const prefix = 'sys:super_admin';
    const maintenanceCenters = await Center_1.default.countDocuments({ status: 'maintenance' });
    if (maintenanceCenters > 0) {
        alerts.push({
            key: `${prefix}:maintenance-centers`,
            targetRoles: ['super_admin'],
            title: 'Centers in Maintenance',
            description: `${maintenanceCenters} training center${maintenanceCenters > 1 ? 's require' : ' requires'} attention.`,
            type: 'system',
            link: '/centers',
        });
    }
    const openTickets = await SupportTicket_1.default.countDocuments({ status: 'open' });
    if (openTickets > 0) {
        alerts.push({
            key: `${prefix}:open-tickets`,
            targetRoles: ['super_admin'],
            title: 'Open Support Tickets',
            description: `${openTickets} support ticket${openTickets > 1 ? 's are' : ' is'} awaiting response.`,
            type: 'system',
            link: '/support',
        });
    }
    return alerts;
}
async function syncSystemNotifications(user) {
    let alerts = [];
    let keyPrefix = `sys:${user.role}:${user.id}`;
    switch (user.role) {
        case 'owner':
            alerts = await buildOwnerAlerts(user);
            keyPrefix = `sys:owner:${user.tenantId ?? user.id}`;
            break;
        case 'bde':
            alerts = await buildBdeAlerts(user);
            break;
        case 'student':
            alerts = await buildStudentAlerts(user);
            break;
        case 'trainer':
            alerts = await buildTrainerAlerts(user);
            break;
        case 'super_admin':
            alerts = await buildSuperAdminAlerts();
            keyPrefix = 'sys:super_admin';
            break;
        default:
            break;
    }
    await upsertSystemAlerts(alerts);
    await removeStaleSystemAlerts(keyPrefix, alerts.map((alert) => alert.key));
}
function visibilityFilter(user) {
    const orConditions = [
        { targetUserId: user.id },
        { targetUserId: { $exists: false }, targetRoles: user.role },
        { targetUserId: null, targetRoles: user.role },
    ];
    if (user.role === 'super_admin') {
        orConditions.push({ targetRoles: 'super_admin', targetUserId: { $exists: false } });
        orConditions.push({ targetRoles: 'super_admin', targetUserId: null });
    }
    const filter = {
        $or: orConditions,
        $and: [
            {
                $or: [
                    { expiresAt: { $exists: false } },
                    { expiresAt: null },
                    { expiresAt: { $gt: new Date() } },
                ],
            },
        ],
    };
    if (user.role !== 'super_admin' && user.tenantId) {
        filter.$and = [
            ...filter.$and,
            {
                $or: [
                    { tenantId: tenantRegex(user.tenantId) },
                    { tenantId: { $exists: false } },
                    { tenantId: null },
                    { tenantId: '' },
                    { targetUserId: user.id },
                ],
            },
        ];
    }
    return filter;
}
async function getNotificationsForUser(user) {
    await syncSystemNotifications(user);
    const docs = await Notification_1.default.find(visibilityFilter(user))
        .sort({ createdAt: -1 })
        .limit(50);
    return docs.map((doc) => ({
        id: String(doc._id),
        title: doc.title,
        description: doc.description,
        type: doc.type,
        read: doc.readBy.includes(user.id),
        timestamp: (doc.createdAt ?? new Date()).toISOString(),
        link: doc.link,
        source: doc.source,
    }));
}
async function notifyTargetRoles(params) {
    await Notification_1.default.create({
        tenantId: params.tenantId,
        targetRoles: params.targetRoles,
        targetUserId: params.targetUserId,
        title: params.title,
        description: params.description,
        type: params.type,
        link: params.link,
        createdBy: params.createdBy,
        source: 'user',
        readBy: [],
    });
}
async function createUserNotification(user, data) {
    const targetRoles = data.targetRoles?.length ? data.targetRoles : [user.role];
    const targetUserId = data.targetUserId ?? user.id;
    const notification = await Notification_1.default.create({
        tenantId: user.tenantId,
        title: data.title,
        description: data.description,
        type: data.type ?? 'system',
        targetRoles,
        targetUserId,
        createdBy: user.id,
        source: 'user',
        readBy: [],
        link: data.link,
    });
    return {
        id: String(notification._id),
        title: notification.title,
        description: notification.description,
        type: notification.type,
        read: false,
        timestamp: (notification.createdAt ?? new Date()).toISOString(),
        link: notification.link,
        source: notification.source,
    };
}
