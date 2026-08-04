import mongoose, { Document, Schema } from 'mongoose';

export type FeeReminderFlowType = 'due_today' | 'overdue_7' | 'overdue_30';

export type FeeReminderCallStatus =
  | 'queued'
  | 'in-progress'
  | 'completed'
  | 'busy'
  | 'no-answer'
  | 'failed';

export interface IFeeReminderCallLog extends Document {
  tenantId: string;
  studentId: string;
  studentName: string;
  phone: string;
  amountDue: number;
  dueDate: string;
  flowType: FeeReminderFlowType;
  callSid?: string;
  status: FeeReminderCallStatus;
  triggeredBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const FeeReminderCallLogSchema: Schema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    studentName: { type: String, required: true },
    phone: { type: String, required: true },
    amountDue: { type: Number, default: 0 },
    dueDate: { type: String, default: '' },
    flowType: {
      type: String,
      enum: ['due_today', 'overdue_7', 'overdue_30'],
      required: true,
    },
    callSid: { type: String },
    status: {
      type: String,
      enum: ['queued', 'in-progress', 'in_progress', 'completed', 'busy', 'no-answer', 'no_answer', 'failed'],
      default: 'queued',
    },
    triggeredBy: { type: String, default: 'manual' },
  },
  { timestamps: true }
);

FeeReminderCallLogSchema.index({ tenantId: 1, createdAt: -1 });
FeeReminderCallLogSchema.index({ callSid: 1 });

export default mongoose.model<IFeeReminderCallLog>(
  'FeeReminderCallLog',
  FeeReminderCallLogSchema
);
