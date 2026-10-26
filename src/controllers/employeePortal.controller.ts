import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import HREmployee from '../models/HREmployee';
import Attendance from '../models/Attendance';
import HRHoliday from '../models/HRHoliday';
import HRPayroll from '../models/HRPayroll';
import HRDocument from '../models/HRDocument';
import { HRLeaveRequest } from '../models/HRLeave';
import EmployeeTask from '../models/EmployeeTask';
import EmployeeDailyReport from '../models/EmployeeDailyReport';
import AttendanceCorrection from '../models/AttendanceCorrection';
import User from '../models/User';
import { buildShiftPayload, formatShiftTime, parseManualShiftTime } from '../utils/shiftTimer';
import {
  tenantFilter,
  todayStr,
  daysBetween,
  ensureLeaveBalance,
  serializeEmployee,
} from './hrSuite.controller';

const LEAVE_TYPES = ['casual', 'sick', 'earned'];
const WORK_MODES = ['office', 'remote', 'field'];
const TASK_STATUSES = ['pending', 'in_progress', 'completed'];
const TASK_PRIORITIES = ['low', 'medium', 'high'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

type EmployeeDoc = InstanceType<typeof HREmployee>;

function serialize(doc: { toObject: () => Record<string, unknown>; _id: { toString(): string } }) {
  return { ...doc.toObject(), id: doc._id.toString() };
}

function serializeShift(doc: InstanceType<typeof Attendance>) {
  return { ...buildShiftPayload(doc.toObject()), workMode: doc.workMode };
}

/** Attendance.tenantId is required, so fall back when an employee has no tenant. */
function attendanceTenant(emp: EmployeeDoc, req: AuthRequest) {
  return emp.tenantId || req.user?.tenantId || 'default';
}

async function resolveEmployee(req: AuthRequest, res: Response): Promise<EmployeeDoc | null> {
  const emp = await HREmployee.findOne({ userId: req.user?.id });
  if (!emp) {
    res.status(404).json({ message: 'No employee profile is linked to your login. Please contact HR.' });
    return null;
  }
  if (emp.status === 'exited') {
    res.status(403).json({ message: 'Your employee profile is inactive. Please contact HR.' });
    return null;
  }
  return emp;
}

// ---------- Dashboard ----------

export const getSummary = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await resolveEmployee(req, res);
    if (!emp) return;
    const employeeId = emp._id.toString();
    const today = todayStr();

    const [attendance, balance, pendingLeaves, report, openTasks] = await Promise.all([
      Attendance.findOne({ type: 'employee', entityId: employeeId, date: today }),
      ensureLeaveBalance(emp.tenantId, employeeId, new Date().getFullYear()),
      HRLeaveRequest.countDocuments({ employeeId, status: 'Pending' }),
      EmployeeDailyReport.findOne({ employeeId, date: today }),
      EmployeeTask.countDocuments({ employeeId, status: { $ne: 'completed' } }),
    ]);

    res.status(200).json({
      employee: serializeEmployee(emp),
      today: {
        date: today,
        attendance: attendance ? serializeShift(attendance) : null,
        reportSubmitted: Boolean(report),
      },
      leave: {
        casual: balance.casual,
        sick: balance.sick,
        earned: balance.earned,
        available: balance.casual + balance.sick + balance.earned,
        pending: pendingLeaves,
      },
      openTasks,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error loading employee dashboard', error });
  }
};

// ---------- Attendance ----------

export const clockIn = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await resolveEmployee(req, res);
    if (!emp) return;
    const employeeId = emp._id.toString();
    const today = todayStr();
    const workMode = WORK_MODES.includes(req.body.workMode) ? req.body.workMode : 'office';

    const existing = await Attendance.findOne({ type: 'employee', entityId: employeeId, date: today });
    if (existing?.loginAt) {
      return res.status(400).json({ message: 'You have already clocked in today' });
    }

    const now = new Date();
    const record = await Attendance.findOneAndUpdate(
      { tenantId: attendanceTenant(emp, req), date: today, type: 'employee', entityId: employeeId },
      {
        name: emp.name,
        status: 'present',
        loginAt: now.toISOString(),
        loginTime: formatShiftTime(now),
        shiftStatus: 'active',
        workMode,
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    res.status(200).json(record ? serializeShift(record) : null);
  } catch (error) {
    res.status(500).json({ message: 'Error clocking in', error });
  }
};

export const clockOut = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await resolveEmployee(req, res);
    if (!emp) return;
    const record = await Attendance.findOne({
      type: 'employee',
      entityId: emp._id.toString(),
      date: todayStr(),
    });
    if (!record?.loginAt) {
      return res.status(400).json({ message: 'You have not clocked in today' });
    }
    if (record.logoutAt) {
      return res.status(400).json({ message: 'You have already clocked out today' });
    }

    const now = new Date();
    record.logoutAt = now.toISOString();
    record.logoutTime = formatShiftTime(now);
    record.shiftStatus = 'finished';
    await record.save();
    res.status(200).json(serializeShift(record));
  } catch (error) {
    res.status(500).json({ message: 'Error clocking out', error });
  }
};

