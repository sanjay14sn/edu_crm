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
const CenterSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    tenantName: { type: String, required: true },
    location: { type: String, required: true },
    manager: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, default: '' },
    status: { type: String, enum: ['active', 'inactive', 'maintenance'], default: 'active' },
    enabledModules: [{ type: String }],
    branchType: { type: String, enum: ['single', 'multiple'], default: 'multiple' },
    centerCode: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },
    country: { type: String, default: 'India' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    operatingHoursStart: { type: String, default: '09:00' },
    operatingHoursEnd: { type: String, default: '18:00' },
    maxStudentCapacity: { type: Number, default: 500 },
    maxTrainers: { type: Number, default: 25 },
    maxBdes: { type: Number, default: 10 },
    website: { type: String },
    linkedin: { type: String },
    instagram: { type: String },
    whatsapp: { type: String },
    youtube: { type: String },
    facebook: { type: String },
    twitter: { type: String },
    googleMaps: { type: String },
    logoUrl: { type: String },
    faviconUrl: { type: String },
    brandColor: { type: String, default: '#3b82f6' },
    secondaryBrandColor: { type: String, default: '#10b981' },
    tagline: { type: String },
    welcomeMessage: { type: String },
    customDomain: { type: String },
    publicPortalEnabled: { type: Boolean, default: true },
    smsProvider: { type: String, default: 'twilio' },
    whatsappAlerts: { type: Boolean, default: true },
    smsAlertsEnabled: { type: Boolean, default: false },
    emailSender: { type: String },
    reminderTimings: { type: String, default: '24h' },
    dailyDigestEnabled: { type: Boolean, default: true },
    emailAlertsFees: { type: Boolean, default: true },
    emailAlertsAttendance: { type: Boolean, default: true },
    emailAlertsAdmissions: { type: Boolean, default: true },
    emailAlertsLeads: { type: Boolean, default: true },
    feeReminderDaysBefore: { type: Number, default: 3 },
    feeReminderAutoSend: { type: Boolean, default: true },
    gstVatNumber: { type: String },
    invoicePrefix: { type: String, default: 'INV' },
    currency: { type: String, default: 'INR' },
    paymentGateway: { type: String, default: 'razorpay' },
    taxRatePercent: { type: Number, default: 18 },
    lateFeePercent: { type: Number, default: 2 },
    lateFeeGraceDays: { type: Number, default: 7 },
    allowPartialPayments: { type: Boolean, default: true },
    autoGenerateReceipts: { type: Boolean, default: true },
    invoiceFooterNote: { type: String },
    defaultInstallmentCount: { type: Number, default: 3 },
    scholarshipTrackingEnabled: { type: Boolean, default: false },
    allowStudentPortal: { type: Boolean, default: true },
    allowLeadCsvImport: { type: Boolean, default: true },
    leadAutoReplyEnabled: { type: Boolean, default: true },
    leadFollowUpsEnabled: { type: Boolean, default: true },
    allowBdeDirectConvert: { type: Boolean, default: false },
    allowTrainerDeleteBatch: { type: Boolean, default: false },
    enableCampaigns: { type: Boolean, default: true },
    enableHrModule: { type: Boolean, default: true },
    enableLmsAiTutor: { type: Boolean, default: true },
    enableJobPortal: { type: Boolean, default: true },
    defaultClassDuration: { type: Number, default: 90 },
    minAttendancePercent: { type: Number, default: 75 },
    lowAttendanceThreshold: { type: Number, default: 75 },
    autoAbsentAfterMinutes: { type: Number, default: 15 },
    allowLateAttendanceMarking: { type: Boolean, default: true },
    geofenceEnabled: { type: Boolean, default: false },
    geofenceRadiusMeters: { type: Number, default: 200 },
    sessionTimeoutMinutes: { type: Number, default: 480 },
    passwordMinLength: { type: Number, default: 6 },
    requireOwnerTwoFactor: { type: Boolean, default: false },
    dataRetentionDays: { type: Number, default: 365 },
    ipWhitelist: { type: String, default: '' },
    leadChatbotEnabled: { type: Boolean },
    leadChatbotAutoOutreach: { type: Boolean },
    leadChatbotInboundEnabled: { type: Boolean },
    mailHost: { type: String },
    mailPort: { type: Number },
    mailSecure: { type: Boolean },
    mailUsername: { type: String },
    mailPassword: { type: String },
    mailFrom: { type: String },
    googleClientId: { type: String },
    googleClientSecret: { type: String },
    googleRedirectUri: { type: String },
    googleRefreshToken: { type: String },
    autoAiReply: { type: Boolean },
}, { timestamps: true });
exports.default = mongoose_1.default.model('Center', CenterSchema);
