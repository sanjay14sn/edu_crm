"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFlowType = resolveFlowType;
exports.getFeeReminderTarget = getFeeReminderTarget;
exports.listFeeReminderTargets = listFeeReminderTargets;
exports.listDueTodayTargets = listDueTodayTargets;
exports.triggerFeeReminderCalls = triggerFeeReminderCalls;
exports.getFeeReminderCallSummary = getFeeReminderCallSummary;
exports.updateFeeReminderCallStatus = updateFeeReminderCallStatus;
exports.triggerFeeReminderEmails = triggerFeeReminderEmails;
exports.getFeeReminderEmailSummary = getFeeReminderEmailSummary;
exports.runAutoFeeReminderCron = runAutoFeeReminderCron;
const Student_1 = __importDefault(require("../models/Student"));
const Center_1 = __importDefault(require("../models/Center"));
const FeeReminderCallLog_1 = __importDefault(require("../models/FeeReminderCallLog"));
const FeeReminderEmailLog_1 = __importDefault(require("../models/FeeReminderEmailLog"));
const mail_service_1 = require("./leadChatbot/mail.service");
const installments_1 = require("../utils/installments");
const exotel_service_1 = require("./exotel.service");
function todayStr() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}
function daysOverdue(dueDate) {
    const due = new Date(`${dueDate.substring(0, 10)}T00:00:00`);
    const today = new Date(`${todayStr()}T00:00:00`);
    const diffMs = today.getTime() - due.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
function resolveFlowType(dueDate) {
    const overdueDays = daysOverdue(dueDate);
    if (overdueDays >= 30)
        return 'overdue_30';
    if (overdueDays >= 7)
        return 'overdue_7';
    return 'due_today';
}
function resolveCallPhone(student) {
    const guardianPhone = student.guardian?.phone;
    if (guardianPhone && guardianPhone !== 'N/A' && guardianPhone.trim()) {
        return guardianPhone.trim();
    }
    return (student.phone || '').trim();
}
function getFeeReminderTarget(student) {
    if (student.status && student.status !== 'active')
        return null;
    if ((0, installments_1.isFullyPaid)(student.feesPaid, student.feesTotal))
        return null;
    const rows = (0, installments_1.computeInstallmentRows)(student);
    const current = rows.find((row) => row.status === 'overdue') ||
        rows.find((row) => row.status === 'partial') ||
        rows.find((row) => row.status === 'pending');
    if (!current || current.dueAmount <= 0)
        return null;
    const phone = resolveCallPhone(student);
    if (!phone)
        return null;
    const studentId = String(student.id || student._id);
    const flowType = resolveFlowType(current.dueDate);
    const rowStatus = current.status === 'overdue'
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
function tenantFilter(tenantId) {
    const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
}
async function listFeeReminderTargets(tenantId) {
    const students = await Student_1.default.find({ tenantId: tenantFilter(tenantId), status: 'active' });
    return students
        .map((student) => getFeeReminderTarget({ ...student.toObject(), id: String(student._id) }))
        .filter((target) => Boolean(target));
}
async function listDueTodayTargets(tenantId) {
    const today = todayStr();
    const targets = await listFeeReminderTargets(tenantId);
    return targets.filter((target) => target.dueDate.substring(0, 10) === today);
}
function getWebhookBaseUrl() {
    return (process.env.EXOTEL_WEBHOOK_BASE_URL ||
        process.env.BACKEND_PUBLIC_URL ||
        `http://127.0.0.1:${process.env.PORT || 5000}`);
}
async function simulateMockCallCompletion(logId) {
    const finalStatus = (0, exotel_service_1.getMockFinalStatus)();
    setTimeout(async () => {
        try {
            await FeeReminderCallLog_1.default.findByIdAndUpdate(logId, {
                status: finalStatus,
            });
        }
        catch (error) {
            console.error('Failed to update mock fee reminder call:', error);
        }
    }, 2500);
}
async function triggerFeeReminderCalls(input) {
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
    const results = [];
    for (const target of targets) {
        try {
            const call = await (0, exotel_service_1.initiateFeeReminderCall)({
                phone: target.phone,
                flowType: target.flowType,
                statusCallbackUrl: (0, exotel_service_1.isExotelConfigured)() ? statusCallbackUrl : undefined,
                customField: target.studentId,
            });
            const log = await FeeReminderCallLog_1.default.create({
                tenantId: input.tenantId,
                studentId: target.studentId,
                studentName: target.studentName,
                phone: (0, exotel_service_1.normalizeIndianPhone)(target.phone),
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Call failed';
            const log = await FeeReminderCallLog_1.default.create({
                tenantId: input.tenantId,
                studentId: target.studentId,
                studentName: target.studentName,
                phone: (0, exotel_service_1.normalizeIndianPhone)(target.phone),
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
        exotelConfigured: (0, exotel_service_1.isExotelConfigured)(),
    };
}
async function getFeeReminderCallSummary(tenantId) {
    const logs = await FeeReminderCallLog_1.default.find({ tenantId: tenantFilter(tenantId) })
        .sort({ createdAt: -1 })
        .limit(100);
    const latestByStudent = new Map();
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
        exotelConfigured: (0, exotel_service_1.isExotelConfigured)(),
    };
}
async function updateFeeReminderCallStatus(input) {
    const mapped = (0, exotel_service_1.mapExotelStatus)(input.status);
    const query = input.callSid
        ? { callSid: input.callSid }
        : input.studentId
            ? { studentId: input.studentId }
            : null;
    if (!query)
        return null;
    const log = await FeeReminderCallLog_1.default.findOneAndUpdate(query, { status: mapped }, { sort: { createdAt: -1 }, new: true });
    return log;
}
async function triggerFeeReminderEmails(input) {
    const allTargets = input.onlyDueToday
        ? await listDueTodayTargets(input.tenantId)
        : await listFeeReminderTargets(input.tenantId);
    const idSet = input.studentIds?.length
        ? new Set(input.studentIds.map(String))
        : null;
    const targets = idSet
        ? allTargets.filter((target) => idSet.has(target.studentId))
        : allTargets;
    const results = [];
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
            await (0, mail_service_1.sendLeadEmail)({
                to: target.email,
                subject,
                text: body,
                tenantId: input.tenantId,
            });
            await FeeReminderEmailLog_1.default.create({
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Email sending failed';
            await FeeReminderEmailLog_1.default.create({
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
async function getFeeReminderEmailSummary(tenantId) {
    const logs = await FeeReminderEmailLog_1.default.find({ tenantId: tenantFilter(tenantId) })
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
async function runAutoFeeReminderCron() {
    const centers = await Center_1.default.find({
        feeReminderAutoSend: { $ne: false },
        status: 'active',
    });
    const summaries = [];
    for (const center of centers) {
        const tenantId = center.tenantName || center.name;
        if (!tenantId)
            continue;
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
        }
        catch (err) {
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
