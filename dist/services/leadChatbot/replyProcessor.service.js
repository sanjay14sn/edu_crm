"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processPendingLeadReplies = processPendingLeadReplies;
exports.sendManualLeadReply = sendManualLeadReply;
exports.buildChatThread = buildChatThread;
const Lead_1 = __importDefault(require("../../models/Lead"));
const gmail_service_1 = require("./gmail.service");
const conversationEngine_1 = require("./conversationEngine");
const mail_service_1 = require("./mail.service");
const config_1 = require("./config");
const settings_service_1 = require("./settings.service");
async function processLeadReply(lead) {
    if (!lead.email || !lead.outreachSentAt)
        return { skipped: true, reason: 'no outreach' };
    if (!(0, gmail_service_1.isGmailAuthHealthy)()) {
        return { skipped: true, reason: 'gmail_auth_paused' };
    }
    const after = new Date(lead.outreachSentAt);
    after.setDate(after.getDate() - 1);
    let latest;
    try {
        latest = await (0, gmail_service_1.fetchLatestFromLead)(lead.email, after, lead.tenantId);
    }
    catch (err) {
        // Auth failures are logged once by gmail circuit breaker — don't spam per lead
        if (!(0, gmail_service_1.isGmailAuthHealthy)() || /invalid_grant|paused/i.test(String(err?.message || ''))) {
            return { skipped: true, reason: 'gmail_auth_paused' };
        }
        console.warn(`[LeadChatbot] Reply fetch failed for ${lead.email}:`, err?.message || err);
        return { skipped: true, reason: err?.message };
    }
    if (!latest?.messageId)
        return { skipped: true, reason: 'no reply' };
    const already = lead.lastReplyMessageId === latest.messageId ||
        (lead.incomingReplies || []).some((r) => r.messageId === latest.messageId);
    // Still send first AI reply if we have a reply stored but never auto-replied
    const needsAi = !lead.autoAiReply?.sentAt;
    if (already && !needsAi) {
        return { skipped: true, reason: 'already processed' };
    }
    const now = new Date();
    if (!already) {
        lead.incomingReplies = [
            ...(lead.incomingReplies || []),
            {
                subject: latest.subject,
                body: latest.body,
                snippet: latest.snippet,
                messageId: latest.messageId,
                receivedAt: latest.date || now,
                role: 'lead',
            },
        ];
        lead.lastReplyMessageId = latest.messageId;
        lead.replySubject = latest.subject;
        lead.replyBody = latest.body;
        lead.replySnippet = latest.snippet;
        lead.repliedAt = lead.repliedAt || now;
        lead.emailStatus = 'replied';
        lead.gmailThreadId = latest.threadId || lead.gmailThreadId;
    }
    const globalAutoReply = await (0, settings_service_1.isGlobalAutoReplyEnabled)(lead.tenantId);
    if (!(await (0, mail_service_1.isAutoAiReplyEnabled)(lead.tenantId)) || !globalAutoReply) {
        await lead.save();
        return {
            skipped: true,
            reason: !globalAutoReply ? 'Global auto reply disabled' : 'AUTO_AI_REPLY disabled',
            stored: !already,
        };
    }
    const result = await (0, conversationEngine_1.generateReplyForLead)(lead, latest.body || latest.snippet || '');
    if (!result.reply?.body?.trim()) {
        await lead.save();
        return { skipped: true, reason: 'empty AI reply' };
    }
    try {
        await (0, conversationEngine_1.sendGeneratedEmail)(lead.email, result.reply.subject, result.reply.body, lead.tenantId);
    }
    catch (err) {
        lead.chatbotNotes = [
            ...(lead.chatbotNotes || []),
            { note: `AI reply failed: ${err?.message || err}`, addedAt: now },
        ];
        await lead.save();
        return { skipped: true, reason: err?.message };
    }
    lead.autoAiReply = {
        subject: result.reply.subject,
        body: result.reply.body,
        generatedAt: now,
        sentAt: now,
    };
    lead.sentReplies = [
        ...(lead.sentReplies || []),
        {
            subject: result.reply.subject,
            body: result.reply.body,
            sentAt: now,
            role: 'ai',
        },
    ];
    lead.intentScore = result.leadScore;
    lead.lastIntent = result.intents[0] || '';
    lead.lastChatbotContactAt = now;
    lead.stage = (0, conversationEngine_1.mapIntentToStage)(lead.stage, result.suggestedStage, result.intents);
    lead.chatbotNotes = [
        ...(lead.chatbotNotes || []),
        { note: result.summary, addedAt: now },
    ];
    lead.notes = [
        ...(lead.notes || []),
        { text: `AI chatbot: ${result.summary}`, date: now.toISOString() },
    ];
    await lead.save();
    console.log(`[LeadChatbot] AI reply → ${lead.email} | intents=${result.intents.join(',')} | stage=${lead.stage}`);
    return { sent: true, intents: result.intents, stage: lead.stage };
}
async function processPendingLeadReplies() {
    if (!(await (0, mail_service_1.isLeadChatbotEnabled)()) || !(await (0, config_1.isGmailReady)())) {
        return { checked: 0, replied: 0, paused: !(0, gmail_service_1.isGmailAuthHealthy)() };
    }
    const leads = await Lead_1.default.find({
        chatbotEnabled: { $ne: false },
        outreachSentAt: { $ne: null },
        email: { $exists: true, $ne: '' },
        stage: { $nin: ['converted', 'lost'] },
    })
        .sort({ lastChatbotContactAt: 1, updatedAt: -1 })
        .limit(40);
    let replied = 0;
    for (const lead of leads) {
        if (!(0, gmail_service_1.isGmailAuthHealthy)()) {
            return { checked: leads.length, replied, paused: true };
        }
        if (!(await (0, mail_service_1.isLeadChatbotEnabled)(lead.tenantId)))
            continue;
        if (!(await (0, config_1.isGmailReady)(lead.tenantId)))
            continue;
        if (!(await (0, settings_service_1.isGlobalAutoReplyEnabled)(lead.tenantId)))
            continue;
        const result = await processLeadReply(lead);
        if (result.sent)
            replied++;
    }
    return { checked: leads.length, replied, paused: false };
}
async function sendManualLeadReply(leadId, opts) {
    const lead = await Lead_1.default.findById(leadId);
    if (!lead)
        throw new Error('Lead not found');
    if (!opts.body?.trim())
        throw new Error('Reply body is required');
    if (!lead.email)
        throw new Error('Lead has no email');
    const subject = opts.subject?.trim() ||
        (lead.replySubject ? `Re: ${lead.replySubject}` : `Re: your ${lead.course} enquiry`);
    await (0, conversationEngine_1.sendGeneratedEmail)(lead.email, subject, opts.body.trim(), lead.tenantId);
    const now = new Date();
    lead.sentReplies = [
        ...(lead.sentReplies || []),
        {
            subject,
            body: opts.body.trim(),
            sentAt: now,
            role: 'manual',
        },
    ];
    lead.lastChatbotContactAt = now;
    if (lead.stage === 'new')
        lead.stage = 'contacted';
    await lead.save();
    return lead;
}
function buildChatThread(lead) {
    const items = [];
    if (lead.outreachBody) {
        items.push({
            id: 'outreach',
            side: 'right',
            role: 'outreach',
            label: 'Outreach',
            subject: lead.outreachSubject,
            body: lead.outreachBody,
            at: lead.outreachSentAt,
        });
    }
    for (const [idx, r] of (lead.incomingReplies || []).entries()) {
        items.push({
            id: `in-${r.messageId || idx}`,
            side: 'left',
            role: 'lead',
            label: lead.name || 'Lead',
            subject: r.subject,
            body: r.body || r.snippet || '',
            at: r.receivedAt,
        });
    }
    for (const [idx, r] of (lead.sentReplies || []).entries()) {
        if (r.role === 'outreach')
            continue;
        items.push({
            id: `out-${idx}-${r.sentAt || ''}`,
            side: 'right',
            role: r.role || 'manual',
            label: r.role === 'ai' ? 'AI Assistant' : 'You',
            subject: r.subject,
            body: r.body || '',
            at: r.sentAt,
        });
    }
    items.sort((a, b) => {
        const ta = a.at ? new Date(a.at).getTime() : 0;
        const tb = b.at ? new Date(b.at).getTime() : 0;
        return ta - tb;
    });
    return {
        leadId: String(lead._id),
        name: lead.name,
        email: lead.email,
        course: lead.course,
        stage: lead.stage,
        emailStatus: lead.emailStatus || 'none',
        outreachSentAt: lead.outreachSentAt,
        repliedAt: lead.repliedAt,
        intentScore: lead.intentScore || 0,
        lastIntent: lead.lastIntent || '',
        messages: items,
        replyCount: (lead.incomingReplies || []).length,
    };
}
