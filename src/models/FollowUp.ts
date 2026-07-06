import mongoose, { Document, Schema } from 'mongoose';

export interface IFollowUp extends Document {
  leadId: string;
  bdeId: string;
  followupDate: string;
  notes: string;
  status: string;
  nextFollowupDate: string;
}

const FollowUpSchema: Schema = new Schema({
  leadId: { type: String, required: true },
  bdeId: { type: String, required: true },
  followupDate: { type: String },
  notes: { type: String },
  status: { type: String, default: 'pending' },
  nextFollowupDate: { type: String }
}, { timestamps: true });

export default mongoose.model<IFollowUp>('FollowUp', FollowUpSchema);
