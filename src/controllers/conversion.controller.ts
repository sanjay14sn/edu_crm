import { Response } from 'express';
import ConversionRequest from '../models/ConversionRequest';
import Lead from '../models/Lead';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth.middleware';
import { tenantFilter } from '../utils/bdeStats';
import { enrollStudent } from '../utils/enrollment';
import { notifyTargetRoles } from '../utils/notificationService';
import { assertFeature, assertCapacity } from '../utils/centerPolicy';

function mapRequest(doc: any) {
  return { ...doc.toObject(), id: doc._id };
}

async function syncPendingLeadStages(filter: Record<string, unknown>) {
  const pending = await ConversionRequest.find({ ...filter, status: 'pending' });
  await Promise.all(
    pending.map((req) =>
      Lead.findOneAndUpdate(
        { _id: req.leadId, stage: { $nin: ['converted', 'requested_as_student'] } },
        { stage: 'requested_as_student' }
      )
    )
  );
}

export const getConversionRequests = async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.query;
    const filter: Record<string, unknown> = {};

    if (req.user?.role === 'bde') {
      filter.bdeId = String(req.user.id);
    } else if (req.user?.role === 'owner' && req.user.tenantId) {
      filter.tenantId = tenantFilter(req.user.tenantId);
    }

    if (status && typeof status === 'string') {
      filter.status = status;
    }

    await syncPendingLeadStages(filter);

    const requests = await ConversionRequest.find(filter).sort({ createdAt: -1 });
    res.status(200).json(requests.map(mapRequest));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching conversion requests', error });
  }
};

export const createConversionRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'bde') {
      return res.status(403).json({ message: 'Only BDEs can submit conversion requests' });
    }

    const {
      leadId,
      course,
      batchId,
      feesTotal,
      feesPaid,
      nextDueDate,
      installmentsCount,
      paymentPlan,
    } = req.body;

    if (!leadId || !course || feesTotal == null || feesPaid == null || !nextDueDate) {
      return res.status(400).json({ message: 'leadId, course, feesTotal, feesPaid, and nextDueDate are required' });
    }

    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (lead.stage === 'converted') {
      return res.status(400).json({ message: 'Lead is already converted' });
    }

    if (lead.stage === 'requested_as_student') {
      return res.status(400).json({ message: 'Lead is already requested as student and awaiting owner approval' });
    }

    const existingPending = await ConversionRequest.findOne({ leadId: String(leadId), status: 'pending' });
    if (existingPending) {
      return res.status(400).json({ message: 'A pending conversion request already exists for this lead' });
    }

    const tenantId = req.user.tenantId || lead.tenantId || 'ERP';
    const directCheck = await assertFeature(tenantId, 'allowBdeDirectConvert', req.user.role);

    if (directCheck.ok) {
      const capacity = await assertCapacity(tenantId, 'students', req.user.role);
      if (!capacity.ok) {
        return res.status(403).json({
          message: capacity.message,
          code: 'CAPACITY_LIMIT',
          limit: capacity.limit,
          current: capacity.current,
        });
      }

      const bdeUser = await User.findById(req.user.id);
      const { student, password } = await enrollStudent({
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        course,
        tenantId,
        feesTotal: Number(feesTotal),
        feesPaid: Number(feesPaid),
        nextDueDate,
        installmentsCount: Number(installmentsCount) || 3,
        batchId,
      });

      await Lead.findByIdAndUpdate(leadId, {
        stage: 'converted',
        course,
        value: Number(feesTotal),
        $push: {
          notes: {
            text: `Direct conversion by ${bdeUser?.name || 'BDE'} (owner approval skipped).`,
            date: new Date().toISOString(),
          },
        },
      });

      return res.status(201).json({
        direct: true,
        student: { ...student.toObject(), id: student._id, password },
        message: 'Lead converted directly to student.',
      });
    }

    const bdeUser = await User.findById(req.user.id);
    const request = new ConversionRequest({
      tenantId: req.user.tenantId || lead.tenantId || 'ERP',
      leadId: String(leadId),
      leadName: lead.name,
      leadEmail: lead.email,
      leadPhone: lead.phone,
      bdeId: String(req.user.id),
      bdeName: bdeUser?.name || 'BDE',
      course,
      batchId,
      feesTotal: Number(feesTotal),
      feesPaid: Number(feesPaid),
      nextDueDate,
      installmentsCount: Number(installmentsCount) || 3,
      paymentPlan,
      status: 'pending',
    });

    await request.save();

    await notifyTargetRoles({
      tenantId: request.tenantId,
      targetRoles: ['owner'],
      title: 'New Conversion Request',
      description: `${bdeUser?.name || 'BDE'} submitted ${lead.name} for enrollment in ${course}.`,
      type: 'admissions',
      link: '/admissions',
      createdBy: String(req.user.id),
    });

    await Lead.findByIdAndUpdate(leadId, {
      stage: 'requested_as_student',
      course,
      value: Number(feesTotal),
      $push: {
        notes: {
          text: `Conversion request submitted by ${bdeUser?.name || 'BDE'} — awaiting owner approval.`,
          date: new Date().toISOString(),
        },
      },
    });

    res.status(201).json(mapRequest(request));
  } catch (error) {
    res.status(400).json({ message: 'Error creating conversion request', error });
  }
};

