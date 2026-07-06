import { Response } from 'express';
import SupportTicket from '../models/SupportTicket';
import Announcement from '../models/Announcement';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth.middleware';
import { tenantFilter } from '../utils/bdeStats';

function mapTicket(doc: { toObject: () => Record<string, unknown>; _id: unknown }) {
  const obj = doc.toObject();
  const createdAt = obj.createdAt as Date | string | undefined;
  return {
    ...obj,
    id: obj._id,
    createdAt:
      createdAt instanceof Date
        ? createdAt.toISOString().split('T')[0]
        : typeof createdAt === 'string'
          ? createdAt.split('T')[0]
          : new Date().toISOString().split('T')[0],
  };
}

function mapAnnouncement(doc: { toObject: () => Record<string, unknown>; _id: unknown }) {
  const obj = doc.toObject();
  const createdAt = obj.createdAt as Date | string | undefined;
  return {
    ...obj,
    id: obj._id,
    date:
      createdAt instanceof Date
        ? createdAt.toISOString().split('T')[0]
        : typeof createdAt === 'string'
          ? createdAt.split('T')[0]
          : new Date().toISOString().split('T')[0],
  };
}

export async function seedAnnouncementsIfEmpty() {
  const count = await Announcement.countDocuments();
  if (count > 0) return;

  await Announcement.insertMany([
    {
      title: 'Platform Maintenance — Scheduled Updates',
      body: 'EduPlatform may undergo brief scheduled maintenance during off-peak hours. The portal will notify you before any downtime window.',
      type: 'warning',
      active: true,
    },
    {
      title: 'New Feature: Dynamic Reports & Call Logs',
      body: 'BDE staff can now audit call summary reports with monthly filters and export CSV sheets directly from the Reports module.',
      type: 'info',
      active: true,
    },
    {
      title: 'Billing Cycle Reminder',
      body: 'Enterprise plan invoices are generated on the 1st of each month. Contact support if you need billing adjustments.',
      type: 'info',
      active: true,
    },
  ]);
}

export const getSupportQueueCount = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only super admins can view the support queue count.' });
    }

    const [open, inProgress] = await Promise.all([
      SupportTicket.countDocuments({ status: 'open' }),
      SupportTicket.countDocuments({ status: 'in-progress' }),
    ]);

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.status(200).json({ open, inProgress, pending: open + inProgress });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching support queue count', error });
  }
};

export const getSupportTickets = async (req: AuthRequest, res: Response) => {
  try {
    const filter: Record<string, unknown> = {};

    if (req.user?.role === 'super_admin') {
      // Super admin sees all tickets
    } else {
      filter.userId = String(req.user?.id);
    }

    const tickets = await SupportTicket.find(filter).sort({ createdAt: -1 });
    res.status(200).json(tickets.map(mapTicket));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching support tickets', error });
  }
};

export const createSupportTicket = async (req: AuthRequest, res: Response) => {
  try {
    const { subject, category, priority, message } = req.body;

    if (!subject?.trim() || !message?.trim()) {
      return res.status(400).json({ message: 'subject and message are required' });
    }

    const dbUser = await User.findById(req.user?.id);

    const ticket = await SupportTicket.create({
      tenantId: req.user?.tenantId,
      userId: String(req.user?.id),
      userName: dbUser?.name || 'User',
      userRole: req.user?.role || 'owner',
      subject: subject.trim(),
      category: category || 'Other',
      priority: priority || 'medium',
      status: 'open',
      message: message.trim(),
    });

    res.status(201).json(mapTicket(ticket));
  } catch (error) {
    res.status(400).json({ message: 'Error creating support ticket', error });
  }
};

export const updateSupportTicket = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only super admins can update ticket status and responses' });
    }

    const { status, response } = req.body as { status?: string; response?: string };
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    if (status) ticket.status = status as typeof ticket.status;
    if (response !== undefined) {
      ticket.response = response;
      ticket.respondedBy = String(req.user.id);
      ticket.respondedAt = new Date();
      if (ticket.status === 'open') ticket.status = 'in-progress';
    }

    await ticket.save();
    res.status(200).json(mapTicket(ticket));
  } catch (error) {
    res.status(400).json({ message: 'Error updating support ticket', error });
  }
};

export const getAnnouncements = async (req: AuthRequest, res: Response) => {
  try {
    await seedAnnouncementsIfEmpty();

    const filter: Record<string, unknown> = { active: true };

    if (req.user?.role !== 'super_admin' && req.user?.tenantId) {
      filter.$or = [{ tenantId: { $exists: false } }, { tenantId: null }, { tenantId: tenantFilter(req.user.tenantId) }];
    }

    const announcements = await Announcement.find(filter).sort({ createdAt: -1 }).limit(20);
    res.status(200).json(announcements.map(mapAnnouncement));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching announcements', error });
  }
};
