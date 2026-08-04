import mongoose, { Document, Schema } from 'mongoose';

export type LeadStage = "new" | "contacted" | "interested" | "demo_scheduled" | "follow_up" | "requested_as_student" | "converted" | "lost";

export type LeadEmailStatus =
  | "none"
  | "pending"
  | "sent"
  | "delivered"
  | "replied"
  | "failed"
  | "bounced";

export interface ILeadChatMessage {
  subject?: string;
  body?: string;
  snippet?: string;
  messageId?: string;
  sentAt?: Date;
  receivedAt?: Date;
  role?: "outreach" | "ai" | "manual" | "lead";
}

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

  /* Lead email chatbot */
  chatbotEnabled?: boolean;
  autoReplyEnabled?: boolean;
  followUpsEnabled?: boolean;
  followUpCount?: number;
  lastFollowUpAt?: Date | null;
  emailStatus?: LeadEmailStatus;
  outreachSentAt?: Date | null;
  outreachSubject?: string;
  outreachBody?: string;
  incomingReplies?: ILeadChatMessage[];
  sentReplies?: ILeadChatMessage[];
  autoAiReply?: {
    subject?: string;
    body?: string;
    generatedAt?: Date | null;
    sentAt?: Date | null;
  };
  lastReplyMessageId?: string;
  replySubject?: string;
  replyBody?: string;
  replySnippet?: string;
  repliedAt?: Date | null;
  intentScore?: number;
  lastIntent?: string;
  chatbotNotes?: { note: string; addedAt?: Date }[];
  sourceMessageId?: string;
  gmailThreadId?: string;
  lastChatbotContactAt?: Date | null;
}

const chatMessageSchema = new Schema(
  {
    subject: { type: String, default: "" },
    body: { type: String, default: "" },
    snippet: { type: String, default: "" },
    messageId: { type: String, default: "" },
    sentAt: { type: Date },
    receivedAt: { type: Date },
    role: { type: String, enum: ["outreach", "ai", "manual", "lead"], default: "manual" },
  },
  { _id: false }
);

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
  nextFollowUpDate: { type: String },

  chatbotEnabled: { type: Boolean, default: true },
  autoReplyEnabled: { type: Boolean, default: true },
  followUpsEnabled: { type: Boolean, default: true },
  followUpCount: { type: Number, default: 0 },
  lastFollowUpAt: { type: Date, default: null },
  emailStatus: {
    type: String,
    enum: ["none", "pending", "sent", "delivered", "replied", "failed", "bounced"],
    default: "none",
  },
  outreachSentAt: { type: Date, default: null },
  outreachSubject: { type: String, default: "" },
  outreachBody: { type: String, default: "" },
  incomingReplies: { type: [chatMessageSchema], default: [] },
  sentReplies: { type: [chatMessageSchema], default: [] },
  autoAiReply: {
    subject: { type: String, default: "" },
    body: { type: String, default: "" },
    generatedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
  },
  lastReplyMessageId: { type: String, default: "" },
  replySubject: { type: String, default: "" },
  replyBody: { type: String, default: "" },
  replySnippet: { type: String, default: "" },
  repliedAt: { type: Date, default: null },
  intentScore: { type: Number, default: 0 },
  lastIntent: { type: String, default: "" },
  chatbotNotes: {
    type: [
      {
        note: { type: String, default: "" },
        addedAt: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    default: [],
  },
  sourceMessageId: { type: String, default: "" },
  gmailThreadId: { type: String, default: "" },
  lastChatbotContactAt: { type: Date, default: null },
}, { timestamps: true });

LeadSchema.index({ sourceMessageId: 1 }, { sparse: true });
LeadSchema.index({ email: 1, tenantId: 1 });

export default mongoose.model<ILead>('Lead', LeadSchema);
