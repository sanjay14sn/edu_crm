import Lead from '../../models/Lead';
import {
  generateOutreachEmail,
  sendGeneratedEmail,
} from './conversationEngine';
import { isAutoOutreachEnabled, isLeadChatbotEnabled } from './mail.service';

export async function triggerOutreachForLead(leadId: string, opts?: { force?: boolean }) {
  const lead = await Lead.findById(leadId);
  if (!lead) return { skipped: true, reason: 'Lead not found' };

  if (!(await isLeadChatbotEnabled(lead.tenantId))) {
    return { skipped: true, reason: 'LEAD_CHATBOT_ENABLED=false' };
  }
  if (!opts?.force && !(await isAutoOutreachEnabled(lead.tenantId))) {
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

    const generated = await generateOutreachEmail(lead);
    await sendGeneratedEmail(lead.email, generated.subject, generated.body, lead.tenantId);

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
  } catch (err: any) {
    const message = err?.message || String(err);
    console.error(`[LeadChatbot] Outreach failed for ${leadId}:`, message);
    try {
      lead.emailStatus = 'failed';
      lead.chatbotNotes = [
        ...(lead.chatbotNotes || []),
        { note: `Outreach failed: ${message}`, addedAt: new Date() },
      ];
      await lead.save();
    } catch {
      /* ignore */
    }
    return { skipped: true, reason: message };
  }
}

/** Fire-and-forget helper for create/import hooks */
export function queueOutreachForLead(leadId: string) {
  void triggerOutreachForLead(String(leadId)).catch((err) => {
    console.error('[LeadChatbot] queueOutreach error:', err);
  });
}
