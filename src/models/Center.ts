import mongoose, { Document, Schema } from 'mongoose';

export interface ICenter extends Document {
  name: string;
  tenantName: string;
  location: string;
  manager: string;
  email: string;
  phone: string;
  status: 'active' | 'inactive' | 'maintenance';
  enabledModules: string[];
  branchType?: 'single' | 'multiple';
  centerCode?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  timezone?: string;
  operatingHoursStart?: string;
  operatingHoursEnd?: string;
  maxStudentCapacity?: number;
  maxTrainers?: number;
  maxBdes?: number;
  website?: string;
  linkedin?: string;
  instagram?: string;
  whatsapp?: string;
  youtube?: string;
  facebook?: string;
  twitter?: string;
  googleMaps?: string;
  logoUrl?: string;
  faviconUrl?: string;
  brandColor?: string;
  secondaryBrandColor?: string;
  tagline?: string;
  welcomeMessage?: string;
  customDomain?: string;
  publicPortalEnabled?: boolean;
  smsProvider?: string;
  whatsappAlerts?: boolean;
  smsAlertsEnabled?: boolean;
  emailSender?: string;
  reminderTimings?: string;
  dailyDigestEnabled?: boolean;
  emailAlertsFees?: boolean;
  emailAlertsAttendance?: boolean;
  emailAlertsAdmissions?: boolean;
  emailAlertsLeads?: boolean;
  feeReminderDaysBefore?: number;
  feeReminderAutoSend?: boolean;
  gstVatNumber?: string;
  invoicePrefix?: string;
  currency?: string;
  paymentGateway?: string;
  taxRatePercent?: number;
  lateFeePercent?: number;
  lateFeeGraceDays?: number;
  allowPartialPayments?: boolean;
  autoGenerateReceipts?: boolean;
  invoiceFooterNote?: string;
  defaultInstallmentCount?: number;
  scholarshipTrackingEnabled?: boolean;
  allowStudentPortal?: boolean;
  allowLeadCsvImport?: boolean;
  leadAutoReplyEnabled?: boolean;
  leadFollowUpsEnabled?: boolean;
  allowBdeDirectConvert?: boolean;
  allowTrainerDeleteBatch?: boolean;
  enableCampaigns?: boolean;
  enableHrModule?: boolean;
  enableLmsAiTutor?: boolean;
  enableJobPortal?: boolean;
  defaultClassDuration?: number;
  minAttendancePercent?: number;
  lowAttendanceThreshold?: number;
  autoAbsentAfterMinutes?: number;
  allowLateAttendanceMarking?: boolean;
  geofenceEnabled?: boolean;
  geofenceRadiusMeters?: number;
  sessionTimeoutMinutes?: number;
  passwordMinLength?: number;
  requireOwnerTwoFactor?: boolean;
  dataRetentionDays?: number;
  ipWhitelist?: string;
  leadChatbotEnabled?: boolean;
  leadChatbotAutoOutreach?: boolean;
  leadChatbotInboundEnabled?: boolean;
  mailHost?: string;
  mailPort?: number;
  mailSecure?: boolean;
  mailUsername?: string;
  mailPassword?: string;
  mailFrom?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri?: string;
  googleRefreshToken?: string;
  autoAiReply?: boolean;
}

const CenterSchema: Schema = new Schema(
  {
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
  },
  { timestamps: true }
);

export default mongoose.model<ICenter>('Center', CenterSchema);
