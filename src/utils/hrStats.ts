type AttendanceRecord = {
  entityId?: string;
  type?: string;
  status?: string;
  date?: string;
  name?: string;
};

type BatchRecord = {
  id?: string;
  _id?: string;
  trainerName?: string;
  courseName?: string;
  code?: string;
  schedule?: string;
  centerName?: string;
  roomName?: string;
  mode?: string;
  studentNames?: string[];
  enrolled?: number;
};

type LeadRecord = {
  stage?: string;
  counsellor?: string;
  assignedBdeId?: string;
  value?: number;
  updatedAt?: string | Date;
  createdAt?: string | Date;
};

type TrainerRecord = {
  id?: string;
  _id?: string;
  name?: string;
  email?: string;
  technologySubject?: string;
  skills?: string;
  joiningDate?: string | Date;
  salaryRateAmount?: number;
  rating?: number;
  bankHolderName?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  resumeFileName?: string;
  idProofFileName?: string;
  certificationsFileName?: string;
  activeBatches?: number;
  hoursThisWeek?: number;
  tenantId?: string;
};

type BdeRecord = {
  id?: string;
  name?: string;
  email?: string;
  joiningDate?: string;
  monthlyTarget?: number;
  targetType?: string;
  commissionPercentage?: number;
  commissionEnabled?: boolean;
  convertedLeads?: number;
  activeLeads?: number;
  revenueGenerated?: number;
  status?: string;
};

const DEPT_COLORS: Record<string, string> = {
  'Education & Tech': '#3b82f6',
  'Sales & CRM': '#f59e0b',
  'UI/UX & Design': '#8b5cf6',
  'Operations & Admin': '#10b981',
};

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDateOnly(value?: string | Date) {
  if (!value) return new Date().toISOString().split('T')[0];
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return value.split('T')[0];
}

function trainerDepartment(trainer: TrainerRecord) {
  const subject = `${trainer.technologySubject || ''} ${trainer.skills || ''}`.toLowerCase();
  if (subject.includes('ui') || subject.includes('ux') || subject.includes('design') || subject.includes('figma')) {
    return 'UI/UX & Design';
  }
  return 'Education & Tech';
}

function parseScheduleMeta(schedule: string) {
  const dayMatch = schedule.match(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|mon|tue|wed|thu|fri|sat|sun)\b/gi);
  const dayOfWeek = dayMatch?.[0]
    ? dayMatch[0].charAt(0).toUpperCase() + dayMatch[0].slice(1).toLowerCase()
    : 'Monday';
  const timeMatch = schedule.match(
    /(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i
  );
  return {
    dayOfWeek,
    startTime: timeMatch?.[1] || '10:00 AM',
    endTime: timeMatch?.[2] || '12:00 PM',
  };
}

function parseTimeToMinutes(time: string): number {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return 0;
  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + mins;
}

function schedulesOverlap(a: { startTime: string; endTime: string; dayOfWeek: string; roomName: string }, b: { startTime: string; endTime: string; dayOfWeek: string; roomName: string }) {
  if (!a.roomName || !b.roomName || a.roomName !== b.roomName) return false;
  if (a.dayOfWeek.toLowerCase() !== b.dayOfWeek.toLowerCase()) return false;
  const aStart = parseTimeToMinutes(a.startTime);
  const aEnd = parseTimeToMinutes(a.endTime);
  const bStart = parseTimeToMinutes(b.startTime);
  const bEnd = parseTimeToMinutes(b.endTime);
  return aStart < bEnd && bStart < aEnd;
}

function currentMonthPrefix(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function toDatePrefix(value?: string | Date) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return String(value).split('T')[0];
}

function leadsInMonth(leads: LeadRecord[], monthPrefix: string) {
  return leads.filter((l) => {
    const stamp = toDatePrefix(l.updatedAt) || toDatePrefix(l.createdAt);
    return stamp.startsWith(monthPrefix);
  });
}

function bdeBaseSalary(bde: BdeRecord) {
  // monthlyTarget is a KPI (leads or revenue), not a salary multiplier
  return 30000;
}

