import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import Student from '../models/Student';
import Batch from '../models/Batch';
import Trainer from '../models/Trainer';
import Attendance from '../models/Attendance';
import {
  buildCumulativeStudentGrowth,
  buildFacultyPerformance,
  buildMonthlyRevenueByMode,
  buildWeeklyAttendanceRates,
} from '../utils/analyticsStats';
import { loadTrainerStatsContext } from '../utils/trainerStats';

function tenantFilter(tenantId: string) {
  const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
}

export const getAnalyticsOverview = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const filter = tenantId ? { tenantId: tenantFilter(tenantId) } : {};

    const [students, batches, trainers, studentAttendance] = await Promise.all([
      Student.find(filter).lean(),
      Batch.find(filter).select('trainerName schedule mode studentNames').lean(),
      Trainer.find(filter).lean(),
      Attendance.find({ ...filter, type: 'student' }).select('date status').lean(),
    ]);

    const { attendanceRecords: trainerAttendance } = await loadTrainerStatsContext(tenantId);

    const studentRecords = students.map((student) => ({
      name: student.name,
      status: student.status,
      feesPaid: student.feesPaid,
      enrollmentDate: student.enrollmentDate,
      attendanceRate: student.attendanceRate,
      updatedAt: (student as { updatedAt?: Date }).updatedAt,
    }));

    const batchRecords = batches.map((batch) => ({
      trainerName: batch.trainerName,
      schedule: batch.schedule,
      mode: batch.mode,
      studentNames: batch.studentNames,
    }));

    res.status(200).json({
      monthlyRevenueGrowth: buildMonthlyRevenueByMode(studentRecords, batchRecords),
      studentCumulativeGrowth: buildCumulativeStudentGrowth(studentRecords),
      weeklyAttendanceRates: buildWeeklyAttendanceRates(studentAttendance, studentRecords),
      facultyPerformance: await buildFacultyPerformance(
        trainers.map((trainer) => ({
          _id: trainer._id,
          name: trainer.name,
          rating: trainer.rating,
        })),
        batchRecords,
        trainerAttendance
      ),
      summary: {
        totalStudents: students.filter((student) => student.status === 'active').length,
        totalTrainers: trainers.length,
        totalBatches: batches.length,
        totalFeesCollected: students.reduce((sum, student) => sum + (student.feesPaid || 0), 0),
      },
    });
  } catch (error) {
    console.error('Error fetching analytics overview:', error);
    res.status(500).json({ message: 'Error fetching analytics overview', error });
  }
};
