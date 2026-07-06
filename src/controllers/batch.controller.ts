import { Response } from 'express';
import Batch from '../models/Batch';
import User from '../models/User';
import Student from '../models/Student';
import Trainer from '../models/Trainer';
import { AuthRequest } from '../middleware/auth.middleware';
import { formatBatch } from '../utils/batchFormatter';
import { assertFeature } from '../utils/centerPolicy';

async function resolveTrainerName(userId: string) {
  const user = await User.findById(userId);
  if (!user) return null;
  if (user.email) {
    const escapedEmail = user.email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const trainer = await Trainer.findOne({
      email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') },
    });
    if (trainer?.name) return trainer.name.trim();
  }
  return user.name?.trim() || null;
}

async function trainerOwnsBatch(req: AuthRequest, batch: { trainerName?: string }) {
  if (req.user?.role !== 'trainer') return true;
  const trainerName = await resolveTrainerName(String(req.user.id));
  if (!trainerName) return false;
  return (batch.trainerName || '').trim().toLowerCase() === trainerName.toLowerCase();
}

const TRAINER_BATCH_FIELDS = [
  'schedule',
  'meetLink',
  'platform',
  'mode',
  'roomName',
  'nextSessionDate',
  'nextSessionTopic',
  'nextSessionEndDate',
  'sessions',
  'lmsContent',
] as const;

async function buildBatchFilter(req: AuthRequest) {
  const filter: Record<string, unknown> = {};

  if (req.user?.role === 'owner' && req.user.tenantId) {
    const escaped = req.user.tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.tenantId = { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
  }

  if (req.user?.role === 'student') {
    const user = await User.findById(req.user.id);
    if (user) {
      const student = await Student.findOne({ email: user.email });
      const studentName = (student?.name || user.name || '').trim();
      if (studentName) {
        const escaped = studentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.studentNames = { $regex: new RegExp(`^${escaped}$`, 'i') };
      }
    }
  }

  if (req.user?.role === 'trainer') {
    const user = await User.findById(req.user.id);
    let trainerName = (user?.name || '').trim();
    if (user?.email) {
      const escapedEmail = user.email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const trainer = await Trainer.findOne({
        email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') },
      });
      if (trainer?.name) trainerName = trainer.name.trim();
    }
    if (trainerName) {
      const escaped = trainerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.trainerName = { $regex: new RegExp(`^${escaped}$`, 'i') };
    }
    if (req.user.tenantId) {
      const escaped = req.user.tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.tenantId = { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
    }
  }

  return filter;
}

export const getBatches = async (req: AuthRequest, res: Response) => {
  try {
    const filter = await buildBatchFilter(req);
    const batches = await Batch.find(filter).sort({ createdAt: -1 });
    res.status(200).json(batches.map(formatBatch));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching batches', error });
  }
};

export const createBatch = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role === 'trainer') {
      return res.status(403).json({ message: 'Trainers cannot create batches.' });
    }

    const batchData = { ...req.body };
    if (req.user?.tenantId && !batchData.tenantId) {
      batchData.tenantId = req.user.tenantId;
    }

    if (!batchData.studentLmsAccess && Array.isArray(batchData.studentNames)) {
      batchData.studentLmsAccess = batchData.studentNames.reduce((acc: Record<string, boolean>, name: string) => {
        acc[name] = true;
        return acc;
      }, {});
    }

    const newBatch = new Batch(batchData);
    const savedBatch = await newBatch.save();
    res.status(201).json(formatBatch(savedBatch));
  } catch (error: any) {
    console.error('Error creating batch:', error);
    if (error.code === 11000 || (error.errorResponse && error.errorResponse.code === 11000)) {
      return res.status(400).json({ message: 'A training batch with this Batch Code already exists.' });
    }
    res.status(400).json({ message: error.message || 'Error creating batch', error });
  }
};

export const updateBatch = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existingBatch = await Batch.findById(id);
    if (!existingBatch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    if (!(await trainerOwnsBatch(req, existingBatch))) {
      return res.status(403).json({ message: 'You can only manage your assigned batches.' });
    }

    let batchData = { ...req.body };
    if (req.user?.role === 'trainer') {
      const existing = existingBatch.toObject();
      batchData = {
        ...existing,
        ...Object.fromEntries(
          TRAINER_BATCH_FIELDS.filter((field) => batchData[field] !== undefined).map((field) => [
            field,
            batchData[field],
          ])
        ),
      };
    }

    const updatedBatch = await Batch.findByIdAndUpdate(
      id,
      batchData,
      { returnDocument: 'after' }
    );
    if (!updatedBatch) {
      return res.status(404).json({ message: 'Batch not found' });
    }
    res.status(200).json(formatBatch(updatedBatch));
  } catch (error: any) {
    console.error('Error updating batch:', error);
    if (error.code === 11000 || (error.errorResponse && error.errorResponse.code === 11000)) {
      return res.status(400).json({ message: 'A training batch with this Batch Code already exists.' });
    }
    res.status(500).json({ message: 'Error updating batch', error });
  }
};

