import mongoose, { Document, Schema } from 'mongoose';

export type BatchMode = "online" | "offline" | "recorded";
export type BatchStatus = "active" | "completed";

export interface LmsFeatures {
  videos: boolean;
  assignments: boolean;
  quizzes: boolean;
  codingTests: boolean;
  projects: boolean;
  aiTutor: boolean;
}

export interface IBatch extends Document {
  tenantId: string;
  code: string;
  courseName: string;
  trainerName: string;
  schedule: string;
  enrolled: number;
  capacity: number;
  meetLink?: string;
  platform?: "gmeet" | "zoom" | "teams" | "discord";
  centerName?: string;
  studentNames: string[];
  mode: BatchMode;
  status: BatchStatus;
  completedAt?: Date;
  roomName?: string;
  nextSessionDate?: string;
  nextSessionTopic?: string;
  nextSessionEndDate?: string;
  sessions?: { topic: string; date: string; endDate?: string }[];
  features?: LmsFeatures;
  lmsPortalAccess?: boolean;
  studentLmsAccess?: Record<string, boolean>;
  studentRemarks?: Record<string, string>;
  lmsContent?: Record<string, unknown>;
}

const LmsFeaturesSchema = new Schema({
  videos: { type: Boolean, default: true },
  assignments: { type: Boolean, default: true },
  quizzes: { type: Boolean, default: true },
  codingTests: { type: Boolean, default: true },
  projects: { type: Boolean, default: true },
  aiTutor: { type: Boolean, default: true },
}, { _id: false });

const BatchSchema: Schema = new Schema({
  tenantId: { type: String, required: true, default: "ERP" },
  code: { type: String, required: true, unique: true },
  courseName: { type: String, required: true },
  trainerName: { type: String, required: true },
  schedule: { type: String, required: true },
  enrolled: { type: Number, default: 0 },
  capacity: { type: Number, required: true },
  meetLink: { type: String },
  platform: { type: String, enum: ["gmeet", "zoom", "teams", "discord"] },
  centerName: { type: String },
  studentNames: [{ type: String }],
  mode: { type: String, enum: ["online", "offline", "recorded"], default: "online" },
  status: { type: String, enum: ["active", "completed"], default: "active" },
  completedAt: { type: Date },
  roomName: { type: String },
  nextSessionDate: { type: String },
  nextSessionTopic: { type: String },
  nextSessionEndDate: { type: String },
  sessions: [{ topic: { type: String }, date: { type: String }, endDate: { type: String } }],
  features: { type: LmsFeaturesSchema, default: () => ({}) },
  lmsPortalAccess: { type: Boolean, default: true },
  studentLmsAccess: { type: Map, of: Boolean, default: {} },
  studentRemarks: { type: Map, of: String, default: {} },
  lmsContent: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

export default mongoose.model<IBatch>('Batch', BatchSchema);
