"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalyticsOverview = void 0;
const Student_1 = __importDefault(require("../models/Student"));
const Batch_1 = __importDefault(require("../models/Batch"));
const Trainer_1 = __importDefault(require("../models/Trainer"));
const Attendance_1 = __importDefault(require("../models/Attendance"));
const analyticsStats_1 = require("../utils/analyticsStats");
const trainerStats_1 = require("../utils/trainerStats");
function tenantFilter(tenantId) {
    const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
}
const getAnalyticsOverview = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        const filter = tenantId ? { tenantId: tenantFilter(tenantId) } : {};
        const [students, batches, trainers, studentAttendance] = await Promise.all([
            Student_1.default.find(filter).lean(),
            Batch_1.default.find(filter).select('trainerName schedule mode studentNames').lean(),
            Trainer_1.default.find(filter).lean(),
            Attendance_1.default.find({ ...filter, type: 'student' }).select('date status').lean(),
        ]);
        const { attendanceRecords: trainerAttendance } = await (0, trainerStats_1.loadTrainerStatsContext)(tenantId);
        const studentRecords = students.map((student) => ({
            name: student.name,
            status: student.status,
            feesPaid: student.feesPaid,
            enrollmentDate: student.enrollmentDate,
            attendanceRate: student.attendanceRate,
            updatedAt: student.updatedAt,
        }));
        const batchRecords = batches.map((batch) => ({
            trainerName: batch.trainerName,
            schedule: batch.schedule,
            mode: batch.mode,
            studentNames: batch.studentNames,
        }));
        res.status(200).json({
            monthlyRevenueGrowth: (0, analyticsStats_1.buildMonthlyRevenueByMode)(studentRecords, batchRecords),
            studentCumulativeGrowth: (0, analyticsStats_1.buildCumulativeStudentGrowth)(studentRecords),
            weeklyAttendanceRates: (0, analyticsStats_1.buildWeeklyAttendanceRates)(studentAttendance, studentRecords),
            facultyPerformance: await (0, analyticsStats_1.buildFacultyPerformance)(trainers.map((trainer) => ({
                _id: trainer._id,
                name: trainer.name,
                rating: trainer.rating,
            })), batchRecords, trainerAttendance),
            summary: {
                totalStudents: students.filter((student) => student.status === 'active').length,
                totalTrainers: trainers.length,
                totalBatches: batches.length,
                totalFeesCollected: students.reduce((sum, student) => sum + (student.feesPaid || 0), 0),
            },
        });
    }
    catch (error) {
        console.error('Error fetching analytics overview:', error);
        res.status(500).json({ message: 'Error fetching analytics overview', error });
    }
};
exports.getAnalyticsOverview = getAnalyticsOverview;
