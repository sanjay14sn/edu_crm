import mongoose, { Document, Schema } from 'mongoose';

export interface IBDETask extends Document {
  bdeId: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "delayed";
  dueDate: string;
  remarks?: string;
}

const BDETaskSchema: Schema = new Schema({
  bdeId: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String },
  status: { type: String, enum: ["pending", "in_progress", "completed", "delayed"], default: "pending" },
  dueDate: { type: String },
  remarks: { type: String }
}, { timestamps: true });

export default mongoose.model<IBDETask>('BDETask', BDETaskSchema);
