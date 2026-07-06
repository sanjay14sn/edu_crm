import mongoose, { Document, Schema } from 'mongoose';

export interface ICampaignTemplate extends Document {
  tenantId: string;
  name: string;
  category: string;
  subject: string;
  body?: string;
}

const CampaignTemplateSchema: Schema = new Schema({
  tenantId: { type: String, required: true, default: 'ERP' },
  name: { type: String, required: true },
  category: { type: String, required: true },
  subject: { type: String, required: true },
  body: { type: String },
}, { timestamps: true });

export default mongoose.model<ICampaignTemplate>('CampaignTemplate', CampaignTemplateSchema);
