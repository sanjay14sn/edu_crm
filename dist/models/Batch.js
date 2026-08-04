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
const LmsFeaturesSchema = new mongoose_1.Schema({
    videos: { type: Boolean, default: true },
    assignments: { type: Boolean, default: true },
    quizzes: { type: Boolean, default: true },
    codingTests: { type: Boolean, default: true },
    projects: { type: Boolean, default: true },
    aiTutor: { type: Boolean, default: true },
}, { _id: false });
const BatchSchema = new mongoose_1.Schema({
    tenantId: { type: String, required: true, default: "ERP" },
    code: { type: String, required: true, unique: true },
    courseName: { type: String, required: true },
    trainerName: { type: String, required: true },
    schedule: { type: String, required: true },
    enrolled: { type: Number, default: 0 },
    capacity: { type: Number, required: true },
    meetLink: { type: String },
    platform: { type: String, enum: ["gmeet", "zoom", "teams", "discord"] },
    centerName: { type: String },
    studentNames: [{ type: String }],
    mode: { type: String, enum: ["online", "offline", "recorded"], default: "online" },
    status: { type: String, enum: ["active", "completed"], default: "active" },
    completedAt: { type: Date },
    roomName: { type: String },
    nextSessionDate: { type: String },
    nextSessionTopic: { type: String },
    nextSessionEndDate: { type: String },
    sessions: [{ topic: { type: String }, date: { type: String }, endDate: { type: String } }],
    features: { type: LmsFeaturesSchema, default: () => ({}) },
    lmsPortalAccess: { type: Boolean, default: true },
    studentLmsAccess: { type: Map, of: Boolean, default: {} },
    studentRemarks: { type: Map, of: String, default: {} },
    lmsContent: { type: mongoose_1.Schema.Types.Mixed, default: {} },
}, { timestamps: true });
exports.default = mongoose_1.default.model('Batch', BatchSchema);
