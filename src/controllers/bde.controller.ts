import { Request, Response } from 'express';
import Lead from '../models/Lead';
import BDETask from '../models/BDETask';
import FollowUp from '../models/FollowUp';
import CallLog from '../models/CallLog';
import Attendance from '../models/Attendance';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  fetchLeadsForBDE,
  formatLeadsForResponse,
  loadBdeUsers,
  normalizeName,
  tenantFilter,
  computeBdeMetrics,
  computeBdeMonthlyHistory,
  buildBdeCommissionConfig,
  calculateBdeCommission,
  buildRecentMonths,
  monthKeyFromDate,
} from '../utils/bdeStats';
import BDEProfile from '../models/BDEProfile';
import Center from '../models/Center';
import HRPayroll from '../models/HRPayroll';
import { LeadStage } from '../models/Lead';
import { buildShiftPayload, formatShiftTime } from '../utils/shiftTimer';
import { assertFeature } from '../utils/centerPolicy';

type ShiftAction = 'login' | 'pause' | 'resume' | 'logout';

export const getLeads = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role === 'bde') {
      const dbUser = await User.findById(req.user.id);
      const leads = await fetchLeadsForBDE(
        String(req.user.id),
        dbUser?.name || '',
        req.user.tenantId
      );
      return res.status(200).json(await formatLeadsForResponse(leads, req.user.tenantId));
    }

    const filter: Record<string, unknown> = {};
    if (req.user?.role === 'owner' && req.user.tenantId) {
      filter.tenantId = req.user.tenantId;
    }
    const leads = await Lead.find(filter).sort({ createdAt: -1 });
    res.status(200).json(await formatLeadsForResponse(leads, req.user?.tenantId));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching leads', error });
  }
};

export const createLead = async (req: AuthRequest, res: Response) => {
  try {
    const leadData = { ...req.body };
    if (req.user?.tenantId && !leadData.tenantId) {
      leadData.tenantId = req.user.tenantId;
    }
    if (req.user?.role === 'bde') {
      const dbUser = await User.findById(req.user.id);
      leadData.assignedBdeId = String(req.user.id);
      if (!leadData.counsellor) {
        leadData.counsellor = dbUser?.name || '';
      }
    }
    const lead = new Lead(leadData);
    const saved = await lead.save();
    res.status(201).json({ ...saved.toObject(), id: saved._id });
  } catch (error) {
    res.status(400).json({ message: 'Error creating lead', error });
  }
};

const VALID_LEAD_STAGES: LeadStage[] = [
  'new',
  'contacted',
  'interested',
  'demo_scheduled',
  'follow_up',
  'requested_as_student',
  'converted',
  'lost',
];

function normalizeImportStage(raw: unknown): LeadStage {
  const value = String(raw || 'new')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (VALID_LEAD_STAGES.includes(value as LeadStage)) {
    return value as LeadStage;
  }
  return 'new';
}

export const importLeads = async (req: AuthRequest, res: Response) => {
  try {
    const importCheck = await assertFeature(req.user?.tenantId, 'allowLeadCsvImport', req.user?.role);
    if (!importCheck.ok) {
      return res.status(403).json({ message: importCheck.message, code: 'FEATURE_DISABLED' });
    }

    const { leads: rows } = req.body as { leads?: Array<Record<string, unknown>> };
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'leads array is required' });
    }
    if (rows.length > 500) {
      return res.status(400).json({ message: 'Maximum 500 leads per import' });
    }

    const tenantId = req.user?.tenantId || 'ERP';
    const bdeUsers = await loadBdeUsers(req.user?.tenantId);
    const dbUser = req.user?.role === 'bde' ? await User.findById(req.user.id) : null;

    const imported: Array<{ row: number; id: unknown; name: string; email: string }> = [];
    const skipped: Array<{ row: number; email?: string; reason: string }> = [];
    const failed: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      try {
        const name = String(row.name || '').trim();
        const email = String(row.email || '').trim().toLowerCase();
        const phone = String(row.phone || '').trim();
        const course = String(row.course || '').trim();

        if (!name || !email || !phone || !course) {
          failed.push({ row: rowNum, reason: 'name, email, phone, and course are required' });
          continue;
        }

        const existing = await Lead.findOne({
          email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          tenantId: tenantFilter(tenantId),
        });
        if (existing) {
          skipped.push({ row: rowNum, email, reason: 'Lead with this email already exists' });
          continue;
        }

        let assignedBdeId: string | undefined;
        let counsellor: string | undefined;
        const bdeName = String(row.bde || row.counsellor || '').trim();

        if (req.user?.role === 'bde') {
          assignedBdeId = String(req.user.id);
          counsellor = dbUser?.name || bdeName || '';
        } else if (bdeName) {
          const bde = bdeUsers.find((u) => normalizeName(u.name || '') === normalizeName(bdeName));
          if (bde) {
            assignedBdeId = String(bde._id);
            counsellor = bde.name;
          } else {
            counsellor = bdeName;
          }
        }

        const value = Number(row.value) || 0;
        const stage = normalizeImportStage(row.stage);
        const priorityRaw = String(row.priority || 'medium').trim().toLowerCase();
        const priority = ['low', 'medium', 'high'].includes(priorityRaw)
          ? (priorityRaw as 'low' | 'medium' | 'high')
          : 'medium';

        const lead = new Lead({
          tenantId,
          name,
          email,
          phone,
          course,
          stage,
          value,
          counsellor,
          assignedBdeId,
          city: row.city ? String(row.city).trim() : undefined,
          source: row.source ? String(row.source).trim() : undefined,
          priority,
          notes: [],
        });

        const saved = await lead.save();
        imported.push({ row: rowNum, id: saved._id, name, email });
      } catch {
        failed.push({ row: rowNum, reason: 'Invalid row data' });
      }
    }

    res.status(200).json({
      imported: imported.length,
      skipped: skipped.length,
      failed: failed.length,
      importedLeads: imported,
      skippedRows: skipped,
      failedRows: failed,
    });
  } catch (error) {
    res.status(400).json({ message: 'Error importing leads', error });
  }
};

