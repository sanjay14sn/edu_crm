import { IBatch } from '../models/Batch';

function mapStudentLmsAccess(batch: IBatch): Record<string, boolean> {
  const access = batch.studentLmsAccess;
  if (!access) {
    return (batch.studentNames || []).reduce<Record<string, boolean>>((acc, name) => {
      acc[name] = true;
      return acc;
    }, {});
  }

  if (access instanceof Map) {
    return Object.fromEntries(access.entries());
  }

  return access as Record<string, boolean>;
}

function mapStudentRemarks(batch: IBatch): Record<string, string> {
  const remarks = batch.studentRemarks;
  if (!remarks) return {};

  if (remarks instanceof Map) {
    return Object.fromEntries(remarks.entries());
  }

  return remarks as Record<string, string>;
}

export function formatBatch(batch: IBatch) {
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
