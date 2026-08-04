"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBdePerformance = exports.resetShiftAttendance = exports.punchAttendance = exports.updateTaskStatus = exports.getTasks = exports.createCallLog = exports.updateFollowUp = exports.createFollowUp = exports.getFollowUps = exports.deleteLead = exports.updateLead = exports.updateLeadStage = exports.importLeads = exports.createLead = exports.getLeads = void 0;
const Lead_1 = __importDefault(require("../models/Lead"));
const BDETask_1 = __importDefault(require("../models/BDETask"));
const FollowUp_1 = __importDefault(require("../models/FollowUp"));
const CallLog_1 = __importDefault(require("../models/CallLog"));
const Attendance_1 = __importDefault(require("../models/Attendance"));
const User_1 = __importDefault(require("../models/User"));
const bdeStats_1 = require("../utils/bdeStats");
const BDEProfile_1 = __importDefault(require("../models/BDEProfile"));
const Center_1 = __importDefault(require("../models/Center"));
const HRPayroll_1 = __importDefault(require("../models/HRPayroll"));
const shiftTimer_1 = require("../utils/shiftTimer");
const centerPolicy_1 = require("../utils/centerPolicy");
const outreach_service_1 = require("../services/leadChatbot/outreach.service");
const getLeads = async (req, res) => {
    try {
        if (req.user?.role === 'bde') {
            const dbUser = await User_1.default.findById(req.user.id);
            const leads = await (0, bdeStats_1.fetchLeadsForBDE)(String(req.user.id), dbUser?.name || '', req.user.tenantId);
            return res.status(200).json(await (0, bdeStats_1.formatLeadsForResponse)(leads, req.user.tenantId));
        }
        const filter = {};
        if (req.user?.role === 'owner' && req.user.tenantId) {
            filter.tenantId = (0, bdeStats_1.tenantFilter)(req.user.tenantId);
        }
        const leads = await Lead_1.default.find(filter).sort({ createdAt: -1 });
        res.status(200).json(await (0, bdeStats_1.formatLeadsForResponse)(leads, req.user?.tenantId));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Error fetching leads';
        console.error('[getLeads]', message, error);
        res.status(500).json({ message: `Error fetching leads: ${message}` });
    }
};
exports.getLeads = getLeads;
const createLead = async (req, res) => {
    try {
        const leadData = { ...req.body };
        if (req.user?.tenantId && !leadData.tenantId) {
            leadData.tenantId = req.user.tenantId;
        }
        if (req.user?.role === 'bde') {
            const dbUser = await User_1.default.findById(req.user.id);
            leadData.assignedBdeId = String(req.user.id);
            if (!leadData.counsellor) {
                leadData.counsellor = dbUser?.name || '';
            }
        }
        const lead = new Lead_1.default(leadData);
        const saved = await lead.save();
        (0, outreach_service_1.queueOutreachForLead)(String(saved._id));
        res.status(201).json({ ...saved.toObject(), id: saved._id });
    }
    catch (error) {
        res.status(400).json({ message: 'Error creating lead', error });
    }
};
exports.createLead = createLead;
const VALID_LEAD_STAGES = [
    'new',
    'contacted',
    'interested',
    'demo_scheduled',
    'follow_up',
    'requested_as_student',
    'converted',
    'lost',
];
function normalizeImportStage(raw) {
    const value = String(raw || 'new')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
    if (VALID_LEAD_STAGES.includes(value)) {
        return value;
    }
    return 'new';
}
const importLeads = async (req, res) => {
    try {
        const importCheck = await (0, centerPolicy_1.assertFeature)(req.user?.tenantId, 'allowLeadCsvImport', req.user?.role);
        if (!importCheck.ok) {
            return res.status(403).json({ message: importCheck.message, code: 'FEATURE_DISABLED' });
        }
        const { leads: rows } = req.body;
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ message: 'leads array is required' });
        }
        if (rows.length > 500) {
            return res.status(400).json({ message: 'Maximum 500 leads per import' });
        }
        const tenantId = req.user?.tenantId || 'ERP';
        const bdeUsers = await (0, bdeStats_1.loadBdeUsers)(req.user?.tenantId);
        const dbUser = req.user?.role === 'bde' ? await User_1.default.findById(req.user.id) : null;
        const imported = [];
        const skipped = [];
        const failed = [];
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
                const existing = await Lead_1.default.findOne({
                    email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                    tenantId: (0, bdeStats_1.tenantFilter)(tenantId),
                });
                if (existing) {
                    skipped.push({ row: rowNum, email, reason: 'Lead with this email already exists' });
                    continue;
                }
                let assignedBdeId;
                let counsellor;
                const bdeName = String(row.bde || row.counsellor || '').trim();
                if (req.user?.role === 'bde') {
                    assignedBdeId = String(req.user.id);
                    counsellor = dbUser?.name || bdeName || '';
                }
                else if (bdeName) {
                    const bde = bdeUsers.find((u) => (0, bdeStats_1.normalizeName)(u.name || '') === (0, bdeStats_1.normalizeName)(bdeName));
                    if (bde) {
                        assignedBdeId = String(bde._id);
                        counsellor = bde.name;
                    }
                    else {
                        counsellor = bdeName;
                    }
                }
                const value = Number(row.value) || 0;
                const stage = normalizeImportStage(row.stage);
                const priorityRaw = String(row.priority || 'medium').trim().toLowerCase();
                const priority = ['low', 'medium', 'high'].includes(priorityRaw)
                    ? priorityRaw
                    : 'medium';
                const lead = new Lead_1.default({
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
                (0, outreach_service_1.queueOutreachForLead)(String(saved._id));
            }
            catch {
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
    }
    catch (error) {
        res.status(400).json({ message: 'Error importing leads', error });
    }
};
exports.importLeads = importLeads;
const updateLeadStage = async (req, res) => {
    try {
        const existing = await Lead_1.default.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({ message: 'Lead not found' });
        }
        if (req.user?.role === 'bde' &&
            existing.stage === 'requested_as_student' &&
            req.body.stage !== 'requested_as_student') {
            return res.status(403).json({
                message: 'This lead is awaiting owner approval and cannot be moved to another stage yet.',
            });
        }
        if (req.user?.role === 'bde' &&
            (req.body.stage === 'converted' || req.body.stage === 'requested_as_student')) {
            return res.status(403).json({
                message: 'BDEs cannot convert leads directly. Submit a conversion request for owner approval.',
            });
        }
        const updated = await Lead_1.default.findByIdAndUpdate(req.params.id, { stage: req.body.stage }, { returnDocument: 'after' });
        res.status(200).json({ ...updated?.toObject(), id: updated?._id });
    }
    catch (error) {
        res.status(400).json({ message: 'Error updating lead', error });
    }
};
exports.updateLeadStage = updateLeadStage;
const updateLead = async (req, res) => {
    try {
        const existing = await Lead_1.default.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({ message: 'Lead not found' });
        }
        if (req.user?.role === 'bde' &&
            existing.stage === 'requested_as_student' &&
            req.body.stage &&
            req.body.stage !== 'requested_as_student') {
            return res.status(403).json({
                message: 'This lead is awaiting owner approval and cannot be moved to another stage yet.',
            });
        }
        if (req.user?.role === 'bde' &&
            (req.body.stage === 'converted' || req.body.stage === 'requested_as_student')) {
            return res.status(403).json({
                message: 'BDEs cannot convert leads directly. Submit a conversion request for owner approval.',
            });
        }
        const updated = await Lead_1.default.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        res.status(200).json({ ...updated?.toObject(), id: updated?._id });
    }
    catch (error) {
        res.status(400).json({ message: 'Error updating lead', error });
    }
};
exports.updateLead = updateLead;
const deleteLead = async (req, res) => {
    try {
        await Lead_1.default.findByIdAndDelete(req.params.id);
        res.status(204).send();
    }
    catch (error) {
        res.status(400).json({ message: 'Error deleting lead', error });
    }
};
exports.deleteLead = deleteLead;
async function loadLeadsForFollowUps(req) {
    if (req.user?.role === 'bde') {
        const dbUser = await User_1.default.findById(req.user.id);
        return (0, bdeStats_1.fetchLeadsForBDE)(String(req.user.id), dbUser?.name || '', req.user.tenantId);
    }
    const filter = {};
    if (req.user?.role === 'owner' && req.user.tenantId) {
        filter.tenantId = (0, bdeStats_1.tenantFilter)(req.user.tenantId);
    }
    return Lead_1.default.find(filter).sort({ createdAt: -1 });
}
function buildFollowUpTasks(leads, records, defaultBdeId) {
    const today = new Date().toISOString().split('T')[0];
    const pendingByLead = new Set(records.filter((r) => r.status === 'pending').map((r) => String(r.leadId)));
    const fromDb = records.map((r) => ({ ...r.toObject(), id: r._id }));
    const synthesized = leads
        .filter((lead) => {
        const id = String(lead._id);
        if (pendingByLead.has(id))
            return false;
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
    return [...fromDb, ...synthesized].sort((a, b) => String(a.nextFollowupDate || '').localeCompare(String(b.nextFollowupDate || '')));
}
const getFollowUps = async (req, res) => {
    try {
        const leads = await loadLeadsForFollowUps(req);
        const leadIds = leads.map((l) => String(l._id));
        const records = await FollowUp_1.default.find({ leadId: { $in: leadIds } }).sort({ nextFollowupDate: 1 });
        const tasks = buildFollowUpTasks(leads, records, String(req.user?.id || ''));
        res.status(200).json(tasks);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching follow-ups', error });
    }
};
exports.getFollowUps = getFollowUps;
const createFollowUp = async (req, res) => {
    try {
        const { leadId, notes, nextFollowupDate, followupDate } = req.body;
        if (!leadId) {
            return res.status(400).json({ message: 'leadId is required' });
        }
        const lead = await Lead_1.default.findById(leadId);
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }
        const today = new Date().toISOString().split('T')[0];
        const bdeId = req.user?.role === 'bde'
            ? String(req.user.id)
            : String(lead.assignedBdeId || req.user?.id || '');
        const existing = await FollowUp_1.default.findOne({ leadId: String(leadId), status: 'pending' });
        if (existing) {
            existing.notes = notes || existing.notes;
            existing.nextFollowupDate = nextFollowupDate || existing.nextFollowupDate || today;
            await existing.save();
            return res.status(200).json({ ...existing.toObject(), id: existing._id });
        }
        const record = new FollowUp_1.default({
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
    }
    catch (error) {
        res.status(400).json({ message: 'Error creating follow-up', error });
    }
};
exports.createFollowUp = createFollowUp;
const updateFollowUp = async (req, res) => {
    try {
        const { status, notes, nextFollowupDate } = req.body;
        const updated = await FollowUp_1.default.findByIdAndUpdate(req.params.id, {
            ...(status ? { status } : {}),
            ...(notes !== undefined ? { notes } : {}),
            ...(nextFollowupDate ? { nextFollowupDate } : {}),
        }, { returnDocument: 'after' });
        if (!updated) {
            return res.status(404).json({ message: 'Follow-up not found' });
        }
        if (nextFollowupDate) {
            await Lead_1.default.findByIdAndUpdate(updated.leadId, { nextFollowUpDate: nextFollowupDate });
        }
        res.status(200).json({ ...updated.toObject(), id: updated._id });
    }
    catch (error) {
        res.status(400).json({ message: 'Error updating follow-up', error });
    }
};
exports.updateFollowUp = updateFollowUp;
function defaultTalkDuration(outcome) {
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
const createCallLog = async (req, res) => {
    try {
        const dbUser = await User_1.default.findById(req.user?.id);
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
        const log = await CallLog_1.default.create({
            tenantId: req.user?.tenantId || 'IMS',
            bdeId: String(req.user?.id),
            bdeName: dbUser?.name || 'BDE',
            leadId: String(leadId),
            leadName,
            callDate,
            callTime,
            talkDurationSeconds: typeof talkDurationSeconds === 'number'
                ? talkDurationSeconds
                : defaultTalkDuration(outcome),
            outcome,
            notes: notes || '',
        });
        res.status(201).json({ ...log.toObject(), id: log._id });
    }
    catch (error) {
        res.status(400).json({ message: 'Error creating call log', error });
    }
};
exports.createCallLog = createCallLog;
const getTasks = async (req, res) => {
    try {
        const filter = {};
        if (req.user?.role === 'bde') {
            filter.bdeId = req.user.id;
        }
        const tasks = await BDETask_1.default.find(filter).sort({ dueDate: 1 });
        res.status(200).json(tasks.map(t => ({ ...t.toObject(), id: t._id })));
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching tasks', error });
    }
};
exports.getTasks = getTasks;
const updateTaskStatus = async (req, res) => {
    try {
        const updated = await BDETask_1.default.findByIdAndUpdate(req.params.id, { status: req.body.status }, { returnDocument: 'after' });
        res.status(200).json({ ...updated?.toObject(), id: updated?._id });
    }
    catch (error) {
        res.status(400).json({ message: 'Error updating task', error });
    }
};
exports.updateTaskStatus = updateTaskStatus;
const punchAttendance = async (req, res) => {
    try {
        const { action } = req.body;
        if (!action || !['login', 'pause', 'resume', 'logout'].includes(action)) {
            return res.status(400).json({ message: 'action must be login, pause, resume, or logout' });
        }
        const userId = String(req.user?.id);
        const tenantId = req.user?.tenantId || 'ERP';
        const user = await User_1.default.findById(userId);
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();
        const nowIso = now.toISOString();
        const nowLabel = (0, shiftTimer_1.formatShiftTime)(now);
        const filter = { tenantId, date: today, type: 'bde', entityId: userId };
        if (action === 'login') {
            const existing = await Attendance_1.default.findOne(filter);
            if (existing?.shiftStatus === 'finished' || existing?.logoutAt) {
                return res.status(400).json({ message: 'Shift already completed for today' });
            }
            const record = await Attendance_1.default.findOneAndUpdate(filter, {
                name: user?.name || 'BDE',
                status: 'present',
                shiftStatus: 'active',
                loginAt: nowIso,
                loginTime: nowLabel,
                logoutAt: null,
                logoutTime: null,
                pausedAt: null,
                totalPausedSeconds: existing?.totalPausedSeconds ?? 0,
            }, { upsert: true, returnDocument: 'after' });
            return res.status(200).json((0, shiftTimer_1.buildShiftPayload)(record.toObject()));
        }
        const record = await Attendance_1.default.findOne(filter);
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
            const updated = await Attendance_1.default.findOneAndUpdate(filter, { shiftStatus: 'paused', pausedAt: nowIso }, { returnDocument: 'after' });
            return res.status(200).json((0, shiftTimer_1.buildShiftPayload)(updated.toObject()));
        }
        if (action === 'resume') {
            if (record.shiftStatus !== 'paused' || !record.pausedAt) {
                return res.status(400).json({ message: 'Shift is not paused' });
            }
            const pauseDuration = Math.floor((now.getTime() - new Date(record.pausedAt).getTime()) / 1000);
            const updated = await Attendance_1.default.findOneAndUpdate(filter, {
                shiftStatus: 'active',
                pausedAt: null,
                totalPausedSeconds: (record.totalPausedSeconds ?? 0) + pauseDuration,
            }, { returnDocument: 'after' });
            return res.status(200).json((0, shiftTimer_1.buildShiftPayload)(updated.toObject()));
        }
        let totalPaused = record.totalPausedSeconds ?? 0;
        if (record.shiftStatus === 'paused' && record.pausedAt) {
            totalPaused += Math.floor((now.getTime() - new Date(record.pausedAt).getTime()) / 1000);
        }
        const updated = await Attendance_1.default.findOneAndUpdate(filter, {
            shiftStatus: 'finished',
            logoutAt: nowIso,
            logoutTime: nowLabel,
            pausedAt: null,
            totalPausedSeconds: totalPaused,
        }, { returnDocument: 'after' });
        return res.status(200).json((0, shiftTimer_1.buildShiftPayload)(updated.toObject()));
    }
    catch (error) {
        res.status(400).json({ message: 'Error updating attendance', error });
    }
};
exports.punchAttendance = punchAttendance;
const resetShiftAttendance = async (req, res) => {
    try {
        const userId = String(req.user?.id);
        const tenantId = req.user?.tenantId || 'ERP';
        const today = new Date().toISOString().split('T')[0];
        await Attendance_1.default.deleteOne({
            tenantId,
            date: today,
            type: 'bde',
            entityId: userId,
        });
        return res.status(200).json({ message: 'Shift reset successfully', attendance: null });
    }
    catch (error) {
        res.status(400).json({ message: 'Error resetting shift', error });
    }
};
exports.resetShiftAttendance = resetShiftAttendance;
const getBdePerformance = async (req, res) => {
    try {
        if (req.user?.role !== 'bde') {
            return res.status(403).json({ message: 'Only BDEs can access performance dashboard data' });
        }
        const userId = String(req.user.id);
        const tenantId = req.user.tenantId;
        const dbUser = await User_1.default.findById(userId);
        const bdeName = dbUser?.name || '';
        const monthsBack = Math.min(Math.max(Number(req.query.months) || 12, 1), 24);
        const [myLeads, profile, centers] = await Promise.all([
            (0, bdeStats_1.fetchLeadsForBDE)(userId, bdeName, tenantId),
            BDEProfile_1.default.findOne({ userId }),
            tenantId ? Center_1.default.find({ tenantName: (0, bdeStats_1.tenantFilter)(tenantId) }).limit(1) : Center_1.default.find().limit(1),
        ]);
        const monthlyTarget = profile?.monthlyTarget ?? 30;
        const targetType = profile?.targetType ?? 'leads';
        const commissionConfig = (0, bdeStats_1.buildBdeCommissionConfig)(profile?.toObject?.() ?? profile);
        const employeeIds = [userId, profile?.employeeId].filter(Boolean);
        const payrollRecords = await HRPayroll_1.default.find({
            employeeId: { $in: employeeIds },
            employeeType: 'bde',
        }).sort({ month: 1 });
        const payrollByMonth = {};
        for (const record of payrollRecords) {
            payrollByMonth[record.month] = {
                status: record.status,
                commissionAdd: record.commissionAdd,
                incentiveAdd: record.incentiveAdd,
            };
        }
        const currentMetrics = (0, bdeStats_1.computeBdeMetrics)(myLeads, monthlyTarget, targetType, commissionConfig);
        const currentMonth = (0, bdeStats_1.buildRecentMonths)(0).slice(-1)[0];
        const convertedThisMonth = myLeads.filter((lead) => {
            if (lead.stage !== 'converted')
                return false;
            const leadObj = lead.toObject();
            const stamp = new Date(leadObj.updatedAt || leadObj.createdAt || 0);
            return (0, bdeStats_1.monthKeyFromDate)(stamp) === currentMonth;
        });
        const monthlyConverted = convertedThisMonth.length;
        const monthlyRevenue = convertedThisMonth.reduce((sum, lead) => sum + (lead.value || 0), 0);
        const monthlyAchieved = targetType === 'revenue' ? monthlyRevenue : monthlyConverted;
        const monthlyRemaining = Math.max(0, monthlyTarget - monthlyAchieved);
        const monthlyIncentive = (0, bdeStats_1.calculateBdeCommission)(monthlyRevenue, monthlyTarget, targetType, monthlyConverted, commissionConfig);
        const monthlyTargetPercent = monthlyTarget > 0 ? Math.min(Math.round((monthlyAchieved / monthlyTarget) * 100), 100) : 0;
        const joinDate = profile?.joiningDate
            ? new Date(profile.joiningDate)
            : new Date((dbUser?.toObject()).createdAt || Date.now());
        const history = (0, bdeStats_1.computeBdeMonthlyHistory)(myLeads, monthlyTarget, targetType, commissionConfig, joinDate, payrollByMonth, monthsBack);
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
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching BDE performance data', error });
    }
};
exports.getBdePerformance = getBdePerformance;
