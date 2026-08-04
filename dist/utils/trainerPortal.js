"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantFilter = tenantFilter;
exports.trainerNameFilter = trainerNameFilter;
exports.resolveTrainerByUser = resolveTrainerByUser;
exports.getAssignedBatches = getAssignedBatches;
exports.buildTrainerDashboardPayload = buildTrainerDashboardPayload;
exports.getTrainerStudentsForUser = getTrainerStudentsForUser;
const User_1 = __importDefault(require("../models/User"));
const Trainer_1 = __importDefault(require("../models/Trainer"));
const Batch_1 = __importDefault(require("../models/Batch"));
const Student_1 = __importDefault(require("../models/Student"));
const Attendance_1 = __importDefault(require("../models/Attendance"));
const SessionFeedback_1 = __importDefault(require("../models/SessionFeedback"));
const batchFormatter_1 = require("./batchFormatter");
const trainerStats_1 = require("./trainerStats");
const sessionTiming_1 = require("./sessionTiming");
function escapeRegex(value) {
    return value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function tenantFilter(tenantId) {
    const escaped = escapeRegex(tenantId);
    return { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
}
function trainerNameFilter(name) {
    const escaped = escapeRegex(name);
    return { $regex: new RegExp(`^${escaped}$`, 'i') };
}
async function resolveTrainerByUser(userId) {
    const user = await User_1.default.findById(userId);
    if (!user || user.role !== 'trainer')
        return null;
    const trainer = await Trainer_1.default.findOne({
        email: { $regex: new RegExp(`^${escapeRegex(user.email)}$`, 'i') },
    });
    if (!trainer) {
        return { user, trainer: null };
    }
    return { user, trainer };
}
async function getAssignedBatches(trainerName, tenantId, status) {
    const filter = {
        trainerName: trainerNameFilter(trainerName),
    };
    if (tenantId)
        filter.tenantId = tenantFilter(tenantId);
    if (status)
        filter.status = status;
    return Batch_1.default.find(filter).sort({ createdAt: -1 });
}
function todayISO() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function isUpcomingSession(session, now = new Date()) {
    return (0, sessionTiming_1.isActiveSession)(session, now);
}
function sessionStatusRank(status) {
    if (status === 'in_progress')
        return 0;
    if (status === 'upcoming')
        return 1;
    return 2;
}
function getUpcomingSessionsForBatch(batch) {
    const now = new Date();
    return normalizeBatchSessions(batch)
        .filter((session) => isUpcomingSession(session, now))
        .sort((a, b) => {
        const aStatus = (0, sessionTiming_1.getSessionStatus)(a, now);
        const bStatus = (0, sessionTiming_1.getSessionStatus)(b, now);
        const rankDiff = sessionStatusRank(aStatus) - sessionStatusRank(bStatus);
        if (rankDiff !== 0)
            return rankDiff;
        return getSessionSortTime(a) - getSessionSortTime(b);
    });
}
function getSessionSortTime(session) {
    return (0, sessionTiming_1.parseSessionDateTime)(session.date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}
function formatScheduleTimeLabel(session, schedule) {
    const start = (0, sessionTiming_1.parseSessionDateTime)(session.date);
    const end = (0, sessionTiming_1.getSessionEndTime)(session);
    if (start) {
        const today = todayISO();
        const sessionDay = session.date?.substring(0, 10);
        const timeOptions = { hour: '2-digit', minute: '2-digit' };
        const startLabel = start.toLocaleTimeString('en-IN', timeOptions);
        const endLabel = end ? end.toLocaleTimeString('en-IN', timeOptions) : '';
        const range = endLabel ? `${startLabel} - ${endLabel}` : startLabel;
        if (sessionDay && sessionDay !== today) {
            const dateLabel = start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
            return `${dateLabel} • ${range}`;
        }
        return range;
    }
    const match = schedule.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
    return match ? `${match[1]} - ${match[2]}` : 'Time TBD';
}
function normalizeBatchSessions(batch) {
    if (batch.sessions?.length) {
        return batch.sessions.filter((session) => session?.date);
    }
    if (batch.nextSessionDate) {
        return [
            {
                topic: batch.nextSessionTopic || 'Class Session',
                date: batch.nextSessionDate,
                endDate: batch.nextSessionEndDate,
            },
        ];
    }
    return [];
}
function computeAssignmentStats(batches) {
    let totalSlots = 0;
    let submittedCount = 0;
    let pendingGrading = 0;
    batches.forEach((batch) => {
        const assignments = batch.lmsContent?.assignments || [];
        const studentNames = batch.studentNames || [];
        assignments.forEach((assignment) => {
            const submissions = assignment?.submissions || {};
            studentNames.forEach((name) => {
                totalSlots += 1;
                const submissionKey = Object.keys(submissions).find((key) => key.trim().toLowerCase() === name.trim().toLowerCase()) || name;
                const submission = submissions[submissionKey];
                if (submission?.status === 'submitted' || submission?.status === 'graded') {
                    submittedCount += 1;
                }
                if (submission?.status === 'submitted' && !submission?.grade) {
                    pendingGrading += 1;
                }
            });
        });
    });
    const submissionRate = totalSlots > 0 ? Math.round((submittedCount / totalSlots) * 100) : 0;
    return { totalSlots, submittedCount, submissionRate, pendingGrading };
}
async function buildStudentIdMap(studentNames, tenantId) {
    if (studentNames.length === 0)
        return new Map();
    const filter = {
        name: {
            $in: studentNames.map((name) => new RegExp(`^${escapeRegex(name)}$`, 'i')),
        },
    };
    if (tenantId)
        filter.tenantId = tenantFilter(tenantId);
    const students = await Student_1.default.find(filter).select('_id name').lean();
    const map = new Map();
    students.forEach((student) => {
        map.set(String(student.name).trim().toLowerCase(), String(student._id));
    });
    return map;
}
function batchAttendanceMarked(batchStudentNames, studentIdMap, todayLogs) {
    if (batchStudentNames.length === 0)
        return false;
    const loggedIds = new Set(todayLogs.map((log) => log.entityId));
    const batchIds = batchStudentNames
        .map((name) => studentIdMap.get(name.trim().toLowerCase()))
        .filter(Boolean);
    if (batchIds.length === 0)
        return false;
    return batchIds.every((id) => loggedIds.has(id));
}
async function buildAttendanceWatchlist(batches, studentIdMap, tenantId) {
    const studentNames = new Set();
    batches.forEach((batch) => {
        batch.studentNames?.forEach((name) => studentNames.add(name.trim().toLowerCase()));
    });
    const entityIds = [...studentNames]
        .map((name) => studentIdMap.get(name))
        .filter(Boolean);
    if (entityIds.length === 0)
        return [];
    const filter = {
        type: 'student',
        entityId: { $in: entityIds },
    };
    if (tenantId)
        filter.tenantId = tenantId;
    const logs = await Attendance_1.default.find(filter).sort({ date: -1 }).lean();
    const byEntity = new Map();
    logs.forEach((log) => {
        if (!byEntity.has(log.entityId))
            byEntity.set(log.entityId, []);
        byEntity.get(log.entityId).push({ date: log.date, status: log.status });
    });
    const watchlist = [];
    batches.forEach((batch) => {
        batch.studentNames?.forEach((studentName) => {
            const entityId = studentIdMap.get(studentName.trim().toLowerCase());
            if (!entityId)
                return;
            const records = (byEntity.get(entityId) || []).sort((a, b) => b.date.localeCompare(a.date));
            if (records.length < 2)
                return;
            if (records.slice(0, 2).every((record) => record.status === 'absent')) {
                watchlist.push({
                    studentName,
                    batchLabel: `${batch.courseName || 'Batch'} (${batch.code || 'N/A'})`,
                });
            }
        });
    });
    return watchlist;
}
async function buildTrainerDashboardPayload(userId, tenantId) {
    const resolved = await resolveTrainerByUser(userId);
    if (!resolved) {
        throw new Error('Trainer profile not found');
    }
    const { user, trainer } = resolved;
    const trainerName = trainer?.name || user.name;
    const batches = await getAssignedBatches(trainerName, tenantId);
    const activeBatches = batches.filter((batch) => batch.status !== 'completed');
    const batchObjects = batches.map((batch) => batch.toObject());
    const allStudentNames = new Set();
    activeBatches.forEach((batch) => {
        batch.studentNames?.forEach((name) => allStudentNames.add(name));
    });
    const today = todayISO();
    const studentIdMap = await buildStudentIdMap([...allStudentNames], tenantId);
    const todayAttendance = await Attendance_1.default.find({
        ...(tenantId ? { tenantId } : {}),
        date: today,
        type: 'student',
    }).lean();
    const schedules = [];
    const now = new Date();
    activeBatches.forEach((batch) => {
        const upcomingSessions = getUpcomingSessionsForBatch(batch.toObject());
        upcomingSessions.forEach((session, index) => {
            const status = (0, sessionTiming_1.getSessionStatus)(session, now);
            if (status !== 'in_progress' && status !== 'upcoming')
                return;
            schedules.push({
                id: `${batch._id}-${index}-${session.date}`,
                batchId: String(batch._id),
                time: formatScheduleTimeLabel(session, batch.schedule || ''),
                batchName: `${batch.courseName} (${batch.code})`,
                topic: session.topic || batch.nextSessionTopic || batch.courseName || 'Class Session',
                studentsCount: batch.studentNames?.length || batch.enrolled || 0,
                sessionStatus: status,
                attendanceStatus: batchAttendanceMarked(batch.studentNames || [], studentIdMap, todayAttendance)
                    ? 'marked'
                    : 'pending',
                meetLink: batch.meetLink,
                platform: batch.platform,
                sortTime: status === 'in_progress'
                    ? 0
                    : getSessionSortTime(session),
            });
        });
    });
    schedules.sort((a, b) => (a.sortTime ?? 0) - (b.sortTime ?? 0));
    const upcomingSchedules = schedules.map(({ sortTime, ...schedule }) => schedule);
    const statsContext = await (0, trainerStats_1.loadTrainerStatsContext)(tenantId);
    const trainerStats = trainer
        ? await (0, trainerStats_1.computeTrainerStats)(trainer, statsContext.batches, statsContext.attendanceRecords)
        : {
            activeBatches: activeBatches.length,
            hoursThisWeek: activeBatches.reduce((sum, batch) => {
                const match = (batch.schedule || '').match(/(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
                if (!match)
                    return sum;
                return sum + 1.5;
            }, 0),
        };
    const assignmentStats = computeAssignmentStats(batchObjects);
    const watchlist = await buildAttendanceWatchlist(activeBatches.map((batch) => batch.toObject()), studentIdMap, tenantId);
    const feedbackFilter = {
        trainerName: trainerNameFilter(trainerName),
    };
    if (tenantId)
        feedbackFilter.tenantId = tenantFilter(tenantId);
    const feedbackRecords = await SessionFeedback_1.default.find(feedbackFilter).lean();
    const rated = feedbackRecords.filter((item) => !item.skipped && item.rating);
    const averageRating = rated.length
        ? Math.round((rated.reduce((sum, item) => sum + (item.rating || 0), 0) / rated.length) * 10) / 10
        : trainer?.rating ?? 5;
    const totalStudents = allStudentNames.size;
    const dailyHours = upcomingSchedules.reduce((sum, item) => {
        const match = item.time.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
        if (!match)
            return sum + 1.5;
        return sum + 1.5;
    }, 0);
    return {
        profile: trainer
            ? {
                id: String(trainer._id),
                trainerId: trainer.trainerId,
                name: trainer.name,
                email: trainer.email,
                phone: trainer.phone,
                employmentType: trainer.employmentType,
                status: trainer.status,
                technologySubject: trainer.technologySubject,
                trainingMode: trainer.trainingMode,
                rating: averageRating,
                activeBatches: trainerStats.activeBatches,
                hoursThisWeek: trainerStats.hoursThisWeek,
            }
            : {
                id: String(user._id),
                trainerId: null,
                name: user.name,
                email: user.email,
                rating: averageRating,
                activeBatches: trainerStats.activeBatches,
                hoursThisWeek: trainerStats.hoursThisWeek,
            },
        metrics: {
            activeBatches: trainerStats.activeBatches,
            totalStudents,
            dailyHours: Math.round(dailyHours * 10) / 10,
            scheduledClasses: upcomingSchedules.length,
            liveClasses: upcomingSchedules.filter((item) => item.sessionStatus === 'in_progress').length,
            assignmentSubmissionRate: assignmentStats.submissionRate,
            pendingGrading: assignmentStats.pendingGrading,
            averageRating,
            feedbackCount: rated.length,
        },
        schedules: upcomingSchedules,
        watchlist,
        batches: activeBatches.map(batchFormatter_1.formatBatch),
    };
}
async function getTrainerStudentsForUser(userId, tenantId) {
    const resolved = await resolveTrainerByUser(userId);
    if (!resolved)
        return [];
    const trainerName = resolved.trainer?.name || resolved.user.name;
    const batches = await getAssignedBatches(trainerName, tenantId);
    const studentNames = new Set();
    batches.forEach((batch) => {
        batch.studentNames?.forEach((name) => studentNames.add(name.trim().toLowerCase()));
    });
    if (studentNames.size === 0)
        return [];
    const filter = {};
    if (tenantId)
        filter.tenantId = tenantFilter(tenantId);
    const students = await Student_1.default.find(filter).sort({ createdAt: -1 });
    return students
        .filter((student) => studentNames.has(student.name.trim().toLowerCase()))
        .map((student) => ({ ...student.toObject(), id: student._id }));
}
