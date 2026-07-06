import mongoose, { Document, Schema } from 'mongoose';

export type LeadStage = "new" | "contacted" | "interested" | "demo_scheduled" | "follow_up" | "requested_as_student" | "converted" | "lost";

export interface ILead extends Document {
  tenantId: string;
  name: string;
  email: string;
  phone: string;
  course: string;
  stage: LeadStage;
  counsellor: string;
  assignedBdeId?: string;
  value: number;
  notes: { text: string; date: string }[];
  city?: string;
  source?: string;
  priority?: "low" | "medium" | "high";
  nextFollowUpDate?: string;
}

const LeadSchema: Schema = new Schema({
  tenantId: { type: String, required: true, default: "ERP" },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  course: { type: String, required: true },
  stage: { type: String, enum: ["new", "contacted", "interested", "demo_scheduled", "follow_up", "requested_as_student", "converted", "lost"], default: "new" },
  counsellor: { type: String },
  assignedBdeId: { type: String },
  value: { type: Number, default: 0 },
  notes: [{ text: String, date: String }],
  city: { type: String },
  source: { type: String },
  priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
  nextFollowUpDate: { type: String }
}, { timestamps: true });

export default mongoose.model<ILead>('Lead', LeadSchema);
