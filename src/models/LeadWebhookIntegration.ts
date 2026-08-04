import mongoose, { Document, Schema } from 'mongoose';

export interface ILeadWebhookIntegration extends Document {
  tenantId: string;
  name: string;
  source: string;
  apiKey: string;
  isActive: boolean;
  defaultCourse?: string;
  assignedBdeId?: string;
  counsellor?: string;
  createdBy?: string;
  lastUsedAt?: Date | null;
  requestCount?: number;
}

const LeadWebhookIntegrationSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    source: { type: String, required: true, trim: true },
    apiKey: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true },
    defaultCourse: { type: String, default: 'General Enquiry' },
    assignedBdeId: { type: String, default: '' },
    counsellor: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    lastUsedAt: { type: Date, default: null },
    requestCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

LeadWebhookIntegrationSchema.index({ tenantId: 1, source: 1 });

export default mongoose.model<ILeadWebhookIntegration>(
  'LeadWebhookIntegration',
  LeadWebhookIntegrationSchema
);