export const getAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await resolveEmployee(req, res);
    if (!emp) return;
    const employeeId = emp._id.toString();
    const monthParam = String(req.query.month || '');
    const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : todayStr().slice(0, 7);

    const [records, corrections] = await Promise.all([
      Attendance.find({ type: 'employee', entityId: employeeId, date: { $regex: `^${month}` } }).sort({ date: -1 }),
      AttendanceCorrection.find({ employeeId }).sort({ createdAt: -1 }).limit(50),
    ]);

    res.status(200).json({
      month,
      records: records.map(serializeShift),
      corrections: corrections.map(serialize),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error loading attendance', error });
  }
};

export const requestCorrection = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await resolveEmployee(req, res);
    if (!emp) return;
    const employeeId = emp._id.toString();
    const date = String(req.body.date || '');
    const requestedLoginTime = String(req.body.requestedLoginTime || '');
    const requestedLogoutTime = String(req.body.requestedLogoutTime || '');
    const reason = String(req.body.reason || '').trim();

    if (!DATE_RE.test(date)) return res.status(400).json({ message: 'A valid date is required' });
    if (date > todayStr()) return res.status(400).json({ message: 'Corrections cannot be requested for future dates' });
    if (!reason) return res.status(400).json({ message: 'Reason is required' });
    if (!requestedLoginTime && !requestedLogoutTime) {
      return res.status(400).json({ message: 'Provide a clock-in or clock-out time' });
    }
    if ((requestedLoginTime && !TIME_RE.test(requestedLoginTime)) || (requestedLogoutTime && !TIME_RE.test(requestedLogoutTime))) {
      return res.status(400).json({ message: 'Times must be in HH:mm format' });
    }
    if (requestedLoginTime && requestedLogoutTime && requestedLogoutTime <= requestedLoginTime) {
      return res.status(400).json({ message: 'Clock-out time must be after clock-in time' });
    }

    const pending = await AttendanceCorrection.findOne({ employeeId, date, status: 'Pending' });
    if (pending) {
      return res.status(409).json({ message: 'A correction for this date is already awaiting approval' });
    }

    const row = await AttendanceCorrection.create({
      tenantId: emp.tenantId,
      employeeId,
      employeeName: emp.name,
      date,
      requestedLoginTime: requestedLoginTime || undefined,
      requestedLogoutTime: requestedLogoutTime || undefined,
      reason,
    });
    res.status(201).json(serialize(row));
  } catch (error) {
    res.status(500).json({ message: 'Error requesting correction', error });
  }
};

// ---------- Tasks ----------

export const listTasks = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await resolveEmployee(req, res);
    if (!emp) return;
    const tasks = await EmployeeTask.find({ employeeId: emp._id.toString() }).sort({ createdAt: -1 }).limit(200);
    res.status(200).json(tasks.map(serialize));
  } catch (error) {
    res.status(500).json({ message: 'Error loading tasks', error });
  }
};

