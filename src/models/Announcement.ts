import mongoose, { Document, Schema } from 'mongoose';

export type AnnouncementType = 'info' | 'warning';

export interface IAnnouncement extends Document {
  tenantId?: string;
  title: string;
  body: string;
  type: AnnouncementType;
  active: boolean;
  createdBy?: string;
}

const AnnouncementSchema: Schema = new Schema(
  {
    tenantId: { type: String },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: { type: String, enum: ['info', 'warning'], default: 'info' },
    active: { type: Boolean, default: true },
    createdBy: { type: String },
  },
  { timestamps: true }
);

AnnouncementSchema.index({ active: 1, createdAt: -1 });
AnnouncementSchema.index({ tenantId: 1, active: 1 });

export default mongoose.model<IAnnouncement>('Announcement', AnnouncementSchema);
