import mongoose, { Document, Schema } from 'mongoose';

export interface IStudent extends Document {
  name: string;
  email: string;
  phone: string;
  course: string;
  status: 'active' | 'completed' | 'on_hold';
  attendanceRate: number;
  feesPaid: number;
  feesTotal: number;
  guardian?: {
    name?: string;
    phone?: string;
  };
  enrollmentDate: string;
  tenantId: string;
  nextDueDate?: string;
  installmentsCount?: number;
  installmentSchedule?: {
    amount: number;
    dueDate: string;
    label?: string;
  }[];
  scholarshipAmount?: number;
  scholarshipNotes?: string;
  remarks?: string;
  password?: string;
}

const StudentSchema: Schema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  course: { type: String, required: true },
  status: { type: String, enum: ['active', 'completed', 'on_hold'], default: 'active' },
  attendanceRate: { type: Number, default: 0 },
  feesPaid: { type: Number, default: 0 },
  feesTotal: { type: Number, required: true },
  guardian: {
    name: { type: String, default: "N/A" },
    phone: { type: String, default: "N/A" }
  },
  enrollmentDate: { type: String, required: true },
  tenantId: { type: String, required: true },
  nextDueDate: { type: String },
  installmentsCount: { type: Number, default: 3 },
  installmentSchedule: [{
    amount: { type: Number, required: true },
    dueDate: { type: String, required: true },
    label: { type: String },
  }],
  scholarshipAmount: { type: Number, default: 0 },
  scholarshipNotes: { type: String, default: '' },
  remarks: { type: String, default: '' },
  password: { type: String }
}, { timestamps: true });

export default mongoose.model<IStudent>('Student', StudentSchema);
