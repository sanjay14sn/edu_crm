import mongoose, { Document, Schema } from 'mongoose';

export interface IJobApplication extends Document {
  tenantId: string;
  jobId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  coverLetter: string;
  appliedDate: string;
  status: "Pending" | "InterviewScheduled" | "Interviewing" | "Selected" | "Rejected";
  interview?: {
    date: string;
    time: string;
    mode: "online" | "offline";
    locationOrLink: string;
  };
}

const JobApplicationSchema: Schema = new Schema({
  tenantId: { type: String, required: true, index: true },
  jobId: { type: String, required: true },
  studentId: { type: String, required: true },
  studentName: { type: String, required: true },
  studentEmail: { type: String, required: true },
  coverLetter: { type: String },
  appliedDate: { type: String },
  status: { type: String, enum: ["Pending", "InterviewScheduled", "Interviewing", "Selected", "Rejected"], default: "Pending" },
  interview: {
    date: String,
    time: String,
    mode: { type: String, enum: ["online", "offline"] },
    locationOrLink: String
  }
}, { timestamps: true });

export default mongoose.model<IJobApplication>('JobApplication', JobApplicationSchema);
