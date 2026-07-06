import mongoose, { Document, Schema } from 'mongoose';

export interface PayrollTimelineStep {
  title: string;
  date: string;
  description: string;
}

export interface IHRPayroll extends Document {
  tenantId?: string;
  employeeId: string;
  employeeType: 'trainer' | 'bde';
  month: string;
  baseSalary: number;
  lateArrivalDeduction: number;
  unpaidLeaveDeduction: number;
  overtimeAdd: number;
  commissionAdd: number;
  incentiveAdd: number;
  grossPayout: number;
  netPayout: number;
  status: 'Draft' | 'Pending Approval' | 'Approved' | 'Released';
  timeline: PayrollTimelineStep[];
}

const HRPayrollSchema = new Schema({
  tenantId: { type: String },
  employeeId: { type: String, required: true },
  employeeType: { type: String, enum: ['trainer', 'bde'], required: true },
  month: { type: String, required: true },
  baseSalary: { type: Number, default: 0 },
  lateArrivalDeduction: { type: Number, default: 0 },
  unpaidLeaveDeduction: { type: Number, default: 0 },
  overtimeAdd: { type: Number, default: 0 },
  commissionAdd: { type: Number, default: 0 },
  incentiveAdd: { type: Number, default: 0 },
  grossPayout: { type: Number, default: 0 },
  netPayout: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['Draft', 'Pending Approval', 'Approved', 'Released'],
    default: 'Draft',
  },
  timeline: [{
    title: { type: String },
    date: { type: String },
    description: { type: String },
  }],
}, { timestamps: true });

HRPayrollSchema.index({ tenantId: 1, employeeId: 1, month: 1 }, { unique: true });

export default mongoose.model<IHRPayroll>('HRPayroll', HRPayrollSchema);
