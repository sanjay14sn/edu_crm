export type InstallmentScheduleItem = {
  amount: number;
  dueDate: string;
  label?: string;
};

export type ComputedInstallment = InstallmentScheduleItem & {
  number: number;
  label: string;
  status: 'paid' | 'partial' | 'pending' | 'overdue';
  dueAmount: number;
  paidAmount: number;
};

export function getInstallmentLabel(index: number, total: number) {
  const number = index + 1;
  if (number === 1) return 'Admission Fee';
  if (number === total) return 'Final Dues';
  return `Installment ${number}`;
}

export function buildDefaultSchedule(input: {
  feesTotal: number;
  installmentsCount?: number;
  enrollmentDate?: string;
  nextDueDate?: string;
}): InstallmentScheduleItem[] {
  const count = Math.max(1, input.installmentsCount || 3);
  const total = Math.max(0, input.feesTotal || 0);
  if (total <= 0) return [];

  const baseAmount = Math.floor(total / count);
  const remainder = total - baseAmount * count;
  const enrollment = input.enrollmentDate || new Date().toISOString().split('T')[0];

  return Array.from({ length: count }, (_, index) => {
    const amount = index === count - 1 ? baseAmount + remainder : baseAmount;
    const baseDate = new Date(enrollment);
    baseDate.setMonth(baseDate.getMonth() + index * 2);
    const dueDate =
      index === 0 && input.nextDueDate
        ? input.nextDueDate.substring(0, 10)
        : baseDate.toISOString().split('T')[0];

    return {
      amount,
      dueDate,
      label: getInstallmentLabel(index, count),
    };
  });
}

export function normalizeInstallmentSchedule(student: {
  feesTotal?: number;
  installmentsCount?: number;
  enrollmentDate?: string;
  nextDueDate?: string;
  installmentSchedule?: InstallmentScheduleItem[];
}): InstallmentScheduleItem[] {
  const schedule = student.installmentSchedule || [];
  if (schedule.length > 0) {
    return schedule.map((item, index) => ({
      amount: Number(item.amount) || 0,
      dueDate: (item.dueDate || '').substring(0, 10),
      label: item.label || getInstallmentLabel(index, schedule.length),
    }));
  }

  return buildDefaultSchedule({
    feesTotal: student.feesTotal || 0,
    installmentsCount: student.installmentsCount,
    enrollmentDate: student.enrollmentDate,
    nextDueDate: student.nextDueDate,
  });
}

function isPastDueDate(dueDate?: string) {
  if (!dueDate) return false;
  const due = dueDate.substring(0, 10);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return due < todayStr;
}

export function computeInstallmentRows(student: {
  feesPaid?: number;
  feesTotal?: number;
  installmentsCount?: number;
  enrollmentDate?: string;
  nextDueDate?: string;
  installmentSchedule?: InstallmentScheduleItem[];
}): ComputedInstallment[] {
  const schedule = normalizeInstallmentSchedule(student);
  const feesPaid = Math.max(0, student.feesPaid || 0);
  let remainingPaid = feesPaid;

  return schedule.map((item, index) => {
    const amount = Math.max(0, item.amount || 0);
    let status: ComputedInstallment['status'] = 'pending';
    let paidAmount = 0;
    let dueAmount = amount;

    if (remainingPaid >= amount) {
      status = 'paid';
      paidAmount = amount;
      dueAmount = 0;
      remainingPaid -= amount;
    } else if (remainingPaid > 0) {
      status = 'partial';
      paidAmount = remainingPaid;
      dueAmount = amount - remainingPaid;
      remainingPaid = 0;
    } else if (isPastDueDate(item.dueDate)) {
      status = 'overdue';
    }

    return {
      number: index + 1,
      amount,
      dueDate: item.dueDate,
      label: item.label || getInstallmentLabel(index, schedule.length),
      status,
      dueAmount,
      paidAmount,
    };
  });
}

export function isFullyPaid(feesPaid?: number, feesTotal?: number) {
  return (feesTotal || 0) > 0 && (feesPaid || 0) >= (feesTotal || 0);
}
