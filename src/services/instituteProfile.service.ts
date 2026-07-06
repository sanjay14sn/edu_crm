import TenantUsage from '../models/TenantUsage';
import Center from '../models/Center';
import Student from '../models/Student';
import Lead from '../models/Lead';
import Batch from '../models/Batch';
import Trainer from '../models/Trainer';
import User from '../models/User';
import Attendance from '../models/Attendance';
import {
  estimateMongoUsageForTenant,
} from '../services/usageTracker.service';
import {
  getMonthlyIncome,
  getOutstandingDues,
} from '../utils/incomeStats';
import { formatBytes } from '../utils/formatBytes';

function tenantRegex(tenantId: string) {
  const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
}

function currentMonthPrefix(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function parseDurationToMinutes(duration?: string): number {
  const value = String(duration || '').trim().toLowerCase();
  if (!value || value === '—' || value === '-') return 0;

  let minutes = 0;
  const hourMatch = value.match(/(\d+(?:\.\d+)?)\s*h/);
  const minuteMatch = value.match(/(\d+(?:\.\d+)?)\s*m/);
  const colonMatch = value.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);

  if (hourMatch) minutes += Number(hourMatch[1]) * 60;
  if (minuteMatch) minutes += Number(minuteMatch[1]);
  if (colonMatch) {
    minutes += Number(colonMatch[1]) * 60 + Number(colonMatch[2]);
    if (colonMatch[3]) minutes += Number(colonMatch[3]) / 60;
  }

  if (!hourMatch && !minuteMatch && !colonMatch) {
    const numeric = Number(value.replace(/[^\d.]/g, ''));
    if (Number.isFinite(numeric) && numeric > 0) minutes = numeric;
  }

  return minutes;
}

function computeLmsWatchHours(batches: Array<{ lmsContent?: any }>) {
  let totalMinutes = 0;

  batches.forEach((batch) => {
    const videos = batch.lmsContent?.videos || [];
    videos.forEach((video: { duration?: string; isCompleted?: boolean }) => {
      const minutes = parseDurationToMinutes(video.duration);
      if (minutes > 0) {
        totalMinutes += minutes * (video.isCompleted ? 1 : 0.35);
      }
    });
  });

  return Math.round((totalMinutes / 60) * 10) / 10;
}

function computeAssignmentSubmissions(batches: Array<{ studentNames?: string[]; lmsContent?: any }>) {
  let submitted = 0;

  batches.forEach((batch) => {
    const assignments = batch.lmsContent?.assignments || [];
    const studentNames = batch.studentNames || [];

    assignments.forEach((assignment: any) => {
      const submissions = assignment?.submissions || {};
      studentNames.forEach((name: string) => {
        const submissionKey =
          Object.keys(submissions).find(
            (key) => key.trim().toLowerCase() === name.trim().toLowerCase()
          ) || name;
        const submission = submissions[submissionKey];
        if (submission?.status === 'submitted' || submission?.status === 'graded') {
          submitted += 1;
        }
      });
    });
  });

  return submitted;
}

function computeAttendancePercentage(logs: Array<{ status?: string }>) {
  if (logs.length === 0) return 0;
  const present = logs.filter((log) => log.status === 'present' || log.status === 'late').length;
  return Math.round((present / logs.length) * 100);
}

function estimateAiCostInr(totalTokens: number) {
  if (!totalTokens) return 0;
  return Math.max(0.01, Number(((totalTokens * 0.01294) / 1000).toFixed(2)));
}