export const createTask = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await resolveEmployee(req, res);
    if (!emp) return;
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ message: 'Title is required' });
    const dueDate = String(req.body.dueDate || '');

    const task = await EmployeeTask.create({
      tenantId: emp.tenantId,
      employeeId: emp._id.toString(),
      title,
      description: String(req.body.description || '').trim(),
      priority: TASK_PRIORITIES.includes(req.body.priority) ? req.body.priority : 'medium',
      dueDate: DATE_RE.test(dueDate) ? dueDate : undefined,
      assignedBy: req.user?.id,
      assignedByName: 'Self',
    });
    res.status(201).json(serialize(task));
  } catch (error) {
    res.status(500).json({ message: 'Error creating task', error });
  }
};

export const updateTask = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await resolveEmployee(req, res);
    if (!emp) return;
    const task = await EmployeeTask.findOne({ _id: req.params.id, employeeId: emp._id.toString() });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    if (req.body.status !== undefined) {
      if (!TASK_STATUSES.includes(req.body.status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      task.status = req.body.status;
      task.completedAt = req.body.status === 'completed' ? new Date().toISOString() : undefined;
    }
    if (req.body.remarks !== undefined) task.remarks = String(req.body.remarks).trim();
    await task.save();
    res.status(200).json(serialize(task));
  } catch (error) {
    res.status(500).json({ message: 'Error updating task', error });
  }
};

// ---------- Daily reports ----------

export const listDailyReports = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await resolveEmployee(req, res);
    if (!emp) return;
    const reports = await EmployeeDailyReport.find({ employeeId: emp._id.toString() }).sort({ date: -1 }).limit(60);
    res.status(200).json(reports.map(serialize));
  } catch (error) {
    res.status(500).json({ message: 'Error loading daily reports', error });
  }
};

export const submitDailyReport = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await resolveEmployee(req, res);
    if (!emp) return;
    const date = DATE_RE.test(String(req.body.date || '')) ? String(req.body.date) : todayStr();
    if (date > todayStr()) return res.status(400).json({ message: 'Reports cannot be submitted for future dates' });
    const tasksCompleted = String(req.body.tasksCompleted || '').trim();
    if (!tasksCompleted) return res.status(400).json({ message: 'Tasks completed today is required' });
    const hours = Number(req.body.hoursWorked);
    if (req.body.hoursWorked === undefined || req.body.hoursWorked === '' || !Number.isFinite(hours) || hours < 0 || hours > 24) {
      return res.status(400).json({ message: 'Hours worked must be between 0 and 24' });
    }

    const report = await EmployeeDailyReport.findOneAndUpdate(
      { employeeId: emp._id.toString(), date },
      {
        tenantId: emp.tenantId,
        employeeName: emp.name,
        tasksCompleted,
        tasksInProgress: String(req.body.tasksInProgress || '').trim(),
        blockers: String(req.body.blockers || '').trim(),
        planForTomorrow: String(req.body.planForTomorrow || '').trim(),
        hoursWorked: hours,
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    res.status(200).json(report ? serialize(report) : null);
  } catch (error) {
    res.status(500).json({ message: 'Error submitting daily report', error });
  }
};

// ---------- Leave ----------

export const getLeave = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await resolveEmployee(req, res);
    if (!emp) return;
    const employeeId = emp._id.toString();
    const year = new Date().getFullYear();
    const [balance, requests] = await Promise.all([
      ensureLeaveBalance(emp.tenantId, employeeId, year),
      HRLeaveRequest.find({ employeeId }).sort({ createdAt: -1 }).limit(100),
    ]);
    res.status(200).json({
      balance: { year, casual: balance.casual, sick: balance.sick, earned: balance.earned },
      requests: requests.map(serialize),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error loading leave', error });
  }
};