export const updateLeadStage = async (req: AuthRequest, res: Response) => {
  try {
    const existing = await Lead.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (
      req.user?.role === 'bde' &&
      existing.stage === 'requested_as_student' &&
      req.body.stage !== 'requested_as_student'
    ) {
      return res.status(403).json({
        message: 'This lead is awaiting owner approval and cannot be moved to another stage yet.',
      });
    }

    if (
      req.user?.role === 'bde' &&
      (req.body.stage === 'converted' || req.body.stage === 'requested_as_student')
    ) {
      return res.status(403).json({
        message: 'BDEs cannot convert leads directly. Submit a conversion request for owner approval.',
      });
    }

    const updated = await Lead.findByIdAndUpdate(req.params.id, { stage: req.body.stage }, { returnDocument: 'after' });
    res.status(200).json({ ...updated?.toObject(), id: updated?._id });
  } catch (error) {
    res.status(400).json({ message: 'Error updating lead', error });
  }
};

export const updateLead = async (req: AuthRequest, res: Response) => {
  try {
    const existing = await Lead.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (
      req.user?.role === 'bde' &&
      existing.stage === 'requested_as_student' &&
      req.body.stage &&
      req.body.stage !== 'requested_as_student'
    ) {
      return res.status(403).json({
        message: 'This lead is awaiting owner approval and cannot be moved to another stage yet.',
      });
    }

    if (
      req.user?.role === 'bde' &&
      (req.body.stage === 'converted' || req.body.stage === 'requested_as_student')
    ) {
      return res.status(403).json({
        message: 'BDEs cannot convert leads directly. Submit a conversion request for owner approval.',
      });
    }

    const updated = await Lead.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    res.status(200).json({ ...updated?.toObject(), id: updated?._id });
  } catch (error) {
    res.status(400).json({ message: 'Error updating lead', error });
  }
};

export const deleteLead = async (req: AuthRequest, res: Response) => {
  try {
    await Lead.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ message: 'Error deleting lead', error });
  }
};

async function loadLeadsForFollowUps(req: AuthRequest) {
  if (req.user?.role === 'bde') {
    const dbUser = await User.findById(req.user.id);
    return fetchLeadsForBDE(String(req.user.id), dbUser?.name || '', req.user.tenantId);
  }

  const filter: Record<string, unknown> = {};
  if (req.user?.role === 'owner' && req.user.tenantId) {
    filter.tenantId = tenantFilter(req.user.tenantId);
  }
  return Lead.find(filter).sort({ createdAt: -1 });
}

