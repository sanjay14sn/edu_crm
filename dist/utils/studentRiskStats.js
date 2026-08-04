"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildStudentRisks = buildStudentRisks;
const installments_1 = require("./installments");
const incomeStats_1 = require("./incomeStats");
function studentId(student) {
    if (typeof student._id === 'string')
        return student._id;
    if (student._id)
        return student._id.toString();
    return student.id || '';
}
function formatNames(students, max = 3) {
    const names = students
        .map((student) => student.name?.trim())
        .filter(Boolean)
        .slice(0, max);
    if (names.length === 0)
        return '';
    if (students.length <= max)
        return ` (${names.join(', ')})`;
    return ` (${names.join(', ')} and ${students.length - max} more)`;
}
function findConsecutiveAbsentStudents(students, logs, streak) {
    const activeIds = new Set(students.map((student) => studentId(student)).filter(Boolean));
    const byEntity = new Map();
    for (const log of logs) {
        if (!activeIds.has(log.entityId))
            continue;
        if (!byEntity.has(log.entityId))
            byEntity.set(log.entityId, []);
        byEntity.get(log.entityId).push(log);
    }
    const flagged = [];
    for (const student of students) {
        const id = studentId(student);
        const records = (byEntity.get(id) || []).sort((a, b) => b.date.localeCompare(a.date));
        if (records.length < streak)
            continue;
        if (records.slice(0, streak).every((record) => record.status === 'absent')) {
            flagged.push(student);
        }
    }
    return flagged;
}
function buildStudentRisks(students, attendanceLogs = [], options) {
    const risks = [];
    const scope = options?.centerLabel ? ` at ${options.centerLabel}` : '';
    const activeStudents = students.filter((student) => student.status !== 'completed');
    const overdueStudents = activeStudents.filter((student) => {
        if ((0, installments_1.isFullyPaid)(student.feesPaid, student.feesTotal))
            return false;
        return (0, installments_1.computeInstallmentRows)(student).some((row) => row.status === 'overdue');
    });
    if (overdueStudents.length > 0) {
        risks.push({
            title: 'Overdue Fee Payments',
            description: `${overdueStudents.length} active student${overdueStudents.length > 1 ? 's have' : ' has'} overdue installments${scope}${formatNames(overdueStudents)}.`,
            link: '/fees',
        });
    }
    const lowAttendance = activeStudents.filter((student) => student.status === 'active' &&
        (student.attendanceRate ?? 0) > 0 &&
        (student.attendanceRate ?? 0) < 75);
    if (lowAttendance.length > 0) {
        risks.push({
            title: 'Low Attendance Alert',
            description: `${lowAttendance.length} student${lowAttendance.length > 1 ? 's are' : ' is'} below 75% attendance${scope}${formatNames(lowAttendance)}.`,
            link: '/attendance',
        });
    }
    const onHold = students.filter((student) => student.status === 'on_hold');
    if (onHold.length > 0) {
        risks.push({
            title: 'Students On Hold',
            description: `${onHold.length} student${onHold.length > 1 ? 's are' : ' is'} marked on hold and may need follow-up${scope}${formatNames(onHold)}.`,
            link: '/students',
        });
    }
    const absentWatchlist = findConsecutiveAbsentStudents(activeStudents.filter((student) => student.status === 'active'), attendanceLogs, 2);
    if (absentWatchlist.length > 0) {
        risks.push({
            title: 'Attendance Watchlist',
            description: `${absentWatchlist.length} student${absentWatchlist.length > 1 ? 's were' : ' was'} absent for the last 2 recorded sessions${scope}${formatNames(absentWatchlist)}.`,
            link: '/attendance',
        });
    }
    const outstanding = (0, incomeStats_1.getOutstandingDues)(activeStudents);
    if (outstanding >= 50000 && overdueStudents.length === 0) {
        risks.push({
            title: 'High Outstanding Fees',
            description: `₹${outstanding.toLocaleString('en-IN')} in total outstanding fees${scope}. Review collection follow-ups.`,
            link: '/fees',
        });
    }
    const pendingConversions = options?.pendingConversions ?? 0;
    if (pendingConversions > 0) {
        risks.push({
            title: 'Pending Admissions',
            description: `${pendingConversions} lead conversion request${pendingConversions > 1 ? 's' : ''} awaiting approval${scope}.`,
            link: '/admissions',
        });
    }
    return risks;
}
