import mongoose, { Document, Schema } from 'mongoose';
import { UserRole } from './User';

export type NotificationType =
  | 'fees'
  | 'attendance'
  | 'admissions'
  | 'assignments'
  | 'system'
  | 'leads'
  | 'tasks';

export interface INotification extends Document {
  key?: string;
  tenantId?: string;
  targetRoles: UserRole[];
  targetUserId?: string;
  title: string;
  description: string;
  type: NotificationType;
  link?: string;
  readBy: string[];
  createdBy?: string;
  source: 'system' | 'user';
  expiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const NotificationSchema: Schema = new Schema(
  {
    key: { type: String, sparse: true },
    tenantId: { type: String },
    targetRoles: {
      type: [String],
      enum: ['super_admin', 'owner', 'trainer', 'student', 'bde'],
      default: [],
    },
    targetUserId: { type: String },
    title: { type: String, required: true },
    description: { type: String, required: true },
    type: {
      type: String,
      enum: ['fees', 'attendance', 'admissions', 'assignments', 'system', 'leads', 'tasks'],
      default: 'system',
    },
    link: { type: String },
    readBy: { type: [String], default: [] },
    createdBy: { type: String },
    source: { type: String, enum: ['system', 'user'], default: 'user' },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

NotificationSchema.index({ tenantId: 1, targetRoles: 1, createdAt: -1 });
NotificationSchema.index({ targetUserId: 1, createdAt: -1 });
NotificationSchema.index({ key: 1, tenantId: 1 }, { unique: true, sparse: true });

export default mongoose.model<INotification>('Notification', NotificationSchema);
