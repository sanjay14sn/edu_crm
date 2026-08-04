"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignStudentToBatch = assignStudentToBatch;
exports.enrollStudent = enrollStudent;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const Batch_1 = __importDefault(require("../models/Batch"));
const Student_1 = __importDefault(require("../models/Student"));
const User_1 = __importDefault(require("../models/User"));
const bdeStats_1 = require("./bdeStats");
const centerPolicy_1 = require("./centerPolicy");
async function assignStudentToBatch(studentName, batchRef, tenantId) {
    const ref = (batchRef || '').trim();
    if (!ref)
        return null;
    let batch = (await Batch_1.default.findById(ref).catch(() => null)) ||
        (await Batch_1.default.findOne({ code: ref, tenantId: (0, bdeStats_1.tenantFilter)(tenantId) })) ||
        (await Batch_1.default.findOne({ code: ref }));
    if (!batch)
        return null;
    const names = batch.studentNames || [];
    const alreadyAssigned = names.some((name) => (0, bdeStats_1.normalizeName)(name) === (0, bdeStats_1.normalizeName)(studentName));
    if (!alreadyAssigned) {
        batch.studentNames = [...names, studentName];
        batch.enrolled = batch.studentNames.length;
    }
    const access = batch.studentLmsAccess instanceof Map
        ? Object.fromEntries(batch.studentLmsAccess)
        : { ...(batch.studentLmsAccess || {}) };
    access[studentName] = true;
    batch.studentLmsAccess = access;
    batch.markModified('studentLmsAccess');
    await batch.save();
    return batch;
}
async function enrollStudent(payload) {
    const password = Math.random().toString(36).substring(2, 10).toUpperCase();
    const enrollmentDate = payload.enrollmentDate || new Date().toISOString().split('T')[0];
    let student = await Student_1.default.findOne({ email: payload.email });
    if (!student) {
        const capacity = await (0, centerPolicy_1.assertCapacity)(payload.tenantId, 'students');
        if (!capacity.ok) {
            throw Object.assign(new Error(capacity.message), {
                code: 'CAPACITY_LIMIT',
                limit: capacity.limit,
                current: capacity.current,
            });
        }
    }
    if (student) {
        student.name = payload.name;
        student.phone = payload.phone;
        student.course = payload.course;
        student.status = 'active';
        student.feesPaid = payload.feesPaid;
        student.feesTotal = payload.feesTotal;
        student.enrollmentDate = enrollmentDate;
        student.nextDueDate = payload.nextDueDate;
        student.installmentsCount = payload.installmentsCount;
        student.tenantId = payload.tenantId;
        if (!student.password)
            student.password = password;
        await student.save();
    }
    else {
        student = new Student_1.default({
            ...payload,
            status: 'active',
            attendanceRate: 0,
            guardian: { name: 'N/A', phone: 'N/A' },
            enrollmentDate,
            password,
        });
        await student.save();
    }
    let existingUser = await User_1.default.findOne({ email: payload.email });
    if (!existingUser) {
        const avatar = payload.name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
        const salt = await bcryptjs_1.default.genSalt(10);
        const hashedPassword = await bcryptjs_1.default.hash(student.password, salt);
        existingUser = new User_1.default({
            name: payload.name,
            email: payload.email,
            password: hashedPassword,
            role: 'student',
            tenantId: payload.tenantId,
            avatar,
        });
        await existingUser.save();
    }
    await assignStudentToBatch(student.name, payload.batchId, payload.tenantId);
    return {
        student,
        password: student.password,
    };
}
