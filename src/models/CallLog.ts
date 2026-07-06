import mongoose, { Document, Schema } from 'mongoose';

export type CallOutcome = 'connected' | 'no_answer' | 'busy' | 'switched_off';

export interface ICallLog extends Document {
  tenantId: string;
  bdeId: string;
  bdeName: string;
  leadId: string;
  leadName: string;
  callDate: string;
  callTime: string;
  talkDurationSeconds: number;
  outcome: CallOutcome;
  notes: string;
}

const CallLogSchema: Schema = new Schema(
  {
    tenantId: { type: String, required: true },
    bdeId: { type: String, required: true },
    bdeName: { type: String, required: true },
    leadId: { type: String, required: true },
    leadName: { type: String, required: true },
    callDate: { type: String, required: true },
    callTime: { type: String, required: true },
    talkDurationSeconds: { type: Number, default: 0 },
    outcome: {
      type: String,
      enum: ['connected', 'no_answer', 'busy', 'switched_off'],
      required: true,
    },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

CallLogSchema.index({ tenantId: 1, callDate: -1 });
CallLogSchema.index({ bdeId: 1, callDate: -1 });

export default mongoose.model<ICallLog>('CallLog', CallLogSchema);