export const applyLeave = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await resolveEmployee(req, res);
    if (!emp) return;
    const employeeId = emp._id.toString();
    const { leaveType, startDate, endDate } = req.body;
    const reason = String(req.body.reason || '').trim();

    if (!LEAVE_TYPES.includes(leaveType)) return res.status(400).json({ message: 'Invalid leave type' });
    if (!DATE_RE.test(startDate || '') || !DATE_RE.test(endDate || '')) {
      return res.status(400).json({ message: 'Start and end dates are required' });
    }
    if (endDate < startDate) return res.status(400).json({ message: 'End date must be on or after start date' });

    const days = daysBetween(startDate, endDate);
    const balance = await ensureLeaveBalance(emp.tenantId, employeeId, Number(startDate.slice(0, 4)));
    const available = (balance as unknown as Record<string, number>)[leaveType] ?? 0;
    if (available < days) {
      return res.status(400).json({ message: `Insufficient ${leaveType} leave balance (${available} left)` });
    }

    const row = await HRLeaveRequest.create({
      tenantId: emp.tenantId,
      employeeId,
      employeeName: emp.name,
      leaveType,
      startDate,
      endDate,
      days,
      reason,
      status: 'Pending',
    });
    res.status(201).json(serialize(row));
  } catch (error) {
    res.status(500).json({ message: 'Error applying for leave', error });
  }
};

export const cancelLeave = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await resolveEmployee(req, res);
    if (!emp) return;
    const row = await HRLeaveRequest.findOne({ _id: req.params.id, employeeId: emp._id.toString() });
    if (!row) return res.status(404).json({ message: 'Leave request not found' });
    if (row.status !== 'Pending') {
      return res.status(400).json({ message: 'Only pending requests can be cancelled' });
    }
    row.status = 'Cancelled';
    await row.save();
    res.status(200).json(serialize(row));
  } catch (error) {
    res.status(500).json({ message: 'Error cancelling leave', error });
  }
};

// ---------- Holidays, payslips, documents ----------

const NATIONAL_HOLIDAYS = [
  { monthDay: '01-26', name: 'Republic Day' },
  { monthDay: '08-15', name: 'Independence Day' },
  { monthDay: '10-02', name: 'Gandhi Jayanti' },
];

export const listHolidays = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await resolveEmployee(req, res);
    if (!emp) return;
    const yearParam = String(req.query.year || '');
    const year = /^\d{4}$/.test(yearParam) ? yearParam : String(new Date().getFullYear());
    const holidays = await HRHoliday.find({
      ...tenantFilter(emp.tenantId),
      date: { $regex: `^${year}` },
    }).sort({ date: 1 });
    const rows: Array<Record<string, unknown>> = holidays.map(serialize);
    const declared = new Set(holidays.map((h) => h.date));
    for (const n of NATIONAL_HOLIDAYS) {
      const date = `${year}-${n.monthDay}`;
      if (declared.has(date)) continue;
      rows.push({ id: `national-${date}`, name: n.name, date, optional: false, notes: 'National holiday' });
    }
    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Error loading holidays', error });
  }
};

export const listPayslips = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await resolveEmployee(req, res);
    if (!emp) return;
    const payroll = await HRPayroll.find({
      employeeId: { $in: [emp._id.toString(), emp.sourceId] },
      status: { $in: ['Approved', 'Released'] },
    }).sort({ month: -1 });
    res.status(200).json(payroll.map(serialize));
  } catch (error) {
    res.status(500).json({ message: 'Error loading payslips', error });
  }
};

export const listDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await resolveEmployee(req, res);
    if (!emp) return;
    const docs = await HRDocument.find({
      employeeId: emp._id.toString(),
      sharedWithEmployee: { $ne: false },
    }).sort({ createdAt: -1 });
    res.status(200).json(docs.map(serialize));
  } catch (error) {
    res.status(500).json({ message: 'Error loading documents', error });
  }
};

// ---------- Admin (owner / super admin) ----------

async function findTenantEmployee(id: string, tenantId?: string) {
  return HREmployee.findOne({ _id: id, ...tenantFilter(tenantId) });
}

