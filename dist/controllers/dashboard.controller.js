"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardMetrics = void 0;
const Lead_1 = __importDefault(require("../models/Lead"));
const BDETask_1 = __importDefault(require("../models/BDETask"));
const BDEProfile_1 = __importDefault(require("../models/BDEProfile"));
const FollowUp_1 = __importDefault(require("../models/FollowUp"));
const User_1 = __importDefault(require("../models/User"));
const Batch_1 = __importDefault(require("../models/Batch"));
const Course_1 = __importDefault(require("../models/Course"));
const Center_1 = __importDefault(require("../models/Center"));
const Attendance_1 = __importDefault(require("../models/Attendance"));
const Student_1 = __importDefault(require("../models/Student"));
const ConversionRequest_1 = __importDefault(require("../models/ConversionRequest"));
const incomeStats_1 = require("../utils/incomeStats");
const studentRiskStats_1 = require("../utils/studentRiskStats");
const bdeStats_1 = require("../utils/bdeStats");
const shiftTimer_1 = require("../utils/shiftTimer");
const trainerPortal_1 = require("../utils/trainerPortal");
function countActiveCourses(courses, batches, centerName) {
    const relevantBatches = centerName
        ? batches.filter((batch) => (batch.centerName || '').trim().toLowerCase() === centerName.trim().toLowerCase())
        : batches;
    const activeCourseNames = new Set(relevantBatches.map((batch) => batch.courseName).filter(Boolean));
    if (courses.length > 0) {
        return courses.filter((course) => activeCourseNames.has(course.name)).length;
    }
    return activeCourseNames.size;
}
function countBatchesAtCenter(batches, centerName) {
    if (!centerName)
        return batches.length;
    return batches.filter((batch) => (batch.centerName || '').trim().toLowerCase() === centerName.trim().toLowerCase()).length;
}
function tenantFilter(tenantId) {
    const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
}
function leadsForCenter(allLeads, centerName) {
    return allLeads.filter((lead) => (lead.centerName || lead.city || '').trim().toLowerCase() === centerName.trim().toLowerCase());
}
const getDashboardMetrics = async (req, res) => {
    try {
        const role = req.user?.role;
        const userId = req.user?.id;
        if (role === 'bde') {
            const tenantId = req.user?.tenantId;
            const dbUser = await User_1.default.findById(userId);
            const bdeName = dbUser?.name || '';
            const [myLeads, myTasks, profile, centers, followUpRecords, todayAttendance, allStudents] = await Promise.all([
                (0, bdeStats_1.fetchLeadsForBDE)(String(userId), bdeName, tenantId),
                BDETask_1.default.find({ bdeId: String(userId) }).sort({ dueDate: 1 }),
                BDEProfile_1.default.findOne({ userId }),
                tenantId ? Center_1.default.find({ tenantName: (0, bdeStats_1.tenantFilter)(tenantId) }).limit(1) : Center_1.default.find().limit(1),
                FollowUp_1.default.find({ bdeId: String(userId) }).sort({ nextFollowupDate: 1 }),
                Attendance_1.default.findOne({
                    tenantId: tenantId || 'ERP',
                    date: new Date().toISOString().split('T')[0],
                    type: 'bde',
                    entityId: String(userId),
                }),
                tenantId
                    ? Student_1.default.find({ tenantId: (0, bdeStats_1.tenantFilter)(tenantId) })
                    : Student_1.default.find(),
            ]);
            const monthlyTarget = profile?.monthlyTarget ?? 30;
            const targetType = profile?.targetType ?? 'leads';
            const commissionConfig = (0, bdeStats_1.buildBdeCommissionConfig)(profile?.toObject?.() ?? profile);
            const studentRecords = allStudents.map((s) => s.toObject());
            const recovery = (0, bdeStats_1.computeBdeRecovery)(myLeads, studentRecords);
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
            const monthlyTargetPercent = monthlyTarget > 0 ? Math.min(Math.round((monthlyAchieved / monthlyTarget) * 100), 100) : 0;
            const monthlyIncentive = (0, bdeStats_1.calculateBdeCommission)(monthlyRevenue, monthlyTarget, targetType, monthlyConverted, commissionConfig);
            const metrics = (0, bdeStats_1.computeBdeMetrics)(myLeads, monthlyTarget, targetType, commissionConfig);
            const center = centers[0];
            const centerLabel = center
                ? `${center.name}${center.location ? ` • ${center.location}` : ''}`
                : tenantId || 'Main Campus';
            const leadFollowUps = myLeads
                .filter((lead) => lead.nextFollowUpDate)
                .map((lead) => ({
                id: String(lead._id),
                leadId: String(lead._id),
                bdeId: String(userId),
                followupDate: lead.nextFollowUpDate,
                nextFollowupDate: lead.nextFollowUpDate,
                notes: 'Scheduled follow-up',
                status: 'pending',
            }));
            const followUpsPayload = followUpRecords.length > 0
                ? followUpRecords.map((f) => ({ ...f.toObject(), id: f._id }))
                : leadFollowUps;
            return res.status(200).json({
                profile: {
                    employeeId: profile?.employeeId || `EMP-${String(userId).substring(0, 6)}`,
                    centerName: centerLabel,
                    monthlyTarget,
                    targetType,
                    commissionEnabled: commissionConfig.commissionEnabled,
                    commissionPercentage: commissionConfig.commissionPercentage,
                    commissionApplyFrom: commissionConfig.commissionApplyFrom,
                    commissionThreshold: commissionConfig.commissionThreshold,
                },
                metrics: {
                    totalAssigned: metrics.totalAssigned,
                    newLeads: metrics.newLeads,
                    interestedLeads: metrics.interestedLeads,
                    convertedLeads: metrics.convertedLeads,
                    contactedLeads: metrics.contactedLeads,
                    conversionRate: metrics.conversionRate,
                    activeCrm: myLeads.filter((l) => l.stage !== 'converted' && l.stage !== 'lost').length,
                },
                targets: {
                    achievedCount: monthlyAchieved,
                    targetCount: monthlyTarget,
                    targetPercent: monthlyTargetPercent,
                    remaining: monthlyRemaining,
                    revenue: monthlyRevenue,
                    incentive: monthlyIncentive,
                    bonusAmount: metrics.bonusAmount,
                },
                recovery: {
                    monthlyRecovery: recovery.monthlyRecovery,
                    totalRecovery: recovery.totalRecovery,
                    totalFeeTarget: recovery.totalFeeTarget,
                    totalOutstanding: recovery.totalOutstanding,
                    remainingDues: recovery.remainingDues,
                    averageDueAmount: recovery.averageDueAmount,
                },
                attendance: todayAttendance ? (0, shiftTimer_1.buildShiftPayload)(todayAttendance.toObject()) : null,
                myLeads: myLeads.map((l) => ({ ...l.toObject(), id: l._id })),
                myTasks: myTasks.map((t) => ({ ...t.toObject(), id: t._id })),
                followUps: followUpsPayload,
            });
        }
        if (role === 'owner') {
            const tenantId = req.user?.tenantId || "Your Institute";
            const tenantMatch = tenantFilter(tenantId);
            const centers = await Center_1.default.find({ tenantName: tenantMatch });
            const allLeads = await Lead_1.default.find({ tenantId: tenantMatch });
            const allBatches = await Batch_1.default.find({ tenantId: tenantMatch });
            const allCourses = await Course_1.default.find({ tenantId: tenantMatch });
            const allStudents = await Student_1.default.find({ tenantId: tenantMatch });
            const pendingConversions = await ConversionRequest_1.default.countDocuments({
                tenantId: tenantMatch,
                status: 'pending',
            });
            const studentObjects = allStudents.map((student) => student.toObject());
            const studentLogs = await Attendance_1.default.find({ tenantId, type: 'student' });
            const attendanceLogs = studentLogs.map((log) => ({
                entityId: log.entityId,
                date: log.date,
                status: log.status,
            }));
            const totalLeads = allLeads.length;
            const totalIncome = (0, incomeStats_1.getIncomeForStudents)(allStudents);
            const totalCourses = countActiveCourses(allCourses, allBatches);
            const now = new Date();
            const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const computeMonthlyRate = (logs) => {
                const monthlyLogs = logs.filter((log) => log.date?.startsWith(currentMonthPrefix));
                if (monthlyLogs.length === 0)
                    return '0%';
                const presentCount = monthlyLogs.filter((log) => log.status === 'present' || log.status === 'late').length;
                return `${Math.round((presentCount / monthlyLogs.length) * 100)}%`;
            };
            const averageAttendance = computeMonthlyRate(attendanceLogs);
            const revenueTrends = (0, incomeStats_1.buildRevenueTrends)(allStudents);
            // Pipeline Conversion (Real data)
            const pipelineCounts = {
                "new": 0, "contacted": 0, "interested": 0, "demo_scheduled": 0, "converted": 0
            };
            allLeads.forEach(l => {
                if (pipelineCounts[l.stage] !== undefined)
                    pipelineCounts[l.stage]++;
            });
            const leadPipelineConversion = [
                { stage: "New", Count: pipelineCounts["new"] },
                { stage: "Contacted", Count: pipelineCounts["contacted"] },
                { stage: "Interested", Count: pipelineCounts["interested"] },
                { stage: "Demo Set", Count: pipelineCounts["demo_scheduled"] },
                { stage: "Converted", Count: pipelineCounts["converted"] }
            ];
            // Format centers for the frontend
            let aggregatedLeads = 0;
            let aggregatedIncome = 0;
            let aggregatedCourses = 0;
            const formattedCenters = centers.map((center) => {
                const centerLeads = leadsForCenter(allLeads, center.name);
                const centerStudents = (0, incomeStats_1.studentsAtCenter)(allStudents, allBatches, center.name);
                const centerStudentObjects = (0, incomeStats_1.studentsAtCenter)(studentObjects, allBatches, center.name);
                const centerStudentIds = new Set(centerStudentObjects.map((student) => String(student._id)));
                const centerAttendanceLogs = attendanceLogs.filter((log) => centerStudentIds.has(log.entityId));
                const centerIncome = (0, incomeStats_1.getIncomeForStudents)(centerStudents);
                const centerCourses = countActiveCourses(allCourses, allBatches, center.name);
                const centerBatches = countBatchesAtCenter(allBatches, center.name);
                const centerRisks = (0, studentRiskStats_1.buildStudentRisks)(centerStudentObjects, centerAttendanceLogs, {
                    centerLabel: center.name,
                });
                aggregatedLeads += centerLeads.length;
                aggregatedIncome += centerIncome;
                aggregatedCourses += centerCourses;
                return {
                    id: center._id,
                    name: center.name,
                    location: center.location,
                    leads: centerLeads.length,
                    income: centerIncome,
                    attendance: computeMonthlyRate(centerAttendanceLogs),
                    courses: centerCourses,
                    batches: centerBatches,
                    recentActivity: [],
                    risks: centerRisks,
                };
            });
            if (formattedCenters.length === 0) {
                aggregatedLeads = totalLeads;
                aggregatedIncome = totalIncome;
                aggregatedCourses = totalCourses;
            }
            const risks = (0, studentRiskStats_1.buildStudentRisks)(studentObjects, attendanceLogs, { pendingConversions });
            return res.status(200).json({
                metrics: {
                    totalLeads: formattedCenters.length > 0 ? aggregatedLeads : totalLeads,
                    totalIncome,
                    totalCourses,
                    averageAttendance,
                    risks,
                },
                centersList: formattedCenters,
                revenueTrends,
                leadPipelineConversion
            });
        }
        if (role === 'super_admin') {
            const Trainer = require('../models/Trainer').default;
            const SupportTicket = require('../models/SupportTicket').default;
            const [totalCenters, activeCentersCount, pendingCentersCount, inactiveCentersCount, totalStudents, totalTrainers, totalOwners, totalBdes, openTickets, inProgressTickets,] = await Promise.all([
                Center_1.default.countDocuments(),
                Center_1.default.countDocuments({ status: 'active' }),
                Center_1.default.countDocuments({ status: 'maintenance' }),
                Center_1.default.countDocuments({ status: 'inactive' }),
                Student_1.default.countDocuments(),
                Trainer.countDocuments(),
                User_1.default.countDocuments({ role: 'owner' }),
                User_1.default.countDocuments({ role: 'bde' }),
                SupportTicket.countDocuments({ status: 'open' }),
                SupportTicket.countDocuments({ status: 'in-progress' }),
            ]);
            const recentTenantsData = await Center_1.default.find().sort({ createdAt: -1 }).limit(8);
            const allCenters = await Center_1.default.find().select('tenantName name status createdAt enabledModules');
            const tenantGroups = new Map();
            for (const center of allCenters) {
                const key = center.tenantName || center.name || 'Unknown';
                const entry = tenantGroups.get(key) || { centers: 0 };
                entry.centers += 1;
                tenantGroups.set(key, entry);
            }
            const enrollmentData = Array.from(tenantGroups.entries())
                .slice(0, 6)
                .map(([name, data]) => ({
                tenant: name.length > 14 ? `${name.slice(0, 14)}…` : name,
                centers: data.centers,
                students: Math.max(1, Math.floor(totalStudents / Math.max(tenantGroups.size, 1))),
            }));
            const statusBreakdown = [
                { status: 'Active', count: activeCentersCount },
                { status: 'Maintenance', count: pendingCentersCount },
                { status: 'Inactive', count: inactiveCentersCount },
            ];
            const revenue = activeCentersCount * 100000;
            return res.status(200).json({
                metrics: {
                    totalCenters,
                    activeCentersCount,
                    pendingCentersCount,
                    inactiveCentersCount,
                    totalStudents,
                    totalTrainers,
                    totalOwners,
                    totalBdes,
                    openTickets,
                    inProgressTickets,
                    revenue,
                    uptime: 99.98,
                },
                recentTenants: recentTenantsData.map((t) => ({
                    id: t._id,
                    name: t.name,
                    tenantName: t.tenantName,
                    domain: t.website || `${(t.tenantName || t.name || 'tenant').toLowerCase().replace(/\s+/g, '')}.eduplatform.com`,
                    plan: (t.enabledModules?.length || 0) > 5 ? 'enterprise' : 'starter',
                    status: t.status,
                    billing: (t.enabledModules?.length || 0) > 5 ? '₹5,00,000/yr' : '₹1,00,000/yr',
                    joined: t.createdAt,
                    location: t.location,
                    manager: t.manager,
                    modulesCount: t.enabledModules?.length || 0,
                })),
                enrollmentData,
                statusBreakdown,
            });
        }
        if (role === 'trainer') {
            const tenantId = req.user?.tenantId;
            const payload = await (0, trainerPortal_1.buildTrainerDashboardPayload)(String(userId), tenantId);
            return res.status(200).json({
                profile: payload.profile,
                metrics: payload.metrics,
                schedules: payload.schedules,
                watchlist: payload.watchlist,
                batches: payload.batches,
            });
        }
        // Fallback for other roles like student
        if (role === 'student') {
            return res.status(200).json({ metrics: {} });
        }
        return res.status(200).json({ metrics: {} });
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching dashboard metrics', error });
    }
};
exports.getDashboardMetrics = getDashboardMetrics;