function formatInr(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function normalizeTenantId(tenantId?: string | null) {
  return (tenantId || 'ERP').trim() || 'ERP';
}

export async function getInstituteProfileSnapshot(tenantId: string) {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const tenantMatch = tenantRegex(normalizedTenantId);
  const monthPrefix = currentMonthPrefix();
  const today = todayISO();

  const [
    centers,
    students,
    leads,
    batches,
    trainers,
    bdes,
    usageDoc,
    mongoUsage,
    studentAttendanceLogs,
    todayAttendanceLogs,
  ] = await Promise.all([
    Center.find({ tenantName: tenantMatch }).lean(),
    Student.find({ tenantId: tenantMatch }).lean(),
    Lead.find({ tenantId: tenantMatch }).lean(),
    Batch.find({ tenantId: tenantMatch }).lean(),
    Trainer.find({ tenantId: tenantMatch }).lean(),
    User.find({ role: 'bde', tenantId: tenantMatch }).lean(),
    TenantUsage.findOne({ tenantId: normalizedTenantId }).lean(),
    estimateMongoUsageForTenant(normalizedTenantId),
    Attendance.find({ tenantId: tenantMatch, type: 'student' }).lean(),
    Attendance.find({ tenantId: tenantMatch, date: today }).lean(),
  ]);

  const instituteName =
    centers[0]?.tenantName?.trim() || normalizedTenantId;
  const totalStudents = students.length;
  const activeStudents = students.filter((student) => student.status === 'active').length;
  const totalTrainers = trainers.length;
  const totalBdes = bdes.length;
  const totalBatches = batches.length;
  const totalLeads = leads.length;
  const convertedLeads = leads.filter((lead) => lead.stage === 'converted').length;
  const conversionRate =
    totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

  const monthlyCollections = getMonthlyIncome(students);
  const outstandingDues = getOutstandingDues(students);
  const newAdmissionsThisMonth = students.filter((student) =>
    String(student.enrollmentDate || '').startsWith(monthPrefix)
  ).length;

  const monthlyAttendanceLogs = studentAttendanceLogs.filter((log) =>
    String(log.date || '').startsWith(monthPrefix)
  );
  const attendancePercentage = computeAttendancePercentage(monthlyAttendanceLogs);

  const dailyActiveUsers = new Set(todayAttendanceLogs.map((log) => String(log.entityId))).size;
  const lmsWatchHours = computeLmsWatchHours(batches);
  const assignmentSubmissions = computeAssignmentSubmissions(batches);

  const aiTotalTokens = usageDoc?.aiTotalTokens || 0;
  const aiRequestsToday =
    usageDoc?.aiDailyDate === today ? usageDoc?.aiDailyRequests || 0 : 0;
  const estimatedAiCostInr = estimateAiCostInr(aiTotalTokens);

  return {
    institute: {
      tenantId: normalizedTenantId,
      tenantName: instituteName,
      centerCount: centers.length,
      centerNames: centers.map((center) => center.name),
    },
    storage: {
      cloudinary: {
        bytes: usageDoc?.cloudinaryBytes || 0,
        bytesLabel: formatBytes(usageDoc?.cloudinaryBytes || 0),
        files: usageDoc?.cloudinaryFiles || 0,
        lastUploadAt: usageDoc?.lastCloudinaryUploadAt || null,
      },
      mongo: {
        bytes: mongoUsage.bytes,
        bytesLabel: mongoUsage.bytesLabel,
        documents: mongoUsage.documents,
      },
    },
    overview: {
      totalStudents,
      activeStudents,
      totalTrainers,
      totalBdes,
      totalBatches,
      totalLeads,
    },
    revenue: {
      monthlyCollections,
      monthlyCollectionsLabel: formatInr(monthlyCollections),
      outstandingDues,
      outstandingDuesLabel: formatInr(outstandingDues),
      conversionRate,
      newAdmissionsThisMonth,
    },
    systemUsage: {
      dailyActiveUsers,
      lmsWatchHours,
      assignmentSubmissions,
      attendancePercentage,
    },
    ai: {
      assistantLabel: 'AI Assistant',
      requestsToday: aiRequestsToday,
      requestsTodayLabel:
        aiRequestsToday === 1
          ? '1 request today'
          : `${aiRequestsToday} requests today`,
      estimatedCostInr: estimatedAiCostInr,
      estimatedCostLabel: formatInr(estimatedAiCostInr),
      mostUsedBy: instituteName,
      totalTokens: aiTotalTokens,
      totalRequests: usageDoc?.aiRequests || 0,
      lastUsedAt: usageDoc?.lastAiUsageAt || null,
    },
    generatedAt: new Date().toISOString(),
  };
}
