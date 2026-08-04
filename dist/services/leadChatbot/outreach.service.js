"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerOutreachForLead = triggerOutreachForLead;
exports.queueOutreachForLead = queueOutreachForLead;
const Lead_1 = __importDefault(require("../../models/Lead"));
const conversationEngine_1 = require("./conversationEngine");
const mail_service_1 = require("./mail.service");
async function triggerOutreachForLead(leadId, opts) {
    const lead = await Lead_1.default.findById(leadId);
    if (!lead)
        return { skipped: true, reason: 'Lead not found' };
    if (!(await (0, mail_service_1.isLeadChatbotEnabled)(lead.tenantId))) {
        return { skipped: true, reason: 'LEAD_CHATBOT_ENABLED=false' };
    }
    if (!opts?.force && !(await (0, mail_service_1.isAutoOutreachEnabled)(lead.tenantId))) {
        return { skipped: true, reason: 'Auto outreach disabled or mail not configured' };
    }
    if (lead.chatbotEnabled === false) {
        return { skipped: true, reason: 'Chatbot disabled for lead' };
    }
    if (!opts?.force && lead.outreachSentAt) {
        return { skipped: true, reason: 'Outreach already sent' };
    }
    if (!lead.email?.trim()) {
        return { skipped: true, reason: 'No email' };
    }
    try {
        lead.emailStatus = 'pending';
        await lead.save();
        const generated = await (0, conversationEngine_1.generateOutreachEmail)(lead);
        await (0, conversationEngine_1.sendGeneratedEmail)(lead.email, generated.subject, generated.body, lead.tenantId);
        const now = new Date();
        lead.outreachSubject = generated.subject;
        lead.outreachBody = generated.body;
        lead.outreachSentAt = now;
        lead.emailStatus = 'delivered';
        lead.lastChatbotContactAt = now;
        if (lead.stage === 'new') {
            lead.stage = 'contacted';
        }
        lead.sentReplies = [
            ...(lead.sentReplies || []),
            {
                subject: generated.subject,
                body: generated.body,
                sentAt: now,
                role: 'outreach',
            },
        ];
        lead.notes = [
            ...(lead.notes || []),
            {
                text: `AI outreach email sent: ${generated.subject}`,
                date: now.toISOString(),
            },
        ];
        await lead.save();
        console.log(`[LeadChatbot] Outreach sent for ${lead.name} <${lead.email}>`);
        return { sent: true, subject: generated.subject };
    }
    catch (err) {
        const message = err?.message || String(err);
        console.error(`[LeadChatbot] Outreach failed for ${leadId}:`, message);
        try {
            lead.emailStatus = 'failed';
            lead.chatbotNotes = [
                ...(lead.chatbotNotes || []),
                { note: `Outreach failed: ${message}`, addedAt: new Date() },
            ];
            await lead.save();
        }
        catch {
            /* ignore */
        }
        return { skipped: true, reason: message };
    }
}
/** Fire-and-forget helper for create/import hooks */
function queueOutreachForLead(leadId) {
    void triggerOutreachForLead(String(leadId)).catch((err) => {
        console.error('[LeadChatbot] queueOutreach error:', err);
    });
}