function buildFollowUpTasks(
  leads: Array<{ _id: unknown; stage?: string; nextFollowUpDate?: string; assignedBdeId?: string }>,
  records: Array<{ toObject: () => Record<string, unknown>; _id: unknown; leadId: string; status: string }>,
  defaultBdeId: string
) {
  const today = new Date().toISOString().split('T')[0];
  const pendingByLead = new Set(
    records.filter((r) => r.status === 'pending').map((r) => String(r.leadId))
  );

  const fromDb = records.map((r) => ({ ...r.toObject(), id: r._id })) as Array<{
    id: unknown;
    nextFollowupDate?: string;
  }>;

  const synthesized = leads
    .filter((lead) => {
      const id = String(lead._id);
      if (pendingByLead.has(id)) return false;
      return lead.stage === 'follow_up' || !!lead.nextFollowUpDate;
    })
    .map((lead) => ({
      id: `lead-${String(lead._id)}`,
      leadId: String(lead._id),
      bdeId: lead.assignedBdeId || defaultBdeId,
      followupDate: lead.nextFollowUpDate || today,
      nextFollowupDate: lead.nextFollowUpDate || today,
      notes: 'Follow-up scheduled from CRM pipeline',
      status: 'pending',
      synthetic: true,
    }));

  return [...fromDb, ...synthesized].sort((a, b) =>
    String(a.nextFollowupDate || '').localeCompare(String(b.nextFollowupDate || ''))
  );
}

export const getFollowUps = async (req: AuthRequest, res: Response) => {
  try {
    const leads = await loadLeadsForFollowUps(req);
    const leadIds = leads.map((l) => String(l._id));

    const records = await FollowUp.find({ leadId: { $in: leadIds } }).sort({ nextFollowupDate: 1 });
    const tasks = buildFollowUpTasks(leads, records, String(req.user?.id || ''));
    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching follow-ups', error });
  }
};

export const createFollowUp = async (req: AuthRequest, res: Response) => {
  try {
    const { leadId, notes, nextFollowupDate, followupDate } = req.body;
    if (!leadId) {
      return res.status(400).json({ message: 'leadId is required' });
    }

    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const today = new Date().toISOString().split('T')[0];
    const bdeId =
      req.user?.role === 'bde'
        ? String(req.user.id)
        : String(lead.assignedBdeId || req.user?.id || '');

    const existing = await FollowUp.findOne({ leadId: String(leadId), status: 'pending' });
    if (existing) {
      existing.notes = notes || existing.notes;
      existing.nextFollowupDate = nextFollowupDate || existing.nextFollowupDate || today;
      await existing.save();
      return res.status(200).json({ ...existing.toObject(), id: existing._id });
    }

    const record = new FollowUp({
      leadId: String(leadId),
      bdeId,
      followupDate: followupDate || today,
      nextFollowupDate: nextFollowupDate || today,
      notes: notes || 'Follow-up scheduled',
      status: 'pending',
    });
    await record.save();

    if (lead.stage !== 'follow_up') {
      lead.stage = 'follow_up';
    }
    if (nextFollowupDate) {
      lead.nextFollowUpDate = nextFollowupDate;
    }
    await lead.save();

    res.status(201).json({ ...record.toObject(), id: record._id });
  } catch (error) {
    res.status(400).json({ message: 'Error creating follow-up', error });
  }
};

