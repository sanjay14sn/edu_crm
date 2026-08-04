"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateLeadChatbotGlobalSettings = exports.getLeadChatbotGlobalSettings = exports.runReplyScanNow = exports.runInboundScanNow = exports.reconnectGmail = exports.triggerLeadOutreach = exports.sendLeadChatReply = exports.getLeadChat = exports.getGmailChatbotStatus = void 0;
const Lead_1 = __importDefault(require("../models/Lead"));
const gmail_service_1 = require("../services/leadChatbot/gmail.service");
const config_1 = require("../services/leadChatbot/config");
const outreach_service_1 = require("../services/leadChatbot/outreach.service");
const replyProcessor_service_1 = require("../services/leadChatbot/replyProcessor.service");
const inboundLead_service_1 = require("../services/leadChatbot/inboundLead.service");
const replyProcessor_service_2 = require("../services/leadChatbot/replyProcessor.service");
const settings_service_1 = require("../services/leadChatbot/settings.service");
function paramId(value) {
    return Array.isArray(value) ? value[0] : value || '';
}
async function findLeadForUser(req, leadId) {
    const lead = await Lead_1.default.findById(leadId);
    if (!lead)
        return null;
    if (req.user?.role === 'super_admin')
        return lead;
    if (req.user?.role === 'owner' && req.user.tenantId && lead.tenantId !== req.user.tenantId) {
        return null;
    }
    if (req.user?.role === 'bde' &&
        lead.assignedBdeId &&
        lead.assignedBdeId !== String(req.user.id)) {
        return null;
    }
    return lead;
}
const getGmailChatbotStatus = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        res.json({
            ...(await (0, gmail_service_1.getGmailStatus)(tenantId)),
            ...(await (0, config_1.chatbotRuntimeStatus)(tenantId)),
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching chatbot status', error });
    }
};
exports.getGmailChatbotStatus = getGmailChatbotStatus;
const getLeadChat = async (req, res) => {
    try {
        const lead = await findLeadForUser(req, paramId(req.params.leadId));
        if (!lead)
            return res.status(404).json({ message: 'Lead not found' });
        res.json((0, replyProcessor_service_1.buildChatThread)(lead));
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching chat', error });
    }
};
exports.getLeadChat = getLeadChat;
const sendLeadChatReply = async (req, res) => {
    try {
        const lead = await findLeadForUser(req, paramId(req.params.leadId));
        if (!lead)
            return res.status(404).json({ message: 'Lead not found' });
        const { subject, body } = req.body;
        if (!body?.trim()) {
            return res.status(400).json({ message: 'Reply body is required' });
        }
        const updated = await (0, replyProcessor_service_1.sendManualLeadReply)(String(lead._id), { subject, body });
        res.json({ success: true, chat: (0, replyProcessor_service_1.buildChatThread)(updated) });
    }
    catch (error) {
        res.status(400).json({ message: error?.message || 'Error sending reply', error });
    }
};
exports.sendLeadChatReply = sendLeadChatReply;
const triggerLeadOutreach = async (req, res) => {
    try {
        const lead = await findLeadForUser(req, paramId(req.params.leadId));
        if (!lead)
            return res.status(404).json({ message: 'Lead not found' });
        const result = await (0, outreach_service_1.triggerOutreachForLead)(String(lead._id), { force: true });
        if (result.skipped) {
            return res.status(400).json({ message: result.reason, ...result });
        }
        const fresh = await Lead_1.default.findById(lead._id);
        res.json({ success: true, ...result, chat: fresh ? (0, replyProcessor_service_1.buildChatThread)(fresh) : null });
    }
    catch (error) {
        res.status(500).json({ message: error?.message || 'Error triggering outreach', error });
    }
};
exports.triggerLeadOutreach = triggerLeadOutreach;
const reconnectGmail = async (_req, res) => {
    try {
        (0, gmail_service_1.clearGmailAuthCircuit)();
        res.json({ success: true, message: 'Gmail OAuth circuit reset. Ready to retry polls.' });
    }
    catch (error) {
        res.status(500).json({ message: 'Failed to reset Gmail circuit', error });
    }
};
exports.reconnectGmail = reconnectGmail;
const runInboundScanNow = async (_req, res) => {
    try {
        (0, gmail_service_1.clearGmailAuthCircuit)();
        const result = await (0, inboundLead_service_1.processInboundInquiryEmails)();
        res.json({ success: true, ...result });
    }
    catch (error) {
        res.status(500).json({ message: error?.message || 'Inbound scan failed', error });
    }
};
exports.runInboundScanNow = runInboundScanNow;
const runReplyScanNow = async (_req, res) => {
    try {
        (0, gmail_service_1.clearGmailAuthCircuit)();
        const result = await (0, replyProcessor_service_2.processPendingLeadReplies)();
        res.json({ success: true, ...result });
    }
    catch (error) {
        res.status(500).json({ message: error?.message || 'Reply scan failed', error });
    }
};
exports.runReplyScanNow = runReplyScanNow;
const getLeadChatbotGlobalSettings = async (req, res) => {
    try {
        const settings = await (0, settings_service_1.getLeadChatbotGlobalSettings)(req.user?.tenantId);
        res.json(settings);
    }
    catch (error) {
        res.status(500).json({ message: error?.message || 'Error fetching chatbot settings', error });
    }
};
exports.getLeadChatbotGlobalSettings = getLeadChatbotGlobalSettings;
const updateLeadChatbotGlobalSettings = async (req, res) => {
    try {
        if (req.user?.role === 'bde') {
            return res.status(403).json({ message: 'Only owners can change global chatbot settings' });
        }
        const { autoReplyEnabled, followUpsEnabled } = req.body;
        const settings = await (0, settings_service_1.updateLeadChatbotGlobalSettings)(req.user?.tenantId, {
            autoReplyEnabled,
            followUpsEnabled,
        });
        res.json({ success: true, ...settings });
    }
    catch (error) {
        res.status(400).json({ message: error?.message || 'Error updating chatbot settings', error });
    }
};
exports.updateLeadChatbotGlobalSettings = updateLeadChatbotGlobalSettings;
