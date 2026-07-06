import mongoose, { Document, Schema } from 'mongoose';

export interface ISessionFeedback extends Document {
  tenantId: string;
  batchId: string;
  studentId: string;
  studentEmail: string;
  studentName: string;
  sessionDate: string;
  sessionTopic: string;
  trainerName?: string;
  rating?: number;
  comment?: string;
  skipped: boolean;
}

const SessionFeedbackSchema = new Schema(
  {
    tenantId: { type: String, required: true },
    batchId: { type: String, required: true },
    studentId: { type: String, required: true },
    studentEmail: { type: String, required: true },
    studentName: { type: String, required: true },
    sessionDate: { type: String, required: true },
    sessionTopic: { type: String, default: 'Class Session' },
    trainerName: { type: String },
    rating: { type: Number, min: 1, max: 5 },
    comment: { type: String, default: '' },
    skipped: { type: Boolean, default: false },
  },
  { timestamps: true }
);

SessionFeedbackSchema.index({ batchId: 1, studentEmail: 1, sessionDate: 1 }, { unique: true });

export default mongoose.model<ISessionFeedback>('SessionFeedback', SessionFeedbackSchema);
