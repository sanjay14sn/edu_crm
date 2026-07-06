import { Response } from 'express';
import Trainer from '../models/Trainer';
import User from '../models/User';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middleware/auth.middleware';
import { computeTrainerStats, loadTrainerStatsContext } from '../utils/trainerStats';
import { assertCapacity } from '../utils/centerPolicy';
import {
  buildTrainerDashboardPayload,
  getTrainerStudentsForUser,
  resolveTrainerByUser,
} from '../utils/trainerPortal';

async function withTrainerStats(trainers: any[], tenantId?: string) {
  const { batches, attendanceRecords } = await loadTrainerStatsContext(tenantId);

  return Promise.all(
    trainers.map(async (trainer) => {
      const stats = await computeTrainerStats(trainer, batches, attendanceRecords);
      return {
        ...trainer.toObject(),
        id: trainer._id,
        activeBatches: stats.activeBatches,
        hoursThisWeek: stats.hoursThisWeek,
      };
    })
  );
}

export const getTrainerProfileMe = async (req: AuthRequest, res: Response) => {
  try {
    const payload = await buildTrainerDashboardPayload(
      String(req.user?.id),
      req.user?.tenantId
    );
    res.status(200).json({
      profile: payload.profile,
      metrics: payload.metrics,
    });
  } catch (error: any) {
    res.status(404).json({ message: error.message || 'Trainer profile not found' });
  }
};

export const getTrainerStudentsMine = async (req: AuthRequest, res: Response) => {
  try {
    const students = await getTrainerStudentsForUser(
      String(req.user?.id),
      req.user?.tenantId
    );
    res.status(200).json(students);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching trainer students', error });
  }
};

export const getTrainers = async (req: AuthRequest, res: Response) => {
  try {
    const filter: any = {};
    if (req.user?.role === 'owner' && req.user.tenantId) {
      filter.tenantId = req.user.tenantId;
    }
    const trainers = await Trainer.find(filter).sort({ createdAt: -1 });
    const enriched = await withTrainerStats(trainers, req.user?.tenantId);
    res.status(200).json(enriched);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching trainers', error });
  }
};

export const getTrainerById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const trainer = await Trainer.findById(id);
    if (!trainer) {
      return res.status(404).json({ message: 'Trainer not found' });
    }
    const [enriched] = await withTrainerStats([trainer], req.user?.tenantId);
    res.status(200).json(enriched);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching trainer', error });
  }
};

export const createTrainer = async (req: AuthRequest, res: Response) => {
  try {
    const trainerData = { ...req.body };
    if (req.user?.tenantId && !trainerData.tenantId) {
      trainerData.tenantId = req.user.tenantId;
    }

    // Check duplicate email
    const existingTrainer = await Trainer.findOne({ email: trainerData.email });
    if (existingTrainer) {
      return res.status(400).json({ message: 'A trainer with this email already exists.' });
    }

    const capacity = await assertCapacity(trainerData.tenantId, 'trainers', req.user?.role);
    if (!capacity.ok) {
      return res.status(403).json({
        message: capacity.message,
        code: 'CAPACITY_LIMIT',
        limit: capacity.limit,
        current: capacity.current,
      });
    }

    // Auto-generate trainerId
    const count = await Trainer.countDocuments();
    trainerData.trainerId = `TRN-${1001 + count}`;

    // Create login account if requested
    if (trainerData.createAccount) {
      const { username, temporaryPassword } = req.body;
      if (!username || !temporaryPassword) {
        return res.status(400).json({ message: 'Username and temporary password are required for login access.' });
      }

      const existingUser = await User.findOne({ email: username });
      if (existingUser) {
        return res.status(400).json({ message: 'A user login account with this email already exists.' });
      }

      const avatar = trainerData.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(temporaryPassword, salt);

      const newUser = new User({
        name: trainerData.name,
        email: username,
        password: hashedPassword,
        role: 'trainer',
        tenantId: trainerData.tenantId,
        avatar
      });
      await newUser.save();
    }

    const newTrainer = new Trainer(trainerData);
    await newTrainer.save();
    res.status(201).json({ ...newTrainer.toObject(), id: newTrainer._id });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Error creating trainer', error });
  }
};


export const updateTrainer = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const trainer = await Trainer.findByIdAndUpdate(id, req.body, { returnDocument: 'after' });
    if (!trainer) {
      return res.status(404).json({ message: 'Trainer not found' });
    }
    res.status(200).json({ ...trainer.toObject(), id: trainer._id });
  } catch (error) {
    res.status(500).json({ message: 'Error updating trainer', error });
  }
};

export const deleteTrainer = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const trainer = await Trainer.findByIdAndDelete(id);
    if (!trainer) {
      return res.status(404).json({ message: 'Trainer not found' });
    }
    res.status(200).json({ message: 'Trainer deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting trainer', error });
  }
};
