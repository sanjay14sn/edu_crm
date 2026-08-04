import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  getFeeReminderCallSummary,
  listFeeReminderTargets,
  triggerFeeReminderCalls,
  updateFeeReminderCallStatus,
  triggerFeeReminderEmails,
  getFeeReminderEmailSummary,
} from '../services/feeReminder.service';

export const getFeeReminderTargets = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant context is required' });
    }

    const targets = await listFeeReminderTargets(tenantId);
    res.status(200).json(targets);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching fee reminder targets', error });
  }
};

export const callFeeReminders = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant context is required' });
    }

    const { studentIds } = req.body as { studentIds?: string[] };
    const result = await triggerFeeReminderCalls({
      tenantId,
      studentIds,
      triggeredBy: String(req.user?.id || 'manual'),
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error initiating fee reminder calls', error });
  }
};

export const callAllFeeReminders = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant context is required' });
    }

    const result = await triggerFeeReminderCalls({
      tenantId,
      triggeredBy: String(req.user?.id || 'manual'),
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error initiating bulk fee reminder calls', error });
  }
};

export const sendFeeReminderEmails = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant context is required' });
    }

    const { studentIds } = req.body as { studentIds?: string[] };
    const result = await triggerFeeReminderEmails({
      tenantId,
      studentIds,
      triggeredBy: String(req.user?.id || 'manual'),
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error sending fee reminder emails', error });
  }
};

export const sendAllFeeReminderEmails = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant context is required' });
    }

    const result = await triggerFeeReminderEmails({
      tenantId,
      triggeredBy: String(req.user?.id || 'manual'),
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error sending bulk fee reminder emails', error });
  }
};

export const getFeeReminderEmails = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant context is required' });
    }

    const summary = await getFeeReminderEmailSummary(tenantId);
    res.status(200).json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching fee reminder email logs', error });
  }
};

export const getFeeReminderCalls = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant context is required' });
    }

    const summary = await getFeeReminderCallSummary(tenantId);
    res.status(200).json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching fee reminder call logs', error });
  }
};

export const handleExotelFeeReminderWebhook = async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const query = req.query || {};

    const callSid =
      body.CallSid ||
      body.callSid ||
      body.Sid ||
      (query.CallSid as string) ||
      (query.callSid as string);

    const status =
      body.Status ||
      body.status ||
      body.DialCallStatus ||
      (query.Status as string) ||
      (query.status as string);

    const studentId =
      body.CustomField ||
      body.customField ||
      (query.CustomField as string) ||
      (query.customField as string);

    const log = await updateFeeReminderCallStatus({
      callSid: callSid ? String(callSid) : undefined,
      status: status ? String(status) : undefined,
      studentId: studentId ? String(studentId) : undefined,
    });

    res.status(200).json({ ok: true, updated: Boolean(log) });
  } catch (error) {
    res.status(500).json({ message: 'Error processing Exotel webhook', error });
  }
};

