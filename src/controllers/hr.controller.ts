import { Response } from 'express';
import Trainer from '../models/Trainer';
import User from '../models/User';
import BDEProfile from '../models/BDEProfile';
import Batch from '../models/Batch';
import Attendance from '../models/Attendance';
import Lead from '../models/Lead';
import HRPayroll from '../models/HRPayroll';
import HRCommissionRule from '../models/HRCommissionRule';
import HRClaim from '../models/HRClaim';
import HRSubstitute from '../models/HRSubstitute';
import HRDocument from '../models/HRDocument';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  buildEmployees,
  buildSchedules,
  buildDepartmentDistribution,
  buildLeaveUtilization,
  buildAlerts,
  buildAiInsights,
  buildVaultDocs,
  buildCommissionRules,
  buildAutoPayrollDrafts,
  buildSummary,
  currentMonthPrefix,
} from '../utils/hrStats';

function tenantFilter(tenantId?: string) {
  if (!tenantId) return {};
  const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { tenantId: { $regex: new RegExp(`^${escaped}\\s*$`, 'i') } };
}

async function loadBdes(tenantId?: string, role?: string) {
  const filter: Record<string, unknown> = { role: 'bde' };
  if (role !== 'super_admin' && tenantId) {
    filter.tenantId = tenantId;
  }
  const users = await User.find(filter);
  const profiles = await BDEProfile.find({ userId: { $in: users.map((u) => u._id) } });
  return users.map((user) => {
    const profile = profiles.find((p) => p.userId.toString() === user._id.toString());
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      joiningDate: profile?.joiningDate ? profile.joiningDate.toISOString().split('T')[0] : '',
      monthlyTarget: profile?.monthlyTarget || 30,
      targetType: profile?.targetType || 'leads',
      commissionPercentage: profile?.commissionPercentage || 5,
      commissionEnabled: profile?.commissionEnabled || false,
      status: profile?.status || 'active',
    };
  });
}

