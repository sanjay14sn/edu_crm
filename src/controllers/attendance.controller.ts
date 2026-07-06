import { Response } from 'express';
import Attendance from '../models/Attendance';
import Student from '../models/Student';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth.middleware';
import { buildShiftPayload } from '../utils/shiftTimer';
import { tenantFilter } from '../utils/bdeStats';

export const getAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const { date, type, entityId } = req.query;

    const filter: any = {};

    if (req.user?.role === 'student') {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      const student = await Student.findOne({ email: user.email });
      if (!student) {
        return res.status(404).json({ message: 'Student profile not found' });
      }
      filter.entityId = String(student._id);
      filter.type = 'student';
      if (date) {
        filter.date = date;
      }
    } else if (req.user?.role === 'bde') {
      filter.entityId = String(req.user.id);
      filter.type = 'bde';
      if (date) {
        filter.date = date;
      }
    } else if (entityId) {
        filter.entityId = entityId;
        if (type) {
          filter.type = type;
        }
        if (date) {
          filter.date = date;
        }
      } else {
        if (req.user?.tenantId && req.user.role !== 'super_admin') {
          filter.tenantId = tenantFilter(req.user.tenantId);
        }
        if (!date || !type) {
          return res.status(400).json({ message: 'date and type query parameters are required' });
        }
        filter.date = date;
        filter.type = type;
      }

    const records = await Attendance.find(filter).sort({ date: -1, createdAt: -1 });
    res.status(200).json(
      records.map((r) => {
        const base = { ...r.toObject(), id: r._id };
        if (r.type === 'bde') {
          return buildShiftPayload(base);
        }
        return base;
      })
    );
  } catch (error) {
    res.status(500).json({ message: 'Error fetching attendance records', error });
  }
};

export const saveAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const { date, type, records } = req.body;
    if (!date || !type || !Array.isArray(records)) {
      return res.status(400).json({ message: 'date, type, and records array are required' });
    }

    const tenantId = req.user?.tenantId || 'ERP';

    const savedRecords = [];
    for (const record of records) {
      const { entityId, name, status, loginTime, logoutTime } = record;
      if (!entityId || !name || !status) continue;

      const existing = await Attendance.findOne({ tenantId, date, type, entityId });
      const update: Record<string, unknown> = { name, status };

      if (loginTime !== undefined) update.loginTime = loginTime;
      else if (existing?.loginTime) update.loginTime = existing.loginTime;

      if (logoutTime !== undefined) update.logoutTime = logoutTime;
      else if (existing?.logoutTime) update.logoutTime = existing.logoutTime;

      if (type === 'bde') {
        if (status === 'absent') {
          update.shiftStatus = 'offline';
          update.loginTime = '';
          update.logoutTime = '';
          update.loginAt = null;
          update.logoutAt = null;
          update.pausedAt = null;
          update.totalPausedSeconds = 0;
        } else {
          update.shiftStatus = 'finished';
          if (loginTime) update.loginTime = loginTime;
          if (logoutTime) update.logoutTime = logoutTime;
          if (loginTime && !existing?.loginAt) {
            update.loginAt = new Date(`${date}T09:30:00`).toISOString();
          }
          if (logoutTime && !existing?.logoutAt) {
            update.logoutAt = new Date(`${date}T18:30:00`).toISOString();
          }
        }
      }

      const updated = await Attendance.findOneAndUpdate(
        { tenantId, date, type, entityId },
        update,
        { returnDocument: 'after', upsert: true }
      );
      savedRecords.push(updated);

      if (type === 'student') {
        const studentLogs = await Attendance.find({ type: 'student', entityId });
        const presentCount = studentLogs.filter(l => l.status === 'present').length;
        const lateCount = studentLogs.filter(l => l.status === 'late').length;
        const totalCount = studentLogs.length;
        const rate = totalCount > 0 ? Math.round(((presentCount + lateCount) / totalCount) * 100) : 0;
        await Student.findByIdAndUpdate(entityId, { attendanceRate: rate });
      }
    }

    res.status(200).json(
      savedRecords.map((r) => {
        const payload = { ...r!.toObject(), id: r!._id };
        if (type === 'bde') return buildShiftPayload(payload);
        return payload;
      })
    );
  } catch (error) {
    res.status(500).json({ message: 'Error saving attendance records', error });
  }
};
