"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMonthlyRevenueByMode = buildMonthlyRevenueByMode;
exports.buildCumulativeStudentGrowth = buildCumulativeStudentGrowth;
exports.buildWeeklyAttendanceRates = buildWeeklyAttendanceRates;
exports.buildFacultyPerformance = buildFacultyPerformance;
const trainerStats_1 = require("./trainerStats");
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthPrefix(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function endOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
function buildStudentModeMap(batches) {
    const map = new Map();
    batches.forEach((batch) => {
        const mode = batch.mode === 'offline' ? 'offline' : 'online';
        (batch.studentNames || []).forEach((name) => {
            map.set(name.trim().toLowerCase(), mode);
        });
    });
    return map;
}
function buildMonthlyRevenueByMode(students, batches) {
    const modeMap = buildStudentModeMap(batches);
    const now = new Date();
    const trends = [];
    for (let offset = 4; offset >= 0; offset -= 1) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        const prefix = monthPrefix(monthDate);
        let online = 0;
        let offline = 0;
        students.forEach((student) => {
            const enrolledThisMonth = student.enrollmentDate?.startsWith(prefix);
            const updatedThisMonth = student.updatedAt && new Date(student.updatedAt).toISOString().startsWith(prefix);
            if (!enrolledThisMonth && !updatedThisMonth)
                return;
            const amount = student.feesPaid || 0;
            if (amount <= 0)
                return;
            const mode = modeMap.get((student.name || '').trim().toLowerCase()) || 'online';
            if (mode === 'offline')
                offline += amount;
            else
                online += amount;
        });
        trends.push({
            month: MONTH_LABELS[monthDate.getMonth()],
            Online: online,
            Offline: offline,
            total: online + offline,
        });
    }
    if (trends.every((entry) => entry.Online === 0 && entry.Offline === 0) && students.length > 0) {
        let onlineTotal = 0;
        let offlineTotal = 0;
        students.forEach((student) => {
            const amount = student.feesPaid || 0;
            if (amount <= 0)
                return;
            const mode = modeMap.get((student.name || '').trim().toLowerCase()) || 'online';
            if (mode === 'offline')
                offlineTotal += amount;
            else
                onlineTotal += amount;
        });
        if (onlineTotal > 0 || offlineTotal > 0) {
            trends[trends.length - 1] = {
                ...trends[trends.length - 1],
                Online: onlineTotal,
                Offline: offlineTotal,
                total: onlineTotal + offlineTotal,
            };
        }
    }
    return trends;
}
function buildCumulativeStudentGrowth(students) {
    const now = new Date();
    const points = [];
    for (let offset = 4; offset >= 0; offset -= 1) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        const cutoff = endOfMonth(monthDate);
        const count = students.filter((student) => {
            if (!student.enrollmentDate)
                return false;
            const enrolled = new Date(`${student.enrollmentDate}T00:00:00`);
            if (Number.isNaN(enrolled.getTime()) || enrolled > cutoff)
                return false;
            return (student.status || 'active') === 'active';
        }).length;
        points.push({
            month: MONTH_LABELS[monthDate.getMonth()],
            Students: count,
        });
    }
    return points;
}
function weekStart(date) {
    const copy = new Date(date);
    const day = copy.getDay();
    const diff = day === 0 ? 6 : day - 1;
    copy.setDate(copy.getDate() - diff);
    copy.setHours(0, 0, 0, 0);
    return copy;
}
function buildWeeklyAttendanceRates(attendanceLogs, students) {
    const now = new Date();
    const currentWeekStart = weekStart(now);
    const fallbackRate = students.length > 0
        ? Math.round(students.reduce((sum, student) => sum + (student.attendanceRate || 0), 0) / students.length)
        : 0;
    const weeks = [];
    for (let index = 4; index >= 0; index -= 1) {
        const start = new Date(currentWeekStart);
        start.setDate(start.getDate() - index * 7);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const startKey = start.toISOString().slice(0, 10);
        const endKey = end.toISOString().slice(0, 10);
        const weekLogs = attendanceLogs.filter((log) => log.date >= startKey && log.date <= endKey);
        let rate = fallbackRate;
        if (weekLogs.length > 0) {
            const present = weekLogs.filter((log) => log.status === 'present' || log.status === 'late').length;
            rate = Math.round((present / weekLogs.length) * 100);
        }
        weeks.push({
            week: `Wk ${5 - index}`,
            rate,
        });
    }
    return weeks;
}
function trainerApprovalIndex(rating) {
    const value = rating ?? 5;
    if (value <= 5)
        return Math.round((value / 5) * 100);
    return Math.round(Math.min(value, 100));
}
async function buildFacultyPerformance(trainers, batches, attendanceRecords) {
    const rows = await Promise.all(trainers.map(async (trainer) => {
        const stats = await (0, trainerStats_1.computeTrainerStats)(trainer, batches.map((batch) => ({
            trainerName: batch.trainerName || '',
            schedule: batch.schedule || '',
        })), attendanceRecords);
        return {
            name: trainer.name,
            Batches: stats.activeBatches,
            Hours: stats.hoursThisWeek,
            Rating: trainerApprovalIndex(trainer.rating),
        };
    }));
    return rows.sort((a, b) => b.Hours - a.Hours || b.Rating - a.Rating);
}
