import mongoose, { Document, Schema } from 'mongoose';

export interface IAttendance extends Document {
  tenantId: string;
  date: string; // YYYY-MM-DD
  type: 'student' | 'trainer' | 'bde' | 'employee';
  entityId: string;
  name: string;
  status: 'present' | 'absent' | 'late';
  loginTime?: string;
  logoutTime?: string;
  shiftStatus?: 'offline' | 'active' | 'paused' | 'finished';
  loginAt?: string;
  logoutAt?: string;
  pausedAt?: string;
  totalPausedSeconds?: number;
  workMode?: 'office' | 'remote' | 'field';
}

const AttendanceSchema: Schema = new Schema({
  tenantId: { type: String, required: true },
  date: { type: String, required: true },
  type: { type: String, enum: ['student', 'trainer', 'bde', 'employee'], required: true },
  entityId: { type: String, required: true },
  name: { type: String, required: true },
  status: { type: String, enum: ['present', 'absent', 'late'], default: 'present' },
  loginTime: { type: String },
  logoutTime: { type: String },
  shiftStatus: { type: String, enum: ['offline', 'active', 'paused', 'finished'], default: 'offline' },
  loginAt: { type: String },
  logoutAt: { type: String },
  pausedAt: { type: String },
  totalPausedSeconds: { type: Number, default: 0 },
  workMode: { type: String, enum: ['office', 'remote', 'field'] },
}, { timestamps: true });

// Ensure unique index per date, type, and entityId under a tenant
AttendanceSchema.index({ tenantId: 1, date: 1, type: 1, entityId: 1 }, { unique: true });

export default mongoose.model<IAttendance>('Attendance', AttendanceSchema);