function attendanceForEntity(
  records: AttendanceRecord[],
  entityId: string,
  type: 'trainer' | 'bde',
  name?: string,
  monthPrefix?: string
) {
  const normalizedName = (name || '').trim().toLowerCase();
  let logs = records.filter(
    (r) =>
      r.type === type &&
      (r.entityId === entityId || (normalizedName && (r.name || '').trim().toLowerCase() === normalizedName))
  );
  if (monthPrefix) {
    logs = logs.filter((l) => (l.date || '').startsWith(monthPrefix));
  }
  if (!logs.length) {
    return { pct: null as number | null, absent: 0, late: 0, present: 0, loggedDays: 0, hasLogs: false };
  }
  const present = logs.filter((l) => l.status === 'present' || l.status === 'late').length;
  const absent = logs.filter((l) => l.status === 'absent').length;
  const late = logs.filter((l) => l.status === 'late').length;
  return {
    pct: Math.round((present / logs.length) * 1000) / 10,
    absent,
    late,
    present,
    loggedDays: logs.length,
    hasLogs: true,
  };
}

function leaveBalanceFromAttendance(absentCount: number) {
  const casualUsed = Math.min(absentCount, 6);
  const sickUsed = Math.max(0, absentCount - casualUsed);
  const unpaid = Math.max(0, absentCount - 8);
  return {
    casual: Math.max(0, 12 - casualUsed),
    sick: Math.max(0, 10 - sickUsed),
    unpaid,
  };
}

function maskAccount(account?: string) {
  if (!account) return '**** ----';
  const trimmed = account.replace(/\s/g, '');
  return `**** ${trimmed.slice(-4)}`;
}

function defaultCommissionRule(employeeId: string, salary = 40000) {
  return {
    employeeId,
    perBatchPayout: Math.round(salary * 0.08),
    perStudentPayout: 150,
    attendanceBonusThreshold: 90,
    attendanceBonusAmount: 2500,
    studentFeedbackBonusThreshold: 4.5,
    studentFeedbackBonusAmount: 2000,
    retentionIncentivePct: 5,
  };
}

function computePayrollPreview(
  emp: ReturnType<typeof buildEmployees>[number],
  rule: ReturnType<typeof defaultCommissionRule> | undefined,
  batchCount: number,
  studentCount: number,
  leadRevenue = 0
) {
  const unpaidDays = emp.leaveBalance.unpaid;
  const dailyRate = Math.round(emp.baseSalary / 30);
  const unpaidDeduction = unpaidDays * dailyRate;

  // Use real late marks when attendance exists; otherwise no late/OT assumptions
  const lateDays = emp.hasAttendanceLogs ? emp.lateCount : 0;
  const lateDeduction = lateDays * 500;
  const overtime =
    emp.hasAttendanceLogs && emp.attendancePct != null && emp.attendancePct > 95 ? 1500 : 0;

  let batchCommission = 0;
  let attendanceBonus = 0;
  let feedbackBonus = 0;
  let retentionBonus = 0;
  if (rule && emp.role === 'Trainer') {
    batchCommission = rule.perBatchPayout * batchCount + rule.perStudentPayout * studentCount;
    if (
      emp.hasAttendanceLogs &&
      emp.attendancePct != null &&
      emp.attendancePct >= rule.attendanceBonusThreshold
    ) {
      attendanceBonus = rule.attendanceBonusAmount;
    }
    if (emp.performanceScore >= rule.studentFeedbackBonusThreshold) {
      feedbackBonus = rule.studentFeedbackBonusAmount;
    }
    if (emp.performanceScore >= 4.5 && batchCount >= 2) {
      retentionBonus = Math.round(emp.baseSalary * (rule.retentionIncentivePct / 100));
    }
  }

  // BDE: commission from converted lead revenue when enabled
  let salesCommission = 0;
  if (emp.role === 'BDE' && emp.commissionEnabled && emp.commissionPercentage > 0) {
    salesCommission = Math.round(leadRevenue * (emp.commissionPercentage / 100));
  }

  const performanceIncentive =
    emp.performanceScore > 4.5 ? 3000 : emp.performanceScore > 4 ? 1500 : 0;

  const comm = batchCommission + salesCommission;
  const inc = performanceIncentive + attendanceBonus + feedbackBonus + retentionBonus;
  const net =
    emp.baseSalary + emp.allowance + overtime + comm + inc - unpaidDeduction - lateDeduction;

  return {
    unpaidDays,
    unpaidDeduction,
    lateDays,
    lateDeduction,
    overtime,
    comm,
    inc,
    attendanceBonus,
    feedbackBonus,
    retentionBonus,
    salesCommission,
    batchCommission,
    net,
  };
}

