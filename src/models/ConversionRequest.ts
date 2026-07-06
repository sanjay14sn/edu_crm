import mongoose, { Document, Schema } from 'mongoose';

export type ConversionRequestStatus = 'pending' | 'approved' | 'rejected';

export interface IConversionRequest extends Document {
  tenantId: string;
  leadId: string;
  leadName: string;
  leadEmail: string;
  leadPhone: string;
  bdeId: string;
  bdeName: string;
  course: string;
  batchId?: string;
  feesTotal: number;
  feesPaid: number;
  nextDueDate: string;
  installmentsCount: number;
  paymentPlan?: string;
  status: ConversionRequestStatus;
  ownerNote?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  studentId?: string;
}

const ConversionRequestSchema: Schema = new Schema(
  {
    tenantId: { type: String, required: true },
    leadId: { type: String, required: true },
    leadName: { type: String, required: true },
    leadEmail: { type: String, required: true },
    leadPhone: { type: String, required: true },
    bdeId: { type: String, required: true },
    bdeName: { type: String, required: true },
    course: { type: String, required: true },
    batchId: { type: String },
    feesTotal: { type: Number, required: true },
    feesPaid: { type: Number, required: true },
    nextDueDate: { type: String, required: true },
    installmentsCount: { type: Number, default: 3 },
    paymentPlan: { type: String },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    ownerNote: { type: String },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    studentId: { type: String },
  },
  { timestamps: true }
);

ConversionRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
ConversionRequestSchema.index({ leadId: 1, status: 1 });
ConversionRequestSchema.index({ bdeId: 1, status: 1 });

export default mongoose.model<IConversionRequest>('ConversionRequest', ConversionRequestSchema);
