import bcrypt from 'bcryptjs';
import Batch from '../models/Batch';
import Student from '../models/Student';
import User from '../models/User';
import { normalizeName, tenantFilter } from './bdeStats';
import { assertCapacity } from './centerPolicy';

export interface EnrollmentPayload {
  name: string;
  email: string;
  phone: string;
  course: string;
  tenantId: string;
  feesTotal: number;
  feesPaid: number;
  nextDueDate: string;
  installmentsCount: number;
  enrollmentDate?: string;
  batchId?: string;
}

export async function assignStudentToBatch(
  studentName: string,
  batchRef: string | undefined,
  tenantId: string
) {
  const ref = (batchRef || '').trim();
  if (!ref) return null;

  let batch =
    (await Batch.findById(ref).catch(() => null)) ||
    (await Batch.findOne({ code: ref, tenantId: tenantFilter(tenantId) })) ||
    (await Batch.findOne({ code: ref }));

  if (!batch) return null;

  const names = batch.studentNames || [];
  const alreadyAssigned = names.some(
    (name) => normalizeName(name) === normalizeName(studentName)
  );

  if (!alreadyAssigned) {
    batch.studentNames = [...names, studentName];
    batch.enrolled = batch.studentNames.length;
  }

  const access =
    batch.studentLmsAccess instanceof Map
      ? Object.fromEntries(batch.studentLmsAccess)
      : { ...(batch.studentLmsAccess || {}) };
  access[studentName] = true;
  batch.studentLmsAccess = access;
  batch.markModified('studentLmsAccess');
  await batch.save();

  return batch;
}

export async function enrollStudent(payload: EnrollmentPayload) {
  const password = Math.random().toString(36).substring(2, 10).toUpperCase();
  const enrollmentDate = payload.enrollmentDate || new Date().toISOString().split('T')[0];

  let student = await Student.findOne({ email: payload.email });
  if (!student) {
    const capacity = await assertCapacity(payload.tenantId, 'students');
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
    if (!student.password) student.password = password;
    await student.save();
  } else {
    student = new Student({
      ...payload,
      status: 'active',
      attendanceRate: 0,
      guardian: { name: 'N/A', phone: 'N/A' },
      enrollmentDate,
      password,
    });
    await student.save();
  }

  let existingUser = await User.findOne({ email: payload.email });
  if (!existingUser) {
    const avatar = payload.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(student.password!, salt);
    existingUser = new User({
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
    password: student.password!,
  };
}
