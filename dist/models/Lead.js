"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const chatMessageSchema = new mongoose_1.Schema({
    subject: { type: String, default: "" },
    body: { type: String, default: "" },
    snippet: { type: String, default: "" },
    messageId: { type: String, default: "" },
    sentAt: { type: Date },
    receivedAt: { type: Date },
    role: { type: String, enum: ["outreach", "ai", "manual", "lead"], default: "manual" },
}, { _id: false });
const LeadSchema = new mongoose_1.Schema({
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
exports.default = mongoose_1.default.model('Lead', LeadSchema);
