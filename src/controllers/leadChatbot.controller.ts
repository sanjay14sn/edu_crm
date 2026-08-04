import { Response } from 'express';
import Lead from '../models/Lead';
import { AuthRequest } from '../middleware/auth.middleware';
import { getGmailStatus, clearGmailAuthCircuit } from '../services/leadChatbot/gmail.service';
import { chatbotRuntimeStatus } from '../services/leadChatbot/config';
import { triggerOutreachForLead } from '../services/leadChatbot/outreach.service';
import {
  buildChatThread,
  sendManualLeadReply,
} from '../services/leadChatbot/replyProcessor.service';
import { processInboundInquiryEmails } from '../services/leadChatbot/inboundLead.service';
import { processPendingLeadReplies } from '../services/leadChatbot/replyProcessor.service';
import {
  getLeadChatbotGlobalSettings as loadGlobalSettings,
  updateLeadChatbotGlobalSettings as saveGlobalSettings,
} from '../services/leadChatbot/settings.service';

function paramId(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value || '';
}

async function findLeadForUser(req: AuthRequest, leadId: string) {
  const lead = await Lead.findById(leadId);
  if (!lead) return null;

  if (req.user?.role === 'super_admin') return lead;

  if (req.user?.role === 'owner' && req.user.tenantId && lead.tenantId !== req.user.tenantId) {
    return null;
  }

  if (
    req.user?.role === 'bde' &&
    lead.assignedBdeId &&
    lead.assignedBdeId !== String(req.user.id)
  ) {
    return null;
  }

  return lead;
}

export const getGmailChatbotStatus = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    res.json({
      ...(await getGmailStatus(tenantId)),
      ...(await chatbotRuntimeStatus(tenantId)),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching chatbot status', error });
  }
};

export const getLeadChat = async (req: AuthRequest, res: Response) => {
  try {
    const lead = await findLeadForUser(req, paramId(req.params.leadId));
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json(buildChatThread(lead));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching chat', error });
  }
};

export const sendLeadChatReply = async (req: AuthRequest, res: Response) => {
  try {
    const lead = await findLeadForUser(req, paramId(req.params.leadId));
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const { subject, body } = req.body as { subject?: string; body?: string };
    if (!body?.trim()) {
      return res.status(400).json({ message: 'Reply body is required' });
    }

    const updated = await sendManualLeadReply(String(lead._id), { subject, body });
    res.json({ success: true, chat: buildChatThread(updated) });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || 'Error sending reply', error });
  }
};

export const triggerLeadOutreach = async (req: AuthRequest, res: Response) => {
  try {
    const lead = await findLeadForUser(req, paramId(req.params.leadId));
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const result = await triggerOutreachForLead(String(lead._id), { force: true });
    if ((result as any).skipped) {
      return res.status(400).json({ message: (result as any).reason, ...result });
    }

    const fresh = await Lead.findById(lead._id);
    res.json({ success: true, ...result, chat: fresh ? buildChatThread(fresh) : null });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Error triggering outreach', error });
  }
};

export const reconnectGmail = async (_req: AuthRequest, res: Response) => {
  try {
    clearGmailAuthCircuit();
    res.json({ success: true, message: 'Gmail OAuth circuit reset. Ready to retry polls.' });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to reset Gmail circuit', error });
  }
};

export const runInboundScanNow = async (_req: AuthRequest, res: Response) => {
  try {
    clearGmailAuthCircuit();
    const result = await processInboundInquiryEmails();
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Inbound scan failed', error });
  }
};

export const runReplyScanNow = async (_req: AuthRequest, res: Response) => {
  try {
    clearGmailAuthCircuit();
    const result = await processPendingLeadReplies();
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Reply scan failed', error });
  }
};

export const getLeadChatbotGlobalSettings = async (req: AuthRequest, res: Response) => {
  try {
    const settings = await loadGlobalSettings(req.user?.tenantId);
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Error fetching chatbot settings', error });
  }
};

export const updateLeadChatbotGlobalSettings = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role === 'bde') {
      return res.status(403).json({ message: 'Only owners can change global chatbot settings' });
    }

    const { autoReplyEnabled, followUpsEnabled } = req.body as {
      autoReplyEnabled?: boolean;
      followUpsEnabled?: boolean;
    };

    const settings = await saveGlobalSettings(req.user?.tenantId, {
      autoReplyEnabled,
      followUpsEnabled,
    });
    res.json({ success: true, ...settings });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || 'Error updating chatbot settings', error });
  }
};