export const getHROverview = async (req: AuthRequest, res: Response) => {
  try {
    const isSuperAdmin = req.user?.role === 'super_admin';
    // Owners must stay tenant-scoped — otherwise payroll lists trainers from every center.
    const staffFilter = isSuperAdmin ? {} : tenantFilter(req.user?.tenantId);
    const persistFilter = tenantFilter(req.user?.tenantId);
    const month = (req.query.month as string) || currentMonthPrefix();

    const [trainers, bdes, batches, attendanceRecords, leads, payrollRecords, commissionRules, claims, substitutes, documents] =
      await Promise.all([
        Trainer.find(staffFilter).sort({ createdAt: -1 }),
        loadBdes(req.user?.tenantId, req.user?.role),
        Batch.find(staffFilter),
        Attendance.find(
          isSuperAdmin
            ? { type: { $in: ['trainer', 'bde'] } }
            : { ...persistFilter, type: { $in: ['trainer', 'bde'] } }
        ),
        Lead.find(staffFilter),
        HRPayroll.find({ ...persistFilter, month }),
        HRCommissionRule.find(persistFilter),
        HRClaim.find(persistFilter).sort({ createdAt: -1 }),
        HRSubstitute.find(persistFilter),
        HRDocument.find(persistFilter).sort({ createdAt: -1 }),
      ]);

    const trainerPayload = trainers.map((t) => ({ ...t.toObject(), id: t._id.toString() }));
    const batchPayload = batches.map((b) => ({ ...b.toObject(), id: b._id.toString() }));
    const attendancePayload = attendanceRecords.map((a) => ({ ...a.toObject(), id: a._id.toString() }));
    const leadPayload = leads.map((l) => ({ ...l.toObject(), id: l._id.toString() }));

    const storedRules = commissionRules.map((r) => ({
      employeeId: r.employeeId,
      perBatchPayout: r.perBatchPayout,
      perStudentPayout: r.perStudentPayout,
      attendanceBonusThreshold: r.attendanceBonusThreshold,
      attendanceBonusAmount: r.attendanceBonusAmount,
      studentFeedbackBonusThreshold: r.studentFeedbackBonusThreshold,
      studentFeedbackBonusAmount: r.studentFeedbackBonusAmount,
      retentionIncentivePct: r.retentionIncentivePct,
    }));

    const employees = buildEmployees(trainerPayload as any, bdes, batchPayload as any, attendancePayload as any, leadPayload as any, month);
    const rules = buildCommissionRules(trainerPayload as any, storedRules);
    const substitutePayload = substitutes.map((s) => ({
      batchId: s.batchId,
      substituteTrainerId: s.substituteTrainerId,
      substituteTrainerName: s.substituteTrainerName,
      conflictWarning: s.conflictWarning,
    }));
    const schedules = buildSchedules(batchPayload as any, substitutePayload, trainerPayload as any);
    const autoDrafts = buildAutoPayrollDrafts(employees, rules, month);

    const payroll = autoDrafts.map((draft) => {
      const stored = payrollRecords.find((p) => p.employeeId === draft.employeeId);
      if (!stored) return { ...draft, id: `draft-${draft.employeeId}` };
      return {
        id: stored._id.toString(),
        employeeId: stored.employeeId,
        employeeType: stored.employeeType,
        month: stored.month,
        baseSalary: stored.baseSalary,
        lateArrivalDeduction: stored.lateArrivalDeduction,
        unpaidLeaveDeduction: stored.unpaidLeaveDeduction,
        overtimeAdd: stored.overtimeAdd,
        commissionAdd: stored.commissionAdd,
        incentiveAdd: stored.incentiveAdd,
        grossPayout: stored.grossPayout,
        netPayout: stored.netPayout,
        unpaidDays: draft.unpaidDays,
        lateDays: draft.lateDays,
        status: stored.status,
        timeline: stored.timeline,
      };
    });

    const trainerDocs = buildVaultDocs(trainerPayload as any, employees);
    const storedDocs = documents.map((d) => ({
      id: d._id.toString(),
      employeeId: d.employeeId,
      name: d.name,
      category: d.category,
      uploadDate: d.uploadDate,
      size: d.size,
      url: d.url,
    }));

    const summary = buildSummary(employees, payroll, claims, schedules, month);

    res.status(200).json({
      month,
      summary,
      employees,
      payroll,
      commissionRules: rules,
      claims: claims.map((c) => ({
        id: c._id.toString(),
        employeeId: c.employeeId,
        employeeName: c.employeeName,
        title: c.title,
        amount: c.amount,
        category: c.category,
        status: c.status,
        billUrl: c.billUrl,
        date: c.date,
      })),
      schedules: schedules.map((s) => ({
        id: s.id,
        batchId: s.batchId,
        trainerId: s.trainerId,
        trainerName: s.substituteTrainerName ? `${s.trainerName} (Sub: ${s.substituteTrainerName})` : s.trainerName,
        batchName: s.batchName,
        roomName: s.roomName,
        startTime: s.startTime,
        endTime: s.endTime,
        dayOfWeek: s.dayOfWeek,
        substituteTrainerId: s.substituteTrainerId,
        conflictWarning: s.conflictWarning,
      })),
      vaultDocs: [...storedDocs, ...trainerDocs.filter((d) => !storedDocs.some((s) => s.name === d.name))],
      departmentDistribution: buildDepartmentDistribution(employees),
      leaveUtilization: buildLeaveUtilization(employees),
      alerts: buildAlerts(employees, rules, schedules, summary),
      aiInsights: buildAiInsights(employees, summary),
    });
  } catch (error) {
    console.error('Error fetching HR overview:', error);
    res.status(500).json({
      message: 'Error fetching HR overview',
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const submitPayroll = async (req: AuthRequest, res: Response) => {
  try {
    const {
      employeeId,
      employeeType,
      month,
      baseSalary,
      lateArrivalDeduction,
      unpaidLeaveDeduction,
      overtimeAdd,
      commissionAdd,
      incentiveAdd,
      grossPayout,
      netPayout,
    } = req.body;

    if (!employeeId || !month) {
      return res.status(400).json({ message: 'employeeId and month are required' });
    }

    const today = new Date().toISOString().split('T')[0];
    const snapshot = {
      employeeId: String(employeeId),
      employeeType: (employeeType === 'bde' ? 'bde' : 'trainer') as 'trainer' | 'bde',
      month: String(month),
      baseSalary: Number(baseSalary) || 0,
      lateArrivalDeduction: Number(lateArrivalDeduction) || 0,
      unpaidLeaveDeduction: Number(unpaidLeaveDeduction) || 0,
      overtimeAdd: Number(overtimeAdd) || 0,
      commissionAdd: Number(commissionAdd) || 0,
      incentiveAdd: Number(incentiveAdd) || 0,
      grossPayout: Number(grossPayout) || 0,
      netPayout: Number(netPayout) || 0,
      tenantId: req.user?.tenantId,
    };

    const existing = await HRPayroll.findOne({
      employeeId: snapshot.employeeId,
      month: snapshot.month,
      ...tenantFilter(req.user?.tenantId),
    });

    if (existing) {
      Object.assign(existing, snapshot);
      existing.status = 'Pending Approval';
      existing.timeline = [
        ...(existing.timeline || []),
        {
          title: 'Submitted for approval',
          date: today,
          description: `Snapshot saved · net ₹${snapshot.netPayout.toLocaleString('en-IN')}`,
        },
      ];
      await existing.save();
      return res.status(200).json({ ...existing.toObject(), id: existing._id });
    }

    const created = await HRPayroll.create({
      ...snapshot,
      status: 'Pending Approval',
      timeline: [
        {
          title: 'Submitted for approval',
          date: today,
          description: `Auto-calculated from attendance, batches, and commission rules · net ₹${snapshot.netPayout.toLocaleString('en-IN')}`,
        },
      ],
    });
    res.status(201).json({ ...created.toObject(), id: created._id });
  } catch (error) {
    res.status(500).json({ message: 'Error submitting payroll', error });
  }
};

export const updatePayrollStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, timelineEntry } = req.body;
    const payroll = await HRPayroll.findById(id);
    if (!payroll) return res.status(404).json({ message: 'Payroll record not found' });
    payroll.status = status;
    if (timelineEntry) {
      payroll.timeline = [...(payroll.timeline || []), timelineEntry];
    }
    await payroll.save();
    res.status(200).json({ ...payroll.toObject(), id: payroll._id });
  } catch (error) {
    res.status(500).json({ message: 'Error updating payroll', error });
  }
};

export const upsertCommissionRule = async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId, ...rest } = req.body;
    const rule = await HRCommissionRule.findOneAndUpdate(
      { employeeId },
      { ...rest, employeeId, tenantId: req.user?.tenantId },
      { upsert: true, returnDocument: 'after' }
    );
    res.status(200).json({ ...rule?.toObject(), id: rule?._id });
  } catch (error) {
    res.status(500).json({ message: 'Error saving commission rule', error });
  }
};

