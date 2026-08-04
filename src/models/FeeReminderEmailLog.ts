import mongoose, { Document, Schema } from 'mongoose';

export type FeeReminderEmailStatus = 'sent' | 'failed';

export interface IFeeReminderEmailLog extends Document {
  tenantId: string;
  studentId: string;
  studentName: string;
  email: string;
  amountDue: number;
  dueDate: string;
  status: FeeReminderEmailStatus;
  error?: string;
  triggeredBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const FeeReminderEmailLogSchema: Schema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    studentName: { type: String, required: true },
    email: { type: String, required: true },
    amountDue: { type: Number, default: 0 },
    dueDate: { type: String, default: '' },
    status: {
      type: String,
      enum: ['sent', 'failed'],
      default: 'sent',
    },
    error: { type: String },
    triggeredBy: { type: String, default: 'manual' },
  },
  { timestamps: true }
);

FeeReminderEmailLogSchema.index({ tenantId: 1, createdAt: -1 });

export default mongoose.model<IFeeReminderEmailLog>(
  'FeeReminderEmailLog',
  FeeReminderEmailLogSchema
);
