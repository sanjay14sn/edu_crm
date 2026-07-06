import Lead from '../models/Lead';
import User from '../models/User';

export function normalizeName(name: string) {
  return (name || '').trim().toLowerCase();
}

export function leadBelongsToBDE(
  lead: { counsellor?: string; assignedBdeId?: string },
  bdeId: string,
  bdeName: string
) {
  const idMatch = String(lead.assignedBdeId || '') === String(bdeId);
  const nameMatch = normalizeName(lead.counsellor || '') === normalizeName(bdeName);
  return idMatch || nameMatch;
}

export function tenantFilter(tenantId: string) {
  const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
}

export function bdeLeadFilter(bdeId: string, bdeName: string, tenantId?: string) {
  const escapedName = (bdeName || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter: Record<string, unknown> = {
    $or: [
      { assignedBdeId: String(bdeId) },
      { counsellor: { $regex: new RegExp(`^${escapedName}$`, 'i') } },
    ],
  };

  if (tenantId) {
    filter.tenantId = tenantFilter(tenantId);
  }

  return filter;
}

export async function fetchLeadsForBDE(bdeId: string, bdeName: string, tenantId?: string) {
  return Lead.find(bdeLeadFilter(bdeId, bdeName, tenantId)).sort({ createdAt: -1 });
}

export async function loadBdeUsers(tenantId?: string) {
  const filter: Record<string, unknown> = { role: 'bde' };
  if (tenantId) filter.tenantId = tenantFilter(tenantId);
  return User.find(filter);
}

export function resolveLeadBdeName(
  lead: { assignedBdeId?: string; counsellor?: string },
  bdeUsers: Array<{ _id: unknown; name?: string }>
) {
  if (lead.assignedBdeId) {
    const match = bdeUsers.find((u) => String(u._id) === String(lead.assignedBdeId));
    if (match?.name) return match.name;
  }
  if (lead.counsellor?.trim()) return lead.counsellor.trim();
  return null;
}

export async function formatLeadsForResponse(
  leads: Array<{ toObject: () => Record<string, unknown>; _id: unknown; assignedBdeId?: string; counsellor?: string }>,
  tenantId?: string
) {
  const bdeUsers = await loadBdeUsers(tenantId);
  return leads.map((lead) => {
    const obj = lead.toObject();
    return {
      ...obj,
      id: lead._id,
      bdeName: resolveLeadBdeName(lead, bdeUsers),
    };
  });
}

export function computeBdeMetrics(
  leads: Array<{ stage: string; value?: number }>,
  monthlyTarget: number,
  targetType: 'revenue' | 'leads',
  commissionConfig: BdeCommissionConfig
) {
  const totalAssigned = leads.length;
  const newLeads = leads.filter((l) => l.stage === 'new').length;
  const interestedLeads = leads.filter((l) => l.stage === 'interested').length;
  const convertedLeads = leads.filter((l) => l.stage === 'converted').length;
  const contactedLeads = leads.filter((l) => l.stage !== 'new').length;
  const conversionRate = totalAssigned > 0 ? Math.round((convertedLeads / totalAssigned) * 100) : 0;

  const revenue = leads
    .filter((l) => l.stage === 'converted')
    .reduce((acc, curr) => acc + (curr.value || 0), 0);

  const achievedCount = targetType === 'revenue' ? revenue : convertedLeads;
  const targetTotal = monthlyTarget || 30;
  const targetPercent = targetTotal > 0 ? Math.min(Math.round((achievedCount / targetTotal) * 100), 100) : 0;
  const remaining = Math.max(0, targetTotal - achievedCount);
  const incentive = calculateBdeCommission(
    revenue,
    monthlyTarget,
    targetType,
    convertedLeads,
    commissionConfig
  );
  const bonusAmount = Math.round(monthlyTarget * 0.05);

  return {
    totalAssigned,
    newLeads,
    interestedLeads,
    convertedLeads,
    contactedLeads,
    conversionRate,
    revenue,
    achievedCount,
    targetTotal,
    targetPercent,
    remaining,
    incentive,
    bonusAmount,
  };
}

export type CommissionApplyFrom = 'from_start' | 'after_target' | 'after_threshold';

export interface BdeCommissionConfig {
  commissionEnabled?: boolean;
  commissionPercentage?: number;
  commissionApplyFrom?: CommissionApplyFrom;
  commissionThreshold?: number;
}

export function calculateBdeCommission(
  revenue: number,
  monthlyTarget: number,
  targetType: 'revenue' | 'leads',
  convertedLeads: number,
  config: BdeCommissionConfig
) {
  if (!config.commissionEnabled) return 0;

  const rate = config.commissionPercentage ?? 0;
  if (rate <= 0) return 0;

  const applyFrom = config.commissionApplyFrom || 'from_start';
  let commissionableRevenue = revenue;

  if (applyFrom === 'after_target') {
    if (targetType === 'revenue') {
      if (revenue < monthlyTarget) return 0;
      commissionableRevenue = Math.max(0, revenue - monthlyTarget);
    } else if (convertedLeads < monthlyTarget) {
      return 0;
    }
  } else if (applyFrom === 'after_threshold') {
    const threshold = config.commissionThreshold ?? monthlyTarget;
    if (revenue <= threshold) return 0;
    commissionableRevenue = Math.max(0, revenue - threshold);
  }

  return Math.round(commissionableRevenue * (rate / 100));
}

export function buildBdeCommissionConfig(profile?: {
  commissionEnabled?: boolean;
  commissionPercentage?: number;
  commissionApplyFrom?: CommissionApplyFrom;
  commissionThreshold?: number;
} | null): BdeCommissionConfig {
  const commissionPercentage = profile?.commissionPercentage ?? 0;
  return {
    commissionEnabled: profile?.commissionEnabled ?? commissionPercentage > 0,
    commissionPercentage,
    commissionApplyFrom: profile?.commissionApplyFrom ?? 'from_start',
    commissionThreshold: profile?.commissionThreshold,
  };
}

export function computeStudentInstallmentPending(student: {
  feesTotal?: number;
  feesPaid?: number;
  installmentsCount?: number;
}) {
  const total = student.feesTotal || 0;
  const paid = student.feesPaid || 0;
  const installments = student.installmentsCount || 3;
  const outstanding = Math.max(0, total - paid);

  if (outstanding <= 0 || total <= 0) {
    return { pending: 0, remainingDues: 0, dueAmount: 0, totalTarget: total, collected: paid };
  }

  // Plan: 1 down payment + (installments - 1) equal EMIs, e.g. ₹42,000 total,
  // ₹2,000 paid, 2 dues × ₹20,000 = ₹40,000 pending.
  const emiSlots = Math.max(1, installments - 1);
  const perDueEstimate = Math.max(1, Math.round(outstanding / emiSlots));
  const remainingDues = Math.min(emiSlots, Math.max(1, Math.ceil(outstanding / perDueEstimate)));
  const dueAmount = Math.round(outstanding / remainingDues);
  const pending = remainingDues * dueAmount;

  return {
    pending: Math.min(pending, outstanding),
    remainingDues,
    dueAmount,
    totalTarget: total,
    collected: paid,
  };
}

export function computeBdeRecovery(
  leads: Array<{ stage: string; email?: string }>,
  students: Array<{
    email?: string;
    feesPaid?: number;
    feesTotal?: number;
    installmentsCount?: number;
    enrollmentDate?: string;
    updatedAt?: Date | string;
  }>,
  date = new Date()
) {
  const convertedEmails = new Set(
    leads
      .filter((l) => l.stage === 'converted' && l.email)
      .map((l) => (l.email || '').trim().toLowerCase())
  );

  const bdeStudents = students.filter((s) =>
    convertedEmails.has((s.email || '').trim().toLowerCase())
  );

  const schedules = bdeStudents.map((s) => computeStudentInstallmentPending(s));

  const totalFeeTarget = schedules.reduce((sum, s) => sum + s.totalTarget, 0);
  const totalRecovery = schedules.reduce((sum, s) => sum + s.collected, 0);
  const totalOutstanding = schedules.reduce((sum, s) => sum + s.pending, 0);
  const remainingDues = schedules.reduce((sum, s) => sum + s.remainingDues, 0);
  const averageDueAmount =
    remainingDues > 0 ? Math.round(totalOutstanding / remainingDues) : 0;

  const monthPrefix = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const monthlyRecovery = bdeStudents.reduce((sum, student) => {
    const enrolledThisMonth = student.enrollmentDate?.startsWith(monthPrefix);
    const updatedThisMonth =
      student.updatedAt &&
      new Date(student.updatedAt).toISOString().startsWith(monthPrefix);
    if (enrolledThisMonth || updatedThisMonth) {
      return sum + (student.feesPaid || 0);
    }
    return sum;
  }, 0);

  return {
    monthlyRecovery,
    totalRecovery,
    totalFeeTarget,
    totalOutstanding,
    remainingDues,
    averageDueAmount,
  };
}

export function monthKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(month: string) {
  const [year, mon] = month.split('-').map(Number);
  return new Date(year, mon - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

export function buildRecentMonths(count = 5) {
  const now = new Date();
  const months: string[] = [];
  for (let i = count; i >= 0; i--) {
    months.push(monthKeyFromDate(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return months;
}

/** Months from BDE join month through current month (inclusive), capped at maxMonths. */
export function buildMonthsSinceJoining(joinDate: Date, maxMonths = 12) {
  const start = new Date(joinDate.getFullYear(), joinDate.getMonth(), 1);
  const end = new Date();
  const months: string[] = [];

  let cursor = new Date(start);
  while (cursor <= end) {
    months.push(monthKeyFromDate(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  if (months.length === 0) {
    months.push(monthKeyFromDate(end));
  }

  if (months.length > maxMonths) {
    return months.slice(months.length - maxMonths);
  }

  return months;
}

export function computeBdeMonthlyHistory(
  leads: Array<{ stage: string; value?: number; updatedAt?: Date; createdAt?: Date }>,
  monthlyTarget: number,
  targetType: 'revenue' | 'leads',
  commissionConfig: BdeCommissionConfig,
  joinDate: Date,
  payrollByMonth: Record<string, { status?: string; commissionAdd?: number; incentiveAdd?: number }> = {},
  maxMonths = 12
) {
  const months = buildMonthsSinceJoining(joinDate, maxMonths);
  const currentMonth = monthKeyFromDate(new Date());
  const converted = leads.filter((l) => l.stage === 'converted');

  return months.map((month) => {
    const inMonth = converted.filter((lead) => {
      const stamp = new Date(lead.updatedAt || lead.createdAt || 0);
      return monthKeyFromDate(stamp) === month;
    });

    const achieved = inMonth.length;
    const revenue = inMonth.reduce((sum, lead) => sum + (lead.value || 0), 0);
    const achievedCount = targetType === 'revenue' ? revenue : achieved;
    const payroll = payrollByMonth[month];
    const calculatedIncentive = calculateBdeCommission(
      revenue,
      monthlyTarget,
      targetType,
      achieved,
      commissionConfig
    );
    const incentive =
      payroll?.commissionAdd != null && payroll.commissionAdd > 0
        ? payroll.commissionAdd + (payroll.incentiveAdd || 0)
        : calculatedIncentive;

    let releaseStatus: 'accruing' | 'released' | 'pending' = 'pending';
    if (month === currentMonth) {
      releaseStatus = 'accruing';
    } else if (payroll?.status === 'Released' || payroll?.status === 'Approved') {
      releaseStatus = 'released';
    } else if (incentive > 0) {
      releaseStatus = 'pending';
    }

    return {
      month,
      monthLabel: formatMonthLabel(month),
      target: monthlyTarget,
      achieved,
      achievedCount,
      revenue,
      incentive,
      targetPercent:
        monthlyTarget > 0 ? Math.min(Math.round((achievedCount / monthlyTarget) * 100), 100) : 0,
      releaseStatus,
    };
  });
}
