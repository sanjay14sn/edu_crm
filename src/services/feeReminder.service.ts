import Student from '../models/Student';
import Center from '../models/Center';
import FeeReminderCallLog, {
  type FeeReminderFlowType,
  type FeeReminderCallStatus,
} from '../models/FeeReminderCallLog';
import FeeReminderEmailLog from '../models/FeeReminderEmailLog';
import { sendLeadEmail } from './leadChatbot/mail.service';
import {
  computeInstallmentRows,
  isFullyPaid,
} from '../utils/installments';
import {
  getMockFinalStatus,
  initiateFeeReminderCall,
  isExotelConfigured,
  mapExotelStatus,
  normalizeIndianPhone,
} from './exotel.service';

export type FeeReminderTarget = {
  studentId: string;
  studentName: string;
  phone: string;
  email: string;
  amountDue: number;
  dueDate: string;
  flowType: FeeReminderFlowType;
  status: 'pending' | 'overdue' | 'paid';
};

function todayStr() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function daysOverdue(dueDate: string) {
  const due = new Date(`${dueDate.substring(0, 10)}T00:00:00`);
  const today = new Date(`${todayStr()}T00:00:00`);
  const diffMs = today.getTime() - due.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function resolveFlowType(dueDate: string): FeeReminderFlowType {
  const overdueDays = daysOverdue(dueDate);
  if (overdueDays >= 30) return 'overdue_30';
  if (overdueDays >= 7) return 'overdue_7';
  return 'due_today';
}

function resolveCallPhone(student: {
  phone?: string;
  guardian?: { phone?: string };
}) {
  const guardianPhone = student.guardian?.phone;
  if (guardianPhone && guardianPhone !== 'N/A' && guardianPhone.trim()) {
    return guardianPhone.trim();
  }
  return (student.phone || '').trim();
}

export function getFeeReminderTarget(student: {
  _id?: unknown;
  id?: string;
  name: string;
  phone?: string;
  email?: string;
  guardian?: { phone?: string };
  feesPaid?: number;
  feesTotal?: number;
  status?: string;
  installmentSchedule?: Array<{ amount: number; dueDate: string; label?: string }>;
  installmentsCount?: number;
  enrollmentDate?: string;
  nextDueDate?: string;
}): FeeReminderTarget | null {
  if (student.status && student.status !== 'active') return null;
  if (isFullyPaid(student.feesPaid, student.feesTotal)) return null;

  const rows = computeInstallmentRows(student);
  const current =
    rows.find((row) => row.status === 'overdue') ||
    rows.find((row) => row.status === 'partial') ||
    rows.find((row) => row.status === 'pending');

  if (!current || current.dueAmount <= 0) return null;

  const phone = resolveCallPhone(student);
  if (!phone) return null;

  const studentId = String(student.id || student._id);
  const flowType = resolveFlowType(current.dueDate);
  const rowStatus =
    current.status === 'overdue'
      ? 'overdue'
      : current.status === 'pending' || current.status === 'partial'
        ? 'pending'
        : 'pending';

  return {
    studentId,
    studentName: student.name,
    phone,
    email: student.email || '',
    amountDue: current.dueAmount,
    dueDate: current.dueDate,
    flowType,
    status: rowStatus,
  };
}

function tenantFilter(tenantId: string) {
  const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
}

export async function listFeeReminderTargets(tenantId: string) {
  const students = await Student.find({ tenantId: tenantFilter(tenantId), status: 'active' });
  return students
    .map((student) => getFeeReminderTarget({ ...student.toObject(), id: String(student._id) }))
    .filter((target): target is FeeReminderTarget => Boolean(target));
}

export async function listDueTodayTargets(tenantId: string) {
  const today = todayStr();
  const targets = await listFeeReminderTargets(tenantId);
  return targets.filter((target) => target.dueDate.substring(0, 10) === today);
}

function getWebhookBaseUrl() {
  return (
    process.env.EXOTEL_WEBHOOK_BASE_URL ||
    process.env.BACKEND_PUBLIC_URL ||
    `http://127.0.0.1:${process.env.PORT || 5000}`
  );
}

async function simulateMockCallCompletion(logId: string) {
  const finalStatus = getMockFinalStatus();
  setTimeout(async () => {
    try {
      await FeeReminderCallLog.findByIdAndUpdate(logId, {
        status: finalStatus,
      });
    } catch (error) {
      console.error('Failed to update mock fee reminder call:', error);
    }
  }, 2500);
}

export async function triggerFeeReminderCalls(input: {
  tenantId: string;
  studentIds?: string[];
  triggeredBy: string;
  onlyDueToday?: boolean;
}) {
  const allTargets = input.onlyDueToday
    ? await listDueTodayTargets(input.tenantId)
    : await listFeeReminderTargets(input.tenantId);

  const idSet = input.studentIds?.length
    ? new Set(input.studentIds.map(String))
    : null;

  const targets = idSet
    ? allTargets.filter((target) => idSet.has(target.studentId))
    : allTargets;

  const statusCallbackUrl = `${getWebhookBaseUrl()}/api/webhooks/exotel/fee-reminder-status`;
  const results: Array<{
    studentId: string;
    studentName: string;
    phone: string;
    amountDue: number;
    dueDate: string;
    flowType: FeeReminderFlowType;
    status: FeeReminderCallStatus;
    callSid?: string;
    logId: string;
    error?: string;
  }> = [];

  for (const target of targets) {
    try {
      const call = await initiateFeeReminderCall({
        phone: target.phone,
        flowType: target.flowType,
        statusCallbackUrl: isExotelConfigured() ? statusCallbackUrl : undefined,
        customField: target.studentId,
      });

      const log = await FeeReminderCallLog.create({
        tenantId: input.tenantId,
        studentId: target.studentId,
        studentName: target.studentName,
        phone: normalizeIndianPhone(target.phone),
        amountDue: target.amountDue,
        dueDate: target.dueDate,
        flowType: target.flowType,
        callSid: call.callSid,
        status: call.status,
        triggeredBy: input.triggeredBy,
      });

      if (call.mock) {
        void simulateMockCallCompletion(String(log._id));
      }

      results.push({
        studentId: target.studentId,
        studentName: target.studentName,
        phone: target.phone,
        amountDue: target.amountDue,
        dueDate: target.dueDate,
        flowType: target.flowType,
        status: call.status,
        callSid: call.callSid,
        logId: String(log._id),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Call failed';
      const log = await FeeReminderCallLog.create({
        tenantId: input.tenantId,
        studentId: target.studentId,
        studentName: target.studentName,
        phone: normalizeIndianPhone(target.phone),
        amountDue: target.amountDue,
        dueDate: target.dueDate,
        flowType: target.flowType,
        status: 'failed',
        triggeredBy: input.triggeredBy,
      });

      results.push({
        studentId: target.studentId,
        studentName: target.studentName,
        phone: target.phone,
        amountDue: target.amountDue,
        dueDate: target.dueDate,
        flowType: target.flowType,
        status: 'failed',
        logId: String(log._id),
        error: message,
      });
    }
  }

  return {
    total: results.length,
    results,
    exotelConfigured: isExotelConfigured(),
  };
}

export async function getFeeReminderCallSummary(tenantId: string) {
  const logs = await FeeReminderCallLog.find({ tenantId: tenantFilter(tenantId) })
    .sort({ createdAt: -1 })
    .limit(100);

  const latestByStudent = new Map<string, (typeof logs)[number]>();
  for (const log of logs) {
    if (!latestByStudent.has(log.studentId)) {
      latestByStudent.set(log.studentId, log);
    }
  }

  const recent = Array.from(latestByStudent.values());
  const stats = {
    completed: recent.filter((log) => log.status === 'completed').length,
    noAnswer: recent.filter((log) => log.status === 'no-answer').length,
    busy: recent.filter((log) => log.status === 'busy').length,
    failed: recent.filter((log) => log.status === 'failed').length,
    inProgress: recent.filter((log) => log.status === 'in-progress' || log.status === 'queued')
      .length,
    total: recent.length,
  };

  return {
    stats,
    calls: recent.map((log) => ({
      id: String(log._id),
      studentId: log.studentId,
      studentName: log.studentName,
      phone: log.phone,
      amountDue: log.amountDue,
      dueDate: log.dueDate,
      flowType: log.flowType,
      status: log.status,
      callSid: log.callSid,
      createdAt: log.createdAt,
    })),
    exotelConfigured: isExotelConfigured(),
  };
}

export async function updateFeeReminderCallStatus(input: {
  callSid?: string;
  status?: string;
  studentId?: string;
}) {
  const mapped = mapExotelStatus(input.status);
  const query = input.callSid
    ? { callSid: input.callSid }
    : input.studentId
      ? { studentId: input.studentId }
      : null;

  if (!query) return null;

  const log = await FeeReminderCallLog.findOneAndUpdate(
    query,
    { status: mapped },
    { sort: { createdAt: -1 }, new: true }
  );

  return log;
}

export async function triggerFeeReminderEmails(input: {
  tenantId: string;
  studentIds?: string[];
  triggeredBy: string;
  onlyDueToday?: boolean;
}) {
  const allTargets = input.onlyDueToday
    ? await listDueTodayTargets(input.tenantId)
    : await listFeeReminderTargets(input.tenantId);

  const idSet = input.studentIds?.length
    ? new Set(input.studentIds.map(String))
    : null;

  const targets = idSet
    ? allTargets.filter((target) => idSet.has(target.studentId))
    : allTargets;

  const results: Array<{
    studentId: string;
    studentName: string;
    email: string;
    amountDue: number;
    dueDate: string;
    status: 'sent' | 'failed';
    error?: string;
  }> = [];

  for (const target of targets) {
    if (!target.email?.trim()) {
      results.push({
        studentId: target.studentId,
        studentName: target.studentName,
        email: '',
        amountDue: target.amountDue,
        dueDate: target.dueDate,
        status: 'failed',
        error: 'No email address registered for student',
      });
      continue;
    }

    try {
      const subject = `Fee Payment Reminder - ${target.studentName}`;
      const statusLabel = target.status === 'overdue' ? 'OVERDUE' : 'PENDING';
      const body = `Dear ${target.studentName},

This is an automated reminder that your installment fee of INR ${target.amountDue.toLocaleString('en-IN')} is ${statusLabel}.

Due Date: ${target.dueDate}

Please clear the outstanding dues at the earliest. If you have already paid or made the transfer, please share the receipt or notify the center manager.

Best regards,
Apex Academy Management`;

      await sendLeadEmail({
        to: target.email,
        subject,
        text: body,
        tenantId: input.tenantId,
      });

      await FeeReminderEmailLog.create({
        tenantId: input.tenantId,
        studentId: target.studentId,
        studentName: target.studentName,
        email: target.email,
        amountDue: target.amountDue,
        dueDate: target.dueDate,
        status: 'sent',
        triggeredBy: input.triggeredBy,
      });

      results.push({
        studentId: target.studentId,
        studentName: target.studentName,
        email: target.email,
        amountDue: target.amountDue,
        dueDate: target.dueDate,
        status: 'sent',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Email sending failed';
      await FeeReminderEmailLog.create({
        tenantId: input.tenantId,
        studentId: target.studentId,
        studentName: target.studentName,
        email: target.email,
        amountDue: target.amountDue,
        dueDate: target.dueDate,
        status: 'failed',
        error: message,
        triggeredBy: input.triggeredBy,
      });

      results.push({
        studentId: target.studentId,
        studentName: target.studentName,
        email: target.email,
        amountDue: target.amountDue,
        dueDate: target.dueDate,
        status: 'failed',
        error: message,
      });
    }
  }

  return {
    total: results.length,
    results,
  };
}

export async function getFeeReminderEmailSummary(tenantId: string) {
  const logs = await FeeReminderEmailLog.find({ tenantId: tenantFilter(tenantId) })
    .sort({ createdAt: -1 })
    .limit(100);

  return {
    emails: logs.map((log) => ({
      id: String(log._id),
      studentId: log.studentId,
      studentName: log.studentName,
      email: log.email,
      amountDue: log.amountDue,
      dueDate: log.dueDate,
      status: log.status,
      error: log.error,
      createdAt: log.createdAt,
    })),
  };
}

export async function runAutoFeeReminderCron() {
  const centers = await Center.find({
    feeReminderAutoSend: { $ne: false },
    status: 'active',
  });

  const summaries: Array<{ tenantId: string; centerName: string; total: number; emailsSent?: number }> = [];

  for (const center of centers) {
    const tenantId = center.tenantName || center.name;
    if (!tenantId) continue;

    const result = await triggerFeeReminderCalls({
      tenantId,
      triggeredBy: 'cron',
      onlyDueToday: true,
    });

    let emailsSent = 0;
    try {
      const emailResult = await triggerFeeReminderEmails({
        tenantId,
        triggeredBy: 'cron',
        onlyDueToday: true,
      });
      emailsSent = emailResult.total;
    } catch (err) {
      console.error(`Failed to trigger auto fee reminder emails for tenant ${tenantId}:`, err);
    }

    summaries.push({
      tenantId,
      centerName: center.name,
      total: result.total,
      emailsSent,
    });
  }

  return summaries;
}
