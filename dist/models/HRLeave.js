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
exports.HRLeaveRequest = exports.HRLeaveBalance = exports.HRLeavePolicy = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const HRLeavePolicySchema = new mongoose_1.Schema({
    tenantId: { type: String },
    basis: { type: String, enum: ['yearly', 'monthly'], default: 'yearly' },
    casualDays: { type: Number, default: 12 },
    sickDays: { type: Number, default: 10 },
    earnedDays: { type: Number, default: 15 },
    carryForwardEarned: { type: Boolean, default: true },
}, { timestamps: true });
HRLeavePolicySchema.index({ tenantId: 1 }, { unique: true });
const HRLeaveBalanceSchema = new mongoose_1.Schema({
    tenantId: { type: String },
    employeeId: { type: String, required: true },
    year: { type: Number, required: true },
    casual: { type: Number, default: 12 },
    sick: { type: Number, default: 10 },
    earned: { type: Number, default: 15 },
}, { timestamps: true });
HRLeaveBalanceSchema.index({ tenantId: 1, employeeId: 1, year: 1 }, { unique: true });
const HRLeaveRequestSchema = new mongoose_1.Schema({
    tenantId: { type: String },
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    leaveType: { type: String, enum: ['casual', 'sick', 'earned'], required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    days: { type: Number, required: true },
    reason: { type: String },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
        default: 'Pending',
    },
    reviewedBy: { type: String },
    reviewedAt: { type: String },
}, { timestamps: true });
HRLeaveRequestSchema.index({ tenantId: 1, status: 1, startDate: -1 });
exports.HRLeavePolicy = mongoose_1.default.model('HRLeavePolicy', HRLeavePolicySchema);
exports.HRLeaveBalance = mongoose_1.default.model('HRLeaveBalance', HRLeaveBalanceSchema);
exports.HRLeaveRequest = mongoose_1.default.model('HRLeaveRequest', HRLeaveRequestSchema);