export function buildEmployees(
  trainers: TrainerRecord[],
  bdes: BdeRecord[],
  batches: BatchRecord[],
  attendanceRecords: AttendanceRecord[],
  leads: LeadRecord[],
  monthPrefix = currentMonthPrefix()
) {
  const monthLeads = leadsInMonth(leads, monthPrefix);
  const activeTrainers = trainers.filter((t) => {
    const status = String((t as { status?: string }).status || 'Active').toLowerCase();
    return status !== 'inactive';
  });
  const activeBdes = bdes.filter((b) => (b.status || 'active') === 'active');

  const employees = [
    ...activeTrainers.map((trainer) => {
      const id = String(trainer.id || trainer._id);
      const trainerName = (trainer.name || '').trim();
      const assignedBatches = batches.filter(
        (b) => (b.trainerName || '').trim().toLowerCase() === trainerName.toLowerCase()
      );
      const branch = assignedBatches[0]?.centerName || trainer.tenantId || 'Main Campus';
      const att = attendanceForEntity(attendanceRecords, id, 'trainer', trainerName, monthPrefix);
      const activities = assignedBatches.slice(0, 2).map((batch, idx) => ({
        id: `act-tr-${id}-${idx}`,
        text: `Assigned to ${batch.courseName} (${batch.code})`,
        date: new Date().toISOString().split('T')[0],
      }));

      return {
        id,
        employeeType: 'trainer' as const,
        name: trainerName,
        photo: initials(trainerName),
        role: 'Trainer' as const,
        department: trainerDepartment(trainer),
        branch,
        reportingManager: 'Center Admin',
        joiningDate: formatDateOnly(trainer.joiningDate),
        attendancePct: att.pct ?? 0,
        hasAttendanceLogs: att.hasLogs,
        lateCount: att.late,
        attendanceDays: att.loggedDays,
        leaveBalance: leaveBalanceFromAttendance(att.absent),
        bankDetails: {
          holder: trainer.bankHolderName || trainerName,
          bank: 'Institute Bank',
          account: maskAccount(trainer.bankAccountNumber),
          ifsc: trainer.ifscCode || 'N/A',
        },
        performanceScore: trainer.rating || 0,
        baseSalary: trainer.salaryRateAmount || 0,
        allowance: Math.round((trainer.salaryRateAmount || 0) * 0.06),
        commissionEnabled: false,
        commissionPercentage: 0,
        recentActivities: activities,
        batchCount: assignedBatches.length,
        studentCount: assignedBatches.reduce((sum, b) => sum + (b.studentNames?.length || b.enrolled || 0), 0),
        hoursThisWeek: trainer.hoursThisWeek || 0,
        leadRevenue: 0,
        convertedLeads: 0,
        monthlyTarget: 0,
      };
    }),
    ...activeBdes.map((bde) => {
      const id = String(bde.id);
      const bdeLeads = monthLeads.filter(
        (l) =>
          (l.counsellor || '').trim().toLowerCase() === (bde.name || '').trim().toLowerCase() ||
          l.assignedBdeId === id
      );
      const convertedLeads = bdeLeads.filter((l) => l.stage === 'converted');
      const converted = convertedLeads.length;
      const leadRevenue = convertedLeads.reduce((sum, l) => sum + (Number(l.value) || 0), 0);
      const att = attendanceForEntity(attendanceRecords, id, 'bde', bde.name, monthPrefix);
      const target = bde.monthlyTarget || 30;
      const performanceScore = Math.min(5, Math.round((converted / Math.max(target, 1)) * 50) / 10);
      const commissionEnabled = Boolean(bde.commissionEnabled);
      const commissionPercentage = bde.commissionPercentage || 0;

      return {
        id,
        employeeType: 'bde' as const,
        name: bde.name || '',
        photo: initials(bde.name || 'BD'),
        role: 'BDE' as const,
        department: 'Sales & CRM',
        branch: 'Main Campus',
        reportingManager: 'Center Admin',
        joiningDate: bde.joiningDate || new Date().toISOString().split('T')[0],
        attendancePct: att.pct ?? 0,
        hasAttendanceLogs: att.hasLogs,
        lateCount: att.late,
        attendanceDays: att.loggedDays,
        leaveBalance: leaveBalanceFromAttendance(att.absent),
        bankDetails: {
          holder: bde.name || '',
          bank: 'Institute Bank',
          account: '**** ----',
          ifsc: 'N/A',
        },
        performanceScore,
        baseSalary: bdeBaseSalary(bde),
        allowance: commissionEnabled ? 0 : Math.round(Math.max(commissionPercentage, 5) * 500),
        commissionEnabled,
        commissionPercentage,
        recentActivities: [
          {
            id: `act-bde-${id}`,
            text: `${converted} leads converted of ${target} monthly target · ₹${leadRevenue.toLocaleString('en-IN')} revenue`,
            date: new Date().toISOString().split('T')[0],
          },
        ],
        batchCount: 0,
        studentCount: 0,
        convertedLeads: converted,
        monthlyTarget: target,
        hoursThisWeek: 0,
        leadRevenue,
      };
    }),
  ];

  return employees;
}

