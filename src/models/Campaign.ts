import mongoose, { Document, Schema } from 'mongoose';

export type CampaignChannel = 'Email' | 'SMS' | 'WhatsApp';
export type CampaignStatus = 'Draft' | 'Scheduled' | 'Active' | 'Completed';

export interface ICampaign extends Document {
  tenantId: string;
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  audience: string;
  subject?: string;
  body?: string;
  recipientCount: number;
  openRate?: number;
  clickRate?: number;
  scheduledAt?: Date;
  sentAt?: Date;
  templateId?: string;
}

const CampaignSchema: Schema = new Schema({
  tenantId: { type: String, required: true, default: 'ERP' },
  name: { type: String, required: true },
  channel: { type: String, enum: ['Email', 'SMS', 'WhatsApp'], default: 'Email' },
  status: { type: String, enum: ['Draft', 'Scheduled', 'Active', 'Completed'], default: 'Draft' },
  audience: { type: String, default: 'all_leads' },
  subject: { type: String },
  body: { type: String },
  recipientCount: { type: Number, default: 0 },
  openRate: { type: Number },
  clickRate: { type: Number },
  scheduledAt: { type: Date },
  sentAt: { type: Date },
  templateId: { type: String },
}, { timestamps: true });

export default mongoose.model<ICampaign>('Campaign', CampaignSchema);
