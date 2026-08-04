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
const CallLogSchema = new mongoose_1.Schema({
    tenantId: { type: String, required: true },
    bdeId: { type: String, required: true },
    bdeName: { type: String, required: true },
    leadId: { type: String, required: true },
    leadName: { type: String, required: true },
    callDate: { type: String, required: true },
    callTime: { type: String, required: true },
    talkDurationSeconds: { type: Number, default: 0 },
    outcome: {
        type: String,
        enum: ['connected', 'no_answer', 'busy', 'switched_off'],
        required: true,
    },
    notes: { type: String, default: '' },
}, { timestamps: true });
CallLogSchema.index({ tenantId: 1, callDate: -1 });
CallLogSchema.index({ bdeId: 1, callDate: -1 });
exports.default = mongoose_1.default.model('CallLog', CallLogSchema);