export function buildSchedules(
  batches: BatchRecord[],
  substitutes: Array<{
    batchId: string;
    substituteTrainerId?: string;
    substituteTrainerName?: string;
    conflictWarning?: string;
  }>,
  trainers: TrainerRecord[] = []
) {
  const trainerByName = new Map(
    trainers.map((t) => [(t.name || '').trim().toLowerCase(), String(t.id || t._id)])
  );

  const scheduleItems = batches
    .filter((b) => b.mode !== 'online' || b.roomName)
    .map((batch) => {
      const meta = parseScheduleMeta(batch.schedule || '');
      const batchId = String(batch.id || batch._id);
      const stored = substitutes.find((s) => s.batchId === batchId);
      const trainerName = batch.trainerName || '';
      return {
        id: batchId,
        batchId,
        trainerId: trainerByName.get(trainerName.trim().toLowerCase()) || '',
        trainerName,
        batchName: `${batch.courseName} (${batch.code})`,
        roomName: batch.roomName || batch.centerName || 'Room TBD',
        startTime: meta.startTime,
        endTime: meta.endTime,
        dayOfWeek: meta.dayOfWeek,
        substituteTrainerId: stored?.substituteTrainerId,
        substituteTrainerName: stored?.substituteTrainerName,
        conflictWarning: stored?.conflictWarning,
      };
    });

  scheduleItems.forEach((item, idx) => {
    if (item.conflictWarning) return;
    for (let j = idx + 1; j < scheduleItems.length; j += 1) {
      const other = scheduleItems[j];
      if (schedulesOverlap(item, other)) {
        item.conflictWarning = `Time conflict with ${other.batchName} in ${item.roomName}`;
        break;
      }
    }
  });

  return scheduleItems;
}

export function buildDepartmentDistribution(employees: ReturnType<typeof buildEmployees>) {
  const totals = new Map<string, number>();
  employees.forEach((emp) => {
    totals.set(emp.department, (totals.get(emp.department) || 0) + emp.baseSalary);
  });
  return Array.from(totals.entries()).map(([name, value]) => ({
    name,
    value,
    color: DEPT_COLORS[name] || '#64748b',
  }));
}

