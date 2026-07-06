import mongoose, { Document, Schema } from 'mongoose';

export interface IJob extends Document {
  tenantId: string;
  title: string;
  company: string;
  location: string;
  type: "Full-time" | "Part-time" | "Internship";
  salary: string;
  description: string;
  requirements: string[];
  postedDate: string;
  deadline: string;
  active: boolean;
  targetBatchIds?: string[];
  targetBatchCodes?: string[];
}

const JobSchema: Schema = new Schema({
  tenantId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  company: { type: String, required: true },
  location: { type: String, required: true },
  type: { type: String, enum: ["Full-time", "Part-time", "Internship"], default: "Full-time" },
  salary: { type: String },
  description: { type: String, required: true },
  requirements: [{ type: String }],
  postedDate: { type: String },
  deadline: { type: String },
  active: { type: Boolean, default: true },
  targetBatchIds: [{ type: String }],
  targetBatchCodes: [{ type: String }],
}, { timestamps: true });

export default mongoose.model<IJob>('Job', JobSchema);
