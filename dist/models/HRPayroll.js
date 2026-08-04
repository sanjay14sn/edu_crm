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
const HRPayrollSchema = new mongoose_1.Schema({
    tenantId: { type: String },
    employeeId: { type: String, required: true },
    employeeType: { type: String, enum: ['trainer', 'bde'], required: true },
    month: { type: String, required: true },
    baseSalary: { type: Number, default: 0 },
    lateArrivalDeduction: { type: Number, default: 0 },
    unpaidLeaveDeduction: { type: Number, default: 0 },
    overtimeAdd: { type: Number, default: 0 },
    commissionAdd: { type: Number, default: 0 },
    incentiveAdd: { type: Number, default: 0 },
    grossPayout: { type: Number, default: 0 },
    netPayout: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ['Draft', 'Pending Approval', 'Approved', 'Released'],
        default: 'Draft',
    },
    timeline: [{
            title: { type: String },
            date: { type: String },
            description: { type: String },
        }],
}, { timestamps: true });
HRPayrollSchema.index({ tenantId: 1, employeeId: 1, month: 1 }, { unique: true });
exports.default = mongoose_1.default.model('HRPayroll', HRPayrollSchema);