export const adminListTasks = async (req: AuthRequest, res: Response) => {
  try {
    const filter: Record<string, unknown> = { ...tenantFilter(req.user?.tenantId) };
    if (req.query.employeeId) filter.employeeId = String(req.query.employeeId);
    if (req.query.status) filter.status = String(req.query.status);
    const tasks = await EmployeeTask.find(filter).sort({ createdAt: -1 }).limit(500);
    res.status(200).json(tasks.map(serialize));
  } catch (error) {
    res.status(500).json({ message: 'Error listing tasks', error });
  }
};

export const adminCreateTask = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await findTenantEmployee(String(req.body.employeeId || ''), req.user?.tenantId);
    if (!emp) return res.status(404).json({ message: 'Employee not found' });
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ message: 'Title is required' });
    const dueDate = String(req.body.dueDate || '');
    const assigner = await User.findById(req.user?.id).select('name');

    const task = await EmployeeTask.create({
      tenantId: emp.tenantId,
      employeeId: emp._id.toString(),
      title,
      description: String(req.body.description || '').trim(),
      priority: TASK_PRIORITIES.includes(req.body.priority) ? req.body.priority : 'medium',
      dueDate: DATE_RE.test(dueDate) ? dueDate : undefined,
      assignedBy: req.user?.id,
      assignedByName: assigner?.name || 'Admin',
    });
    res.status(201).json(serialize(task));
  } catch (error) {
    res.status(500).json({ message: 'Error assigning task', error });
  }
};

export const adminListDailyReports = async (req: AuthRequest, res: Response) => {
  try {
    const filter: Record<string, unknown> = { ...tenantFilter(req.user?.tenantId) };
    if (req.query.employeeId) filter.employeeId = String(req.query.employeeId);
    if (DATE_RE.test(String(req.query.date || ''))) filter.date = String(req.query.date);
    const reports = await EmployeeDailyReport.find(filter).sort({ date: -1, createdAt: -1 }).limit(500);
    res.status(200).json(reports.map(serialize));
  } catch (error) {
    res.status(500).json({ message: 'Error listing daily reports', error });
  }
};

export const adminListCorrections = async (req: AuthRequest, res: Response) => {
  try {
    const filter: Record<string, unknown> = { ...tenantFilter(req.user?.tenantId) };
    if (req.query.status) filter.status = String(req.query.status);
    const rows = await AttendanceCorrection.find(filter).sort({ createdAt: -1 }).limit(500);
    res.status(200).json(rows.map(serialize));
  } catch (error) {
    res.status(500).json({ message: 'Error listing corrections', error });
  }
};

export const adminReviewCorrection = async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'status must be Approved or Rejected' });
    }
    const row = await AttendanceCorrection.findOne({ _id: req.params.id, ...tenantFilter(req.user?.tenantId) });
    if (!row) return res.status(404).json({ message: 'Correction not found' });
    if (row.status !== 'Pending') return res.status(400).json({ message: 'Correction already reviewed' });

    if (status === 'Approved') {
      const emp = await HREmployee.findById(row.employeeId);
      if (!emp) return res.status(404).json({ message: 'Employee not found' });

      const patch: Record<string, unknown> = { name: emp.name, status: 'present' };
      const loginAt = parseManualShiftTime(row.date, row.requestedLoginTime);
      const logoutAt = parseManualShiftTime(row.date, row.requestedLogoutTime);
      if (loginAt) {
        patch.loginAt = loginAt;
        patch.loginTime = formatShiftTime(new Date(loginAt));
      }
      if (logoutAt) {
        patch.logoutAt = logoutAt;
        patch.logoutTime = formatShiftTime(new Date(logoutAt));
      }
      patch.shiftStatus = logoutAt ? 'finished' : 'active';

      await Attendance.findOneAndUpdate(
        {
          tenantId: emp.tenantId || req.user?.tenantId || 'default',
          date: row.date,
          type: 'employee',
          entityId: row.employeeId,
        },
        patch,
        { upsert: true, setDefaultsOnInsert: true }
      );
    }

    row.status = status;
    row.reviewedBy = req.user?.id;
    row.reviewedAt = todayStr();
    await row.save();
    res.status(200).json(serialize(row));
  } catch (error) {
    res.status(500).json({ message: 'Error reviewing correction', error });
  }
};