export function buildLeaveUtilization(employees: ReturnType<typeof buildEmployees>) {
  return employees.map((emp) => {
    const used = emp.leaveBalance.unpaid + (12 - emp.leaveBalance.casual) + (10 - emp.leaveBalance.sick);
    const remaining = emp.leaveBalance.casual + emp.leaveBalance.sick;
    return {
      name: emp.name.split(' ')[0],
      Used: Math.max(0, used),
      Remaining: Math.max(0, remaining),
    };
  });
}

export function buildSummary(
  employees: ReturnType<typeof buildEmployees>,
  payroll: Array<{ netPayout?: number; status?: string }>,
  claims: Array<{ status?: string }>,
  schedules: ReturnType<typeof buildSchedules>,
  month: string
) {
  const totalPayroll = payroll.reduce((sum, row) => sum + (row.netPayout || 0), 0);
  const pendingPayroll = payroll.filter((p) => p.status === 'Pending Approval').length;
  const draftPayroll = payroll.filter((p) => p.status === 'Draft').length;
  const approvedPayroll = payroll.filter((p) => p.status === 'Approved').length;
  const releasedPayroll = payroll.filter((p) => p.status === 'Released').length;
  const openClaims = claims.filter((c) => c.status === 'Pending Approval' || c.status === 'Draft').length;
  const scheduleConflicts = schedules.filter((s) => s.conflictWarning).length;
  const withLogs = employees.filter((e) => e.hasAttendanceLogs);
  const avgAttendance = withLogs.length
    ? Math.round((withLogs.reduce((sum, emp) => sum + emp.attendancePct, 0) / withLogs.length) * 10) / 10
    : 0;

  return {
    month,
    totalStaff: employees.length,
    trainerCount: employees.filter((e) => e.role === 'Trainer').length,
    bdeCount: employees.filter((e) => e.role === 'BDE').length,
    totalPayroll,
    pendingPayroll,
    draftPayroll,
    approvedPayroll,
    releasedPayroll,
    openClaims,
    scheduleConflicts,
    avgAttendance,
    totalBatches: employees.reduce((sum, e) => sum + (e.batchCount || 0), 0),
    totalStudents: employees.reduce((sum, e) => sum + (e.studentCount || 0), 0),
    branches: Array.from(new Set(employees.map((e) => e.branch).filter(Boolean))),
    departments: Array.from(new Set(employees.map((e) => e.department).filter(Boolean))),
  };
}

