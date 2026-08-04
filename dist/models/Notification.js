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
const NotificationSchema = new mongoose_1.Schema({
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
}, { timestamps: true });
NotificationSchema.index({ tenantId: 1, targetRoles: 1, createdAt: -1 });
NotificationSchema.index({ targetUserId: 1, createdAt: -1 });
NotificationSchema.index({ key: 1, tenantId: 1 }, { unique: true, sparse: true });
exports.default = mongoose_1.default.model('Notification', NotificationSchema);
