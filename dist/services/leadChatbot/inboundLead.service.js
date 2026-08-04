"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processInboundInquiryEmails = processInboundInquiryEmails;
const Lead_1 = __importDefault(require("../../models/Lead"));
const gmail_service_1 = require("./gmail.service");
const config_1 = require("./config");
const outreach_service_1 = require("./outreach.service");
function extractPhone(text) {
    const match = text.match(/(?:\+?\d[\d\s\-()]{8,}\d)/);
    return match ? match[0].replace(/[^\d+]/g, '').slice(0, 15) : '0000000000';
}
function extractCourse(subject, body) {
    const text = `${subject}\n${body}`.toLowerCase();
    if (/mobile|android|ios|flutter|app development/.test(text))
        return 'mobile app development';
    if (/\berp\b|odoo|sap/.test(text))
        return 'ERP';
    if (/full\s*stack|mern|web development/.test(text))
        return 'full stack development';
    if (/course|admission|training|enquiry|inquiry/.test(text))
        return 'General Enquiry';
    return 'General Enquiry';
}
function guessName(fromName, email, body) {
    const bodyName = body.match(/(?:my name is|i am|i'm)\s+([A-Za-z][A-Za-z\s.]{1,40})/i);
    if (bodyName?.[1])
        return bodyName[1].trim();
    if (fromName && !fromName.includes('@'))
        return fromName.trim();
    return email.split('@')[0] || 'Email Lead';
}
async function processInboundInquiryEmails() {
    const tenantId = process.env.LEAD_CHATBOT_DEFAULT_TENANT || 'ERP';
    if (!(await (0, config_1.isInboundEnabled)(tenantId)) || !(await (0, config_1.isGmailReady)(tenantId))) {
        return { scanned: 0, created: 0, skipped: 0 };
    }
    let messages;
    try {
        messages = await (0, gmail_service_1.fetchRecentInquiryEmails)({ maxResults: 20, newerThanDays: 2, tenantId });
    }
    catch (err) {
        // Circuit breaker logs invalid_grant once — avoid repeating every minute
        if (!(0, gmail_service_1.isGmailAuthHealthy)() || /invalid_grant|paused/i.test(String(err?.message || ''))) {
            return { scanned: 0, created: 0, skipped: 0, paused: true, error: err?.message };
        }
        console.warn('[LeadChatbot] Inbound Gmail scan failed:', err?.message || err);
        return { scanned: 0, created: 0, skipped: 0, error: err?.message };
    }
    let created = 0;
    let skipped = 0;
    for (const msg of messages) {
        if (!msg.fromEmail) {
            skipped++;
            continue;
        }
        if (msg.messageId) {
            const byMsg = await Lead_1.default.findOne({ sourceMessageId: msg.messageId });
            if (byMsg) {
                skipped++;
                continue;
            }
        }
        const email = msg.fromEmail.toLowerCase();
        const existing = await Lead_1.default.findOne({
            email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        });
        if (existing) {
            if (!existing.sourceMessageId && msg.messageId) {
                existing.sourceMessageId = msg.messageId;
                existing.gmailThreadId = msg.threadId || existing.gmailThreadId;
                await existing.save();
            }
            skipped++;
            continue;
        }
        const name = guessName(msg.fromName, email, msg.body);
        const course = extractCourse(msg.subject, msg.body);
        const phone = extractPhone(`${msg.body} ${msg.snippet}`);
        const lead = await Lead_1.default.create({
            tenantId: process.env.LEAD_CHATBOT_DEFAULT_TENANT || 'ERP',
            name,
            email,
            phone,
            course,
            stage: 'new',
            value: 0,
            source: 'email',
            priority: 'medium',
            counsellor: '',
            notes: [
                {
                    text: `Inbound email enquiry: ${msg.subject || '(no subject)'} — ${msg.snippet || msg.body.slice(0, 160)}`,
                    date: new Date().toISOString(),
                },
            ],
            chatbotEnabled: true,
            autoReplyEnabled: true,
            followUpsEnabled: true,
            emailStatus: 'none',
            sourceMessageId: msg.messageId,
            gmailThreadId: msg.threadId,
            incomingReplies: [
                {
                    subject: msg.subject,
                    body: msg.body,
                    snippet: msg.snippet,
                    messageId: msg.messageId,
                    receivedAt: msg.date,
                    role: 'lead',
                },
            ],
            replySubject: msg.subject,
            replyBody: msg.body,
            replySnippet: msg.snippet,
            repliedAt: msg.date,
            lastReplyMessageId: msg.messageId,
        });
        created++;
        console.log(`[LeadChatbot] Inbound lead created: ${name} <${email}> (${course})`);
        (0, outreach_service_1.queueOutreachForLead)(String(lead._id));
    }
    return { scanned: messages.length, created, skipped };
}
