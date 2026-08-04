"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatBatch = formatBatch;
function mapStudentLmsAccess(batch) {
    const access = batch.studentLmsAccess;
    if (!access) {
        return (batch.studentNames || []).reduce((acc, name) => {
            acc[name] = true;
            return acc;
        }, {});
    }
    if (access instanceof Map) {
        return Object.fromEntries(access.entries());
    }
    return access;
}
function mapStudentRemarks(batch) {
    const remarks = batch.studentRemarks;
    if (!remarks)
        return {};
    if (remarks instanceof Map) {
        return Object.fromEntries(remarks.entries());
    }
    return remarks;
}
function formatBatch(batch) {
    const obj = batch.toObject();
    return {
        id: batch._id,
        tenantId: obj.tenantId,
        code: obj.code,
        courseName: obj.courseName,
        trainerName: obj.trainerName,
        schedule: obj.schedule,
        enrolled: obj.enrolled,
        capacity: obj.capacity,
        meetLink: obj.meetLink,
        platform: obj.platform,
        centerName: obj.centerName,
        studentNames: obj.studentNames,
        mode: obj.mode,
        status: obj.status || "active",
        completedAt: obj.completedAt,
        roomName: obj.roomName,
        nextSessionDate: obj.nextSessionDate,
        nextSessionTopic: obj.nextSessionTopic,
        nextSessionEndDate: obj.nextSessionEndDate,
        sessions: obj.sessions,
        features: obj.features || {
            videos: true,
            assignments: true,
            quizzes: true,
            codingTests: true,
            projects: true,
            aiTutor: true,
        },
        lmsPortalAccess: obj.lmsPortalAccess !== false,
        studentLmsAccess: mapStudentLmsAccess(batch),
        studentRemarks: mapStudentRemarks(batch),
        lmsContent: obj.lmsContent || {},
    };
}