export const updateBatchStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['owner', 'trainer', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only owners and trainers can update batch status.' });
    }

    const { status } = req.body as { status?: 'active' | 'completed' };
    if (!status || !['active', 'completed'].includes(status)) {
      return res.status(400).json({ message: 'status must be "active" or "completed".' });
    }

    const existingBatch = await Batch.findById(req.params.id);
    if (!existingBatch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    if (!(await trainerOwnsBatch(req, existingBatch))) {
      return res.status(403).json({ message: 'You can only manage your assigned batches.' });
    }

    const updatedBatch = await Batch.findByIdAndUpdate(
      req.params.id,
      {
        status,
        completedAt: status === 'completed' ? new Date() : null,
      },
      { returnDocument: 'after' }
    );

    if (!updatedBatch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    res.status(200).json(formatBatch(updatedBatch));
  } catch (error) {
    console.error('Error updating batch status:', error);
    res.status(500).json({ message: 'Error updating batch status', error });
  }
};

export const deleteBatch = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const batch = await Batch.findById(id);
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    if (req.user?.role === 'trainer') {
      const trainerDelete = await assertFeature(req.user.tenantId, 'allowTrainerDeleteBatch', req.user.role);
      if (!trainerDelete.ok) {
        return res.status(403).json({ message: 'Trainers cannot delete batches for this institute.' });
      }
      if (!(await trainerOwnsBatch(req, batch))) {
        return res.status(403).json({ message: 'You can only delete your assigned batches.' });
      }
    }

    await Batch.findByIdAndDelete(id);
    res.status(200).json({ message: 'Batch deleted successfully', id });
  } catch (error) {
    console.error('Error deleting batch:', error);
    res.status(500).json({ message: 'Error deleting batch', error });
  }
};

export const getBatchById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const batch = await Batch.findById(id);
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }
    if (req.user?.role === 'trainer' && !(await trainerOwnsBatch(req, batch))) {
      return res.status(403).json({ message: 'You can only view your assigned batches.' });
    }
    res.status(200).json(formatBatch(batch));
  } catch (error) {
    console.error('Error fetching batch by ID:', error);
    res.status(500).json({ message: 'Error fetching batch details', error });
  }
};

function findBatchStudentName(batch: { studentNames?: string[] }, studentName: string) {
  const normalized = studentName.trim().toLowerCase();
  return (batch.studentNames || []).find((name) => name.trim().toLowerCase() === normalized) || null;
}

export const updateBatchStudentRemarks = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { studentName, remarks } = req.body as { studentName?: string; remarks?: string };

    if (!studentName || typeof studentName !== 'string') {
      return res.status(400).json({ message: 'studentName is required' });
    }
    if (remarks !== undefined && typeof remarks !== 'string') {
      return res.status(400).json({ message: 'remarks must be a string' });
    }

    const batch = await Batch.findById(id);
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    if (!(await trainerOwnsBatch(req, batch))) {
      return res.status(403).json({ message: 'You can only add remarks for your assigned batches.' });
    }

    const matchedName = findBatchStudentName(batch, studentName);
    if (!matchedName) {
      return res.status(400).json({ message: 'Student is not enrolled in this batch.' });
    }

    const remarksMap =
      batch.studentRemarks instanceof Map
        ? new Map(batch.studentRemarks)
        : new Map(Object.entries((batch.studentRemarks as Record<string, string>) || {}));

    const trimmed = String(remarks ?? '').trim();
    if (trimmed) {
      remarksMap.set(matchedName, trimmed);
    } else {
      remarksMap.delete(matchedName);
    }

    batch.studentRemarks = remarksMap as any;
    await batch.save();

    res.status(200).json(formatBatch(batch));
  } catch (error) {
    console.error('Error updating batch student remarks:', error);
    res.status(500).json({ message: 'Error updating batch remarks', error });
  }
};

export const seedBatches = async () => {
  try {
    const defaultTenant = "Thinklance ";
    const count = await Batch.countDocuments({ tenantId: defaultTenant });
    if (count === 0) {
      console.log(`Seeding default batches for tenant: "${defaultTenant}"...`);
      await Batch.create({
        tenantId: defaultTenant,
        code: "Apex-B12",
        courseName: "Fullstack Web Dev",
        trainerName: "Marcus Vance",
        schedule: "Mon, Wed, Fri • 09:00 AM - 10:30 AM",
        enrolled: 4,
        capacity: 30,
        meetLink: "https://meet.google.com/abc-defg-hij",
        platform: "gmeet",
        centerName: "Apex Downtown Hub",
        studentNames: ["David Miller", "Elena Rostova", "Emily Parker", "Chloe Dupont"],
        mode: "online",
        lmsPortalAccess: true,
        studentLmsAccess: {
          "David Miller": true,
          "Elena Rostova": true,
          "Emily Parker": true,
          "Chloe Dupont": true,
        },
        features: {
          videos: true,
          assignments: true,
          quizzes: true,
          codingTests: true,
          projects: true,
          aiTutor: true,
        },
        lmsContent: {},
      });
      console.log("Seeding default batches complete.");
    }
  } catch (error) {
    console.error("Error seeding default batches:", error);
  }
};
