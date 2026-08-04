"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDocument = exports.assignSubstitute = exports.updateClaimStatus = exports.createClaim = exports.upsertCommissionRule = exports.updatePayrollStatus = exports.submitPayroll = exports.getHROverview = void 0;
const Trainer_1 = __importDefault(require("../models/Trainer"));
const User_1 = __importDefault(require("../models/User"));
const BDEProfile_1 = __importDefault(require("../models/BDEProfile"));
const Batch_1 = __importDefault(require("../models/Batch"));
const Attendance_1 = __importDefault(require("../models/Attendance"));
const Lead_1 = __importDefault(require("../models/Lead"));
const HRPayroll_1 = __importDefault(require("../models/HRPayroll"));
const HRCommissionRule_1 = __importDefault(require("../models/HRCommissionRule"));
const HRClaim_1 = __importDefault(require("../models/HRClaim"));
const HRSubstitute_1 = __importDefault(require("../models/HRSubstitute"));
const HRDocument_1 = __importDefault(require("../models/HRDocument"));
const hrStats_1 = require("../utils/hrStats");
function tenantFilter(tenantId) {
    if (!tenantId)
        return {};
    const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { tenantId: { $regex: new RegExp(`^${escaped}\\s*$`, 'i') } };
}
async function loadBdes(tenantId, role) {
    const filter = { role: 'bde' };
    if (role !== 'super_admin' && tenantId) {
        filter.tenantId = tenantId;
    }
    const users = await User_1.default.find(filter);
    const profiles = await BDEProfile_1.default.find({ userId: { $in: users.map((u) => u._id) } });
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
const getHROverview = async (req, res) => {
    try {
        const isSuperAdmin = req.user?.role === 'super_admin';
        // Owners must stay tenant-scoped — otherwise payroll lists trainers from every center.
        const staffFilter = isSuperAdmin ? {} : tenantFilter(req.user?.tenantId);
        const persistFilter = tenantFilter(req.user?.tenantId);
        const month = req.query.month || (0, hrStats_1.currentMonthPrefix)();
        const [trainers, bdes, batches, attendanceRecords, leads, payrollRecords, commissionRules, claims, substitutes, documents] = await Promise.all([
            Trainer_1.default.find(staffFilter).sort({ createdAt: -1 }),
            loadBdes(req.user?.tenantId, req.user?.role),
            Batch_1.default.find(staffFilter),
            Attendance_1.default.find(isSuperAdmin
                ? { type: { $in: ['trainer', 'bde'] } }
                : { ...persistFilter, type: { $in: ['trainer', 'bde'] } }),
            Lead_1.default.find(staffFilter),
            HRPayroll_1.default.find({ ...persistFilter, month }),
            HRCommissionRule_1.default.find(persistFilter),
            HRClaim_1.default.find(persistFilter).sort({ createdAt: -1 }),
            HRSubstitute_1.default.find(persistFilter),
            HRDocument_1.default.find(persistFilter).sort({ createdAt: -1 }),
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
        const employees = (0, hrStats_1.buildEmployees)(trainerPayload, bdes, batchPayload, attendancePayload, leadPayload, month);
        const rules = (0, hrStats_1.buildCommissionRules)(trainerPayload, storedRules);
        const substitutePayload = substitutes.map((s) => ({
            batchId: s.batchId,
            substituteTrainerId: s.substituteTrainerId,
            substituteTrainerName: s.substituteTrainerName,
            conflictWarning: s.conflictWarning,
        }));
        const schedules = (0, hrStats_1.buildSchedules)(batchPayload, substitutePayload, trainerPayload);
        const autoDrafts = (0, hrStats_1.buildAutoPayrollDrafts)(employees, rules, month);
        const payroll = autoDrafts.map((draft) => {
            const stored = payrollRecords.find((p) => p.employeeId === draft.employeeId);
            if (!stored)
                return { ...draft, id: `draft-${draft.employeeId}` };
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
        const trainerDocs = (0, hrStats_1.buildVaultDocs)(trainerPayload, employees);
        const storedDocs = documents.map((d) => ({
            id: d._id.toString(),
            employeeId: d.employeeId,
            name: d.name,
            category: d.category,
            uploadDate: d.uploadDate,
            size: d.size,
            url: d.url,
        }));
        const summary = (0, hrStats_1.buildSummary)(employees, payroll, claims, schedules, month);
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
            departmentDistribution: (0, hrStats_1.buildDepartmentDistribution)(employees),
            leaveUtilization: (0, hrStats_1.buildLeaveUtilization)(employees),
            alerts: (0, hrStats_1.buildAlerts)(employees, rules, schedules, summary),
            aiInsights: (0, hrStats_1.buildAiInsights)(employees, summary),
        });
    }
    catch (error) {
        console.error('Error fetching HR overview:', error);
        res.status(500).json({
            message: 'Error fetching HR overview',
            error: error instanceof Error ? error.message : error,
        });
    }
};
exports.getHROverview = getHROverview;
const submitPayroll = async (req, res) => {
    try {
        const { employeeId, employeeType, month, baseSalary, lateArrivalDeduction, unpaidLeaveDeduction, overtimeAdd, commissionAdd, incentiveAdd, grossPayout, netPayout, } = req.body;
        if (!employeeId || !month) {
            return res.status(400).json({ message: 'employeeId and month are required' });
        }
        const today = new Date().toISOString().split('T')[0];
        const snapshot = {
            employeeId: String(employeeId),
            employeeType: (employeeType === 'bde' ? 'bde' : 'trainer'),
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
        const existing = await HRPayroll_1.default.findOne({
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
        const created = await HRPayroll_1.default.create({
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
    }
    catch (error) {
        res.status(500).json({ message: 'Error submitting payroll', error });
    }
};
exports.submitPayroll = submitPayroll;
const updatePayrollStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, timelineEntry } = req.body;
        const payroll = await HRPayroll_1.default.findById(id);
        if (!payroll)
            return res.status(404).json({ message: 'Payroll record not found' });
        payroll.status = status;
        if (timelineEntry) {
            payroll.timeline = [...(payroll.timeline || []), timelineEntry];
        }
        await payroll.save();
        res.status(200).json({ ...payroll.toObject(), id: payroll._id });
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating payroll', error });
    }
};
exports.updatePayrollStatus = updatePayrollStatus;
const upsertCommissionRule = async (req, res) => {
    try {
        const { employeeId, ...rest } = req.body;
        const rule = await HRCommissionRule_1.default.findOneAndUpdate({ employeeId }, { ...rest, employeeId, tenantId: req.user?.tenantId }, { upsert: true, returnDocument: 'after' });
        res.status(200).json({ ...rule?.toObject(), id: rule?._id });
    }
    catch (error) {
        res.status(500).json({ message: 'Error saving commission rule', error });
    }
};
exports.upsertCommissionRule = upsertCommissionRule;
const createClaim = async (req, res) => {
    try {
        const claim = await HRClaim_1.default.create({ ...req.body, tenantId: req.user?.tenantId });
        res.status(201).json({ ...claim.toObject(), id: claim._id });
    }
    catch (error) {
        res.status(500).json({ message: 'Error creating claim', error });
    }
};
exports.createClaim = createClaim;
const updateClaimStatus = async (req, res) => {
    try {
        const claim = await HRClaim_1.default.findByIdAndUpdate(req.params.id, { status: req.body.status }, { returnDocument: 'after' });
        if (!claim)
            return res.status(404).json({ message: 'Claim not found' });
        res.status(200).json({ ...claim.toObject(), id: claim._id });
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating claim', error });
    }
};
exports.updateClaimStatus = updateClaimStatus;
const assignSubstitute = async (req, res) => {
    try {
        const { batchId, trainerId, trainerName, batchName, roomName, startTime, endTime, dayOfWeek, substituteTrainerId, substituteTrainerName, conflictWarning } = req.body;
        const sub = await HRSubstitute_1.default.findOneAndUpdate({ batchId }, {
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
        }, { upsert: true, returnDocument: 'after' });
        res.status(200).json({ ...sub?.toObject(), id: sub?._id });
    }
    catch (error) {
        res.status(500).json({ message: 'Error assigning substitute', error });
    }
};
exports.assignSubstitute = assignSubstitute;
const createDocument = async (req, res) => {
    try {
        const doc = await HRDocument_1.default.create({ ...req.body, tenantId: req.user?.tenantId });
        res.status(201).json({ ...doc.toObject(), id: doc._id });
    }
    catch (error) {
        res.status(500).json({ message: 'Error uploading document', error });
    }
};
exports.createDocument = createDocument;
