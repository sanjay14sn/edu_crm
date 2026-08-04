"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processLeadFollowUps = processLeadFollowUps;
const Lead_1 = __importDefault(require("../../models/Lead"));
const knowledgeBase_1 = require("./knowledgeBase");
const conversationEngine_1 = require("./conversationEngine");
const mail_service_1 = require("./mail.service");
const settings_service_1 = require("./settings.service");
function followUpDelayMs() {
    const days = Number(process.env.LEAD_CHATBOT_FOLLOWUP_DAYS || 3);
    return Math.max(1, days) * 24 * 60 * 60 * 1000;
}
function maxFollowUps() {
    const n = Number(process.env.LEAD_CHATBOT_MAX_FOLLOWUPS || 2);
    return Math.max(1, Math.min(5, n));
}
async function processLeadFollowUps() {
    if (!(await (0, mail_service_1.isLeadChatbotEnabled)()) || !(await (0, mail_service_1.isMailConfigured)())) {
        return { checked: 0, sent: 0 };
    }
    const cutoff = new Date(Date.now() - followUpDelayMs());
    const max = maxFollowUps();
    const leads = await Lead_1.default.find({
        chatbotEnabled: { $ne: false },
        outreachSentAt: { $ne: null },
        repliedAt: null,
        email: { $exists: true, $ne: '' },
        stage: { $nin: ['converted', 'lost', 'requested_as_student'] },
        followUpCount: { $lt: max },
        $or: [
            { lastFollowUpAt: null, outreachSentAt: { $lte: cutoff } },
            { lastFollowUpAt: { $lte: cutoff } },
        ],
    })
        .sort({ lastFollowUpAt: 1, outreachSentAt: 1 })
        .limit(25);
    let sent = 0;
    for (const lead of leads) {
        if (!(await (0, mail_service_1.isLeadChatbotEnabled)(lead.tenantId)))
            continue;
        if (!(await (0, mail_service_1.isMailConfigured)(lead.tenantId)))
            continue;
        if (!(await (0, settings_service_1.isGlobalFollowUpsEnabled)(lead.tenantId)))
            continue;
        try {
            const center = await (0, knowledgeBase_1.resolveCenterBrand)(lead.tenantId);
            const first = lead.name?.split(' ')[0] || 'there';
            const step = (lead.followUpCount || 0) + 1;
            const subject = step === 1
                ? `Following up on your ${lead.course} enquiry`
                : `Quick check-in about ${lead.course}`;
            const body = `Hi ${first},\n\n` +
                `Just following up on your enquiry about ${lead.course} at ${center.name}. ` +
                `Happy to share batch timings, fee options, or book a short demo whenever you're free.\n\n` +
                `Would a quick call this week work for you?\n\n` +
                `Best,\n${center.name}`;
            await (0, conversationEngine_1.sendGeneratedEmail)(lead.email, subject, body, lead.tenantId);
            const now = new Date();
            lead.followUpCount = step;
            lead.lastFollowUpAt = now;
            lead.lastChatbotContactAt = now;
            lead.sentReplies = [
                ...(lead.sentReplies || []),
                { subject, body, sentAt: now, role: 'ai' },
            ];
            lead.notes = [
                ...(lead.notes || []),
                { text: `Auto follow-up #${step} sent`, date: now.toISOString() },
            ];
            if (lead.stage === 'new' || lead.stage === 'contacted') {
                lead.stage = 'follow_up';
            }
            await lead.save();
            sent++;
            console.log(`[LeadChatbot] Follow-up #${step} → ${lead.email}`);
        }
        catch (err) {
            console.warn(`[LeadChatbot] Follow-up failed for ${lead.email}:`, err?.message || err);
        }
    }
    return { checked: leads.length, sent };
}
