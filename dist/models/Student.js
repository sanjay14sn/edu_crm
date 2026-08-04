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
const StudentSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    course: { type: String, required: true },
    status: { type: String, enum: ['active', 'completed', 'on_hold'], default: 'active' },
    attendanceRate: { type: Number, default: 0 },
    feesPaid: { type: Number, default: 0 },
    feesTotal: { type: Number, required: true },
    guardian: {
        name: { type: String, default: "N/A" },
        phone: { type: String, default: "N/A" }
    },
    enrollmentDate: { type: String, required: true },
    tenantId: { type: String, required: true },
    nextDueDate: { type: String },
    installmentsCount: { type: Number, default: 3 },
    installmentSchedule: [{
            amount: { type: Number, required: true },
            dueDate: { type: String, required: true },
            label: { type: String },
        }],
    scholarshipAmount: { type: Number, default: 0 },
    scholarshipNotes: { type: String, default: '' },
    remarks: { type: String, default: '' },
    password: { type: String }
}, { timestamps: true });
exports.default = mongoose_1.default.model('Student', StudentSchema);
