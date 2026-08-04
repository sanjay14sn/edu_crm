"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedBatches = exports.updateBatchStudentRemarks = exports.getBatchById = exports.deleteBatch = exports.updateBatchStatus = exports.updateBatch = exports.createBatch = exports.getBatches = void 0;
const Batch_1 = __importDefault(require("../models/Batch"));
const User_1 = __importDefault(require("../models/User"));
const Student_1 = __importDefault(require("../models/Student"));
const Trainer_1 = __importDefault(require("../models/Trainer"));
const batchFormatter_1 = require("../utils/batchFormatter");
const centerPolicy_1 = require("../utils/centerPolicy");
async function resolveTrainerName(userId) {
    const user = await User_1.default.findById(userId);
    if (!user)
        return null;
    if (user.email) {
        const escapedEmail = user.email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const trainer = await Trainer_1.default.findOne({
            email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') },
        });
        if (trainer?.name)
            return trainer.name.trim();
    }
    return user.name?.trim() || null;
}
async function trainerOwnsBatch(req, batch) {
    if (req.user?.role !== 'trainer')
        return true;
    const trainerName = await resolveTrainerName(String(req.user.id));
    if (!trainerName)
        return false;
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
];
async function buildBatchFilter(req) {
    const filter = {};
    if (req.user?.role === 'owner' && req.user.tenantId) {
        const escaped = req.user.tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.tenantId = { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
    }
    if (req.user?.role === 'student') {
        const user = await User_1.default.findById(req.user.id);
        if (user) {
            const student = await Student_1.default.findOne({ email: user.email });
            const studentName = (student?.name || user.name || '').trim();
            if (studentName) {
                const escaped = studentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                filter.studentNames = { $regex: new RegExp(`^${escaped}$`, 'i') };
            }
        }
    }
    if (req.user?.role === 'trainer') {
        const user = await User_1.default.findById(req.user.id);
        let trainerName = (user?.name || '').trim();
        if (user?.email) {
            const escapedEmail = user.email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const trainer = await Trainer_1.default.findOne({
                email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') },
            });
            if (trainer?.name)
                trainerName = trainer.name.trim();
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
const getBatches = async (req, res) => {
    try {
        const filter = await buildBatchFilter(req);
        const batches = await Batch_1.default.find(filter).sort({ createdAt: -1 });
        res.status(200).json(batches.map(batchFormatter_1.formatBatch));
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching batches', error });
    }
};
exports.getBatches = getBatches;
const createBatch = async (req, res) => {
    try {
        if (req.user?.role === 'trainer') {
            return res.status(403).json({ message: 'Trainers cannot create batches.' });
        }
        const batchData = { ...req.body };
        if (req.user?.tenantId && !batchData.tenantId) {
            batchData.tenantId = req.user.tenantId;
        }
        if (!batchData.studentLmsAccess && Array.isArray(batchData.studentNames)) {
            batchData.studentLmsAccess = batchData.studentNames.reduce((acc, name) => {
                acc[name] = true;
                return acc;
            }, {});
        }
        const newBatch = new Batch_1.default(batchData);
        const savedBatch = await newBatch.save();
        res.status(201).json((0, batchFormatter_1.formatBatch)(savedBatch));
    }
    catch (error) {
        console.error('Error creating batch:', error);
        if (error.code === 11000 || (error.errorResponse && error.errorResponse.code === 11000)) {
            return res.status(400).json({ message: 'A training batch with this Batch Code already exists.' });
        }
        res.status(400).json({ message: error.message || 'Error creating batch', error });
    }
};
exports.createBatch = createBatch;
const updateBatch = async (req, res) => {
    try {
        const { id } = req.params;
        const existingBatch = await Batch_1.default.findById(id);
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
                ...Object.fromEntries(TRAINER_BATCH_FIELDS.filter((field) => batchData[field] !== undefined).map((field) => [
                    field,
                    batchData[field],
                ])),
            };
        }
        const updatedBatch = await Batch_1.default.findByIdAndUpdate(id, batchData, { returnDocument: 'after' });
        if (!updatedBatch) {
            return res.status(404).json({ message: 'Batch not found' });
        }
        res.status(200).json((0, batchFormatter_1.formatBatch)(updatedBatch));
    }
    catch (error) {
        console.error('Error updating batch:', error);
        if (error.code === 11000 || (error.errorResponse && error.errorResponse.code === 11000)) {
            return res.status(400).json({ message: 'A training batch with this Batch Code already exists.' });
        }
        res.status(500).json({ message: 'Error updating batch', error });
    }
};
exports.updateBatch = updateBatch;
const updateBatchStatus = async (req, res) => {
    try {
        if (!req.user || !['owner', 'trainer', 'super_admin'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Only owners and trainers can update batch status.' });
        }
        const { status } = req.body;
        if (!status || !['active', 'completed'].includes(status)) {
            return res.status(400).json({ message: 'status must be "active" or "completed".' });
        }
        const existingBatch = await Batch_1.default.findById(req.params.id);
        if (!existingBatch) {
            return res.status(404).json({ message: 'Batch not found' });
        }
        if (!(await trainerOwnsBatch(req, existingBatch))) {
            return res.status(403).json({ message: 'You can only manage your assigned batches.' });
        }
        const updatedBatch = await Batch_1.default.findByIdAndUpdate(req.params.id, {
            status,
            completedAt: status === 'completed' ? new Date() : null,
        }, { returnDocument: 'after' });
        if (!updatedBatch) {
            return res.status(404).json({ message: 'Batch not found' });
        }
        res.status(200).json((0, batchFormatter_1.formatBatch)(updatedBatch));
    }
    catch (error) {
        console.error('Error updating batch status:', error);
        res.status(500).json({ message: 'Error updating batch status', error });
    }
};
exports.updateBatchStatus = updateBatchStatus;
const deleteBatch = async (req, res) => {
    try {
        const { id } = req.params;
        const batch = await Batch_1.default.findById(id);
        if (!batch) {
            return res.status(404).json({ message: 'Batch not found' });
        }
        if (req.user?.role === 'trainer') {
            const trainerDelete = await (0, centerPolicy_1.assertFeature)(req.user.tenantId, 'allowTrainerDeleteBatch', req.user.role);
            if (!trainerDelete.ok) {
                return res.status(403).json({ message: 'Trainers cannot delete batches for this institute.' });
            }
            if (!(await trainerOwnsBatch(req, batch))) {
                return res.status(403).json({ message: 'You can only delete your assigned batches.' });
            }
        }
        await Batch_1.default.findByIdAndDelete(id);
        res.status(200).json({ message: 'Batch deleted successfully', id });
    }
    catch (error) {
        console.error('Error deleting batch:', error);
        res.status(500).json({ message: 'Error deleting batch', error });
    }
};
exports.deleteBatch = deleteBatch;
const getBatchById = async (req, res) => {
    try {
        const { id } = req.params;
        const batch = await Batch_1.default.findById(id);
        if (!batch) {
            return res.status(404).json({ message: 'Batch not found' });
        }
        if (req.user?.role === 'trainer' && !(await trainerOwnsBatch(req, batch))) {
            return res.status(403).json({ message: 'You can only view your assigned batches.' });
        }
        res.status(200).json((0, batchFormatter_1.formatBatch)(batch));
    }
    catch (error) {
        console.error('Error fetching batch by ID:', error);
        res.status(500).json({ message: 'Error fetching batch details', error });
    }
};
exports.getBatchById = getBatchById;
function findBatchStudentName(batch, studentName) {
    const normalized = studentName.trim().toLowerCase();
    return (batch.studentNames || []).find((name) => name.trim().toLowerCase() === normalized) || null;
}
const updateBatchStudentRemarks = async (req, res) => {
    try {
        const { id } = req.params;
        const { studentName, remarks } = req.body;
        if (!studentName || typeof studentName !== 'string') {
            return res.status(400).json({ message: 'studentName is required' });
        }
        if (remarks !== undefined && typeof remarks !== 'string') {
            return res.status(400).json({ message: 'remarks must be a string' });
        }
        const batch = await Batch_1.default.findById(id);
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
        const remarksMap = batch.studentRemarks instanceof Map
            ? new Map(batch.studentRemarks)
            : new Map(Object.entries(batch.studentRemarks || {}));
        const trimmed = String(remarks ?? '').trim();
        if (trimmed) {
            remarksMap.set(matchedName, trimmed);
        }
        else {
            remarksMap.delete(matchedName);
        }
        batch.studentRemarks = remarksMap;
        await batch.save();
        res.status(200).json((0, batchFormatter_1.formatBatch)(batch));
    }
    catch (error) {
        console.error('Error updating batch student remarks:', error);
        res.status(500).json({ message: 'Error updating batch remarks', error });
    }
};
exports.updateBatchStudentRemarks = updateBatchStudentRemarks;
const seedBatches = async () => {
    try {
        const defaultTenant = "Thinklance ";
        const count = await Batch_1.default.countDocuments({ tenantId: defaultTenant });
        if (count === 0) {
            console.log(`Seeding default batches for tenant: "${defaultTenant}"...`);
            await Batch_1.default.create({
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
    }
    catch (error) {
        console.error("Error seeding default batches:", error);
    }
};
exports.seedBatches = seedBatches;
