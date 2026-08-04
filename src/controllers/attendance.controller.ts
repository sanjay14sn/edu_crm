import { Response } from 'express';
import Attendance from '../models/Attendance';
import Student from '../models/Student';
import User from '../models/User';
import Trainer from '../models/Trainer';
import BDEProfile from '../models/BDEProfile';
import { AuthRequest } from '../middleware/auth.middleware';
import { buildShiftPayload, parseManualShiftTime } from '../utils/shiftTimer';
import { tenantFilter } from '../utils/bdeStats';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function wasPresentOrPunched(record: {
  status?: string;
  loginTime?: string;
  shiftStatus?: string;
} | null | undefined) {
  if (!record) return false;
  if (record.status === 'present' || record.status === 'late') return true;
  if (record.loginTime) return true;
  if (record.shiftStatus === 'active' || record.shiftStatus === 'paused' || record.shiftStatus === 'finished') {
    return true;
  }
  return false;
}

async function listStaffForType(tenantId: string | undefined, type: string, role?: string) {
  if (type === 'trainer') {
    const filter =
      role === 'super_admin' || !tenantId ? {} : { tenantId: tenantFilter(tenantId) };
    const trainers = await Trainer.find(filter);
    return trainers
      .filter((t) => String(t.status || 'Active').toLowerCase() !== 'inactive')
      .map((t) => ({ entityId: t._id.toString(), name: t.name }));
  }

  if (type === 'bde') {
    const userFilter: Record<string, unknown> = { role: 'bde' };
    if (role !== 'super_admin' && tenantId) userFilter.tenantId = tenantId;
    const users = await User.find(userFilter);
    const profiles = await BDEProfile.find({ userId: { $in: users.map((u) => u._id) } });
    return users
      .filter((u) => {
        const profile = profiles.find((p) => p.userId.toString() === u._id.toString());
        return (profile?.status || 'active') !== 'inactive';
      })
      .map((u) => ({ entityId: u._id.toString(), name: u.name }));
  }

  return [];
}

export const getAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const { date, type, entityId, month } = req.query;

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
        if (!type) {
          return res.status(400).json({ message: 'type query parameter is required' });
        }
        filter.type = type;
        if (month && typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) {
          filter.date = { $regex: `^${month}` };
        } else if (date) {
          filter.date = date;
        } else {
          return res.status(400).json({ message: 'date or month query parameter is required' });
        }
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
          const parsedLogin = parseManualShiftTime(date, loginTime);
          const parsedLogout = parseManualShiftTime(date, logoutTime);
          if (parsedLogin) update.loginAt = parsedLogin;
          if (parsedLogout) update.logoutAt = parsedLogout;
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

/**
 * End-of-day close: for each past day in the month, staff who were not marked
 * present/late and did not punch in are auto-marked absent.
 */
export const finalizeAttendanceMonth = async (req: AuthRequest, res: Response) => {
  try {
    const month = String(req.body.month || '');
    const typeRaw = String(req.body.type || '');
    if (!/^\d{4}-\d{2}$/.test(month) || !['trainer', 'bde'].includes(typeRaw)) {
      return res.status(400).json({ message: 'month (YYYY-MM) and type (trainer|bde) are required' });
    }

    const type = typeRaw as 'trainer' | 'bde';
    const tenantId = req.user?.tenantId || 'ERP';
    const staff = await listStaffForType(req.user?.tenantId, type, req.user?.role);
    if (staff.length === 0) {
      return res.status(200).json({ markedAbsent: 0, records: [] });
    }

    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const today = todayIso();
    const filter: Record<string, unknown> = {
      type,
      date: { $regex: `^${month}` },
    };
    if (req.user?.tenantId && req.user.role !== 'super_admin') {
      filter.tenantId = tenantFilter(req.user.tenantId);
    }
    const existing = await Attendance.find(filter);
    const byKey = new Map(existing.map((r) => [`${r.date}:${r.entityId}`, r]));

    let markedAbsent = 0;
    const created: typeof existing = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${month}-${String(day).padStart(2, '0')}`;
      if (date >= today) continue; // only past days (EOD already passed)

      for (const person of staff) {
        const key = `${date}:${person.entityId}`;
        const record = byKey.get(key);
        if (wasPresentOrPunched(record)) continue;
        if (record?.status === 'absent') continue;

        const updated = await Attendance.findOneAndUpdate(
          { tenantId, date, type, entityId: person.entityId },
          {
            name: person.name,
            status: 'absent',
            ...(type === 'bde'
              ? {
                  shiftStatus: 'offline',
                  loginTime: '',
                  logoutTime: '',
                  loginAt: null,
                  logoutAt: null,
                  pausedAt: null,
                  totalPausedSeconds: 0,
                }
              : {}),
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        if (updated) {
          markedAbsent += 1;
          created.push(updated);
          byKey.set(key, updated);
        }
      }
    }

    res.status(200).json({
      markedAbsent,
      records: created.map((r) => ({ ...r.toObject(), id: r._id.toString() })),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error finalizing attendance month', error });
  }
};
