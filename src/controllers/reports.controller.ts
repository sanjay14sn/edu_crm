import { Response } from 'express';
import CallLog from '../models/CallLog';
import Lead from '../models/Lead';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth.middleware';
import { fetchLeadsForBDE, tenantFilter } from '../utils/bdeStats';

function monthRange(month: string) {
  const [year, mon] = month.split('-').map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const end = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

function formatTalkDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function outcomeLabel(outcome: string) {
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

export const getCallSummary = async (req: AuthRequest, res: Response) => {
  try {
    const month =
      (req.query.month as string) ||
      new Date().toISOString().slice(0, 7);
    const { start, end } = monthRange(month);

    const filter: Record<string, unknown> = {
      callDate: { $gte: start, $lte: end },
    };

    if (req.user?.role === 'bde') {
      filter.bdeId = String(req.user.id);
    } else if (req.user?.role === 'owner' && req.user.tenantId) {
      filter.tenantId = tenantFilter(req.user.tenantId);
    }

    const logs = await CallLog.find(filter).sort({ callDate: -1, createdAt: -1 });

    const totalDials = logs.length;
    const connectedCount = logs.filter((l) => l.outcome === 'connected').length;
    const totalTalkSeconds = logs.reduce((sum, l) => sum + (l.talkDurationSeconds || 0), 0);
    const avgDurationSeconds =
      totalDials > 0 ? Math.round(totalTalkSeconds / totalDials) : 0;
    const connectionRate =
      totalDials > 0 ? Math.round((connectedCount / totalDials) * 100) : 0;

    let interestedCandidates = 0;
    const monthStart = new Date(`${month}-01T00:00:00.000Z`);
    const monthEnd = new Date(`${end}T23:59:59.999Z`);

    if (req.user?.role === 'bde') {
      const dbUser = await User.findById(req.user.id);
      const leads = await fetchLeadsForBDE(
        String(req.user.id),
        dbUser?.name || '',
        req.user.tenantId
      );
      interestedCandidates = leads.filter((l) => {
        const updated = new Date((l as { updatedAt?: Date }).updatedAt || 0);
        const inMonth = updated >= monthStart && updated <= monthEnd;
        const stageMatch =
          l.stage === 'interested' || l.stage === 'converted' || l.stage === 'follow_up';
        return inMonth && stageMatch;
      }).length;
    } else {
      const leadFilter: Record<string, unknown> = {
        stage: { $in: ['interested', 'converted', 'follow_up'] },
        updatedAt: { $gte: monthStart, $lte: monthEnd },
      };
      if (req.user?.role === 'owner' && req.user.tenantId) {
        leadFilter.tenantId = tenantFilter(req.user.tenantId);
      }
      interestedCandidates = await Lead.countDocuments(leadFilter);
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
  } catch (error) {
    res.status(500).json({ message: 'Error fetching call summary', error });
  }
};