export const updateFollowUp = async (req: AuthRequest, res: Response) => {
  try {
    const { status, notes, nextFollowupDate } = req.body;
    const updated = await FollowUp.findByIdAndUpdate(
      req.params.id,
      {
        ...(status ? { status } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(nextFollowupDate ? { nextFollowupDate } : {}),
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Follow-up not found' });
    }

    if (nextFollowupDate) {
      await Lead.findByIdAndUpdate(updated.leadId, { nextFollowUpDate: nextFollowupDate });
    }

    res.status(200).json({ ...updated.toObject(), id: updated._id });
  } catch (error) {
    res.status(400).json({ message: 'Error updating follow-up', error });
  }
};


function defaultTalkDuration(outcome: string) {
  switch (outcome) {
    case 'connected':
      return 135;
    case 'busy':
      return 45;
    case 'switched_off':
      return 30;
    default:
      return 0;
  }
}

export const createCallLog = async (req: AuthRequest, res: Response) => {
  try {
    const dbUser = await User.findById(req.user?.id);
    const { leadId, leadName, talkDurationSeconds, outcome, notes } = req.body;

    if (!leadId || !leadName || !outcome) {
      return res.status(400).json({ message: 'leadId, leadName, and outcome are required' });
    }

    const now = new Date();
    const callDate = now.toISOString().slice(0, 10);
    const callTime = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const log = await CallLog.create({
      tenantId: req.user?.tenantId || 'IMS',
      bdeId: String(req.user?.id),
      bdeName: dbUser?.name || 'BDE',
      leadId: String(leadId),
      leadName,
      callDate,
      callTime,
      talkDurationSeconds:
        typeof talkDurationSeconds === 'number'
          ? talkDurationSeconds
          : defaultTalkDuration(outcome),
      outcome,
      notes: notes || '',
    });

    res.status(201).json({ ...log.toObject(), id: log._id });
  } catch (error) {
    res.status(400).json({ message: 'Error creating call log', error });
  }
};

export const getTasks = async (req: AuthRequest, res: Response) => {
  try {
    const filter: any = {};
    if (req.user?.role === 'bde') {
      filter.bdeId = req.user.id;
    }
    const tasks = await BDETask.find(filter).sort({ dueDate: 1 });
    res.status(200).json(tasks.map(t => ({ ...t.toObject(), id: t._id })));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching tasks', error });
  }
};

export const updateTaskStatus = async (req: AuthRequest, res: Response) => {
  try {
    const updated = await BDETask.findByIdAndUpdate(req.params.id, { status: req.body.status }, { returnDocument: 'after' });
    res.status(200).json({ ...updated?.toObject(), id: updated?._id });
  } catch (error) {
    res.status(400).json({ message: 'Error updating task', error });
  }
};

export const punchAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const { action } = req.body as { action: ShiftAction };
    if (!action || !['login', 'pause', 'resume', 'logout'].includes(action)) {
      return res.status(400).json({ message: 'action must be login, pause, resume, or logout' });
    }

    const userId = String(req.user?.id);
    const tenantId = req.user?.tenantId || 'ERP';
    const user = await User.findById(userId);
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const nowIso = now.toISOString();
    const nowLabel = formatShiftTime(now);

    const filter = { tenantId, date: today, type: 'bde' as const, entityId: userId };

    if (action === 'login') {
      const existing = await Attendance.findOne(filter);
      if (existing?.shiftStatus === 'finished' || existing?.logoutAt) {
        return res.status(400).json({ message: 'Shift already completed for today' });
      }

      const record = await Attendance.findOneAndUpdate(
        filter,
        {
          name: user?.name || 'BDE',
          status: 'present',
          shiftStatus: 'active',
          loginAt: nowIso,
          loginTime: nowLabel,
          logoutAt: null,
          logoutTime: null,
          pausedAt: null,
          totalPausedSeconds: existing?.totalPausedSeconds ?? 0,
        },
        { upsert: true, returnDocument: 'after' }
      );

      return res.status(200).json(buildShiftPayload(record.toObject()));
    }

    const record = await Attendance.findOne(filter);
    if (!record?.loginAt) {
      return res.status(400).json({ message: 'Punch in before using pause or logout' });
    }

    if (record.shiftStatus === 'finished' || record.logoutAt) {
      return res.status(400).json({ message: 'Shift already completed for today' });
    }

    if (action === 'pause') {
      if (record.shiftStatus === 'paused') {
        return res.status(400).json({ message: 'Shift is already paused' });
      }

      const updated = await Attendance.findOneAndUpdate(
        filter,
        { shiftStatus: 'paused', pausedAt: nowIso },
        { returnDocument: 'after' }
      );

      return res.status(200).json(buildShiftPayload(updated!.toObject()));
    }

    if (action === 'resume') {
      if (record.shiftStatus !== 'paused' || !record.pausedAt) {
        return res.status(400).json({ message: 'Shift is not paused' });
      }

      const pauseDuration = Math.floor((now.getTime() - new Date(record.pausedAt).getTime()) / 1000);
      const updated = await Attendance.findOneAndUpdate(
        filter,
        {
          shiftStatus: 'active',
          pausedAt: null,
          totalPausedSeconds: (record.totalPausedSeconds ?? 0) + pauseDuration,
        },
        { returnDocument: 'after' }
      );

      return res.status(200).json(buildShiftPayload(updated!.toObject()));
    }

    let totalPaused = record.totalPausedSeconds ?? 0;
    if (record.shiftStatus === 'paused' && record.pausedAt) {
      totalPaused += Math.floor((now.getTime() - new Date(record.pausedAt).getTime()) / 1000);
    }

    const updated = await Attendance.findOneAndUpdate(
      filter,
      {
        shiftStatus: 'finished',
        logoutAt: nowIso,
        logoutTime: nowLabel,
        pausedAt: null,
        totalPausedSeconds: totalPaused,
      },
      { returnDocument: 'after' }
    );

    return res.status(200).json(buildShiftPayload(updated!.toObject()));
  } catch (error) {
    res.status(400).json({ message: 'Error updating attendance', error });
  }
};

