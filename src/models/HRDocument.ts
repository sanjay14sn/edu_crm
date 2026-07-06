import mongoose, { Document, Schema } from 'mongoose';

export interface IHRDocument extends Document {
  tenantId?: string;
  employeeId: string;
  name: string;
  category: 'Contract' | 'ID Proof' | 'Tax Document' | 'Certificate';
  uploadDate: string;
  size: string;
  url?: string;
}

const HRDocumentSchema = new Schema({
  tenantId: { type: String },
  employeeId: { type: String, required: true },
  name: { type: String, required: true },
  category: {
    type: String,
    enum: ['Contract', 'ID Proof', 'Tax Document', 'Certificate'],
    default: 'Contract',
  },
  uploadDate: { type: String, required: true },
  size: { type: String, default: '450 KB' },
  url: { type: String },
}, { timestamps: true });

export default mongoose.model<IHRDocument>('HRDocument', HRDocumentSchema);