export const createClaim = async (req: AuthRequest, res: Response) => {
  try {
    const claim = await HRClaim.create({ ...req.body, tenantId: req.user?.tenantId });
    res.status(201).json({ ...claim.toObject(), id: claim._id });
  } catch (error) {
    res.status(500).json({ message: 'Error creating claim', error });
  }
};

export const updateClaimStatus = async (req: AuthRequest, res: Response) => {
  try {
    const claim = await HRClaim.findByIdAndUpdate(req.params.id, { status: req.body.status }, { returnDocument: 'after' });
    if (!claim) return res.status(404).json({ message: 'Claim not found' });
    res.status(200).json({ ...claim.toObject(), id: claim._id });
  } catch (error) {
    res.status(500).json({ message: 'Error updating claim', error });
  }
};

export const assignSubstitute = async (req: AuthRequest, res: Response) => {
  try {
    const { batchId, trainerId, trainerName, batchName, roomName, startTime, endTime, dayOfWeek, substituteTrainerId, substituteTrainerName, conflictWarning } = req.body;
    const sub = await HRSubstitute.findOneAndUpdate(
      { batchId },
      {
        batchId,
        trainerId,
        trainerName,
        batchName,
        roomName,
        startTime,
        endTime,
        dayOfWeek,
        substituteTrainerId,
        substituteTrainerName,
        conflictWarning,
        tenantId: req.user?.tenantId,
      },
      { upsert: true, returnDocument: 'after' }
    );
    res.status(200).json({ ...sub?.toObject(), id: sub?._id });
  } catch (error) {
    res.status(500).json({ message: 'Error assigning substitute', error });
  }
};

export const createDocument = async (req: AuthRequest, res: Response) => {
  try {
    const doc = await HRDocument.create({ ...req.body, tenantId: req.user?.tenantId });
    res.status(201).json({ ...doc.toObject(), id: doc._id });
  } catch (error) {
    res.status(500).json({ message: 'Error uploading document', error });
  }
};
