import Lead from '../../models/Lead';
import { resolveCenterBrand } from './knowledgeBase';
import { sendGeneratedEmail } from './conversationEngine';
import { isLeadChatbotEnabled, isMailConfigured } from './mail.service';
import { isGlobalFollowUpsEnabled } from './settings.service';

function followUpDelayMs() {
  const days = Number(process.env.LEAD_CHATBOT_FOLLOWUP_DAYS || 3);
  return Math.max(1, days) * 24 * 60 * 60 * 1000;
}

function maxFollowUps() {
  const n = Number(process.env.LEAD_CHATBOT_MAX_FOLLOWUPS || 2);
  return Math.max(1, Math.min(5, n));
}

export async function processLeadFollowUps() {
  if (!(await isLeadChatbotEnabled()) || !(await isMailConfigured())) {
    return { checked: 0, sent: 0 };
  }

  const cutoff = new Date(Date.now() - followUpDelayMs());
  const max = maxFollowUps();

  const leads = await Lead.find({
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
    if (!(await isLeadChatbotEnabled(lead.tenantId))) continue;
    if (!(await isMailConfigured(lead.tenantId))) continue;
    if (!(await isGlobalFollowUpsEnabled(lead.tenantId))) continue;
    try {
      const center = await resolveCenterBrand(lead.tenantId);
      const first = lead.name?.split(' ')[0] || 'there';
      const step = (lead.followUpCount || 0) + 1;
      const subject =
        step === 1
          ? `Following up on your ${lead.course} enquiry`
          : `Quick check-in about ${lead.course}`;
      const body =
        `Hi ${first},\n\n` +
        `Just following up on your enquiry about ${lead.course} at ${center.name}. ` +
        `Happy to share batch timings, fee options, or book a short demo whenever you're free.\n\n` +
        `Would a quick call this week work for you?\n\n` +
        `Best,\n${center.name}`;

      await sendGeneratedEmail(lead.email, subject, body, lead.tenantId);

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
    } catch (err: any) {
      console.warn(`[LeadChatbot] Follow-up failed for ${lead.email}:`, err?.message || err);
    }
  }

  return { checked: leads.length, sent };
}
