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
const ConversionRequestSchema = new mongoose_1.Schema({
    tenantId: { type: String, required: true },
    leadId: { type: String, required: true },
    leadName: { type: String, required: true },
    leadEmail: { type: String, required: true },
    leadPhone: { type: String, required: true },
    bdeId: { type: String, required: true },
    bdeName: { type: String, required: true },
    course: { type: String, required: true },
    batchId: { type: String },
    feesTotal: { type: Number, required: true },
    feesPaid: { type: Number, required: true },
    nextDueDate: { type: String, required: true },
    installmentsCount: { type: Number, default: 3 },
    paymentPlan: { type: String },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
    },
    ownerNote: { type: String },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    studentId: { type: String },
}, { timestamps: true });
ConversionRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
ConversionRequestSchema.index({ leadId: 1, status: 1 });
ConversionRequestSchema.index({ bdeId: 1, status: 1 });
exports.default = mongoose_1.default.model('ConversionRequest', ConversionRequestSchema);
