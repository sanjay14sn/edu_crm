import mongoose, { Document, Schema } from 'mongoose';

export interface IHRClaim extends Document {
  tenantId?: string;
  employeeId: string;
  employeeName: string;
  title: string;
  amount: number;
  category: 'Travel' | 'Food' | 'Fuel' | 'Office' | 'Internet' | 'Hardware' | 'Others';
  status: 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected' | 'Released';
  billUrl?: string;
  date: string;
}

const HRClaimSchema = new Schema({
  tenantId: { type: String },
  employeeId: { type: String, required: true },
  employeeName: { type: String, required: true },
  title: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { type: String, enum: ['Travel', 'Food', 'Fuel', 'Office', 'Internet', 'Hardware', 'Others'], default: 'Travel' },
  status: {
    type: String,
    enum: ['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Released'],
    default: 'Pending Approval',
  },
  billUrl: { type: String },
  date: { type: String, required: true },
}, { timestamps: true });

export default mongoose.model<IHRClaim>('HRClaim', HRClaimSchema);