export const resetShiftAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.user?.id);
    const tenantId = req.user?.tenantId || 'ERP';
    const today = new Date().toISOString().split('T')[0];

    await Attendance.deleteOne({
      tenantId,
      date: today,
      type: 'bde',
      entityId: userId,
    });

    return res.status(200).json({ message: 'Shift reset successfully', attendance: null });
  } catch (error) {
    res.status(400).json({ message: 'Error resetting shift', error });
  }
};

export const getBdePerformance = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'bde') {
      return res.status(403).json({ message: 'Only BDEs can access performance dashboard data' });
    }

    const userId = String(req.user.id);
    const tenantId = req.user.tenantId;
    const dbUser = await User.findById(userId);
    const bdeName = dbUser?.name || '';

    const monthsBack = Math.min(Math.max(Number(req.query.months) || 12, 1), 24);

    const [myLeads, profile, centers] = await Promise.all([
      fetchLeadsForBDE(userId, bdeName, tenantId),
      BDEProfile.findOne({ userId }),
      tenantId ? Center.find({ tenantName: tenantFilter(tenantId) }).limit(1) : Center.find().limit(1),
    ]);

    const monthlyTarget = profile?.monthlyTarget ?? 30;
    const targetType = profile?.targetType ?? 'leads';
    const commissionConfig = buildBdeCommissionConfig(profile?.toObject?.() ?? profile);
    const employeeIds = [userId, profile?.employeeId].filter(Boolean) as string[];

    const payrollRecords = await HRPayroll.find({
      employeeId: { $in: employeeIds },
      employeeType: 'bde',
    }).sort({ month: 1 });

    const payrollByMonth: Record<string, { status?: string; commissionAdd?: number; incentiveAdd?: number }> =
      {};
    for (const record of payrollRecords) {
      payrollByMonth[record.month] = {
        status: record.status,
        commissionAdd: record.commissionAdd,
        incentiveAdd: record.incentiveAdd,
      };
    }

    const currentMetrics = computeBdeMetrics(
      myLeads,
      monthlyTarget,
      targetType,
      commissionConfig
    );

    const currentMonth = buildRecentMonths(0).slice(-1)[0];
    const convertedThisMonth = myLeads.filter((lead) => {
      if (lead.stage !== 'converted') return false;
      const leadObj = lead.toObject() as { updatedAt?: Date; createdAt?: Date };
      const stamp = new Date(leadObj.updatedAt || leadObj.createdAt || 0);
      return monthKeyFromDate(stamp) === currentMonth;
    });
    const monthlyConverted = convertedThisMonth.length;
    const monthlyRevenue = convertedThisMonth.reduce((sum, lead) => sum + (lead.value || 0), 0);
    const monthlyAchieved = targetType === 'revenue' ? monthlyRevenue : monthlyConverted;
    const monthlyRemaining = Math.max(0, monthlyTarget - monthlyAchieved);
    const monthlyIncentive = calculateBdeCommission(
      monthlyRevenue,
      monthlyTarget,
      targetType,
      monthlyConverted,
      commissionConfig
    );
    const monthlyTargetPercent =
      monthlyTarget > 0 ? Math.min(Math.round((monthlyAchieved / monthlyTarget) * 100), 100) : 0;

    const joinDate = profile?.joiningDate
      ? new Date(profile.joiningDate)
      : new Date((dbUser?.toObject() as { createdAt?: Date }).createdAt || Date.now());

    const history = computeBdeMonthlyHistory(
      myLeads,
      monthlyTarget,
      targetType,
      commissionConfig,
      joinDate,
      payrollByMonth,
      monthsBack
    );

    const center = centers[0];
    const centerLabel = center
      ? `${center.name}${center.location ? ` • ${center.location}` : ''}`
      : tenantId || 'Main Campus';

    res.status(200).json({
      profile: {
        employeeId: profile?.employeeId || `EMP-${userId.substring(0, 6)}`,
        centerName: centerLabel,
        monthlyTarget,
        targetType,
        commissionEnabled: commissionConfig.commissionEnabled,
        commissionPercentage: commissionConfig.commissionPercentage,
        commissionApplyFrom: commissionConfig.commissionApplyFrom,
        commissionThreshold: commissionConfig.commissionThreshold,
        joiningDate: joinDate.toISOString().split('T')[0],
      },
      current: {
        achievedCount: monthlyAchieved,
        targetCount: monthlyTarget,
        targetPercent: monthlyTargetPercent,
        remaining: monthlyRemaining,
        revenue: monthlyRevenue,
        incentive: monthlyIncentive,
        conversionRate: currentMetrics.conversionRate,
        totalAssigned: currentMetrics.totalAssigned,
        convertedLeads: currentMetrics.convertedLeads,
      },
      history,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching BDE performance data', error });
  }
};
