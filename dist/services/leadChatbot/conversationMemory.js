"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMemory = buildMemory;
function buildMemory(lead, leadName = 'Lead') {
    const events = [];
    if (lead.outreachBody) {
        events.push({
            from: 'us',
            role: 'You (outreach)',
            body: lead.outreachBody,
            at: lead.outreachSentAt,
        });
    }
    if (lead.autoAiReply?.body && lead.autoAiReply?.sentAt) {
        events.push({
            from: 'us',
            role: 'You (AI reply)',
            body: lead.autoAiReply.body,
            at: lead.autoAiReply.sentAt,
        });
    }
    for (const r of lead.incomingReplies || []) {
        events.push({
            from: 'lead',
            role: leadName,
            body: r.body || r.snippet || '',
            at: r.receivedAt,
        });
    }
    for (const r of lead.sentReplies || []) {
        if (r.role === 'outreach')
            continue;
        events.push({
            from: 'us',
            role: r.role === 'ai' ? 'You (AI)' : 'You (manual)',
            body: r.body || '',
            at: r.sentAt,
        });
    }
    events.sort((a, b) => {
        const ta = a.at ? new Date(a.at).getTime() : 0;
        const tb = b.at ? new Date(b.at).getTime() : 0;
        return ta - tb;
    });
    const leadMessages = events.filter((e) => e.from === 'lead');
    return {
        events,
        leadMessages,
        lastLeadMessage: leadMessages[leadMessages.length - 1] || null,
    };
}
