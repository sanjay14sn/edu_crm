"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTrainer = exports.updateTrainer = exports.createTrainer = exports.getTrainerById = exports.getTrainers = exports.getTrainerStudentsMine = exports.getTrainerProfileMe = void 0;
const Trainer_1 = __importDefault(require("../models/Trainer"));
const User_1 = __importDefault(require("../models/User"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const trainerStats_1 = require("../utils/trainerStats");
const centerPolicy_1 = require("../utils/centerPolicy");
const trainerPortal_1 = require("../utils/trainerPortal");
async function withTrainerStats(trainers, tenantId) {
    const { batches, attendanceRecords } = await (0, trainerStats_1.loadTrainerStatsContext)(tenantId);
    return Promise.all(trainers.map(async (trainer) => {
        const stats = await (0, trainerStats_1.computeTrainerStats)(trainer, batches, attendanceRecords);
        return {
            ...trainer.toObject(),
            id: trainer._id,
            activeBatches: stats.activeBatches,
            hoursThisWeek: stats.hoursThisWeek,
        };
    }));
}
const getTrainerProfileMe = async (req, res) => {
    try {
        const payload = await (0, trainerPortal_1.buildTrainerDashboardPayload)(String(req.user?.id), req.user?.tenantId);
        res.status(200).json({
            profile: payload.profile,
            metrics: payload.metrics,
        });
    }
    catch (error) {
        res.status(404).json({ message: error.message || 'Trainer profile not found' });
    }
};
exports.getTrainerProfileMe = getTrainerProfileMe;
const getTrainerStudentsMine = async (req, res) => {
    try {
        const students = await (0, trainerPortal_1.getTrainerStudentsForUser)(String(req.user?.id), req.user?.tenantId);
        res.status(200).json(students);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching trainer students', error });
    }
};
exports.getTrainerStudentsMine = getTrainerStudentsMine;
const getTrainers = async (req, res) => {
    try {
        const filter = {};
        if (req.user?.role === 'owner' && req.user.tenantId) {
            filter.tenantId = req.user.tenantId;
        }
        const trainers = await Trainer_1.default.find(filter).sort({ createdAt: -1 });
        const enriched = await withTrainerStats(trainers, req.user?.tenantId);
        res.status(200).json(enriched);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching trainers', error });
    }
};
exports.getTrainers = getTrainers;
const getTrainerById = async (req, res) => {
    try {
        const { id } = req.params;
        const trainer = await Trainer_1.default.findById(id);
        if (!trainer) {
            return res.status(404).json({ message: 'Trainer not found' });
        }
        const [enriched] = await withTrainerStats([trainer], req.user?.tenantId);
        res.status(200).json(enriched);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching trainer', error });
    }
};
exports.getTrainerById = getTrainerById;
const createTrainer = async (req, res) => {
    try {
        const trainerData = { ...req.body };
        if (req.user?.tenantId && !trainerData.tenantId) {
            trainerData.tenantId = req.user.tenantId;
        }
        // Check duplicate email
        const existingTrainer = await Trainer_1.default.findOne({ email: trainerData.email });
        if (existingTrainer) {
            return res.status(400).json({ message: 'A trainer with this email already exists.' });
        }
        const capacity = await (0, centerPolicy_1.assertCapacity)(trainerData.tenantId, 'trainers', req.user?.role);
        if (!capacity.ok) {
            return res.status(403).json({
                message: capacity.message,
                code: 'CAPACITY_LIMIT',
                limit: capacity.limit,
                current: capacity.current,
            });
        }
        // Auto-generate trainerId
        const count = await Trainer_1.default.countDocuments();
        trainerData.trainerId = `TRN-${1001 + count}`;
        // Create login account if requested
        if (trainerData.createAccount) {
            const { username, temporaryPassword } = req.body;
            if (!username || !temporaryPassword) {
                return res.status(400).json({ message: 'Username and temporary password are required for login access.' });
            }
            const existingUser = await User_1.default.findOne({ email: username });
            if (existingUser) {
                return res.status(400).json({ message: 'A user login account with this email already exists.' });
            }
            const avatar = trainerData.name.split(' ').map((n) => n[0]).join('').toUpperCase().substring(0, 2);
            const salt = await bcryptjs_1.default.genSalt(10);
            const hashedPassword = await bcryptjs_1.default.hash(temporaryPassword, salt);
            const newUser = new User_1.default({
                name: trainerData.name,
                email: username,
                password: hashedPassword,
                role: 'trainer',
                tenantId: trainerData.tenantId,
                avatar
            });
            await newUser.save();
        }
        const newTrainer = new Trainer_1.default(trainerData);
        await newTrainer.save();
        res.status(201).json({ ...newTrainer.toObject(), id: newTrainer._id });
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Error creating trainer', error });
    }
};
exports.createTrainer = createTrainer;
const updateTrainer = async (req, res) => {
    try {
        const { id } = req.params;
        const trainer = await Trainer_1.default.findByIdAndUpdate(id, req.body, { returnDocument: 'after' });
        if (!trainer) {
            return res.status(404).json({ message: 'Trainer not found' });
        }
        res.status(200).json({ ...trainer.toObject(), id: trainer._id });
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating trainer', error });
    }
};
exports.updateTrainer = updateTrainer;
const deleteTrainer = async (req, res) => {
    try {
        const { id } = req.params;
        const trainer = await Trainer_1.default.findByIdAndDelete(id);
        if (!trainer) {
            return res.status(404).json({ message: 'Trainer not found' });
        }
        res.status(200).json({ message: 'Trainer deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: 'Error deleting trainer', error });
    }
};
exports.deleteTrainer = deleteTrainer;