export function buildAlerts(
  employees: ReturnType<typeof buildEmployees>,
  commissionRules: Array<ReturnType<typeof defaultCommissionRule>>,
  schedules: ReturnType<typeof buildSchedules>,
  summary?: ReturnType<typeof buildSummary>
) {
  const alerts: Array<{ type: 'penalty' | 'substitute' | 'insight'; title: string; message: string }> = [];

  employees.forEach((emp) => {
    const rule = commissionRules.find((r) => r.employeeId === emp.id);
    const preview = computePayrollPreview(
      emp,
      rule,
      emp.batchCount || 0,
      emp.studentCount || 0,
      emp.leadRevenue || 0
    );
    if (preview.unpaidDays > 0) {
      alerts.push({
        type: 'penalty',
        title: 'Attendance Penalty Applied',
        message: `${preview.unpaidDays} unpaid leave${preview.unpaidDays > 1 ? 's' : ''} deducted automatically from ${emp.name}'s base salary payout.`,
      });
    }
  });

  schedules
    .filter((s) => s.conflictWarning)
    .slice(0, 2)
    .forEach((s) => {
      alerts.push({
        type: 'substitute',
        title: 'Substitute Instructor Needed',
        message: `${s.conflictWarning} for ${s.trainerName}'s scheduled ${s.dayOfWeek} session.`,
      });
    });

  employees
    .filter((e) => e.role === 'BDE' && 'convertedLeads' in e)
    .forEach((bde) => {
      const target = (bde as { monthlyTarget?: number }).monthlyTarget || 30;
      const converted = (bde as { convertedLeads?: number }).convertedLeads || 0;
      const pctOver = Math.round(((converted - target) / Math.max(target, 1)) * 100);
      if (pctOver >= 10) {
        alerts.push({
          type: 'insight',
          title: 'AI Performance Insight',
          message: `${bde.name} exceeded monthly conversion target by ${pctOver}%; eligible for incentive bonus.`,
        });
      }
    });

  if (summary) {
    if (summary.draftPayroll > 0) {
      alerts.push({
        type: 'insight',
        title: 'Payroll drafts awaiting action',
        message: `${summary.draftPayroll} salary draft${summary.draftPayroll > 1 ? 's' : ''} for ${summary.month} need submission before approval.`,
      });
    }
    if (summary.pendingPayroll > 0) {
      alerts.push({
        type: 'insight',
        title: 'Pending payroll approvals',
        message: `${summary.pendingPayroll} payout${summary.pendingPayroll > 1 ? 's' : ''} queued for HR authorization this cycle.`,
      });
    }
    if (summary.openClaims > 0) {
      alerts.push({
        type: 'insight',
        title: 'Reimbursement queue active',
        message: `${summary.openClaims} expense claim${summary.openClaims > 1 ? 's' : ''} waiting for review in Claims & Vault.`,
      });
    }
    if (summary.scheduleConflicts > 0) {
      alerts.push({
        type: 'substitute',
        title: 'Schedule conflicts detected',
        message: `${summary.scheduleConflicts} batch session${summary.scheduleConflicts > 1 ? 's' : ''} overlap in shared rooms — assign substitutes.`,
      });
    }
  }

  employees
    .filter((e) => e.hasAttendanceLogs && e.attendancePct < 85)
    .slice(0, 2)
    .forEach((emp) => {
      alerts.push({
        type: 'penalty',
        title: 'Low attendance flag',
        message: `${emp.name} is at ${emp.attendancePct}% attendance this month — review leave deductions and schedule impact.`,
      });
    });

  if (alerts.length === 0 && summary && summary.totalStaff > 0) {
    alerts.push({
      type: 'insight',
      title: 'Workforce pulse',
      message: `${summary.totalStaff} staff active · ${summary.avgAttendance}% avg attendance · est. payroll ₹${summary.totalPayroll.toLocaleString('en-IN')} for ${summary.month}.`,
    });
  }

  return alerts.slice(0, 6);
}

export function buildAiInsights(
  employees: ReturnType<typeof buildEmployees>,
  summary?: ReturnType<typeof buildSummary>
) {
  const insights: Array<{ title: string; message: string; severity?: 'info' | 'warning' | 'success' }> = [];

  employees
    .filter((e) => e.role === 'BDE')
    .forEach((bde) => {
      const converted = bde.convertedLeads || 0;
      const target = bde.monthlyTarget || 30;
      if (converted <= 0) return;
      if (converted >= target) {
        insights.push({
          title: 'Conversion target met',
          message: `${bde.name} converted ${converted}/${target} leads this month${
            bde.leadRevenue ? ` (₹${bde.leadRevenue.toLocaleString('en-IN')} revenue)` : ''
          }.`,
          severity: 'success',
        });
      } else if (converted >= target * 0.7) {
        insights.push({
          title: 'Near conversion target',
          message: `${bde.name} is at ${converted}/${target} conversions this month.`,
          severity: 'info',
        });
      }
    });

  employees
    .filter((e) => e.role === 'Trainer' && (e.hoursThisWeek || 0) >= 30)
    .forEach((trainer) => {
      insights.push({
        title: 'High weekly load',
        message: `${trainer.name} logged ${trainer.hoursThisWeek}+ hours across ${trainer.batchCount || 0} batches this week.`,
        severity: 'warning',
      });
    });

  employees
    .filter((e) => e.hasAttendanceLogs && e.attendancePct < 85)
    .forEach((emp) => {
      insights.push({
        title: 'Low attendance',
        message: `${emp.name} is at ${emp.attendancePct}% (${emp.attendanceDays} logged days, ${emp.lateCount} late) this month.`,
        severity: 'warning',
      });
    });

  employees
    .filter((e) => !e.hasAttendanceLogs)
    .slice(0, 3)
    .forEach((emp) => {
      insights.push({
        title: 'No attendance logs',
        message: `${emp.name} has no ${emp.role.toLowerCase()} attendance marked for this month — pay deductions are skipped until logs exist.`,
        severity: 'info',
      });
    });

  employees
    .filter((e) => e.role === 'Trainer' && (e.batchCount || 0) === 0)
    .forEach((trainer) => {
      insights.push({
        title: 'Unassigned trainer',
        message: `${trainer.name} has no active batches mapped.`,
        severity: 'info',
      });
    });

  employees
    .filter((e) => e.role === 'Trainer' && e.performanceScore >= 4.5 && (e.batchCount || 0) >= 2)
    .slice(0, 2)
    .forEach((trainer) => {
      insights.push({
        title: 'Top-rated trainer',
        message: `${trainer.name} has ${trainer.performanceScore}/5 rating across ${trainer.batchCount} batches.`,
        severity: 'success',
      });
    });

  if (summary && insights.length === 0 && summary.totalStaff > 0) {
    insights.push({
      title: 'Payroll cycle status',
      message: `${summary.draftPayroll} draft · ${summary.pendingPayroll} pending · ${summary.releasedPayroll} released for ${summary.month}.`,
      severity: 'info',
    });
  }

  return insights.slice(0, 6);
}

