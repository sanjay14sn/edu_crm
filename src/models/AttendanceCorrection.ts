import mongoose, { Document, Schema } from 'mongoose';

export interface IAttendanceCorrection extends Document {
  tenantId?: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  requestedLoginTime?: string; // HH:mm
  requestedLogoutTime?: string; // HH:mm
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  reviewedBy?: string;
  reviewedAt?: string;
}

const AttendanceCorrectionSchema = new Schema(
  {
    tenantId: { type: String },
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    date: { type: String, required: true },
    requestedLoginTime: { type: String },
    requestedLogoutTime: { type: String },
    reason: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    reviewedBy: { type: String },
    reviewedAt: { type: String },
  },
  { timestamps: true }
);

AttendanceCorrectionSchema.index({ tenantId: 1, employeeId: 1, date: -1 });

export default mongoose.model<IAttendanceCorrection>('AttendanceCorrection', AttendanceCorrectionSchema);
