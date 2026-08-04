"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseWeeklyHoursFromSchedule = parseWeeklyHoursFromSchedule;
exports.computeTrainerStats = computeTrainerStats;
exports.loadTrainerStatsContext = loadTrainerStatsContext;
const Batch_1 = __importDefault(require("../models/Batch"));
const Attendance_1 = __importDefault(require("../models/Attendance"));
function parseTimeToMinutes(time) {
    const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match)
        return 0;
    let hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    const period = match[3].toUpperCase();
    if (period === 'PM' && hours !== 12)
        hours += 12;
    if (period === 'AM' && hours === 12)
        hours = 0;
    return hours * 60 + mins;
}
function parseWeeklyHoursFromSchedule(schedule) {
    if (!schedule)
        return 0;
    const timeMatch = schedule.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
    if (!timeMatch)
        return 0;
    const startMins = parseTimeToMinutes(timeMatch[1]);
    const endMins = parseTimeToMinutes(timeMatch[2]);
    const sessionHours = Math.max(0, (endMins - startMins) / 60);
    const daysPart = schedule.split(/[•·|]/)[0] || schedule;
    const dayCount = (daysPart.match(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/gi) || []).length || 1;
    return Math.round(sessionHours * dayCount * 10) / 10;
}
function getCurrentWeekRange() {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const format = (date) => date.toISOString().slice(0, 10);
    return { start: format(monday), end: format(sunday) };
}
function hoursFromAttendanceRecord(loginTime, logoutTime) {
    if (!loginTime || !logoutTime)
        return 0;
    const startMins = parseTimeToMinutes(loginTime);
    const endMins = parseTimeToMinutes(logoutTime);
    return Math.max(0, Math.round(((endMins - startMins) / 60) * 10) / 10);
}
async function computeTrainerStats(trainer, batches, attendanceRecords) {
    const trainerName = trainer.name.trim().toLowerCase();
    const assignedBatches = batches.filter((batch) => (batch.trainerName || '').trim().toLowerCase() === trainerName);
    const activeBatches = assignedBatches.length;
    const attendanceHours = attendanceRecords
        .filter((record) => record.entityId === String(trainer._id))
        .filter((record) => record.status === 'present' || record.status === 'late')
        .reduce((sum, record) => sum + hoursFromAttendanceRecord(record.loginTime, record.logoutTime), 0);
    const scheduleHours = assignedBatches.reduce((sum, batch) => sum + parseWeeklyHoursFromSchedule(batch.schedule || ''), 0);
    const hoursThisWeek = attendanceHours > 0
        ? Math.round(attendanceHours * 10) / 10
        : Math.round(scheduleHours * 10) / 10;
    return { activeBatches, hoursThisWeek };
}
async function loadTrainerStatsContext(tenantId) {
    const batchFilter = {};
    if (tenantId)
        batchFilter.tenantId = tenantId;
    const { start, end } = getCurrentWeekRange();
    const attendanceFilter = {
        type: 'trainer',
        date: { $gte: start, $lte: end },
    };
    if (tenantId)
        attendanceFilter.tenantId = tenantId;
    const [batches, attendanceRecords] = await Promise.all([
        Batch_1.default.find(batchFilter).select('trainerName schedule').lean(),
        Attendance_1.default.find(attendanceFilter).select('entityId loginTime logoutTime status').lean(),
    ]);
    return { batches, attendanceRecords };
}
