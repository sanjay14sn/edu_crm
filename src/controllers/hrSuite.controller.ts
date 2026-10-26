import { Response } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Trainer from '../models/Trainer';
import User from '../models/User';
import BDEProfile from '../models/BDEProfile';
import Attendance from '../models/Attendance';
import HREmployee from '../models/HREmployee';
import HRHoliday from '../models/HRHoliday';
import HRSalaryStructure, {
  customComponentTotal,
  structureGross,
  type ICustomSalaryComponent,
  type ISalaryComponentRule,
  type SalaryComponentMode,
} from '../models/HRSalaryStructure';
import { HRLeavePolicy, HRLeaveBalance, HRLeaveRequest } from '../models/HRLeave';
import HRPayroll from '../models/HRPayroll';
import HRClaim from '../models/HRClaim';
import HRDocument, { HR_DOCUMENT_CATEGORIES, type HRDocumentCategory } from '../models/HRDocument';
import { AuthRequest } from '../middleware/auth.middleware';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function tenantFilter(tenantId?: string) {
  if (!tenantId) return {};
  const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { tenantId: { $regex: new RegExp(`^${escaped}\\s*$`, 'i') } };
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthPrefix(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function daysBetween(start: string, end: string) {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  return Math.max(1, diff + 1);
}

async function loadBdes(tenantId?: string, role?: string) {
  const filter: Record<string, unknown> = { role: 'bde' };
  if (role !== 'super_admin' && tenantId) filter.tenantId = tenantId;
  const users = await User.find(filter);
  const profiles = await BDEProfile.find({ userId: { $in: users.map((u) => u._id) } });
  return users.map((user) => {
    const profile = profiles.find((p) => p.userId.toString() === user._id.toString());
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      joiningDate: profile?.joiningDate ? profile.joiningDate.toISOString().split('T')[0] : todayStr(),
      status: profile?.status || 'active',
      monthlyTarget: profile?.monthlyTarget || 30,
      commissionPercentage: profile?.commissionPercentage || 0,
      commissionEnabled: profile?.commissionEnabled || false,
      dob: profile?.dob ? profile.dob.toISOString().split('T')[0] : undefined,
    };
  });
}

export async function syncHREmployees(tenantId?: string, role?: string) {
  const isAdmin = role === 'super_admin';
  const staffFilter = isAdmin || !tenantId ? {} : tenantFilter(tenantId);
  const [trainers, bdes] = await Promise.all([
    Trainer.find(staffFilter),
    loadBdes(tenantId, role),
  ]);

  const upserts: Array<Promise<unknown>> = [];

  for (const trainer of trainers) {
    const sourceId = trainer._id.toString();
    const status = String(trainer.status || 'Active').toLowerCase() === 'inactive' ? 'exited' : 'active';
    upserts.push(
      HREmployee.findOneAndUpdate(
        { sourceType: 'trainer', sourceId, ...tenantFilter(tenantId) },
        {
          tenantId,
          sourceType: 'trainer',
          sourceId,
          employeeCode: trainer.trainerId || `TRN-${sourceId.slice(-4)}`,
          name: trainer.name,
          email: trainer.email,
          phone: trainer.phone,
          department: 'Education & Tech',
          designation: 'Trainer',
          branch: trainer.tenantId || 'Main Campus',
          employmentType:
            trainer.employmentType === 'Part Time'
              ? 'Part-Time'
              : trainer.employmentType === 'Contract' ||
                  trainer.employmentType === 'Freelancer / External Trainer' ||
                  trainer.employmentType === 'Guest Lecturer'
                ? 'Contract'
                : 'Full-Time',
          joiningDate: trainer.joiningDate
            ? new Date(trainer.joiningDate).toISOString().split('T')[0]
            : todayStr(),
          reportingManager: 'Center Admin',
          status,
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      ).then(async (doc) => {
        // Only seed pay on first sync; keep salary-structure / HR edits afterwards
        if (doc && !(doc.baseSalary > 0)) {
          doc.baseSalary = trainer.salaryRateAmount || 0;
          await doc.save();
        }
        return doc;
      })
    );
  }

  for (const bde of bdes) {
    upserts.push(
      HREmployee.findOneAndUpdate(
        { sourceType: 'bde', sourceId: bde.id, ...tenantFilter(tenantId) },
        {
          tenantId,
          sourceType: 'bde',
          sourceId: bde.id,
          employeeCode: `BDE-${bde.id.slice(-4).toUpperCase()}`,
          name: bde.name,
          email: bde.email,
          department: 'Sales & CRM',
          designation: 'BDE',
          branch: 'Main Campus',
          employmentType: 'Full-Time',
          joiningDate: bde.joiningDate || todayStr(),
          reportingManager: 'Center Admin',
          dateOfBirth: bde.dob,
          status: bde.status === 'inactive' ? 'exited' : 'active',
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      ).then(async (doc) => {
        if (doc && !(doc.baseSalary > 0)) {
          doc.baseSalary = 30000;
          await doc.save();
        }
        return doc;
      })
    );
  }

  await Promise.all(upserts);
  return HREmployee.find(tenantFilter(tenantId)).sort({ name: 1 });
}

function annualEntitlement(days: number, basis: 'yearly' | 'monthly' | undefined) {
  const n = Number(days) || 0;
  return basis === 'monthly' ? n * 12 : n;
}

export async function ensureLeaveBalance(tenantId: string | undefined, employeeId: string, year: number) {
  let policy = await HRLeavePolicy.findOne(tenantFilter(tenantId));
  if (!policy) {
    policy = await HRLeavePolicy.create({
      tenantId,
      basis: 'yearly',
      casualDays: 12,
      sickDays: 10,
      earnedDays: 15,
      carryForwardEarned: true,
    });
  }
  let balance = await HRLeaveBalance.findOne({ ...tenantFilter(tenantId), employeeId, year });
  if (!balance) {
    const basis = (policy.basis as 'yearly' | 'monthly') || 'yearly';
    balance = await HRLeaveBalance.create({
      tenantId,
      employeeId,
      year,
      casual: annualEntitlement(policy.casualDays, basis),
      sick: annualEntitlement(policy.sickDays, basis),
      earned: annualEntitlement(policy.earnedDays, basis),
    });
  }
  return balance;
}

export function serializeEmployee(doc: InstanceType<typeof HREmployee>) {
  return { ...doc.toObject(), id: doc._id.toString(), portalAccess: Boolean(doc.userId) };
}

function avatarFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

/** Returns an error message when the email cannot be used for this employee's login. */
async function portalEmailConflict(email: string, currentUserId?: string) {
  const existing = await User.findOne({ email });
  if (existing && existing._id.toString() !== currentUserId) {
    return 'This email is already used by another login';
  }
  return null;
}

async function upsertEmployeeLogin(
  emp: InstanceType<typeof HREmployee>,
  email: string,
  password: string,
  tenantId?: string
) {
  const hashed = await bcrypt.hash(password, await bcrypt.genSalt(10));
  const existing = emp.userId ? await User.findById(emp.userId) : null;
  if (existing) {
    existing.email = email;
    existing.name = emp.name;
    existing.password = hashed;
    await existing.save();
    return existing;
  }
  const user = await User.create({
    name: emp.name,
    email,
    password: hashed,
    role: 'employee',
    tenantId,
    avatar: avatarFromName(emp.name),
  });
  emp.userId = user._id.toString();
  if (!emp.email) emp.email = email;
  await emp.save();
  return user;
}

export const createEmployee = async (req: AuthRequest, res: Response) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Name is required' });

    const portalPassword = String(req.body.portalPassword || '');
    const portalEmail = String(req.body.email || '').trim().toLowerCase();
    if (portalPassword) {
      if (!portalEmail) {
        return res.status(400).json({ message: 'Email is required to enable portal login' });
      }
      if (portalPassword.length < 4) {
        return res.status(400).json({ message: 'Portal password must be at least 4 characters' });
      }
      const conflict = await portalEmailConflict(portalEmail);
      if (conflict) return res.status(409).json({ message: conflict });
    }

    const sourceId = `manual-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const employeeCode =
      String(req.body.employeeCode || '').trim() || `EMP-${sourceId.slice(-6).toUpperCase()}`;

    const existingCode = await HREmployee.findOne({
      ...tenantFilter(req.user?.tenantId),
      employeeCode,
    });
    if (existingCode) {
      return res.status(409).json({ message: 'Employee code already exists' });
    }

    const employmentTypes = ['Full-Time', 'Part-Time', 'Contract', 'Intern'];
    const employmentType = employmentTypes.includes(req.body.employmentType)
      ? req.body.employmentType
      : 'Full-Time';

    const emp = await HREmployee.create({
      tenantId: req.user?.tenantId,
      sourceType: 'manual',
      sourceId,
      employeeCode,
      name,
      email: String(req.body.email || '').trim(),
      phone: String(req.body.phone || '').trim(),
      department: String(req.body.department || 'General').trim() || 'General',
      designation: String(req.body.designation || 'Staff').trim() || 'Staff',
      branch: String(req.body.branch || 'Main Campus').trim() || 'Main Campus',
      employmentType,
      joiningDate: req.body.joiningDate || todayStr(),
      reportingManager: String(req.body.reportingManager || 'Center Admin').trim() || 'Center Admin',
      dateOfBirth: req.body.dateOfBirth || undefined,
      status: 'active',
      baseSalary: Number(req.body.baseSalary) || 0,
    });

    if (portalPassword) {
      await upsertEmployeeLogin(emp, portalEmail, portalPassword, req.user?.tenantId);
    }

    res.status(201).json(serializeEmployee(emp));
  } catch (error) {
    res.status(500).json({ message: 'Error creating employee', error });
  }
};

export const setEmployeePortalAccess = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await HREmployee.findOne({ _id: req.params.id, ...tenantFilter(req.user?.tenantId) });
    if (!emp) return res.status(404).json({ message: 'Employee not found' });
    if (emp.sourceType !== 'manual') {
      return res.status(400).json({
        message: 'Trainers and BDEs sign in through their own portals',
      });
    }

    const email = String(req.body.email || emp.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email) return res.status(400).json({ message: 'Email is required' });
    if (password.length < 4) {
      return res.status(400).json({ message: 'Password must be at least 4 characters' });
    }

    const conflict = await portalEmailConflict(email, emp.userId);
    if (conflict) return res.status(409).json({ message: conflict });

    await upsertEmployeeLogin(emp, email, password, req.user?.tenantId);
    res.status(200).json(serializeEmployee(emp));
  } catch (error) {
    res.status(500).json({ message: 'Error updating portal access', error });
  }
};

export const listEmployees = async (req: AuthRequest, res: Response) => {
  try {
    let employees = await syncHREmployees(req.user?.tenantId, req.user?.role);

    // Align employee baseSalary with salary-structure gross when a structure exists
    const structures = await HRSalaryStructure.find(tenantFilter(req.user?.tenantId));
    const byEmp = new Map(structures.map((s) => [s.employeeId, s]));
    await Promise.all(
      employees.map(async (emp) => {
        const structure = byEmp.get(emp._id.toString());
        if (!structure) return;
        const gross = structureGross(structure);
        if (emp.baseSalary !== gross) {
          emp.baseSalary = gross;
          await emp.save();
        }
      })
    );
    employees = await HREmployee.find(tenantFilter(req.user?.tenantId)).sort({ name: 1 });

    if (req.user?.role === 'trainer' || req.user?.role === 'bde') {
      const user = await User.findById(req.user.id);
      employees = employees.filter(
        (e) =>
          e.sourceId === req.user?.id ||
          (user && e.name.toLowerCase() === user.name.toLowerCase()) ||
          (user?.email && e.email && e.email.toLowerCase() === user.email.toLowerCase())
      );
    }
    res.status(200).json(employees.map(serializeEmployee));
  } catch (error) {
    res.status(500).json({ message: 'Error listing HR employees', error });
  }
};

export const updateEmployee = async (req: AuthRequest, res: Response) => {
  try {
    const allowed = [
      'department',
      'designation',
      'branch',
      'employmentType',
      'joiningDate',
      'reportingManager',
      'dateOfBirth',
      'baseSalary',
      'phone',
      'email',
    ];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    const emp = await HREmployee.findOneAndUpdate(
      { _id: req.params.id, ...tenantFilter(req.user?.tenantId) },
      patch,
      { returnDocument: 'after' }
    );
    if (!emp) return res.status(404).json({ message: 'Employee not found' });

    // Keep salary structure gross in sync when base salary is edited
    if (patch.baseSalary !== undefined) {
      const gross = Number(patch.baseSalary) || 0;
      const structure = await HRSalaryStructure.findOne({
        employeeId: emp._id.toString(),
        ...tenantFilter(req.user?.tenantId),
      });
      if (structure) {
        const otherEarnings = structureGross(structure) - (structure.basic || 0);
        structure.basic = Math.max(0, gross - otherEarnings);
        // Amounts were edited outside the builder, so percentage rules no longer apply
        structure.ctc = gross;
        structure.rules = {};
        structure.customComponents = (structure.customComponents || []).map((c) => ({
          name: c.name,
          kind: c.kind,
          mode: 'fixed' as const,
          value: c.amount,
          amount: c.amount,
        }));
        structure.markModified('rules');
        await structure.save();
      } else {
        await HRSalaryStructure.create({
          tenantId: req.user?.tenantId,
          employeeId: emp._id.toString(),
          ctc: gross,
          basic: gross,
          hra: 0,
          allowances: 0,
          incentives: 0,
          bonuses: 0,
          pf: 0,
          esi: 0,
          professionalTax: 0,
          tds: 0,
          otherDeductions: 0,
          effectiveFrom: todayStr(),
        });
      }
    }

    res.status(200).json(serializeEmployee(emp));
  } catch (error) {
    res.status(500).json({ message: 'Error updating employee', error });
  }
};

export const exitEmployee = async (req: AuthRequest, res: Response) => {
  try {
    const emp = await HREmployee.findOneAndUpdate(
      { _id: req.params.id, ...tenantFilter(req.user?.tenantId) },
      {
        status: 'exited',
        exitDate: req.body.exitDate || todayStr(),
        exitReason: req.body.exitReason || 'Resigned',
      },
      { returnDocument: 'after' }
    );
    if (!emp) return res.status(404).json({ message: 'Employee not found' });
    res.status(200).json(serializeEmployee(emp));
  } catch (error) {
    res.status(500).json({ message: 'Error exiting employee', error });
  }
};

export const getDashboard = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const today = todayStr();
    const month = (req.query.month as string) || monthPrefix();
    const employees = await syncHREmployees(tenantId, req.user?.role);
    const active = employees.filter((e) => e.status === 'active');

    const attendanceToday = await Attendance.find({
      ...tenantFilter(tenantId),
      type: { $in: ['trainer', 'bde', 'employee'] },
      date: today,
    });

    const presentIds = new Set(
      attendanceToday
        .filter((a) => a.status === 'present' || a.status === 'late')
        .map((a) => a.entityId)
    );
    const absentIds = new Set(
      attendanceToday.filter((a) => a.status === 'absent').map((a) => a.entityId)
    );

    const onLeave = await HRLeaveRequest.find({
      ...tenantFilter(tenantId),
      status: 'Approved',
      startDate: { $lte: today },
      endDate: { $gte: today },
    });

    const pendingLeave = await HRLeaveRequest.countDocuments({
      ...tenantFilter(tenantId),
      status: 'Pending',
    });
    const pendingClaims = await HRClaim.countDocuments({
      ...tenantFilter(tenantId),
      status: { $in: ['Pending Approval', 'Draft'] },
    });
    const payroll = await HRPayroll.find({ ...tenantFilter(tenantId), month });

    const upcoming = active
      .map((e) => {
        const join = e.joiningDate;
        if (!join) return null;
        const [, m, d] = join.split('-');
        const thisYear = `${new Date().getFullYear()}-${m}-${d}`;
        const diff = Math.round(
          (new Date(`${thisYear}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
            86400000
        );
        if (diff < 0 || diff > 30) return null;
        return { name: e.name, type: 'anniversary' as const, date: thisYear, days: diff };
      })
      .filter(Boolean)
      .slice(0, 5);

    const birthdays = active
      .filter((e) => e.dateOfBirth)
      .map((e) => {
        const [, m, d] = (e.dateOfBirth || '').split('-');
        const thisYear = `${new Date().getFullYear()}-${m}-${d}`;
        const diff = Math.round(
          (new Date(`${thisYear}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
            86400000
        );
        if (diff < 0 || diff > 30) return null;
        return { name: e.name, type: 'birthday' as const, date: thisYear, days: diff };
      })
      .filter(Boolean)
      .slice(0, 5);

    res.status(200).json({
      month,
      today,
      totalEmployees: active.length,
      presentToday: presentIds.size,
      absentToday: absentIds.size,
      onLeaveToday: onLeave.length,
      pendingLeaveRequests: pendingLeave,
      pendingExpenseClaims: pendingClaims,
      payrollStatus: {
        draft: payroll.filter((p) => p.status === 'Draft').length,
        pending: payroll.filter((p) => p.status === 'Pending Approval').length,
        approved: payroll.filter((p) => p.status === 'Approved').length,
        released: payroll.filter((p) => p.status === 'Released').length,
        total: payroll.length,
      },
      upcoming: [...birthdays, ...upcoming].sort((a: any, b: any) => a.days - b.days).slice(0, 8),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error loading HR dashboard', error });
  }
};

export const listHolidays = async (req: AuthRequest, res: Response) => {
  try {
    const year = (req.query.year as string) || String(new Date().getFullYear());
    const holidays = await HRHoliday.find({
      ...tenantFilter(req.user?.tenantId),
      date: { $regex: `^${year}` },
    }).sort({ date: 1 });
    res.status(200).json(holidays.map((h) => ({ ...h.toObject(), id: h._id.toString() })));
  } catch (error) {
    res.status(500).json({ message: 'Error listing holidays', error });
  }
};

export const createHoliday = async (req: AuthRequest, res: Response) => {
  try {
    const holiday = await HRHoliday.create({ ...req.body, tenantId: req.user?.tenantId });
    res.status(201).json({ ...holiday.toObject(), id: holiday._id.toString() });
  } catch (error) {
    res.status(500).json({ message: 'Error creating holiday', error });
  }
};

export const deleteHoliday = async (req: AuthRequest, res: Response) => {
  try {
    await HRHoliday.findOneAndDelete({ _id: req.params.id, ...tenantFilter(req.user?.tenantId) });
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting holiday', error });
  }
};

export const getLeavePolicy = async (req: AuthRequest, res: Response) => {
  try {
    let policy = await HRLeavePolicy.findOne(tenantFilter(req.user?.tenantId));
    if (!policy) {
      policy = await HRLeavePolicy.create({ tenantId: req.user?.tenantId });
    }
    res.status(200).json({ ...policy.toObject(), id: policy._id.toString() });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching leave policy', error });
  }
};

export const updateLeavePolicy = async (req: AuthRequest, res: Response) => {
  try {
    const basis = req.body.basis === 'monthly' ? 'monthly' : 'yearly';
    const policy = await HRLeavePolicy.findOneAndUpdate(
      tenantFilter(req.user?.tenantId),
      {
        basis,
        casualDays: Number(req.body.casualDays) || 12,
        sickDays: Number(req.body.sickDays) || 10,
        earnedDays: Number(req.body.earnedDays) || 15,
        carryForwardEarned: Boolean(req.body.carryForwardEarned),
        tenantId: req.user?.tenantId,
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    res.status(200).json({ ...policy?.toObject(), id: policy?._id?.toString() });
  } catch (error) {
    res.status(500).json({ message: 'Error updating leave policy', error });
  }
};

export const listLeaveBalances = async (req: AuthRequest, res: Response) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const employees = await syncHREmployees(req.user?.tenantId, req.user?.role);
    const balances = [];
    for (const emp of employees.filter((e) => e.status === 'active')) {
      const bal = await ensureLeaveBalance(req.user?.tenantId, emp._id.toString(), year);
      balances.push({
        id: bal._id.toString(),
        employeeId: emp._id.toString(),
        employeeName: emp.name,
        year: bal.year,
        casual: bal.casual,
        sick: bal.sick,
        earned: bal.earned,
      });
    }
    res.status(200).json(balances);
  } catch (error) {
    res.status(500).json({ message: 'Error listing leave balances', error });
  }
};

export const updateLeaveBalance = async (req: AuthRequest, res: Response) => {
  try {
    const casual = Number(req.body.casual);
    const sick = Number(req.body.sick);
    const earned = Number(req.body.earned);
    if ([casual, sick, earned].some((n) => !Number.isFinite(n) || n < 0)) {
      return res.status(400).json({ message: 'Casual, sick, and earned must be zero or more' });
    }

    const balance = await HRLeaveBalance.findOneAndUpdate(
      { _id: req.params.id, ...tenantFilter(req.user?.tenantId) },
      { casual, sick, earned },
      { returnDocument: 'after' }
    );
    if (!balance) return res.status(404).json({ message: 'Leave balance not found' });

    res.status(200).json({
      id: balance._id.toString(),
      employeeId: balance.employeeId,
      year: balance.year,
      casual: balance.casual,
      sick: balance.sick,
      earned: balance.earned,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating leave balance', error });
  }
};

export const listLeaveRequests = async (req: AuthRequest, res: Response) => {
  try {
    const filter: Record<string, unknown> = { ...tenantFilter(req.user?.tenantId) };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;

    if (req.user?.role === 'trainer' || req.user?.role === 'bde') {
      const employees = await syncHREmployees(req.user?.tenantId, req.user?.role);
      const user = await User.findById(req.user.id);
      const me =
        employees.find((e) => e.sourceId === req.user?.id) ||
        employees.find((e) => user && e.name.toLowerCase() === user.name.toLowerCase());
      if (!me) return res.status(200).json([]);
      filter.employeeId = me._id.toString();
    }

    const rows = await HRLeaveRequest.find(filter).sort({ createdAt: -1 }).limit(200);
    res.status(200).json(rows.map((r) => ({ ...r.toObject(), id: r._id.toString() })));
  } catch (error) {
    res.status(500).json({ message: 'Error listing leave requests', error });
  }
};

export const createLeaveRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId, employeeName, leaveType, startDate, endDate, reason } = req.body;
    if (!employeeId || !leaveType || !startDate || !endDate) {
      return res.status(400).json({ message: 'employeeId, leaveType, startDate, endDate required' });
    }
    const days = daysBetween(startDate, endDate);
    const year = Number(startDate.slice(0, 4));
    const balance = await ensureLeaveBalance(req.user?.tenantId, employeeId, year);
    const available = (balance as any)[leaveType] as number;
    if (available < days) {
      return res.status(400).json({ message: `Insufficient ${leaveType} balance (${available} left)` });
    }
    const row = await HRLeaveRequest.create({
      tenantId: req.user?.tenantId,
      employeeId,
      employeeName: employeeName || 'Staff',
      leaveType,
      startDate,
      endDate,
      days,
      reason,
      status: 'Pending',
    });
    res.status(201).json({ ...row.toObject(), id: row._id.toString() });
  } catch (error) {
    res.status(500).json({ message: 'Error creating leave request', error });
  }
};

export const reviewLeaveRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'status must be Approved or Rejected' });
    }
    const row = await HRLeaveRequest.findOne({
      _id: req.params.id,
      ...tenantFilter(req.user?.tenantId),
    });
    if (!row) return res.status(404).json({ message: 'Leave request not found' });
    if (row.status !== 'Pending') {
      return res.status(400).json({ message: 'Request already reviewed' });
    }

    if (status === 'Approved') {
      const year = Number(row.startDate.slice(0, 4));
      const balance = await ensureLeaveBalance(req.user?.tenantId, row.employeeId, year);
      const key = row.leaveType as 'casual' | 'sick' | 'earned';
      if ((balance as any)[key] < row.days) {
        return res.status(400).json({ message: 'Insufficient leave balance at approval time' });
      }
      (balance as any)[key] -= row.days;
      await balance.save();
    }

    row.status = status;
    row.reviewedBy = req.user?.id;
    row.reviewedAt = todayStr();
    await row.save();
    res.status(200).json({ ...row.toObject(), id: row._id.toString() });
  } catch (error) {
    res.status(500).json({ message: 'Error reviewing leave request', error });
  }
};

export const listSalaryStructures = async (req: AuthRequest, res: Response) => {
  try {
    const rows = await HRSalaryStructure.find(tenantFilter(req.user?.tenantId));
    res.status(200).json(rows.map((r) => ({ ...r.toObject(), id: r._id.toString() })));
  } catch (error) {
    res.status(500).json({ message: 'Error listing salary structures', error });
  }
};

export const upsertSalaryStructure = async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId, ...rest } = req.body;
    if (!employeeId) return res.status(400).json({ message: 'employeeId required' });

    const basic = Number(rest.basic) || 0;
    const hra = Number(rest.hra) || 0;
    const allowances = Number(rest.allowances) || 0;
    const incentives = Number(rest.incentives) || 0;
    const bonuses = Number(rest.bonuses) || 0;
    const pf = Number(rest.pf) || 0;
    const esi = Number(rest.esi) || 0;
    const professionalTax = Number(rest.professionalTax) || 0;
    const tds = Number(rest.tds) || 0;
    const otherDeductions = Number(rest.otherDeductions) || 0;
    const modes: SalaryComponentMode[] = ['fixed', 'ctc', 'basic', 'gross', 'balance'];
    const toMode = (m: unknown): SalaryComponentMode =>
      modes.includes(m as SalaryComponentMode) ? (m as SalaryComponentMode) : 'fixed';

    const rules: Record<string, ISalaryComponentRule> = {};
    if (rest.rules && typeof rest.rules === 'object') {
      for (const [key, rule] of Object.entries(rest.rules as Record<string, any>)) {
        rules[key] = { mode: toMode(rule?.mode), value: Number(rule?.value) || 0 };
      }
    }
    const customComponents: ICustomSalaryComponent[] = Array.isArray(rest.customComponents)
      ? rest.customComponents
          .filter((c: any) => String(c?.name || '').trim())
          .map((c: any) => ({
            name: String(c.name).trim(),
            kind: c.kind === 'deduction' ? 'deduction' : 'earning',
            mode: toMode(c.mode),
            value: Number(c.value) || 0,
            amount: Math.max(0, Number(c.amount) || 0),
          }))
      : [];

    const gross =
      basic + hra + allowances + incentives + bonuses + customComponentTotal({ customComponents }, 'earning');
    const ctc = Number(rest.ctc) || gross;

    const row = await HRSalaryStructure.findOneAndUpdate(
      { employeeId, ...tenantFilter(req.user?.tenantId) },
      {
        ctc,
        rules,
        customComponents,
        basic,
        hra,
        allowances,
        incentives,
        bonuses,
        pf,
        esi,
        professionalTax,
        tds,
        otherDeductions,
        employeeId,
        tenantId: req.user?.tenantId,
        effectiveFrom: rest.effectiveFrom || todayStr(),
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    // Keep Employees.baseSalary in sync with structure gross (single pay source of truth)
    await HREmployee.findOneAndUpdate(
      { _id: employeeId, ...tenantFilter(req.user?.tenantId) },
      { baseSalary: gross }
    );

    res.status(200).json({ ...row?.toObject(), id: row?._id?.toString() });
  } catch (error) {
    res.status(500).json({ message: 'Error saving salary structure', error });
  }
};

export const listDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const filter: Record<string, unknown> = { ...tenantFilter(req.user?.tenantId) };
    if (req.query.employeeId) filter.employeeId = String(req.query.employeeId);

    if (req.user?.role === 'trainer' || req.user?.role === 'bde') {
      const employees = await syncHREmployees(req.user?.tenantId, req.user?.role);
      const user = await User.findById(req.user.id);
      const me =
        employees.find((e) => e.sourceId === req.user?.id) ||
        employees.find((e) => user && e.name.toLowerCase() === user.name.toLowerCase());
      if (!me) return res.status(200).json([]);
      filter.employeeId = me._id.toString();
      filter.sharedWithEmployee = { $ne: false };
    }

    const docs = await HRDocument.find(filter).sort({ createdAt: -1 });
    res.status(200).json(docs.map((d) => ({ ...d.toObject(), id: d._id.toString() })));
  } catch (error) {
    res.status(500).json({ message: 'Error listing documents', error });
  }
};

export const createDocument = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = String(req.body.employeeId || '');
    const name = String(req.body.name || '').trim();
    const url = String(req.body.url || '').trim();
    const category = String(req.body.category || 'Contract');
    if (!employeeId || !name || !url) {
      return res.status(400).json({ message: 'Employee, document name and file are required' });
    }
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ message: 'Invalid file URL' });
    if (!(HR_DOCUMENT_CATEGORIES as readonly string[]).includes(category)) {
      return res.status(400).json({ message: 'Invalid document category' });
    }
    if (!mongoose.isValidObjectId(employeeId)) return res.status(404).json({ message: 'Employee not found' });
    const emp = await HREmployee.findOne({ _id: employeeId, ...tenantFilter(req.user?.tenantId) });
    if (!emp) return res.status(404).json({ message: 'Employee not found' });

    const uploader = await User.findById(req.user?.id).select('name');
    const doc = await HRDocument.create({
      tenantId: req.user?.tenantId,
      employeeId,
      name,
      category: category as HRDocumentCategory,
      url,
      size: String(req.body.size || '').trim() || undefined,
      uploadDate: DATE_ONLY_RE.test(String(req.body.uploadDate || '')) ? String(req.body.uploadDate) : todayStr(),
      sharedWithEmployee: req.body.sharedWithEmployee !== false,
      uploadedByName: uploader?.name,
    });
    res.status(201).json({ ...doc.toObject(), id: doc._id.toString() });
  } catch (error) {
    res.status(500).json({ message: 'Error uploading document', error });
  }
};

export const updateDocumentSharing = async (req: AuthRequest, res: Response) => {
  try {
    const doc = await HRDocument.findOneAndUpdate(
      { _id: req.params.id, ...tenantFilter(req.user?.tenantId) },
      { sharedWithEmployee: Boolean(req.body.sharedWithEmployee) },
      { returnDocument: 'after' }
    );
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    res.status(200).json({ ...doc.toObject(), id: doc._id.toString() });
  } catch (error) {
    res.status(500).json({ message: 'Error updating document', error });
  }
};

export const deleteDocument = async (req: AuthRequest, res: Response) => {
  try {
    const doc = await HRDocument.findOneAndDelete({ _id: req.params.id, ...tenantFilter(req.user?.tenantId) });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    res.status(200).json({ message: 'Document deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting document', error });
  }
};

export const listClaims = async (req: AuthRequest, res: Response) => {
  try {
    const filter: Record<string, unknown> = { ...tenantFilter(req.user?.tenantId) };
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;

    if (req.user?.role === 'trainer' || req.user?.role === 'bde') {
      const employees = await syncHREmployees(req.user?.tenantId, req.user?.role);
      const user = await User.findById(req.user.id);
      const me =
        employees.find((e) => e.sourceId === req.user?.id) ||
        employees.find((e) => user && e.name.toLowerCase() === user.name.toLowerCase());
      if (!me) return res.status(200).json([]);
      filter.employeeId = me._id.toString();
    }

    const claims = await HRClaim.find(filter).sort({ createdAt: -1 });
    res.status(200).json(claims.map((c) => ({ ...c.toObject(), id: c._id.toString() })));
  } catch (error) {
    res.status(500).json({ message: 'Error listing claims', error });
  }
};

export const getMyHR = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const employees = await syncHREmployees(req.user?.tenantId, req.user?.role);
    let me =
      employees.find((e) => e.sourceId === userId) ||
      employees.find((e) => e.email && req.user && (e.email as string));

    if (!me && role === 'trainer') {
      const trainer = await Trainer.findOne({ email: (await User.findById(userId))?.email });
      if (trainer) me = employees.find((e) => e.sourceId === trainer._id.toString());
    }

    if (!me) {
      // fallback: match by user name
      const user = await User.findById(userId);
      if (user) {
        me = employees.find((e) => e.name.toLowerCase() === user.name.toLowerCase());
      }
    }

    if (!me) {
      return res.status(404).json({ message: 'No HR employee profile linked to your account' });
    }

    const employeeId = me._id.toString();
    const year = new Date().getFullYear();
    const balance = await ensureLeaveBalance(req.user?.tenantId, employeeId, year);
    const leaveRequests = await HRLeaveRequest.find({
      ...tenantFilter(req.user?.tenantId),
      employeeId,
    })
      .sort({ createdAt: -1 })
      .limit(50);
    const claims = await HRClaim.find({
      ...tenantFilter(req.user?.tenantId),
      employeeId,
    })
      .sort({ createdAt: -1 })
      .limit(50);
    const docs = await HRDocument.find({
      ...tenantFilter(req.user?.tenantId),
      employeeId,
      sharedWithEmployee: { $ne: false },
    }).sort({ createdAt: -1 });
    const payroll = await HRPayroll.find({
      ...tenantFilter(req.user?.tenantId),
      employeeId: me.sourceId,
    }).sort({ month: -1 });
    const structure = await HRSalaryStructure.findOne({
      ...tenantFilter(req.user?.tenantId),
      employeeId,
    });

    res.status(200).json({
      employee: serializeEmployee(me),
      leaveBalance: {
        year,
        casual: balance.casual,
        sick: balance.sick,
        earned: balance.earned,
      },
      leaveRequests: leaveRequests.map((r) => ({ ...r.toObject(), id: r._id.toString() })),
      claims: claims.map((c) => ({ ...c.toObject(), id: c._id.toString() })),
      documents: docs.map((d) => ({ ...d.toObject(), id: d._id.toString() })),
      payroll: payroll.map((p) => ({ ...p.toObject(), id: p._id.toString() })),
      salaryStructure: structure
        ? { ...structure.toObject(), id: structure._id.toString() }
        : null,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error loading self-service HR', error });
  }
};

export const getReportsBundle = async (req: AuthRequest, res: Response) => {
  try {
    const month = (req.query.month as string) || monthPrefix();
    const employees = await syncHREmployees(req.user?.tenantId, req.user?.role);
    const attendance = await Attendance.find({
      ...tenantFilter(req.user?.tenantId),
      type: { $in: ['trainer', 'bde', 'employee'] },
      date: { $regex: `^${month}` },
    });
    const leave = await HRLeaveRequest.find({
      ...tenantFilter(req.user?.tenantId),
      startDate: { $regex: `^${month.slice(0, 4)}` },
    });
    const payroll = await HRPayroll.find({ ...tenantFilter(req.user?.tenantId), month });

    res.status(200).json({
      month,
      employees: employees.map(serializeEmployee),
      attendance: attendance.map((a) => ({ ...a.toObject(), id: a._id.toString() })),
      leave: leave.map((l) => ({ ...l.toObject(), id: l._id.toString() })),
      payroll: payroll.map((p) => ({ ...p.toObject(), id: p._id.toString() })),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error loading HR reports', error });
  }
};
