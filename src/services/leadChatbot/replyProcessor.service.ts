import Lead, { ILead } from '../../models/Lead';
import { fetchLatestFromLead, isGmailAuthHealthy } from './gmail.service';
import {
  generateReplyForLead,
  mapIntentToStage,
  sendGeneratedEmail,
} from './conversationEngine';
import { isAutoAiReplyEnabled, isLeadChatbotEnabled } from './mail.service';
import { isGmailReady } from './config';
import { isGlobalAutoReplyEnabled } from './settings.service';

async function processLeadReply(lead: ILead) {
  if (!lead.email || !lead.outreachSentAt) return { skipped: true, reason: 'no outreach' };
  if (!isGmailAuthHealthy()) {
    return { skipped: true, reason: 'gmail_auth_paused' };
  }

  const after = new Date(lead.outreachSentAt);
  after.setDate(after.getDate() - 1);

  let latest;
  try {
    latest = await fetchLatestFromLead(lead.email, after, lead.tenantId);
  } catch (err: any) {
    // Auth failures are logged once by gmail circuit breaker — don't spam per lead
    if (!isGmailAuthHealthy() || /invalid_grant|paused/i.test(String(err?.message || ''))) {
      return { skipped: true, reason: 'gmail_auth_paused' };
    }
    console.warn(`[LeadChatbot] Reply fetch failed for ${lead.email}:`, err?.message || err);
    return { skipped: true, reason: err?.message };
  }

  if (!latest?.messageId) return { skipped: true, reason: 'no reply' };

  const already =
    lead.lastReplyMessageId === latest.messageId ||
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

  const globalAutoReply = await isGlobalAutoReplyEnabled(lead.tenantId);
  if (!(await isAutoAiReplyEnabled(lead.tenantId)) || !globalAutoReply) {
    await lead.save();
    return {
      skipped: true,
      reason: !globalAutoReply ? 'Global auto reply disabled' : 'AUTO_AI_REPLY disabled',
      stored: !already,
    };
  }

  const result = await generateReplyForLead(lead, latest.body || latest.snippet || '');
  if (!result.reply?.body?.trim()) {
    await lead.save();
    return { skipped: true, reason: 'empty AI reply' };
  }

  try {
    await sendGeneratedEmail(lead.email, result.reply.subject, result.reply.body, lead.tenantId);
  } catch (err: any) {
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
  lead.stage = mapIntentToStage(lead.stage, result.suggestedStage, result.intents);
  lead.chatbotNotes = [
    ...(lead.chatbotNotes || []),
    { note: result.summary, addedAt: now },
  ];
  lead.notes = [
    ...(lead.notes || []),
    { text: `AI chatbot: ${result.summary}`, date: now.toISOString() },
  ];
  await lead.save();

  console.log(
    `[LeadChatbot] AI reply → ${lead.email} | intents=${result.intents.join(',')} | stage=${lead.stage}`
  );
  return { sent: true, intents: result.intents, stage: lead.stage };
}

export async function processPendingLeadReplies() {
  if (!(await isLeadChatbotEnabled()) || !(await isGmailReady())) {
    return { checked: 0, replied: 0, paused: !isGmailAuthHealthy() };
  }

  const leads = await Lead.find({
    chatbotEnabled: { $ne: false },
    outreachSentAt: { $ne: null },
    email: { $exists: true, $ne: '' },
    stage: { $nin: ['converted', 'lost'] },
  })
    .sort({ lastChatbotContactAt: 1, updatedAt: -1 })
    .limit(40);

  let replied = 0;
  for (const lead of leads) {
    if (!isGmailAuthHealthy()) {
      return { checked: leads.length, replied, paused: true };
    }
    if (!(await isLeadChatbotEnabled(lead.tenantId))) continue;
    if (!(await isGmailReady(lead.tenantId))) continue;
    if (!(await isGlobalAutoReplyEnabled(lead.tenantId))) continue;
    const result = await processLeadReply(lead);
    if ((result as any).sent) replied++;
  }

  return { checked: leads.length, replied, paused: false };
}

export async function sendManualLeadReply(
  leadId: string,
  opts: { subject?: string; body: string }
) {
  const lead = await Lead.findById(leadId);
  if (!lead) throw new Error('Lead not found');
  if (!opts.body?.trim()) throw new Error('Reply body is required');
  if (!lead.email) throw new Error('Lead has no email');

  const subject =
    opts.subject?.trim() ||
    (lead.replySubject ? `Re: ${lead.replySubject}` : `Re: your ${lead.course} enquiry`);

  await sendGeneratedEmail(lead.email, subject, opts.body.trim(), lead.tenantId);

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
  if (lead.stage === 'new') lead.stage = 'contacted';
  await lead.save();
  return lead;
}

export function buildChatThread(lead: ILead) {
  type ThreadItem = {
    id: string;
    side: 'left' | 'right';
    role: string;
    label: string;
    subject?: string;
    body: string;
    at?: Date | string | null;
  };

  const items: ThreadItem[] = [];

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
    if (r.role === 'outreach') continue;
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
