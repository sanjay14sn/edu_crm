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
const HREmployeeSchema = new mongoose_1.Schema({
    tenantId: { type: String },
    sourceType: { type: String, enum: ['trainer', 'bde', 'manual'], required: true },
    sourceId: { type: String, required: true },
    employeeCode: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    department: { type: String, default: 'General' },
    designation: { type: String, default: 'Staff' },
    branch: { type: String, default: 'Main Campus' },
    employmentType: {
        type: String,
        enum: ['Full-Time', 'Part-Time', 'Contract', 'Intern'],
        default: 'Full-Time',
    },
    joiningDate: { type: String, required: true },
    reportingManager: { type: String, default: 'Center Admin' },
    dateOfBirth: { type: String },
    status: { type: String, enum: ['active', 'exited'], default: 'active' },
    exitDate: { type: String },
    exitReason: { type: String },
    baseSalary: { type: Number, default: 0 },
}, { timestamps: true });
HREmployeeSchema.index({ tenantId: 1, sourceType: 1, sourceId: 1 }, { unique: true });
HREmployeeSchema.index({ tenantId: 1, employeeCode: 1 });
exports.default = mongoose_1.default.model('HREmployee', HREmployeeSchema);
