import mongoose, { Document, Schema } from 'mongoose';

export interface ITenantUsage extends Document {
  tenantId: string;
  tenantName?: string;
  cloudinaryBytes: number;
  cloudinaryFiles: number;
  aiPromptTokens: number;
  aiCompletionTokens: number;
  aiTotalTokens: number;
  aiRequests: number;
  aiDailyRequests?: number;
  aiDailyDate?: string;
  lastAiUsageAt?: Date;
  lastCloudinaryUploadAt?: Date;
}

const TenantUsageSchema = new Schema(
  {
    tenantId: { type: String, required: true, unique: true, trim: true },
    tenantName: { type: String, trim: true },
    cloudinaryBytes: { type: Number, default: 0 },
    cloudinaryFiles: { type: Number, default: 0 },
    aiPromptTokens: { type: Number, default: 0 },
    aiCompletionTokens: { type: Number, default: 0 },
    aiTotalTokens: { type: Number, default: 0 },
    aiRequests: { type: Number, default: 0 },
    aiDailyRequests: { type: Number, default: 0 },
    aiDailyDate: { type: String },
    lastAiUsageAt: { type: Date },
    lastCloudinaryUploadAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model<ITenantUsage>('TenantUsage', TenantUsageSchema);
