import mongoose, { Document, Schema } from 'mongoose';

export type LeaveType = 'casual' | 'sick' | 'earned';

export type LeaveAccrualBasis = 'yearly' | 'monthly';

export interface IHRLeavePolicy extends Document {
  tenantId?: string;
  /** How casual/sick/earned day counts are interpreted */
  basis: LeaveAccrualBasis;
  casualDays: number;
  sickDays: number;
  earnedDays: number;
  carryForwardEarned: boolean;
}

const HRLeavePolicySchema = new Schema(
  {
    tenantId: { type: String },
    basis: { type: String, enum: ['yearly', 'monthly'], default: 'yearly' },
    casualDays: { type: Number, default: 12 },
    sickDays: { type: Number, default: 10 },
    earnedDays: { type: Number, default: 15 },
    carryForwardEarned: { type: Boolean, default: true },
  },
  { timestamps: true }
);

HRLeavePolicySchema.index({ tenantId: 1 }, { unique: true });

export interface IHRLeaveBalance extends Document {
  tenantId?: string;
  employeeId: string;
  year: number;
  casual: number;
  sick: number;
  earned: number;
}

const HRLeaveBalanceSchema = new Schema(
  {
    tenantId: { type: String },
    employeeId: { type: String, required: true },
    year: { type: Number, required: true },
    casual: { type: Number, default: 12 },
    sick: { type: Number, default: 10 },
    earned: { type: Number, default: 15 },
  },
  { timestamps: true }
);

HRLeaveBalanceSchema.index({ tenantId: 1, employeeId: 1, year: 1 }, { unique: true });

export interface IHRLeaveRequest extends Document {
  tenantId?: string;
  employeeId: string;
  employeeName: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  reviewedBy?: string;
  reviewedAt?: string;
}

const HRLeaveRequestSchema = new Schema(
  {
    tenantId: { type: String },
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    leaveType: { type: String, enum: ['casual', 'sick', 'earned'], required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    days: { type: Number, required: true },
    reason: { type: String },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
      default: 'Pending',
    },
    reviewedBy: { type: String },
    reviewedAt: { type: String },
  },
  { timestamps: true }
);

HRLeaveRequestSchema.index({ tenantId: 1, status: 1, startDate: -1 });

export const HRLeavePolicy = mongoose.model<IHRLeavePolicy>('HRLeavePolicy', HRLeavePolicySchema);
export const HRLeaveBalance = mongoose.model<IHRLeaveBalance>('HRLeaveBalance', HRLeaveBalanceSchema);
export const HRLeaveRequest = mongoose.model<IHRLeaveRequest>('HRLeaveRequest', HRLeaveRequestSchema);
