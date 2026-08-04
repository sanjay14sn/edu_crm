"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSessionDateTime = parseSessionDateTime;
exports.getSessionEndTime = getSessionEndTime;
exports.getSessionStatus = getSessionStatus;
exports.isActiveSession = isActiveSession;
const DEFAULT_SESSION_MS = 60 * 60 * 1000;
function parseSessionDateTime(value) {
    if (!value)
        return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}
function getSessionEndTime(session, defaultDurationMs = DEFAULT_SESSION_MS) {
    const start = parseSessionDateTime(session.date);
    if (!start)
        return null;
    if (session.endDate) {
        const end = parseSessionDateTime(session.endDate);
        if (end && end > start)
            return end;
    }
    return new Date(start.getTime() + defaultDurationMs);
}
function getSessionStatus(session, referenceTime = new Date()) {
    const start = parseSessionDateTime(session.date);
    const end = getSessionEndTime(session);
    if (!start || !end)
        return null;
    if (referenceTime.getTime() < start.getTime())
        return 'upcoming';
    if (referenceTime.getTime() > end.getTime())
        return 'completed';
    return 'in_progress';
}
function isActiveSession(session, referenceTime = new Date()) {
    const status = getSessionStatus(session, referenceTime);
    return status === 'in_progress' || status === 'upcoming';
}
