import Batch from '../models/Batch';
import Attendance from '../models/Attendance';

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

export function parseWeeklyHoursFromSchedule(schedule: string): number {
  if (!schedule) return 0;

  const timeMatch = schedule.match(
    /(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i
  );
  if (!timeMatch) return 0;

  const startMins = parseTimeToMinutes(timeMatch[1]);
  const endMins = parseTimeToMinutes(timeMatch[2]);
  const sessionHours = Math.max(0, (endMins - startMins) / 60);

  const daysPart = schedule.split(/[•·|]/)[0] || schedule;
  const dayCount = (daysPart.match(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/gi) || []).length || 1;

  return Math.round(sessionHours * dayCount * 10) / 10;
}

function getCurrentWeekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const format = (date: Date) => date.toISOString().slice(0, 10);
  return { start: format(monday), end: format(sunday) };
}

function hoursFromAttendanceRecord(loginTime?: string, logoutTime?: string): number {
  if (!loginTime || !logoutTime) return 0;
  const startMins = parseTimeToMinutes(loginTime);
  const endMins = parseTimeToMinutes(logoutTime);
  return Math.max(0, Math.round(((endMins - startMins) / 60) * 10) / 10);
}

export async function computeTrainerStats(
  trainer: { _id: unknown; name: string; tenantId?: string },
  batches: Array<{ trainerName: string; schedule: string }>,
  attendanceRecords: Array<{ entityId: string; loginTime?: string; logoutTime?: string; status: string }>
) {
  const trainerName = trainer.name.trim().toLowerCase();
  const assignedBatches = batches.filter(
    (batch) => (batch.trainerName || '').trim().toLowerCase() === trainerName
  );

  const activeBatches = assignedBatches.length;

  const attendanceHours = attendanceRecords
    .filter((record) => record.entityId === String(trainer._id))
    .filter((record) => record.status === 'present' || record.status === 'late')
    .reduce((sum, record) => sum + hoursFromAttendanceRecord(record.loginTime, record.logoutTime), 0);

  const scheduleHours = assignedBatches.reduce(
    (sum, batch) => sum + parseWeeklyHoursFromSchedule(batch.schedule || ''),
    0
  );

  const hoursThisWeek = attendanceHours > 0
    ? Math.round(attendanceHours * 10) / 10
    : Math.round(scheduleHours * 10) / 10;

  return { activeBatches, hoursThisWeek };
}

export async function loadTrainerStatsContext(tenantId?: string) {
  const batchFilter: Record<string, string> = {};
  if (tenantId) batchFilter.tenantId = tenantId;

  const { start, end } = getCurrentWeekRange();
  const attendanceFilter: Record<string, unknown> = {
    type: 'trainer',
    date: { $gte: start, $lte: end },
  };
  if (tenantId) attendanceFilter.tenantId = tenantId;

  const [batches, attendanceRecords] = await Promise.all([
    Batch.find(batchFilter).select('trainerName schedule').lean(),
    Attendance.find(attendanceFilter).select('entityId loginTime logoutTime status').lean(),
  ]);

  return { batches, attendanceRecords };
}
