export type BatchSession = { topic?: string; date?: string; endDate?: string };

const DEFAULT_SESSION_MS = 60 * 60 * 1000;

export function parseSessionDateTime(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getSessionEndTime(
  session: BatchSession,
  defaultDurationMs = DEFAULT_SESSION_MS
): Date | null {
  const start = parseSessionDateTime(session.date);
  if (!start) return null;

  if (session.endDate) {
    const end = parseSessionDateTime(session.endDate);
    if (end && end > start) return end;
  }

  return new Date(start.getTime() + defaultDurationMs);
}

export type SessionRollCallStatus = 'in_progress' | 'upcoming' | 'completed';

export function getSessionStatus(
  session: BatchSession,
  referenceTime = new Date()
): SessionRollCallStatus | null {
  const start = parseSessionDateTime(session.date);
  const end = getSessionEndTime(session);
  if (!start || !end) return null;

  if (referenceTime.getTime() < start.getTime()) return 'upcoming';
  if (referenceTime.getTime() > end.getTime()) return 'completed';
  return 'in_progress';
}

export function isActiveSession(session: BatchSession, referenceTime = new Date()) {
  const status = getSessionStatus(session, referenceTime);
  return status === 'in_progress' || status === 'upcoming';
}
