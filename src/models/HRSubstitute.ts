import mongoose, { Document, Schema } from 'mongoose';

export interface IHRSubstitute extends Document {
  tenantId?: string;
  batchId: string;
  trainerId: string;
  trainerName: string;
  batchName: string;
  roomName: string;
  startTime: string;
  endTime: string;
  dayOfWeek: string;
  substituteTrainerId?: string;
  substituteTrainerName?: string;
  conflictWarning?: string;
}

const HRSubstituteSchema = new Schema({
  tenantId: { type: String },
  batchId: { type: String, required: true, unique: true },
  trainerId: { type: String, required: true },
  trainerName: { type: String, required: true },
  batchName: { type: String, required: true },
  roomName: { type: String, default: '' },
  startTime: { type: String, default: '' },
  endTime: { type: String, default: '' },
  dayOfWeek: { type: String, default: '' },
  substituteTrainerId: { type: String },
  substituteTrainerName: { type: String },
  conflictWarning: { type: String },
}, { timestamps: true });

export default mongoose.model<IHRSubstitute>('HRSubstitute', HRSubstituteSchema);
