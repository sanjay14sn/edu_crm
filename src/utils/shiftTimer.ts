export type ShiftStatus = 'offline' | 'active' | 'paused' | 'finished';

export interface ShiftFields {
  shiftStatus?: ShiftStatus;
  loginAt?: string | Date | null;
  logoutAt?: string | Date | null;
  pausedAt?: string | Date | null;
  totalPausedSeconds?: number;
  loginTime?: string;
  logoutTime?: string;
}

export function deriveShiftStatus(record: ShiftFields | null | undefined): ShiftStatus {
  if (!record) return 'offline';
  if (record.shiftStatus) return record.shiftStatus;
  if (record.logoutAt || record.logoutTime) return 'finished';
  if (record.pausedAt) return 'paused';
  if (record.loginAt || record.loginTime) return 'active';
  return 'offline';
}

export function computeWorkedSeconds(record: ShiftFields | null | undefined): number {
  if (!record?.loginAt) return 0;

  const login = new Date(record.loginAt).getTime();
  const end = record.logoutAt ? new Date(record.logoutAt).getTime() : Date.now();
  let paused = record.totalPausedSeconds ?? 0;

  if (record.shiftStatus === 'paused' && record.pausedAt && !record.logoutAt) {
    paused += Math.floor((Date.now() - new Date(record.pausedAt).getTime()) / 1000);
  }

  return Math.max(0, Math.floor((end - login) / 1000) - paused);
}

export function formatShiftTime(date = new Date()): string {
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function buildShiftPayload(
  record: ShiftFields & {
    _id?: unknown;
    id?: unknown;
    date?: string;
    createdAt?: Date | string;
    entityId?: string;
    name?: string;
    status?: string;
  }
) {
  const normalized: ShiftFields = { ...record };

  if (!normalized.loginAt && normalized.loginTime) {
    normalized.loginAt = record.createdAt
      ? new Date(record.createdAt).toISOString()
      : new Date().toISOString();
  }

  const shiftStatus = deriveShiftStatus(normalized);
  const workedSeconds = computeWorkedSeconds(normalized);

  return {
    id: record._id ?? record.id,
    entityId: record.entityId,
    name: record.name,
    status: record.status,
    date: record.date,
    shiftStatus,
    loginTime: normalized.loginTime,
    logoutTime: normalized.logoutTime,
    loginAt: normalized.loginAt,
    logoutAt: normalized.logoutAt,
    pausedAt: normalized.pausedAt,
    totalPausedSeconds: normalized.totalPausedSeconds ?? 0,
    workedSeconds,
  };
}