export function buildVaultDocs(trainers: TrainerRecord[], employees: ReturnType<typeof buildEmployees>) {
  const docs: Array<{ id: string; employeeId: string; name: string; category: string; uploadDate: string; size: string }> = [];
  trainers.forEach((trainer) => {
    const id = String(trainer.id || trainer._id);
    const joinDate = formatDateOnly(trainer.joiningDate);
    if (trainer.resumeFileName) {
      docs.push({ id: `doc-res-${id}`, employeeId: id, name: trainer.resumeFileName, category: 'Contract', uploadDate: joinDate, size: '1.2 MB' });
    }
    if (trainer.idProofFileName) {
      docs.push({ id: `doc-id-${id}`, employeeId: id, name: trainer.idProofFileName, category: 'ID Proof', uploadDate: joinDate, size: '840 KB' });
    }
    if (trainer.certificationsFileName) {
      docs.push({ id: `doc-cert-${id}`, employeeId: id, name: trainer.certificationsFileName, category: 'Certificate', uploadDate: joinDate, size: '1.1 MB' });
    }
  });
  return docs;
}

export function buildCommissionRules(
  trainers: TrainerRecord[],
  storedRules: Array<ReturnType<typeof defaultCommissionRule>>
) {
  return trainers.map((trainer) => {
    const id = String(trainer.id || trainer._id);
    const existing = storedRules.find((r) => r.employeeId === id);
    return existing || defaultCommissionRule(id, trainer.salaryRateAmount || 40000);
  });
}

export function buildAutoPayrollDrafts(
  employees: ReturnType<typeof buildEmployees>,
  commissionRules: Array<ReturnType<typeof defaultCommissionRule>>,
  month = currentMonthPrefix()
) {
  return employees.map((emp) => {
    const rule = commissionRules.find((r) => r.employeeId === emp.id);
    const preview = computePayrollPreview(
      emp,
      rule,
      emp.batchCount || 0,
      emp.studentCount || 0,
      emp.leadRevenue || 0
    );
    return {
      employeeId: emp.id,
      employeeType: emp.employeeType,
      month,
      baseSalary: emp.baseSalary,
      lateArrivalDeduction: preview.lateDeduction,
      unpaidLeaveDeduction: preview.unpaidDeduction,
      overtimeAdd: preview.overtime,
      commissionAdd: preview.comm,
      incentiveAdd: preview.inc,
      grossPayout: emp.baseSalary + emp.allowance + preview.overtime + preview.comm + preview.inc,
      netPayout: preview.net,
      unpaidDays: preview.unpaidDays,
      lateDays: preview.lateDays,
      status: 'Draft' as const,
      timeline: [] as Array<{ title: string; date: string; description: string }>,
    };
  });
}

export { computePayrollPreview, currentMonthPrefix, defaultCommissionRule };