export const approveConversionRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'owner' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only owners can approve conversion requests' });
    }

    const request = await ConversionRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Conversion request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request is not pending' });
    }

    const lead = await Lead.findById(request.leadId);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const { student, password } = await enrollStudent({
      name: request.leadName,
      email: request.leadEmail,
      phone: request.leadPhone,
      course: request.course,
      tenantId: request.tenantId,
      feesTotal: request.feesTotal,
      feesPaid: request.feesPaid,
      nextDueDate: request.nextDueDate,
      installmentsCount: request.installmentsCount,
      batchId: request.batchId,
    });

    await Lead.findByIdAndUpdate(request.leadId, {
      stage: 'converted',
      course: request.course,
      value: request.feesTotal,
      $push: {
        notes: {
          text: `Conversion approved by owner. Student enrolled in ${request.course}.`,
          date: new Date().toISOString(),
        },
      },
    });

    request.status = 'approved';
    request.reviewedBy = String(req.user.id);
    request.reviewedAt = new Date();
    request.studentId = String(student._id);
    await request.save();

    await notifyTargetRoles({
      tenantId: request.tenantId,
      targetRoles: ['bde'],
      targetUserId: request.bdeId,
      title: 'Conversion Approved',
      description: `${request.leadName} has been enrolled as a student in ${request.course}.`,
      type: 'admissions',
      link: '/crm',
      createdBy: String(req.user.id),
    });

    res.status(200).json({
      request: mapRequest(request),
      student: { ...student.toObject(), id: student._id, password },
    });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A student with this email is already enrolled.' });
    }
    if (error.code === 'CAPACITY_LIMIT') {
      return res.status(403).json({
        message: error.message,
        code: 'CAPACITY_LIMIT',
        limit: error.limit,
        current: error.current,
      });
    }
    res.status(400).json({ message: 'Error approving conversion request', error });
  }
};

export const rejectConversionRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'owner' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only owners can reject conversion requests' });
    }

    const { note } = req.body as { note?: string };
    const request = await ConversionRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Conversion request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request is not pending' });
    }

    request.status = 'rejected';
    request.ownerNote = note || 'Rejected by owner';
    request.reviewedBy = String(req.user.id);
    request.reviewedAt = new Date();
    await request.save();

    await notifyTargetRoles({
      tenantId: request.tenantId,
      targetRoles: ['bde'],
      targetUserId: request.bdeId,
      title: 'Conversion Rejected',
      description: `Your request for ${request.leadName} was rejected${note ? `: ${note}` : '.'}`,
      type: 'admissions',
      link: '/crm',
      createdBy: String(req.user.id),
    });

    await Lead.findByIdAndUpdate(request.leadId, {
      stage: 'follow_up',
      $push: {
        notes: {
          text: `Conversion request rejected by owner${note ? `: ${note}` : '.'}`,
          date: new Date().toISOString(),
        },
      },
    });

    res.status(200).json(mapRequest(request));
  } catch (error) {
    res.status(400).json({ message: 'Error rejecting conversion request', error });
  }
};
