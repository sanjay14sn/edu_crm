import mongoose, { Document, Schema } from 'mongoose';

export type SupportPriority = 'low' | 'medium' | 'high';
export type SupportStatus = 'open' | 'in-progress' | 'resolved';

export interface ISupportTicket extends Document {
  tenantId?: string;
  userId: string;
  userName: string;
  userRole: string;
  subject: string;
  category: string;
  priority: SupportPriority;
  status: SupportStatus;
  message: string;
  response?: string;
  respondedBy?: string;
  respondedAt?: Date;
}

const SupportTicketSchema: Schema = new Schema(
  {
    tenantId: { type: String },
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    subject: { type: String, required: true },
    category: { type: String, required: true },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: { type: String, enum: ['open', 'in-progress', 'resolved'], default: 'open' },
    message: { type: String, required: true },
    response: { type: String },
    respondedBy: { type: String },
    respondedAt: { type: Date },
  },
  { timestamps: true }
);

SupportTicketSchema.index({ userId: 1, createdAt: -1 });
SupportTicketSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

export default mongoose.model<ISupportTicket>('SupportTicket', SupportTicketSchema);
