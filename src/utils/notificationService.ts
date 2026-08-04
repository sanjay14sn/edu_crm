import ConversionRequest from '../models/ConversionRequest';
import Student from '../models/Student';
import Lead from '../models/Lead';
import FollowUp from '../models/FollowUp';
import BDETask from '../models/BDETask';
import Center from '../models/Center';
import SupportTicket from '../models/SupportTicket';
import Trainer from '../models/Trainer';
import SessionFeedback from '../models/SessionFeedback';
import User from '../models/User';
import Notification, { NotificationType } from '../models/Notification';
import { UserRole } from '../models/User';

type AuthUser = { id: string; role: UserRole; tenantId?: string };

function tenantRegex(tenantId: string) {
  const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

type SystemAlert = {
  key: string;
  title: string;
  description: string;
  type: NotificationType;
  targetRoles: UserRole[];
  targetUserId?: string;
  link?: string;
  tenantId?: string;
};

async function upsertSystemAlerts(alerts: SystemAlert[]) {
  await Promise.all(
    alerts.map((alert) =>
      Notification.findOneAndUpdate(
        { key: alert.key },
        {
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
        },
        { upsert: true, returnDocument: 'after' }
      )
    )
  );
}

async function removeStaleSystemAlerts(keyPrefix: string, activeKeys: string[]) {
  await Notification.deleteMany({
    source: 'system',
    key: { $regex: new RegExp(`^${keyPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), $nin: activeKeys },
  });
}

async function buildOwnerAlerts(user: AuthUser): Promise<SystemAlert[]> {
  if (!user.tenantId) return [];
  const tenantFilter = tenantRegex(user.tenantId);
  const alerts: SystemAlert[] = [];
  const prefix = `sys:owner:${user.tenantId}`;

  const pendingConversions = await ConversionRequest.countDocuments({
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
  const overdueFees = await Student.countDocuments({
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

  const lowAttendance = await Student.countDocuments({
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
  const newLeads = await Lead.countDocuments({
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

async function buildBdeAlerts(user: AuthUser): Promise<SystemAlert[]> {
  const today = todayISO();
  const prefix = `sys:bde:${user.id}`;
  const alerts: SystemAlert[] = [];

  const dueFollowUps = await FollowUp.countDocuments({
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

  const pendingTasks = await BDETask.countDocuments({
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
    const assignedLeads = await Lead.countDocuments({
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

async function buildStudentAlerts(user: AuthUser): Promise<SystemAlert[]> {
  const authUser = await User.findById(user.id);
  if (!authUser) return [];

  const student = await Student.findOne({ email: authUser.email });
  if (!student) return [];

  const alerts: SystemAlert[] = [];
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

async function buildTrainerAlerts(user: AuthUser): Promise<SystemAlert[]> {
  const authUser = await User.findById(user.id);
  if (!authUser) return [];

  const trainer = await Trainer.findOne({ email: authUser.email });
  if (!trainer) return [];

  const alerts: SystemAlert[] = [];
  const prefix = `sys:trainer:${user.id}`;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentFeedback = await SessionFeedback.countDocuments({
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

async function buildSuperAdminAlerts(): Promise<SystemAlert[]> {
  const alerts: SystemAlert[] = [];
  const prefix = 'sys:super_admin';

  const maintenanceCenters = await Center.countDocuments({ status: 'maintenance' });
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

  const openTickets = await SupportTicket.countDocuments({ status: 'open' });
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

export async function syncSystemNotifications(user: AuthUser) {
  let alerts: SystemAlert[] = [];
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

function visibilityFilter(user: AuthUser) {
  const orConditions: Record<string, unknown>[] = [
    { targetUserId: user.id },
    { targetUserId: { $exists: false }, targetRoles: user.role },
    { targetUserId: null, targetRoles: user.role },
  ];

  if (user.role === 'super_admin') {
    orConditions.push({ targetRoles: 'super_admin', targetUserId: { $exists: false } });
    orConditions.push({ targetRoles: 'super_admin', targetUserId: null });
  }

  const filter: Record<string, unknown> = {
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
      ...(filter.$and as Record<string, unknown>[]),
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

export async function getNotificationsForUser(user: AuthUser) {
  await syncSystemNotifications(user);

  const docs = await Notification.find(visibilityFilter(user))
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

export async function notifyTargetRoles(params: {
  tenantId?: string;
  targetRoles: UserRole[];
  targetUserId?: string;
  title: string;
  description: string;
  type: NotificationType;
  link?: string;
  createdBy?: string;
}) {
  await Notification.create({
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

export async function createUserNotification(
  user: AuthUser,
  data: {
    title: string;
    description: string;
    type?: NotificationType;
    targetRoles?: UserRole[];
    targetUserId?: string;
    link?: string;
  }
) {
  const targetRoles = data.targetRoles?.length ? data.targetRoles : [user.role];
  const targetUserId = data.targetUserId ?? user.id;

  const notification = await Notification.create({
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
