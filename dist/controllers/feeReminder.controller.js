"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleExotelFeeReminderWebhook = exports.getFeeReminderCalls = exports.getFeeReminderEmails = exports.sendAllFeeReminderEmails = exports.sendFeeReminderEmails = exports.callAllFeeReminders = exports.callFeeReminders = exports.getFeeReminderTargets = void 0;
const feeReminder_service_1 = require("../services/feeReminder.service");
const getFeeReminderTargets = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) {
            return res.status(400).json({ message: 'Tenant context is required' });
        }
        const targets = await (0, feeReminder_service_1.listFeeReminderTargets)(tenantId);
        res.status(200).json(targets);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching fee reminder targets', error });
    }
};
exports.getFeeReminderTargets = getFeeReminderTargets;
const callFeeReminders = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) {
            return res.status(400).json({ message: 'Tenant context is required' });
        }
        const { studentIds } = req.body;
        const result = await (0, feeReminder_service_1.triggerFeeReminderCalls)({
            tenantId,
            studentIds,
            triggeredBy: String(req.user?.id || 'manual'),
        });
        res.status(200).json(result);
    }
    catch (error) {
        res.status(500).json({ message: 'Error initiating fee reminder calls', error });
    }
};
exports.callFeeReminders = callFeeReminders;
const callAllFeeReminders = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) {
            return res.status(400).json({ message: 'Tenant context is required' });
        }
        const result = await (0, feeReminder_service_1.triggerFeeReminderCalls)({
            tenantId,
            triggeredBy: String(req.user?.id || 'manual'),
        });
        res.status(200).json(result);
    }
    catch (error) {
        res.status(500).json({ message: 'Error initiating bulk fee reminder calls', error });
    }
};
exports.callAllFeeReminders = callAllFeeReminders;
const sendFeeReminderEmails = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) {
            return res.status(400).json({ message: 'Tenant context is required' });
        }
        const { studentIds } = req.body;
        const result = await (0, feeReminder_service_1.triggerFeeReminderEmails)({
            tenantId,
            studentIds,
            triggeredBy: String(req.user?.id || 'manual'),
        });
        res.status(200).json(result);
    }
    catch (error) {
        res.status(500).json({ message: 'Error sending fee reminder emails', error });
    }
};
exports.sendFeeReminderEmails = sendFeeReminderEmails;
const sendAllFeeReminderEmails = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) {
            return res.status(400).json({ message: 'Tenant context is required' });
        }
        const result = await (0, feeReminder_service_1.triggerFeeReminderEmails)({
            tenantId,
            triggeredBy: String(req.user?.id || 'manual'),
        });
        res.status(200).json(result);
    }
    catch (error) {
        res.status(500).json({ message: 'Error sending bulk fee reminder emails', error });
    }
};
exports.sendAllFeeReminderEmails = sendAllFeeReminderEmails;
const getFeeReminderEmails = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) {
            return res.status(400).json({ message: 'Tenant context is required' });
        }
        const summary = await (0, feeReminder_service_1.getFeeReminderEmailSummary)(tenantId);
        res.status(200).json(summary);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching fee reminder email logs', error });
    }
};
exports.getFeeReminderEmails = getFeeReminderEmails;
const getFeeReminderCalls = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) {
            return res.status(400).json({ message: 'Tenant context is required' });
        }
        const summary = await (0, feeReminder_service_1.getFeeReminderCallSummary)(tenantId);
        res.status(200).json(summary);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching fee reminder call logs', error });
    }
};
exports.getFeeReminderCalls = getFeeReminderCalls;
const handleExotelFeeReminderWebhook = async (req, res) => {
    try {
        const body = req.body || {};
        const query = req.query || {};
        const callSid = body.CallSid ||
            body.callSid ||
            body.Sid ||
            query.CallSid ||
            query.callSid;
        const status = body.Status ||
            body.status ||
            body.DialCallStatus ||
            query.Status ||
            query.status;
        const studentId = body.CustomField ||
            body.customField ||
            query.CustomField ||
            query.customField;
        const log = await (0, feeReminder_service_1.updateFeeReminderCallStatus)({
            callSid: callSid ? String(callSid) : undefined,
            status: status ? String(status) : undefined,
            studentId: studentId ? String(studentId) : undefined,
        });
        res.status(200).json({ ok: true, updated: Boolean(log) });
    }
    catch (error) {
        res.status(500).json({ message: 'Error processing Exotel webhook', error });
    }
};
exports.handleExotelFeeReminderWebhook = handleExotelFeeReminderWebhook;
