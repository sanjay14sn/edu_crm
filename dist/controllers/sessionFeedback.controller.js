"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTrainerSessionFeedback = exports.getMyTrainerSessionFeedback = exports.submitSessionFeedback = exports.getPendingSessionFeedback = void 0;
const Batch_1 = __importDefault(require("../models/Batch"));
const Student_1 = __importDefault(require("../models/Student"));
const User_1 = __importDefault(require("../models/User"));
const Trainer_1 = __importDefault(require("../models/Trainer"));
const SessionFeedback_1 = __importDefault(require("../models/SessionFeedback"));
const sessionTiming_1 = require("../utils/sessionTiming");
const trainerPortal_1 = require("../utils/trainerPortal");
function tenantFilter(tenantId) {
    const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
}
function normalizeSessions(batch) {
    if (batch.sessions?.length) {
        return batch.sessions.filter((session) => session?.date);
    }
    if (batch.nextSessionDate) {
        return [
            {
                topic: batch.nextSessionTopic || 'Class Session',
                date: batch.nextSessionDate,
                endDate: batch.nextSessionEndDate,
            },
        ];
    }
    return [];
}
function getRecentlyEndedSession(sessions, referenceTime = new Date(), windowMs = 48 * 60 * 60 * 1000) {
    let latest = null;
    sessions.forEach((session) => {
        const end = (0, sessionTiming_1.getSessionEndTime)(session);
        if (!end)
            return;
        const endedMs = end.getTime();
        const nowMs = referenceTime.getTime();
        if (endedMs > nowMs || nowMs - endedMs > windowMs)
            return;
        if (!latest || endedMs > latest.endedAt.getTime()) {
            latest = { session, endedAt: end };
        }
    });
    return latest;
}
async function resolveStudent(req) {
    const user = await User_1.default.findById(req.user?.id);
    if (!user)
        return null;
    const student = await Student_1.default.findOne({ email: user.email });
    if (!student)
        return null;
    return { user, student };
}
function findStudentBatch(batches, studentName) {
    const normalized = studentName.trim().toLowerCase();
    return batches.find((batch) => (batch.studentNames || []).some((name) => name.trim().toLowerCase() === normalized));
}
const getPendingSessionFeedback = async (req, res) => {
    try {
        if (req.user?.role !== 'student') {
            return res.status(403).json({ message: 'Only students can access session feedback' });
        }
        const resolved = await resolveStudent(req);
        if (!resolved) {
            return res.status(404).json({ message: 'Student profile not found' });
        }
        const { student } = resolved;
        const filter = student.tenantId ? { tenantId: tenantFilter(student.tenantId) } : {};
        const batches = await Batch_1.default.find(filter).lean();
        const batch = findStudentBatch(batches, student.name);
        if (!batch) {
            return res.status(200).json({ pending: null });
        }
        const sessions = normalizeSessions(batch);
        const ended = getRecentlyEndedSession(sessions);
        if (!ended) {
            return res.status(200).json({ pending: null });
        }
        const sessionDate = String(ended.session.date);
        const existing = await SessionFeedback_1.default.findOne({
            batchId: String(batch._id),
            studentEmail: student.email,
            sessionDate,
        });
        if (existing) {
            return res.status(200).json({ pending: null });
        }
        const start = (0, sessionTiming_1.parseSessionDateTime)(sessionDate);
        res.status(200).json({
            pending: {
                batchId: String(batch._id),
                batchCode: batch.code,
                sessionDate,
                sessionTopic: ended.session.topic || 'Class Session',
                trainerName: batch.trainerName || '',
                endedAt: ended.endedAt.toISOString(),
                sessionLabel: start
                    ? start.toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                    })
                    : sessionDate,
            },
        });
    }
    catch (error) {
        console.error('Error fetching pending session feedback:', error);
        res.status(500).json({ message: 'Error fetching pending session feedback', error });
    }
};
exports.getPendingSessionFeedback = getPendingSessionFeedback;
const submitSessionFeedback = async (req, res) => {
    try {
        if (req.user?.role !== 'student') {
            return res.status(403).json({ message: 'Only students can submit session feedback' });
        }
        const resolved = await resolveStudent(req);
        if (!resolved) {
            return res.status(404).json({ message: 'Student profile not found' });
        }
        const { student } = resolved;
        const { batchId, sessionDate, sessionTopic, trainerName, rating, comment, skipped, } = req.body || {};
        if (!batchId || !sessionDate) {
            return res.status(400).json({ message: 'batchId and sessionDate are required' });
        }
        const batch = await Batch_1.default.findById(batchId);
        if (!batch) {
            return res.status(404).json({ message: 'Batch not found' });
        }
        const isEnrolled = (batch.studentNames || []).some((name) => name.trim().toLowerCase() === student.name.trim().toLowerCase());
        if (!isEnrolled) {
            return res.status(403).json({ message: 'You are not enrolled in this batch' });
        }
        const isSkipped = Boolean(skipped);
        const numericRating = rating != null ? Number(rating) : undefined;
        if (!isSkipped) {
            if (!numericRating || numericRating < 1 || numericRating > 5) {
                return res.status(400).json({ message: 'Rating must be between 1 and 5 stars' });
            }
        }
        const feedback = await SessionFeedback_1.default.findOneAndUpdate({
            batchId: String(batchId),
            studentEmail: student.email,
            sessionDate: String(sessionDate),
        }, {
            tenantId: student.tenantId || batch.tenantId,
            batchId: String(batchId),
            studentId: String(student._id),
            studentEmail: student.email,
            studentName: student.name,
            sessionDate: String(sessionDate),
            sessionTopic: String(sessionTopic || 'Class Session'),
            trainerName: trainerName || batch.trainerName,
            rating: isSkipped ? undefined : numericRating,
            comment: isSkipped ? '' : String(comment || '').trim(),
            skipped: isSkipped,
        }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
        res.status(201).json({ ...feedback?.toObject(), id: feedback?._id });
    }
    catch (error) {
        if (error?.code === 11000) {
            return res.status(200).json({ message: 'Feedback already recorded for this session' });
        }
        console.error('Error submitting session feedback:', error);
        res.status(500).json({ message: 'Error submitting session feedback', error });
    }
};
exports.submitSessionFeedback = submitSessionFeedback;
const getMyTrainerSessionFeedback = async (req, res) => {
    try {
        if (req.user?.role !== 'trainer') {
            return res.status(403).json({ message: 'Only trainers can access their feedback' });
        }
        const resolved = await (0, trainerPortal_1.resolveTrainerByUser)(String(req.user.id));
        if (!resolved?.trainer) {
            return res.status(404).json({ message: 'Trainer profile not found' });
        }
        req.params.trainerId = String(resolved.trainer._id);
        return (0, exports.getTrainerSessionFeedback)(req, res);
    }
    catch (error) {
        console.error('Error fetching trainer session feedback:', error);
        res.status(500).json({ message: 'Error fetching trainer session feedback', error });
    }
};
exports.getMyTrainerSessionFeedback = getMyTrainerSessionFeedback;
const getTrainerSessionFeedback = async (req, res) => {
    try {
        const { trainerId } = req.params;
        const trainer = await Trainer_1.default.findById(trainerId);
        if (!trainer) {
            return res.status(404).json({ message: 'Trainer not found' });
        }
        if (req.user?.role === 'owner' &&
            req.user.tenantId &&
            trainer.tenantId &&
            trainer.tenantId.trim().toLowerCase() !== req.user.tenantId.trim().toLowerCase()) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        if (req.user?.role === 'trainer' &&
            String(trainer._id) !== String(req.params.trainerId)) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        const escaped = trainer.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const filter = {
            trainerName: { $regex: new RegExp(`^${escaped}$`, 'i') },
        };
        if (req.user?.tenantId) {
            filter.tenantId = tenantFilter(req.user.tenantId);
        }
        const records = await SessionFeedback_1.default.find(filter).sort({ createdAt: -1 }).limit(100);
        const rated = records.filter((item) => !item.skipped && item.rating);
        const averageRating = rated.length
            ? Math.round((rated.reduce((sum, item) => sum + (item.rating || 0), 0) / rated.length) * 10) / 10
            : null;
        res.status(200).json({
            trainerId: String(trainer._id),
            trainerName: trainer.name,
            summary: {
                total: records.length,
                submitted: rated.length,
                skipped: records.filter((item) => item.skipped).length,
                averageRating,
            },
            feedback: records.map((item) => {
                const obj = item.toObject();
                return {
                    id: obj._id,
                    studentName: obj.studentName,
                    sessionTopic: obj.sessionTopic,
                    sessionDate: obj.sessionDate,
                    rating: obj.rating,
                    comment: obj.comment,
                    skipped: obj.skipped,
                    createdAt: obj.createdAt,
                };
            }),
        });
    }
    catch (error) {
        console.error('Error fetching trainer session feedback:', error);
        res.status(500).json({ message: 'Error fetching trainer session feedback', error });
    }
};
exports.getTrainerSessionFeedback = getTrainerSessionFeedback;
