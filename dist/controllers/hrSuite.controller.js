"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReportsBundle = exports.getMyHR = exports.listClaims = exports.listDocuments = exports.upsertSalaryStructure = exports.listSalaryStructures = exports.reviewLeaveRequest = exports.createLeaveRequest = exports.listLeaveRequests = exports.listLeaveBalances = exports.updateLeavePolicy = exports.getLeavePolicy = exports.deleteHoliday = exports.createHoliday = exports.listHolidays = exports.getDashboard = exports.exitEmployee = exports.updateEmployee = exports.listEmployees = void 0;
exports.syncHREmployees = syncHREmployees;
const Trainer_1 = __importDefault(require("../models/Trainer"));
const User_1 = __importDefault(require("../models/User"));
const BDEProfile_1 = __importDefault(require("../models/BDEProfile"));
const Attendance_1 = __importDefault(require("../models/Attendance"));
const HREmployee_1 = __importDefault(require("../models/HREmployee"));
const HRHoliday_1 = __importDefault(require("../models/HRHoliday"));
const HRSalaryStructure_1 = __importDefault(require("../models/HRSalaryStructure"));
const HRLeave_1 = require("../models/HRLeave");
const HRPayroll_1 = __importDefault(require("../models/HRPayroll"));
const HRClaim_1 = __importDefault(require("../models/HRClaim"));
const HRDocument_1 = __importDefault(require("../models/HRDocument"));
function tenantFilter(tenantId) {
    if (!tenantId)
        return {};
    const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { tenantId: { $regex: new RegExp(`^${escaped}\\s*$`, 'i') } };
}
function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthPrefix(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function daysBetween(start, end) {
    const a = new Date(`${start}T00:00:00`);
    const b = new Date(`${end}T00:00:00`);
    const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
    return Math.max(1, diff + 1);
}
async function loadBdes(tenantId, role) {
    const filter = { role: 'bde' };
    if (role !== 'super_admin' && tenantId)
        filter.tenantId = tenantId;
    const users = await User_1.default.find(filter);
    const profiles = await BDEProfile_1.default.find({ userId: { $in: users.map((u) => u._id) } });
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
async function syncHREmployees(tenantId, role) {
    const isAdmin = role === 'super_admin';
    const staffFilter = isAdmin || !tenantId ? {} : tenantFilter(tenantId);
    const [trainers, bdes] = await Promise.all([
        Trainer_1.default.find(staffFilter),
        loadBdes(tenantId, role),
    ]);
    const upserts = [];
    for (const trainer of trainers) {
        const sourceId = trainer._id.toString();
        const status = String(trainer.status || 'Active').toLowerCase() === 'inactive' ? 'exited' : 'active';
        upserts.push(HREmployee_1.default.findOneAndUpdate({ sourceType: 'trainer', sourceId, ...tenantFilter(tenantId) }, {
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
            employmentType: trainer.employmentType === 'Part Time'
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
        }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }).then(async (doc) => {
            // Only seed pay on first sync; keep salary-structure / HR edits afterwards
            if (doc && !(doc.baseSalary > 0)) {
                doc.baseSalary = trainer.salaryRateAmount || 0;
                await doc.save();
            }
            return doc;
        }));
    }
    for (const bde of bdes) {
        upserts.push(HREmployee_1.default.findOneAndUpdate({ sourceType: 'bde', sourceId: bde.id, ...tenantFilter(tenantId) }, {
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
        }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }).then(async (doc) => {
            if (doc && !(doc.baseSalary > 0)) {
                doc.baseSalary = 30000;
                await doc.save();
            }
            return doc;
        }));
    }
    await Promise.all(upserts);
    return HREmployee_1.default.find(tenantFilter(tenantId)).sort({ name: 1 });
}
function annualEntitlement(days, basis) {
    const n = Number(days) || 0;
    return basis === 'monthly' ? n * 12 : n;
}
async function ensureLeaveBalance(tenantId, employeeId, year) {
    let policy = await HRLeave_1.HRLeavePolicy.findOne(tenantFilter(tenantId));
    if (!policy) {
        policy = await HRLeave_1.HRLeavePolicy.create({
            tenantId,
            basis: 'yearly',
            casualDays: 12,
            sickDays: 10,
            earnedDays: 15,
            carryForwardEarned: true,
        });
    }
    let balance = await HRLeave_1.HRLeaveBalance.findOne({ ...tenantFilter(tenantId), employeeId, year });
    if (!balance) {
        const basis = policy.basis || 'yearly';
        balance = await HRLeave_1.HRLeaveBalance.create({
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
function serializeEmployee(doc) {
    return { ...doc.toObject(), id: doc._id.toString() };
}
const listEmployees = async (req, res) => {
    try {
        let employees = await syncHREmployees(req.user?.tenantId, req.user?.role);
        // Align employee baseSalary with salary-structure gross when a structure exists
        const structures = await HRSalaryStructure_1.default.find(tenantFilter(req.user?.tenantId));
        const byEmp = new Map(structures.map((s) => [s.employeeId, s]));
        await Promise.all(employees.map(async (emp) => {
            const structure = byEmp.get(emp._id.toString());
            if (!structure)
                return;
            const gross = (structure.basic || 0) +
                (structure.hra || 0) +
                (structure.allowances || 0) +
                (structure.incentives || 0) +
                (structure.bonuses || 0);
            if (emp.baseSalary !== gross) {
                emp.baseSalary = gross;
                await emp.save();
            }
        }));
        employees = await HREmployee_1.default.find(tenantFilter(req.user?.tenantId)).sort({ name: 1 });
        if (req.user?.role === 'trainer' || req.user?.role === 'bde') {
            const user = await User_1.default.findById(req.user.id);
            employees = employees.filter((e) => e.sourceId === req.user?.id ||
                (user && e.name.toLowerCase() === user.name.toLowerCase()) ||
                (user?.email && e.email && e.email.toLowerCase() === user.email.toLowerCase()));
        }
        res.status(200).json(employees.map(serializeEmployee));
    }
    catch (error) {
        res.status(500).json({ message: 'Error listing HR employees', error });
    }
};
exports.listEmployees = listEmployees;
const updateEmployee = async (req, res) => {
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
        const patch = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined)
                patch[key] = req.body[key];
        }
        const emp = await HREmployee_1.default.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req.user?.tenantId) }, patch, { returnDocument: 'after' });
        if (!emp)
            return res.status(404).json({ message: 'Employee not found' });
        // Keep salary structure gross in sync when base salary is edited
        if (patch.baseSalary !== undefined) {
            const gross = Number(patch.baseSalary) || 0;
            const structure = await HRSalaryStructure_1.default.findOne({
                employeeId: emp._id.toString(),
                ...tenantFilter(req.user?.tenantId),
            });
            if (structure) {
                const otherEarnings = (structure.hra || 0) +
                    (structure.allowances || 0) +
                    (structure.incentives || 0) +
                    (structure.bonuses || 0);
                structure.basic = Math.max(0, gross - otherEarnings);
                await structure.save();
            }
            else {
                await HRSalaryStructure_1.default.create({
                    tenantId: req.user?.tenantId,
                    employeeId: emp._id.toString(),
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
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating employee', error });
    }
};
exports.updateEmployee = updateEmployee;
const exitEmployee = async (req, res) => {
    try {
        const emp = await HREmployee_1.default.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req.user?.tenantId) }, {
            status: 'exited',
            exitDate: req.body.exitDate || todayStr(),
            exitReason: req.body.exitReason || 'Resigned',
        }, { returnDocument: 'after' });
        if (!emp)
            return res.status(404).json({ message: 'Employee not found' });
        res.status(200).json(serializeEmployee(emp));
    }
    catch (error) {
        res.status(500).json({ message: 'Error exiting employee', error });
    }
};
exports.exitEmployee = exitEmployee;
const getDashboard = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        const today = todayStr();
        const month = req.query.month || monthPrefix();
        const employees = await syncHREmployees(tenantId, req.user?.role);
        const active = employees.filter((e) => e.status === 'active');
        const attendanceToday = await Attendance_1.default.find({
            ...tenantFilter(tenantId),
            type: { $in: ['trainer', 'bde'] },
            date: today,
        });
        const presentIds = new Set(attendanceToday
            .filter((a) => a.status === 'present' || a.status === 'late')
            .map((a) => a.entityId));
        const absentIds = new Set(attendanceToday.filter((a) => a.status === 'absent').map((a) => a.entityId));
        const onLeave = await HRLeave_1.HRLeaveRequest.find({
            ...tenantFilter(tenantId),
            status: 'Approved',
            startDate: { $lte: today },
            endDate: { $gte: today },
        });
        const pendingLeave = await HRLeave_1.HRLeaveRequest.countDocuments({
            ...tenantFilter(tenantId),
            status: 'Pending',
        });
        const pendingClaims = await HRClaim_1.default.countDocuments({
            ...tenantFilter(tenantId),
            status: { $in: ['Pending Approval', 'Draft'] },
        });
        const payroll = await HRPayroll_1.default.find({ ...tenantFilter(tenantId), month });
        const upcoming = active
            .map((e) => {
            const join = e.joiningDate;
            if (!join)
                return null;
            const [, m, d] = join.split('-');
            const thisYear = `${new Date().getFullYear()}-${m}-${d}`;
            const diff = Math.round((new Date(`${thisYear}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
                86400000);
            if (diff < 0 || diff > 30)
                return null;
            return { name: e.name, type: 'anniversary', date: thisYear, days: diff };
        })
            .filter(Boolean)
            .slice(0, 5);
        const birthdays = active
            .filter((e) => e.dateOfBirth)
            .map((e) => {
            const [, m, d] = (e.dateOfBirth || '').split('-');
            const thisYear = `${new Date().getFullYear()}-${m}-${d}`;
            const diff = Math.round((new Date(`${thisYear}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
                86400000);
            if (diff < 0 || diff > 30)
                return null;
            return { name: e.name, type: 'birthday', date: thisYear, days: diff };
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
            upcoming: [...birthdays, ...upcoming].sort((a, b) => a.days - b.days).slice(0, 8),
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Error loading HR dashboard', error });
    }
};
exports.getDashboard = getDashboard;
const listHolidays = async (req, res) => {
    try {
        const year = req.query.year || String(new Date().getFullYear());
        const holidays = await HRHoliday_1.default.find({
            ...tenantFilter(req.user?.tenantId),
            date: { $regex: `^${year}` },
        }).sort({ date: 1 });
        res.status(200).json(holidays.map((h) => ({ ...h.toObject(), id: h._id.toString() })));
    }
    catch (error) {
        res.status(500).json({ message: 'Error listing holidays', error });
    }
};
exports.listHolidays = listHolidays;
const createHoliday = async (req, res) => {
    try {
        const holiday = await HRHoliday_1.default.create({ ...req.body, tenantId: req.user?.tenantId });
        res.status(201).json({ ...holiday.toObject(), id: holiday._id.toString() });
    }
    catch (error) {
        res.status(500).json({ message: 'Error creating holiday', error });
    }
};
exports.createHoliday = createHoliday;
const deleteHoliday = async (req, res) => {
    try {
        await HRHoliday_1.default.findOneAndDelete({ _id: req.params.id, ...tenantFilter(req.user?.tenantId) });
        res.status(200).json({ ok: true });
    }
    catch (error) {
        res.status(500).json({ message: 'Error deleting holiday', error });
    }
};
exports.deleteHoliday = deleteHoliday;
const getLeavePolicy = async (req, res) => {
    try {
        let policy = await HRLeave_1.HRLeavePolicy.findOne(tenantFilter(req.user?.tenantId));
        if (!policy) {
            policy = await HRLeave_1.HRLeavePolicy.create({ tenantId: req.user?.tenantId });
        }
        res.status(200).json({ ...policy.toObject(), id: policy._id.toString() });
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching leave policy', error });
    }
};
exports.getLeavePolicy = getLeavePolicy;
const updateLeavePolicy = async (req, res) => {
    try {
        const basis = req.body.basis === 'monthly' ? 'monthly' : 'yearly';
        const policy = await HRLeave_1.HRLeavePolicy.findOneAndUpdate(tenantFilter(req.user?.tenantId), {
            basis,
            casualDays: Number(req.body.casualDays) || 12,
            sickDays: Number(req.body.sickDays) || 10,
            earnedDays: Number(req.body.earnedDays) || 15,
            carryForwardEarned: Boolean(req.body.carryForwardEarned),
            tenantId: req.user?.tenantId,
        }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
        res.status(200).json({ ...policy?.toObject(), id: policy?._id?.toString() });
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating leave policy', error });
    }
};
exports.updateLeavePolicy = updateLeavePolicy;
const listLeaveBalances = async (req, res) => {
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
    }
    catch (error) {
        res.status(500).json({ message: 'Error listing leave balances', error });
    }
};
exports.listLeaveBalances = listLeaveBalances;
const listLeaveRequests = async (req, res) => {
    try {
        const filter = { ...tenantFilter(req.user?.tenantId) };
        if (req.query.status)
            filter.status = req.query.status;
        if (req.query.employeeId)
            filter.employeeId = req.query.employeeId;
        if (req.user?.role === 'trainer' || req.user?.role === 'bde') {
            const employees = await syncHREmployees(req.user?.tenantId, req.user?.role);
            const user = await User_1.default.findById(req.user.id);
            const me = employees.find((e) => e.sourceId === req.user?.id) ||
                employees.find((e) => user && e.name.toLowerCase() === user.name.toLowerCase());
            if (!me)
                return res.status(200).json([]);
            filter.employeeId = me._id.toString();
        }
        const rows = await HRLeave_1.HRLeaveRequest.find(filter).sort({ createdAt: -1 }).limit(200);
        res.status(200).json(rows.map((r) => ({ ...r.toObject(), id: r._id.toString() })));
    }
    catch (error) {
        res.status(500).json({ message: 'Error listing leave requests', error });
    }
};
exports.listLeaveRequests = listLeaveRequests;
const createLeaveRequest = async (req, res) => {
    try {
        const { employeeId, employeeName, leaveType, startDate, endDate, reason } = req.body;
        if (!employeeId || !leaveType || !startDate || !endDate) {
            return res.status(400).json({ message: 'employeeId, leaveType, startDate, endDate required' });
        }
        const days = daysBetween(startDate, endDate);
        const year = Number(startDate.slice(0, 4));
        const balance = await ensureLeaveBalance(req.user?.tenantId, employeeId, year);
        const available = balance[leaveType];
        if (available < days) {
            return res.status(400).json({ message: `Insufficient ${leaveType} balance (${available} left)` });
        }
        const row = await HRLeave_1.HRLeaveRequest.create({
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
    }
    catch (error) {
        res.status(500).json({ message: 'Error creating leave request', error });
    }
};
exports.createLeaveRequest = createLeaveRequest;
const reviewLeaveRequest = async (req, res) => {
    try {
        const { status } = req.body;
        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ message: 'status must be Approved or Rejected' });
        }
        const row = await HRLeave_1.HRLeaveRequest.findOne({
            _id: req.params.id,
            ...tenantFilter(req.user?.tenantId),
        });
        if (!row)
            return res.status(404).json({ message: 'Leave request not found' });
        if (row.status !== 'Pending') {
            return res.status(400).json({ message: 'Request already reviewed' });
        }
        if (status === 'Approved') {
            const year = Number(row.startDate.slice(0, 4));
            const balance = await ensureLeaveBalance(req.user?.tenantId, row.employeeId, year);
            const key = row.leaveType;
            if (balance[key] < row.days) {
                return res.status(400).json({ message: 'Insufficient leave balance at approval time' });
            }
            balance[key] -= row.days;
            await balance.save();
        }
        row.status = status;
        row.reviewedBy = req.user?.id;
        row.reviewedAt = todayStr();
        await row.save();
        res.status(200).json({ ...row.toObject(), id: row._id.toString() });
    }
    catch (error) {
        res.status(500).json({ message: 'Error reviewing leave request', error });
    }
};
exports.reviewLeaveRequest = reviewLeaveRequest;
const listSalaryStructures = async (req, res) => {
    try {
        const rows = await HRSalaryStructure_1.default.find(tenantFilter(req.user?.tenantId));
        res.status(200).json(rows.map((r) => ({ ...r.toObject(), id: r._id.toString() })));
    }
    catch (error) {
        res.status(500).json({ message: 'Error listing salary structures', error });
    }
};
exports.listSalaryStructures = listSalaryStructures;
const upsertSalaryStructure = async (req, res) => {
    try {
        const { employeeId, ...rest } = req.body;
        if (!employeeId)
            return res.status(400).json({ message: 'employeeId required' });
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
        const gross = basic + hra + allowances + incentives + bonuses;
        const row = await HRSalaryStructure_1.default.findOneAndUpdate({ employeeId, ...tenantFilter(req.user?.tenantId) }, {
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
        }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
        // Keep Employees.baseSalary in sync with structure gross (single pay source of truth)
        await HREmployee_1.default.findOneAndUpdate({ _id: employeeId, ...tenantFilter(req.user?.tenantId) }, { baseSalary: gross });
        res.status(200).json({ ...row?.toObject(), id: row?._id?.toString() });
    }
    catch (error) {
        res.status(500).json({ message: 'Error saving salary structure', error });
    }
};
exports.upsertSalaryStructure = upsertSalaryStructure;
const listDocuments = async (req, res) => {
    try {
        const filter = { ...tenantFilter(req.user?.tenantId) };
        if (req.query.employeeId)
            filter.employeeId = req.query.employeeId;
        const docs = await HRDocument_1.default.find(filter).sort({ createdAt: -1 });
        res.status(200).json(docs.map((d) => ({ ...d.toObject(), id: d._id.toString() })));
    }
    catch (error) {
        res.status(500).json({ message: 'Error listing documents', error });
    }
};
exports.listDocuments = listDocuments;
const listClaims = async (req, res) => {
    try {
        const filter = { ...tenantFilter(req.user?.tenantId) };
        if (req.query.employeeId)
            filter.employeeId = req.query.employeeId;
        if (req.user?.role === 'trainer' || req.user?.role === 'bde') {
            const employees = await syncHREmployees(req.user?.tenantId, req.user?.role);
            const user = await User_1.default.findById(req.user.id);
            const me = employees.find((e) => e.sourceId === req.user?.id) ||
                employees.find((e) => user && e.name.toLowerCase() === user.name.toLowerCase());
            if (!me)
                return res.status(200).json([]);
            filter.employeeId = me._id.toString();
        }
        const claims = await HRClaim_1.default.find(filter).sort({ createdAt: -1 });
        res.status(200).json(claims.map((c) => ({ ...c.toObject(), id: c._id.toString() })));
    }
    catch (error) {
        res.status(500).json({ message: 'Error listing claims', error });
    }
};
exports.listClaims = listClaims;
const getMyHR = async (req, res) => {
    try {
        const userId = req.user?.id;
        const role = req.user?.role;
        const employees = await syncHREmployees(req.user?.tenantId, req.user?.role);
        let me = employees.find((e) => e.sourceId === userId) ||
            employees.find((e) => e.email && req.user && e.email);
        if (!me && role === 'trainer') {
            const trainer = await Trainer_1.default.findOne({ email: (await User_1.default.findById(userId))?.email });
            if (trainer)
                me = employees.find((e) => e.sourceId === trainer._id.toString());
        }
        if (!me) {
            // fallback: match by user name
            const user = await User_1.default.findById(userId);
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
        const leaveRequests = await HRLeave_1.HRLeaveRequest.find({
            ...tenantFilter(req.user?.tenantId),
            employeeId,
        })
            .sort({ createdAt: -1 })
            .limit(50);
        const claims = await HRClaim_1.default.find({
            ...tenantFilter(req.user?.tenantId),
            employeeId,
        })
            .sort({ createdAt: -1 })
            .limit(50);
        const docs = await HRDocument_1.default.find({
            ...tenantFilter(req.user?.tenantId),
            employeeId,
        }).sort({ createdAt: -1 });
        const payroll = await HRPayroll_1.default.find({
            ...tenantFilter(req.user?.tenantId),
            employeeId: me.sourceId,
        }).sort({ month: -1 });
        const structure = await HRSalaryStructure_1.default.findOne({
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
    }
    catch (error) {
        res.status(500).json({ message: 'Error loading self-service HR', error });
    }
};
exports.getMyHR = getMyHR;
const getReportsBundle = async (req, res) => {
    try {
        const month = req.query.month || monthPrefix();
        const employees = await syncHREmployees(req.user?.tenantId, req.user?.role);
        const attendance = await Attendance_1.default.find({
            ...tenantFilter(req.user?.tenantId),
            type: { $in: ['trainer', 'bde'] },
            date: { $regex: `^${month}` },
        });
        const leave = await HRLeave_1.HRLeaveRequest.find({
            ...tenantFilter(req.user?.tenantId),
            startDate: { $regex: `^${month.slice(0, 4)}` },
        });
        const payroll = await HRPayroll_1.default.find({ ...tenantFilter(req.user?.tenantId), month });
        res.status(200).json({
            month,
            employees: employees.map(serializeEmployee),
            attendance: attendance.map((a) => ({ ...a.toObject(), id: a._id.toString() })),
            leave: leave.map((l) => ({ ...l.toObject(), id: l._id.toString() })),
            payroll: payroll.map((p) => ({ ...p.toObject(), id: p._id.toString() })),
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Error loading HR reports', error });
    }
};
exports.getReportsBundle = getReportsBundle;
