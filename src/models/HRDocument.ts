import mongoose, { Document, Schema } from 'mongoose';

export const HR_DOCUMENT_CATEGORIES = [
  'Offer Letter',
  'Contract',
  'ID Proof',
  'Tax Document',
  'Bank Document',
  'Certificate',
  'Other',
] as const;

export type HRDocumentCategory = (typeof HR_DOCUMENT_CATEGORIES)[number];

export interface IHRDocument extends Document {
  tenantId?: string;
  employeeId: string;
  name: string;
  category: HRDocumentCategory;
  uploadDate: string;
  size: string;
  url?: string;
  sharedWithEmployee: boolean;
  uploadedByName?: string;
}

const HRDocumentSchema = new Schema({
  tenantId: { type: String },
  employeeId: { type: String, required: true },
  name: { type: String, required: true },
  category: {
    type: String,
    enum: HR_DOCUMENT_CATEGORIES,
    default: 'Contract',
  },
  uploadDate: { type: String, required: true },
  size: { type: String, default: '450 KB' },
  url: { type: String },
  sharedWithEmployee: { type: Boolean, default: true },
  uploadedByName: { type: String },
}, { timestamps: true });

export default mongoose.model<IHRDocument>('HRDocument', HRDocumentSchema);
