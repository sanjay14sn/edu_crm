import mongoose, { Document, Schema } from 'mongoose';

export interface IBDEProfile extends Document {
  userId: mongoose.Types.ObjectId;
  employeeId: string;
  phone: string;
  gender: string;
  dob: Date;
  address: string;
  qualification: string;
  experience: string;
  joiningDate: Date;
  monthlyTarget: number;
  targetType: 'revenue' | 'leads';
  commissionEnabled: boolean;
  commissionPercentage: number;
  commissionApplyFrom: 'from_start' | 'after_target' | 'after_threshold';
  commissionThreshold?: number;
  status: 'active' | 'inactive';
  weeklyOffDays: number[];
}

const BDEProfileSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  employeeId: { type: String, required: true, unique: true },
  phone: { type: String },
  gender: { type: String },
  dob: { type: Date },
  address: { type: String },
  qualification: { type: String },
  experience: { type: String },
  joiningDate: { type: Date, required: true },
  monthlyTarget: { type: Number, default: 30 },
  targetType: { type: String, enum: ['revenue', 'leads'], default: 'leads' },
  commissionEnabled: { type: Boolean, default: false },
  commissionPercentage: { type: Number, default: 0 },
  commissionApplyFrom: {
    type: String,
    enum: ['from_start', 'after_target', 'after_threshold'],
    default: 'from_start',
  },
  commissionThreshold: { type: Number },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  weeklyOffDays: { type: [Number], default: [0] },
}, { timestamps: true });

export default mongoose.model<IBDEProfile>('BDEProfile', BDEProfileSchema);
