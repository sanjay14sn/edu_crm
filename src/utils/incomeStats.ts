type StudentFeeRecord = {
  name?: string;
  feesPaid?: number;
  feesTotal?: number;
  enrollmentDate?: string;
  updatedAt?: Date | string;
};

type BatchRecord = {
  centerName?: string;
  studentNames?: string[];
};

function currentMonthPrefix(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getTotalFeesCollected(students: StudentFeeRecord[]): number {
  return students.reduce((sum, student) => sum + (student.feesPaid || 0), 0);
}

export function getOutstandingDues(students: StudentFeeRecord[]): number {
  return students.reduce(
    (sum, student) => sum + Math.max(0, (student.feesTotal || 0) - (student.feesPaid || 0)),
    0
  );
}

export function getMonthlyIncome(students: StudentFeeRecord[], date = new Date()): number {
  const monthPrefix = currentMonthPrefix(date);

  return students.reduce((sum, student) => {
    const enrolledThisMonth = student.enrollmentDate?.startsWith(monthPrefix);
    const updatedThisMonth =
      student.updatedAt &&
      new Date(student.updatedAt).toISOString().startsWith(monthPrefix);

    if (enrolledThisMonth || updatedThisMonth) {
      return sum + (student.feesPaid || 0);
    }

    return sum;
  }, 0);
}

export function getIncomeForStudents(students: StudentFeeRecord[], date = new Date()): number {
  const monthly = getMonthlyIncome(students, date);
  if (monthly > 0) return monthly;
  return getTotalFeesCollected(students);
}

export function studentsAtCenter(
  students: StudentFeeRecord[],
  batches: BatchRecord[],
  centerName: string
): StudentFeeRecord[] {
  const normalizedCenter = centerName.trim().toLowerCase();
  const studentNames = new Set<string>();

  batches
    .filter((batch) => (batch.centerName || '').trim().toLowerCase() === normalizedCenter)
    .forEach((batch) => {
      batch.studentNames?.forEach((name) => studentNames.add(name.trim().toLowerCase()));
    });

  if (studentNames.size === 0) return [];

  return students.filter((student) =>
    studentNames.has((student.name || '').trim().toLowerCase())
  );
}

export function buildRevenueTrends(students: StudentFeeRecord[]) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const trends = [];

  for (let offset = 4; offset >= 0; offset -= 1) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const prefix = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;

    const monthStudents = students.filter((student) => student.enrollmentDate?.startsWith(prefix));
    const collected = monthStudents.reduce((sum, student) => sum + (student.feesPaid || 0), 0);
    const dues = monthStudents.reduce(
      (sum, student) => sum + Math.max(0, (student.feesTotal || 0) - (student.feesPaid || 0)),
      0
    );

    trends.push({
      month: monthNames[monthDate.getMonth()],
      Collected: collected,
      Dues: dues,
    });
  }

  if (trends.every((entry) => entry.Collected === 0 && entry.Dues === 0)) {
    const totalCollected = getTotalFeesCollected(students);
    const totalDues = getOutstandingDues(students);
    if (totalCollected > 0 || totalDues > 0) {
      trends[trends.length - 1] = {
        ...trends[trends.length - 1],
        Collected: totalCollected,
        Dues: totalDues,
      };
    }
  }

  return trends;
}
