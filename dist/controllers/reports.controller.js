"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCallSummary = void 0;
const CallLog_1 = __importDefault(require("../models/CallLog"));
const Lead_1 = __importDefault(require("../models/Lead"));
const User_1 = __importDefault(require("../models/User"));
const bdeStats_1 = require("../utils/bdeStats");
function monthRange(month) {
    const [year, mon] = month.split('-').map(Number);
    const start = `${month}-01`;
    const lastDay = new Date(year, mon, 0).getDate();
    const end = `${month}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
}
function formatTalkDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
}
function outcomeLabel(outcome) {
    switch (outcome) {
        case 'connected':
            return 'Connected';
        case 'no_answer':
            return 'No Answer';
        case 'busy':
            return 'Line Busy';
        case 'switched_off':
            return 'Switched Off';
        default:
            return outcome;
    }
}
const getCallSummary = async (req, res) => {
    try {
        const month = req.query.month ||
            new Date().toISOString().slice(0, 7);
        const { start, end } = monthRange(month);
        const filter = {
            callDate: { $gte: start, $lte: end },
        };
        if (req.user?.role === 'bde') {
            filter.bdeId = String(req.user.id);
        }
        else if (req.user?.role === 'owner' && req.user.tenantId) {
            filter.tenantId = (0, bdeStats_1.tenantFilter)(req.user.tenantId);
        }
        const logs = await CallLog_1.default.find(filter).sort({ callDate: -1, createdAt: -1 });
        const totalDials = logs.length;
        const connectedCount = logs.filter((l) => l.outcome === 'connected').length;
        const totalTalkSeconds = logs.reduce((sum, l) => sum + (l.talkDurationSeconds || 0), 0);
        const avgDurationSeconds = totalDials > 0 ? Math.round(totalTalkSeconds / totalDials) : 0;
        const connectionRate = totalDials > 0 ? Math.round((connectedCount / totalDials) * 100) : 0;
        let interestedCandidates = 0;
        const monthStart = new Date(`${month}-01T00:00:00.000Z`);
        const monthEnd = new Date(`${end}T23:59:59.999Z`);
        if (req.user?.role === 'bde') {
            const dbUser = await User_1.default.findById(req.user.id);
            const leads = await (0, bdeStats_1.fetchLeadsForBDE)(String(req.user.id), dbUser?.name || '', req.user.tenantId);
            interestedCandidates = leads.filter((l) => {
                const updated = new Date(l.updatedAt || 0);
                const inMonth = updated >= monthStart && updated <= monthEnd;
                const stageMatch = l.stage === 'interested' || l.stage === 'converted' || l.stage === 'follow_up';
                return inMonth && stageMatch;
            }).length;
        }
        else {
            const leadFilter = {
                stage: { $in: ['interested', 'converted', 'follow_up'] },
                updatedAt: { $gte: monthStart, $lte: monthEnd },
            };
            if (req.user?.role === 'owner' && req.user.tenantId) {
                leadFilter.tenantId = (0, bdeStats_1.tenantFilter)(req.user.tenantId);
            }
            interestedCandidates = await Lead_1.default.countDocuments(leadFilter);
        }
        res.status(200).json({
            month,
            metrics: {
                totalDials,
                avgDurationSeconds,
                avgDurationLabel: formatTalkDuration(avgDurationSeconds),
                interestedCandidates,
                connectionRate,
            },
            logs: logs.map((log) => ({
                id: log._id,
                candidate: log.leadName,
                leadId: log.leadId,
                bdeName: log.bdeName,
                date: log.callDate,
                time: log.callTime,
                duration: formatTalkDuration(log.talkDurationSeconds || 0),
                durationSeconds: log.talkDurationSeconds || 0,
                status: outcomeLabel(log.outcome),
                outcome: log.outcome,
                notes: log.notes,
            })),
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching call summary', error });
    }
};
exports.getCallSummary = getCallSummary;
