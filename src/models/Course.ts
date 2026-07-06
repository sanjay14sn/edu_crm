import mongoose, { Document, Schema } from 'mongoose';

export interface ICourse extends Document {
  tenantId: string;
  name: string;
  code: string;
  description?: string;
  duration?: string;
  fees: number;
}

const CourseSchema: Schema = new Schema({
  tenantId: { type: String, required: true, default: "ERP" },
  name: { type: String, required: true },
  code: { type: String, required: true },
  description: { type: String },
  duration: { type: String },
  fees: { type: Number, required: true, default: 0 },
}, { timestamps: true });

// Compound indexes to ensure uniqueness per tenant
CourseSchema.index({ tenantId: 1, name: 1 }, { unique: true });
CourseSchema.index({ tenantId: 1, code: 1 }, { unique: true });

export default mongoose.model<ICourse>('Course', CourseSchema);
