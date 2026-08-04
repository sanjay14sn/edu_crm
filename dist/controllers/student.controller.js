"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedStudents = exports.getStudentProfile = exports.updateStudentRemarks = exports.updateStudentFees = exports.updateStudentStatus = exports.createStudent = exports.getStudents = exports.getTrainerStudents = void 0;
const Student_1 = __importDefault(require("../models/Student"));
const User_1 = __importDefault(require("../models/User"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const enrollment_1 = require("../utils/enrollment");
const trainerPortal_1 = require("../utils/trainerPortal");
const centerPolicy_1 = require("../utils/centerPolicy");
const getTrainerStudents = async (req, res) => {
    try {
        const students = await (0, trainerPortal_1.getTrainerStudentsForUser)(String(req.user?.id), req.user?.tenantId);
        res.status(200).json(students);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching trainer students', error });
    }
};
exports.getTrainerStudents = getTrainerStudents;
const getStudents = async (req, res) => {
    try {
        const filter = {};
        if (req.user?.role === 'owner' && req.user.tenantId) {
            const escaped = req.user.tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.tenantId = { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
        }
        const students = await Student_1.default.find(filter).sort({ createdAt: -1 });
        res.status(200).json(students.map(s => ({ ...s.toObject(), id: s._id })));
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching students', error });
    }
};
exports.getStudents = getStudents;
const createStudent = async (req, res) => {
    try {
        const studentData = { ...req.body };
        if (req.user?.tenantId && !studentData.tenantId) {
            studentData.tenantId = req.user.tenantId;
        }
        // Generate plain-text password if not provided
        if (!studentData.password) {
            // 8-character random alphanumeric password
            studentData.password = Math.random().toString(36).substring(2, 10).toUpperCase();
        }
        // Check if student already exists with this email to prevent duplicate key errors
        let student = await Student_1.default.findOne({ email: studentData.email });
        if (student) {
            student.name = studentData.name || student.name;
            student.phone = studentData.phone || student.phone;
            student.course = studentData.course || student.course;
            student.status = studentData.status || student.status;
            if (studentData.feesPaid !== undefined)
                student.feesPaid = studentData.feesPaid;
            if (studentData.feesTotal !== undefined)
                student.feesTotal = studentData.feesTotal;
            if (studentData.enrollmentDate !== undefined)
                student.enrollmentDate = studentData.enrollmentDate;
            if (studentData.nextDueDate !== undefined)
                student.nextDueDate = studentData.nextDueDate;
            if (studentData.installmentsCount !== undefined)
                student.installmentsCount = studentData.installmentsCount;
            if (studentData.guardian) {
                student.guardian = studentData.guardian;
            }
            if (studentData.tenantId) {
                student.tenantId = studentData.tenantId;
            }
            if (!student.password) {
                student.password = studentData.password;
            }
            await student.save();
            if (studentData.batchId) {
                await (0, enrollment_1.assignStudentToBatch)(student.name, studentData.batchId, student.tenantId);
            }
            // Sync/ensure User login account exists
            let existingUser = await User_1.default.findOne({ email: student.email });
            if (!existingUser) {
                const avatar = student.name.split(' ').map((n) => n[0]).join('').toUpperCase().substring(0, 2);
                const salt = await bcryptjs_1.default.genSalt(10);
                const hashedPassword = await bcryptjs_1.default.hash(student.password, salt);
                const newUser = new User_1.default({
                    name: student.name,
                    email: student.email,
                    password: hashedPassword,
                    role: 'student',
                    tenantId: student.tenantId,
                    avatar
                });
                await newUser.save();
            }
            return res.status(200).json({ ...student.toObject(), id: student._id });
        }
        const capacity = await (0, centerPolicy_1.assertCapacity)(studentData.tenantId, 'students', req.user?.role);
        if (!capacity.ok) {
            return res.status(403).json({
                message: capacity.message,
                code: 'CAPACITY_LIMIT',
                limit: capacity.limit,
                current: capacity.current,
            });
        }
        const newStudent = new Student_1.default(studentData);
        await newStudent.save();
        if (studentData.batchId) {
            await (0, enrollment_1.assignStudentToBatch)(newStudent.name, studentData.batchId, newStudent.tenantId);
        }
        // Create User login account for the student
        const avatar = newStudent.name.split(' ').map((n) => n[0]).join('').toUpperCase().substring(0, 2);
        const salt = await bcryptjs_1.default.genSalt(10);
        const hashedPassword = await bcryptjs_1.default.hash(newStudent.password, salt);
        const newUser = new User_1.default({
            name: newStudent.name,
            email: newStudent.email,
            password: hashedPassword,
            role: 'student',
            tenantId: newStudent.tenantId,
            avatar
        });
        await newUser.save();
        res.status(201).json({ ...newStudent.toObject(), id: newStudent._id });
    }
    catch (error) {
        console.error('Error creating student in backend:', error);
        if (error.code === 11000 || (error.errorResponse && error.errorResponse.code === 11000)) {
            return res.status(400).json({ message: 'A student with this email is already enrolled.' });
        }
        res.status(500).json({ message: 'Error creating student', error });
    }
};
exports.createStudent = createStudent;
const updateStudentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const student = await Student_1.default.findByIdAndUpdate(id, { status }, { returnDocument: 'after' });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        res.status(200).json({ ...student.toObject(), id: student._id });
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating student status', error });
    }
};
exports.updateStudentStatus = updateStudentStatus;
const updateStudentFees = async (req, res) => {
    try {
        const { id } = req.params;
        const { feesPaid, feesTotal, nextDueDate, installmentsCount, installmentSchedule, scholarshipAmount, scholarshipNotes, } = req.body;
        const existing = await Student_1.default.findById(id);
        if (!existing) {
            return res.status(404).json({ message: 'Student not found' });
        }
        if (scholarshipAmount !== undefined || scholarshipNotes !== undefined) {
            const scholarshipCheck = await (0, centerPolicy_1.assertFeature)(existing.tenantId || req.user?.tenantId, 'scholarshipTrackingEnabled', req.user?.role);
            if (!scholarshipCheck.ok) {
                return res.status(403).json({ message: scholarshipCheck.message, code: 'FEATURE_DISABLED' });
            }
        }
        const updateData = {};
        const paid = feesPaid !== undefined ? Number(feesPaid) : existing.feesPaid;
        const total = feesTotal !== undefined ? Number(feesTotal) : existing.feesTotal;
        if (feesPaid !== undefined)
            updateData.feesPaid = paid;
        if (feesTotal !== undefined)
            updateData.feesTotal = total;
        if (installmentsCount !== undefined)
            updateData.installmentsCount = Number(installmentsCount);
        if (scholarshipAmount !== undefined)
            updateData.scholarshipAmount = Number(scholarshipAmount) || 0;
        if (scholarshipNotes !== undefined)
            updateData.scholarshipNotes = String(scholarshipNotes || '');
        if (Array.isArray(installmentSchedule)) {
            updateData.installmentSchedule = installmentSchedule.map((item, index) => ({
                amount: Number(item.amount) || 0,
                dueDate: String(item.dueDate || '').substring(0, 10),
                label: item.label || `Installment ${index + 1}`,
            }));
        }
        if (paid >= total && total > 0) {
            updateData.$unset = { ...(updateData.$unset || {}), nextDueDate: '' };
        }
        else if (nextDueDate === null || nextDueDate === '') {
            updateData.$unset = { ...(updateData.$unset || {}), nextDueDate: '' };
        }
        else if (nextDueDate !== undefined && nextDueDate) {
            updateData.nextDueDate = String(nextDueDate).substring(0, 10);
        }
        else if (paid < total) {
            const schedule = Array.isArray(installmentSchedule) && installmentSchedule.length > 0
                ? installmentSchedule
                : existing.installmentSchedule || [];
            if (schedule.length > 0) {
                let remainingPaid = paid;
                const openInstallment = schedule.find((item) => {
                    const amount = Number(item.amount) || 0;
                    if (remainingPaid >= amount) {
                        remainingPaid -= amount;
                        return false;
                    }
                    return true;
                });
                if (openInstallment?.dueDate) {
                    updateData.nextDueDate = String(openInstallment.dueDate).substring(0, 10);
                }
            }
        }
        const unset = updateData.$unset;
        delete updateData.$unset;
        const student = await Student_1.default.findByIdAndUpdate(id, unset ? { ...updateData, $unset: unset } : updateData, { returnDocument: 'after' });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        res.status(200).json({ ...student.toObject(), id: student._id });
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating student fees', error });
    }
};
exports.updateStudentFees = updateStudentFees;
async function assertTrainerCanAccessStudent(userId, tenantId, studentId) {
    const students = await (0, trainerPortal_1.getTrainerStudentsForUser)(userId, tenantId);
    return students.some((student) => String(student.id || student._id) === String(studentId));
}
const updateStudentRemarks = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;
        if (remarks !== undefined && typeof remarks !== 'string') {
            return res.status(400).json({ message: 'remarks must be a string' });
        }
        const existing = await Student_1.default.findById(id);
        if (!existing) {
            return res.status(404).json({ message: 'Student not found' });
        }
        if (req.user?.role === 'trainer') {
            const allowed = await assertTrainerCanAccessStudent(String(req.user.id), req.user.tenantId, String(id));
            if (!allowed) {
                return res.status(403).json({ message: 'You can only add remarks for students in your batches.' });
            }
        }
        else if (req.user?.role === 'owner' && req.user.tenantId) {
            const escaped = req.user.tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const tenantPattern = new RegExp(`^${escaped}\\s*$`, 'i');
            if (!tenantPattern.test(existing.tenantId || '')) {
                return res.status(403).json({ message: 'Student not found in your institute.' });
            }
        }
        else if (req.user?.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not allowed to update student remarks.' });
        }
        const student = await Student_1.default.findByIdAndUpdate(id, { remarks: String(remarks ?? '').trim() }, { returnDocument: 'after' });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        res.status(200).json({ ...student.toObject(), id: student._id });
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating student remarks', error });
    }
};
exports.updateStudentRemarks = updateStudentRemarks;
const getStudentProfile = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const user = await User_1.default.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const student = await Student_1.default.findOne({ email: user.email });
        if (!student) {
            return res.status(404).json({ message: 'Student profile not found' });
        }
        res.status(200).json({ ...student.toObject(), id: student._id });
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching student profile', error });
    }
};
exports.getStudentProfile = getStudentProfile;
const seedStudents = async () => {
    try {
        const defaultTenant = 'Thinklance ';
        const count = await Student_1.default.countDocuments({ tenantId: defaultTenant });
        if (count > 0) {
            return;
        }
        console.log(`Seeding default students for tenant: "${defaultTenant}"...`);
        const seedData = [
            {
                name: 'David Miller',
                email: 'david.m@student.com',
                phone: '+1 555-0101',
                course: 'Fullstack Web Dev',
                feesTotal: 45000,
                feesPaid: 15000,
            },
            {
                name: 'Elena Rostova',
                email: 'elena@example.com',
                phone: '+1 555-0102',
                course: 'Fullstack Web Dev',
                feesTotal: 45000,
                feesPaid: 22500,
            },
            {
                name: 'Emily Parker',
                email: 'emily@apexacademy.com',
                phone: '+1 555-0103',
                course: 'Fullstack Web Dev',
                feesTotal: 45000,
                feesPaid: 45000,
            },
            {
                name: 'Chloe Dupont',
                email: 'chloe@student.com',
                phone: '+1 555-0104',
                course: 'Fullstack Web Dev',
                feesTotal: 45000,
                feesPaid: 7500,
            },
        ];
        const defaultPassword = '1234';
        const salt = await bcryptjs_1.default.genSalt(10);
        const hashedPassword = await bcryptjs_1.default.hash(defaultPassword, salt);
        for (const entry of seedData) {
            await Student_1.default.create({
                ...entry,
                status: 'active',
                attendanceRate: 0,
                enrollmentDate: '2026-01-15',
                tenantId: defaultTenant,
                password: defaultPassword,
                installmentsCount: 3,
                nextDueDate: '2026-07-01',
            });
            const existingUser = await User_1.default.findOne({ email: entry.email });
            if (!existingUser) {
                const avatar = entry.name
                    .split(' ')
                    .map((part) => part[0])
                    .join('')
                    .toUpperCase()
                    .substring(0, 2);
                await User_1.default.create({
                    name: entry.name,
                    email: entry.email,
                    password: hashedPassword,
                    role: 'student',
                    tenantId: defaultTenant,
                    avatar,
                });
            }
            console.log(`Seeded student: ${entry.name}`);
        }
        console.log('Seeding default students complete.');
    }
    catch (error) {
        console.error('Error seeding default students:', error);
    }
};
exports.seedStudents = seedStudents;
