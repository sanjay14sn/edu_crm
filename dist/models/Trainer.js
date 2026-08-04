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
const TrainerSchema = new mongoose_1.Schema({
    tenantId: { type: String },
    trainerId: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    // Employment Details
    employmentType: {
        type: String,
        enum: ['Full Time', 'Part Time', 'Contract', 'Freelancer / External Trainer', 'Guest Lecturer'],
        required: true
    },
    joiningDate: { type: Date, required: true },
    status: {
        type: String,
        enum: ['Active', 'Inactive', 'available', 'busy', 'on_leave'],
        default: 'Active'
    },
    // Professional Details
    skills: { type: String, required: true },
    experience: { type: Number, required: true },
    highestQualification: { type: String },
    certifications: { type: String },
    // Login Access Configuration
    createAccount: { type: Boolean, default: false },
    // Training Details
    technologySubject: { type: String, required: true },
    trainingMode: {
        type: String,
        enum: ['Online', 'Offline', 'Hybrid'],
        default: 'Offline'
    },
    availableDays: [{ type: String }],
    availableTimeSlots: [{ type: String }],
    // Payment Details
    paymentModel: {
        type: String,
        enum: ['Monthly Salary', 'Per Hour', 'Per Session', 'Per Batch'],
        required: true
    },
    salaryRateAmount: { type: Number, required: true },
    bankHolderName: { type: String },
    bankAccountNumber: { type: String },
    ifscCode: { type: String },
    upiId: { type: String },
    panNumber: { type: String },
    // Documents
    resumeFileName: { type: String },
    idProofFileName: { type: String },
    certificationsFileName: { type: String },
    // Stats / Legacy compatibility
    activeBatches: { type: Number, default: 0 },
    hoursThisWeek: { type: Number, default: 0 },
    rating: { type: Number, default: 5.0 }
}, { timestamps: true });
exports.default = mongoose_1.default.model('Trainer', TrainerSchema);
